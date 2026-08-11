-- =====================================================================
-- Dental Clinic AI Automation — Supabase / Postgres schema
-- =====================================================================
-- Source of truth for patients, appointments, complaints and feedback.
--
-- Design note: every booking mutation goes through an RPC in this file.
-- The AI agent never writes rows directly, and never talks to Google
-- Calendar directly. Double-booking is prevented by a GiST exclusion
-- constraint inside the database, so two concurrent conversations that
-- ask for the same slot at the same millisecond cannot both win.
--
-- Run once against your Supabase project (SQL Editor or `psql`).
-- =====================================================================

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

-- ---------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------

create table if not exists public.doctors (
    id            uuid primary key default gen_random_uuid(),
    full_name     text        not null,
    full_name_ar  text        not null,
    speciality    text,
    speciality_ar text,
    -- Google Calendar the clinic staff actually look at.
    calendar_id   text        not null,
    work_start    time        not null default '10:00',
    work_end      time        not null default '22:00',
    -- ISO-ish day numbers as returned by extract(dow): 0 = Sunday .. 6 = Saturday.
    work_days     int[]       not null default '{0,1,2,3,4,6}',
    slot_minutes  int         not null default 30,
    active        boolean     not null default true,
    created_at    timestamptz not null default now()
);

create table if not exists public.services (
    id               uuid primary key default gen_random_uuid(),
    name             text        not null,
    name_ar          text        not null,
    duration_minutes int         not null check (duration_minutes > 0),
    price            numeric(10, 2),
    active           boolean     not null default true
);

create table if not exists public.doctor_services (
    doctor_id  uuid not null references public.doctors (id) on delete cascade,
    service_id uuid not null references public.services (id) on delete cascade,
    primary key (doctor_id, service_id)
);

-- ---------------------------------------------------------------------
-- Patients
-- ---------------------------------------------------------------------

create table if not exists public.patients (
    id         uuid primary key default gen_random_uuid(),
    -- Normalised E.164-ish digits, no '+'. This is the conversation key.
    phone      text        not null unique,
    full_name  text,
    email      text,
    notes      text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Appointments
-- ---------------------------------------------------------------------

create table if not exists public.appointments (
    id                    uuid primary key default gen_random_uuid(),
    patient_id            uuid        not null references public.patients (id) on delete cascade,
    doctor_id             uuid        not null references public.doctors (id),
    service_id            uuid        not null references public.services (id),
    starts_at             timestamptz not null,
    ends_at               timestamptz not null,
    status                text        not null default 'booked'
        check (status in ('booked', 'cancelled', 'completed', 'no_show')),
    notes                 text,
    source                text        not null default 'ai_agent',
    google_event_id       text,
    -- Set by the weekly follow-up workflow so a patient is asked only once.
    feedback_requested_at timestamptz,
    created_at            timestamptz not null default now(),
    updated_at            timestamptz not null default now(),

    constraint appointments_time_order check (ends_at > starts_at),

    -- The whole conflict-prevention story, in four lines: one doctor cannot
    -- hold two overlapping *live* appointments. Cancelled and completed rows
    -- drop out of the predicate, so freed slots become bookable again.
    constraint appointments_no_overlap exclude using gist (
        doctor_id with =,
        tstzrange(starts_at, ends_at) with &&
    ) where (status = 'booked')
);

create index if not exists appointments_patient_idx on public.appointments (patient_id, starts_at desc);
create index if not exists appointments_doctor_idx  on public.appointments (doctor_id, starts_at);
create index if not exists appointments_followup_idx
    on public.appointments (ends_at)
    where status = 'completed' and feedback_requested_at is null;

-- ---------------------------------------------------------------------
-- Complaints and feedback
-- ---------------------------------------------------------------------

create table if not exists public.complaints (
    id             uuid primary key default gen_random_uuid(),
    patient_id     uuid references public.patients (id) on delete set null,
    appointment_id uuid references public.appointments (id) on delete set null,
    subject        text        not null,
    body           text        not null,
    severity       text        not null default 'normal'
        check (severity in ('low', 'normal', 'high', 'urgent')),
    status         text        not null default 'open'
        check (status in ('open', 'in_progress', 'resolved')),
    channel        text        not null default 'chat',
    created_at     timestamptz not null default now(),
    resolved_at    timestamptz
);

create index if not exists complaints_open_idx on public.complaints (created_at desc) where status <> 'resolved';

create table if not exists public.feedback (
    id             uuid primary key default gen_random_uuid(),
    patient_id     uuid references public.patients (id) on delete set null,
    appointment_id uuid references public.appointments (id) on delete set null,
    rating         int check (rating between 1 and 5),
    sentiment      text check (sentiment in ('positive', 'neutral', 'negative')),
    summary        text,
    topics         text[],
    raw_message    text,
    is_complaint   boolean     not null default false,
    created_at     timestamptz not null default now()
);

create index if not exists feedback_created_idx on public.feedback (created_at desc);

-- ---------------------------------------------------------------------
-- Chat memory for the n8n "Postgres Chat Memory" node
-- ---------------------------------------------------------------------

create table if not exists public.n8n_chat_histories (
    id         serial primary key,
    session_id varchar(255) not null,
    message    jsonb        not null,
    created_at timestamptz  not null default now()
);

create index if not exists n8n_chat_histories_session_idx on public.n8n_chat_histories (session_id, id);

-- ---------------------------------------------------------------------
-- Convenience view: what the agent may offer
-- ---------------------------------------------------------------------

create or replace view public.v_doctor_services as
select d.id           as doctor_id,
       d.full_name    as doctor_name,
       d.full_name_ar as doctor_name_ar,
       d.speciality_ar,
       d.work_start,
       d.work_end,
       d.work_days,
       s.id           as service_id,
       s.name         as service_name,
       s.name_ar      as service_name_ar,
       s.duration_minutes,
       s.price
from public.doctor_services ds
         join public.doctors d on d.id = ds.doctor_id
         join public.services s on s.id = ds.service_id
where d.active
  and s.active;

-- =====================================================================
-- RPCs — the only write path the automation uses
-- =====================================================================

-- Normalise whatever the messaging channel hands us into bare E.164 digits,
-- so that '0100 123 4567' typed by a receptionist and '+201001234567' coming
-- from WhatsApp resolve to the same patient row instead of two.
--
-- This must stay in step with normalizePhone() in the n8n "Normalize Message"
-- code node. Change the country code in both places.
create or replace function public.normalize_phone(p_phone text)
    returns text
    language plpgsql
    immutable
as
$$
declare
    v_country_code constant text := '20'; -- Egypt
    v_digits       text;
begin
    v_digits := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');

    if v_digits = '' then
        return null;
    end if;

    if left(v_digits, 2) = '00' then
        v_digits := substr(v_digits, 3);
    end if;

    if left(v_digits, 1) = '0' then
        v_digits := v_country_code || substr(v_digits, 2);
    end if;

    return v_digits;
end;
$$;

-- ---------------------------------------------------------------------
-- available_slots — the only source of "free" times the agent may quote
-- ---------------------------------------------------------------------
create or replace function public.available_slots(
    p_doctor_id  uuid,
    p_service_id uuid,
    p_from       date default current_date,
    p_days       int default 7,
    p_tz         text default 'Africa/Cairo'
)
    returns table
            (
                slot_start timestamptz,
                slot_end   timestamptz,
                local_day  text,
                local_time text
            )
    language plpgsql
    stable
    security definer
    set search_path = public
as
$$
declare
    v_doc      public.doctors;
    v_duration int;
begin
    select * into v_doc from public.doctors where id = p_doctor_id and active;
    if v_doc.id is null then
        return;
    end if;

    select duration_minutes into v_duration from public.services where id = p_service_id and active;
    if v_duration is null then
        return;
    end if;

    return query
        with days as (select (p_from + offs)::date as d
                      from generate_series(0, greatest(p_days, 1) - 1) as offs)
        select c.st,
               c.st + make_interval(mins => v_duration),
               to_char(c.st at time zone p_tz, 'YYYY-MM-DD Dy'),
               to_char(c.st at time zone p_tz, 'HH24:MI')
        from days
                 cross join lateral generate_series(
                (days.d + v_doc.work_start) at time zone p_tz,
                ((days.d + v_doc.work_end) at time zone p_tz) - make_interval(mins => v_duration),
                make_interval(mins => v_doc.slot_minutes)
                                     ) as c(st)
        where extract(dow from days.d)::int = any (v_doc.work_days)
          and c.st > now() + interval '30 minutes'
          and not exists (select 1
                          from public.appointments a
                          where a.doctor_id = p_doctor_id
                            and a.status = 'booked'
                            and tstzrange(a.starts_at, a.ends_at) &&
                                tstzrange(c.st, c.st + make_interval(mins => v_duration)))
        order by c.st;
end;
$$;

-- ---------------------------------------------------------------------
-- book_appointment — atomic: upsert patient + insert appointment
-- ---------------------------------------------------------------------
create or replace function public.book_appointment(
    p_phone      text,
    p_doctor_id  uuid,
    p_service_id uuid,
    p_starts_at  timestamptz,
    p_full_name  text default null,
    p_notes      text default null,
    p_tz         text default 'Africa/Cairo'
)
    returns jsonb
    language plpgsql
    security definer
    set search_path = public
as
$$
declare
    v_phone      text;
    v_patient_id uuid;
    v_duration   int;
    v_ends_at    timestamptz;
    v_appt       public.appointments;
begin
    v_phone := public.normalize_phone(p_phone);
    if v_phone is null then
        return jsonb_build_object('ok', false, 'reason', 'missing_phone');
    end if;

    select duration_minutes into v_duration from public.services where id = p_service_id and active;
    if v_duration is null then
        return jsonb_build_object('ok', false, 'reason', 'unknown_service');
    end if;

    v_ends_at := p_starts_at + make_interval(mins => v_duration);

    if not exists (select 1
                   from public.doctors d
                            join public.doctor_services ds
                                 on ds.doctor_id = d.id and ds.service_id = p_service_id
                   where d.id = p_doctor_id
                     and d.active) then
        return jsonb_build_object('ok', false, 'reason', 'doctor_does_not_offer_service');
    end if;

    if p_starts_at <= now() then
        return jsonb_build_object('ok', false, 'reason', 'in_the_past');
    end if;

    if not exists (select 1
                   from public.doctors d
                   where d.id = p_doctor_id
                     and extract(dow from (p_starts_at at time zone p_tz))::int = any (d.work_days)
                     and (p_starts_at at time zone p_tz)::time >= d.work_start
                     and (v_ends_at at time zone p_tz)::time <= d.work_end) then
        return jsonb_build_object('ok', false, 'reason', 'outside_working_hours');
    end if;

    insert into public.patients (phone, full_name)
    values (v_phone, p_full_name)
    on conflict (phone) do update
        set full_name  = coalesce(excluded.full_name, public.patients.full_name),
            updated_at = now()
    returning id into v_patient_id;

    begin
        insert into public.appointments (patient_id, doctor_id, service_id, starts_at, ends_at, notes)
        values (v_patient_id, p_doctor_id, p_service_id, p_starts_at, v_ends_at, p_notes)
        returning * into v_appt;
    exception
        when exclusion_violation then
            -- Someone else took this exact slot, possibly milliseconds ago.
            return jsonb_build_object(
                    'ok', false,
                    'reason', 'slot_taken',
                    'alternatives', (select coalesce(jsonb_agg(x), '[]'::jsonb)
                                     from (select to_jsonb(s)
                                           from public.available_slots(p_doctor_id, p_service_id,
                                                                       (p_starts_at at time zone p_tz)::date, 3,
                                                                       p_tz) s
                                           limit 5) as t(x))
                   );
    end;

    return jsonb_build_object(
            'ok', true,
            'appointment_id', v_appt.id,
            'patient_id', v_patient_id,
            'starts_at', v_appt.starts_at,
            'ends_at', v_appt.ends_at,
            'local_time', to_char(v_appt.starts_at at time zone p_tz, 'YYYY-MM-DD HH24:MI'),
            'doctor', (select full_name_ar from public.doctors where id = p_doctor_id),
            'service', (select name_ar from public.services where id = p_service_id)
           );
end;
$$;

-- ---------------------------------------------------------------------
-- reschedule_appointment — phone acts as the ownership check
-- ---------------------------------------------------------------------
create or replace function public.reschedule_appointment(
    p_phone          text,
    p_appointment_id uuid,
    p_new_starts_at  timestamptz,
    p_tz             text default 'Africa/Cairo'
)
    returns jsonb
    language plpgsql
    security definer
    set search_path = public
as
$$
declare
    v_phone     text;
    v_appt      public.appointments;
    v_duration  int;
    v_new_ends  timestamptz;
begin
    v_phone := public.normalize_phone(p_phone);

    select a.* into v_appt
    from public.appointments a
             join public.patients p on p.id = a.patient_id
    where a.id = p_appointment_id
      and p.phone = v_phone
      and a.status = 'booked';

    if v_appt.id is null then
        return jsonb_build_object('ok', false, 'reason', 'appointment_not_found');
    end if;

    select duration_minutes into v_duration from public.services where id = v_appt.service_id;
    v_new_ends := p_new_starts_at + make_interval(mins => v_duration);

    if p_new_starts_at <= now() then
        return jsonb_build_object('ok', false, 'reason', 'in_the_past');
    end if;

    if not exists (select 1
                   from public.doctors d
                   where d.id = v_appt.doctor_id
                     and extract(dow from (p_new_starts_at at time zone p_tz))::int = any (d.work_days)
                     and (p_new_starts_at at time zone p_tz)::time >= d.work_start
                     and (v_new_ends at time zone p_tz)::time <= d.work_end) then
        return jsonb_build_object('ok', false, 'reason', 'outside_working_hours');
    end if;

    begin
        update public.appointments
        set starts_at  = p_new_starts_at,
            ends_at    = v_new_ends,
            updated_at = now()
        where id = p_appointment_id
        returning * into v_appt;
    exception
        when exclusion_violation then
            return jsonb_build_object(
                    'ok', false,
                    'reason', 'slot_taken',
                    'alternatives', (select coalesce(jsonb_agg(x), '[]'::jsonb)
                                     from (select to_jsonb(s)
                                           from public.available_slots(v_appt.doctor_id, v_appt.service_id,
                                                                       (p_new_starts_at at time zone p_tz)::date, 3,
                                                                       p_tz) s
                                           limit 5) as t(x))
                   );
    end;

    return jsonb_build_object(
            'ok', true,
            'appointment_id', v_appt.id,
            'starts_at', v_appt.starts_at,
            'local_time', to_char(v_appt.starts_at at time zone p_tz, 'YYYY-MM-DD HH24:MI')
           );
end;
$$;

-- ---------------------------------------------------------------------
-- cancel_appointment
-- ---------------------------------------------------------------------
create or replace function public.cancel_appointment(
    p_phone          text,
    p_appointment_id uuid,
    p_reason         text default null
)
    returns jsonb
    language plpgsql
    security definer
    set search_path = public
as
$$
declare
    v_appt public.appointments;
begin
    update public.appointments a
    set status     = 'cancelled',
        notes      = coalesce(a.notes || ' | ', '') || coalesce('cancel: ' || p_reason, 'cancelled by patient'),
        updated_at = now()
    from public.patients p
    where a.id = p_appointment_id
      and p.id = a.patient_id
      and p.phone = public.normalize_phone(p_phone)
      and a.status = 'booked'
    returning a.* into v_appt;

    if v_appt.id is null then
        return jsonb_build_object('ok', false, 'reason', 'appointment_not_found');
    end if;

    return jsonb_build_object('ok', true, 'appointment_id', v_appt.id);
end;
$$;

-- ---------------------------------------------------------------------
-- patient_history — what the agent is allowed to recall about a caller
-- ---------------------------------------------------------------------
create or replace function public.patient_history(
    p_phone text,
    p_tz    text default 'Africa/Cairo'
)
    returns jsonb
    language sql
    stable
    security definer
    set search_path = public
as
$$
select jsonb_build_object(
               'patient', (select jsonb_build_object('full_name', pt.full_name, 'phone', pt.phone,
                                                     'since', pt.created_at)
                           from public.patients pt
                           where pt.phone = public.normalize_phone(p_phone)),
               'appointments', (select coalesce(jsonb_agg(x order by x ->> 'starts_at' desc), '[]'::jsonb)
                                from (select jsonb_build_object(
                                                     'appointment_id', a.id,
                                                     'starts_at', a.starts_at,
                                                     'local_time',
                                                     to_char(a.starts_at at time zone p_tz, 'YYYY-MM-DD HH24:MI'),
                                                     'status', a.status,
                                                     'doctor', d.full_name_ar,
                                                     'service', s.name_ar
                                             ) as x
                                      from public.appointments a
                                               join public.patients p on p.id = a.patient_id
                                               join public.doctors d on d.id = a.doctor_id
                                               join public.services s on s.id = a.service_id
                                      where p.phone = public.normalize_phone(p_phone)
                                      order by a.starts_at desc
                                      limit 20) as t(x)),
               'open_complaints', (select count(*)
                                   from public.complaints c
                                            join public.patients p on p.id = c.patient_id
                                   where p.phone = public.normalize_phone(p_phone)
                                     and c.status <> 'resolved')
       );
$$;

-- ---------------------------------------------------------------------
-- log_complaint
-- ---------------------------------------------------------------------
create or replace function public.log_complaint(
    p_phone    text,
    p_subject  text,
    p_body     text,
    p_severity text default 'normal',
    p_channel  text default 'chat'
)
    returns jsonb
    language plpgsql
    security definer
    set search_path = public
as
$$
declare
    v_patient_id uuid;
    v_id         uuid;
begin
    select id into v_patient_id from public.patients where phone = public.normalize_phone(p_phone);

    insert into public.complaints (patient_id, subject, body, severity, channel)
    values (v_patient_id, p_subject, p_body,
            case when p_severity in ('low', 'normal', 'high', 'urgent') then p_severity else 'normal' end,
            p_channel)
    returning id into v_id;

    return jsonb_build_object('ok', true, 'complaint_id', v_id);
end;
$$;

-- =====================================================================
-- Follow-up / feedback support
-- =====================================================================

-- Anything that already ended and was never cancelled counts as a visit.
create or replace function public.mark_past_appointments_completed()
    returns int
    language plpgsql
    security definer
    set search_path = public
as
$$
declare
    v_count int;
begin
    with updated as (
        update public.appointments
            set status = 'completed', updated_at = now()
            where status = 'booked' and ends_at < now()
            returning 1)
    select count(*) into v_count from updated;
    return v_count;
end;
$$;

-- Visits from the last p_days that have not been asked for feedback yet.
create or replace function public.visits_pending_feedback(
    p_days int default 7,
    p_tz   text default 'Africa/Cairo'
)
    returns table
            (
                appointment_id uuid,
                patient_id     uuid,
                phone          text,
                full_name      text,
                email          text,
                doctor_name_ar text,
                service_name_ar text,
                visited_at     timestamptz,
                local_time     text
            )
    language sql
    stable
    security definer
    set search_path = public
as
$$
select a.id,
       p.id,
       p.phone,
       p.full_name,
       p.email,
       d.full_name_ar,
       s.name_ar,
       a.starts_at,
       to_char(a.starts_at at time zone p_tz, 'YYYY-MM-DD HH24:MI')
from public.appointments a
         join public.patients p on p.id = a.patient_id
         join public.doctors d on d.id = a.doctor_id
         join public.services s on s.id = a.service_id
where a.status = 'completed'
  and a.feedback_requested_at is null
  and a.ends_at >= now() - make_interval(days => greatest(p_days, 1))
  and a.ends_at < now()
order by a.ends_at desc;
$$;

create or replace function public.mark_feedback_requested(p_appointment_ids uuid[])
    returns int
    language plpgsql
    security definer
    set search_path = public
as
$$
declare
    v_count int;
begin
    with updated as (
        update public.appointments
            set feedback_requested_at = now(), updated_at = now()
            where id = any (p_appointment_ids) and feedback_requested_at is null
            returning 1)
    select count(*) into v_count from updated;
    return v_count;
end;
$$;

-- Stores a classified reply. Also opens a complaint when the reply is one.
create or replace function public.record_feedback(
    p_phone          text,
    p_rating         int default null,
    p_sentiment      text default null,
    p_summary        text default null,
    p_topics         text[] default null,
    p_raw_message    text default null,
    p_is_complaint   boolean default false,
    p_appointment_id uuid default null
)
    returns jsonb
    language plpgsql
    security definer
    set search_path = public
as
$$
declare
    v_patient_id   uuid;
    v_appointment  uuid := p_appointment_id;
    v_feedback_id  uuid;
    v_complaint_id uuid;
begin
    select id into v_patient_id from public.patients where phone = public.normalize_phone(p_phone);

    if v_appointment is null and v_patient_id is not null then
        select id into v_appointment
        from public.appointments
        where patient_id = v_patient_id
          and status = 'completed'
        order by ends_at desc
        limit 1;
    end if;

    insert into public.feedback (patient_id, appointment_id, rating, sentiment, summary, topics, raw_message,
                                 is_complaint)
    values (v_patient_id, v_appointment, p_rating,
            case when p_sentiment in ('positive', 'neutral', 'negative') then p_sentiment end,
            p_summary, p_topics, p_raw_message, coalesce(p_is_complaint, false))
    returning id into v_feedback_id;

    if coalesce(p_is_complaint, false) then
        insert into public.complaints (patient_id, appointment_id, subject, body, severity, channel)
        values (v_patient_id, v_appointment,
                coalesce(p_summary, 'شكوى من متابعة ما بعد الزيارة'),
                coalesce(p_raw_message, p_summary, ''),
                case when coalesce(p_rating, 3) <= 2 then 'high' else 'normal' end,
                'feedback')
        returning id into v_complaint_id;
    end if;

    return jsonb_build_object('ok', true, 'feedback_id', v_feedback_id, 'complaint_id', v_complaint_id);
end;
$$;

-- =====================================================================
-- Row level security
-- =====================================================================
-- n8n connects with the service_role key, which bypasses RLS. Enabling it
-- with no permissive policy means anon/authenticated keys — including one
-- leaked from a browser — cannot read patient data.

alter table public.patients    enable row level security;
alter table public.appointments enable row level security;
alter table public.complaints  enable row level security;
alter table public.feedback    enable row level security;
alter table public.n8n_chat_histories enable row level security;

-- Reference data may be read by anyone (useful for a public booking page).
alter table public.doctors  enable row level security;
alter table public.services enable row level security;

drop policy if exists doctors_read_public on public.doctors;
create policy doctors_read_public on public.doctors for select using (active);

drop policy if exists services_read_public on public.services;
create policy services_read_public on public.services for select using (active);
