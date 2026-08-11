-- =====================================================================
-- Sample clinic data — replace with the real doctors, services and
-- Google Calendar IDs before going live.
-- =====================================================================

insert into public.services (name, name_ar, duration_minutes, price)
values ('Consultation', 'كشف وتشخيص', 30, 300),
       ('Teeth Cleaning', 'تنظيف جير وتلميع', 45, 700),
       ('Filling', 'حشو تجميلي', 60, 900),
       ('Root Canal', 'علاج عصب', 90, 2500),
       ('Extraction', 'خلع', 45, 800),
       ('Whitening', 'تبييض أسنان', 60, 3000),
       ('Orthodontics Follow-up', 'متابعة تقويم', 30, 500)
on conflict do nothing;

insert into public.doctors (full_name, full_name_ar, speciality, speciality_ar, calendar_id, work_start, work_end,
                            work_days, slot_minutes)
values ('Dr. Ahmed Samir', 'د. أحمد سمير', 'General Dentistry', 'أسنان عام',
        'ahmed.samir@your-clinic.com', '10:00', '18:00', '{0,1,2,3,4}', 30),
       ('Dr. Mona Khaled', 'د. منى خالد', 'Orthodontics', 'تقويم أسنان',
        'mona.khaled@your-clinic.com', '14:00', '22:00', '{0,2,4,6}', 30),
       ('Dr. Youssef Hany', 'د. يوسف هاني', 'Endodontics', 'علاج جذور',
        'youssef.hany@your-clinic.com', '12:00', '20:00', '{1,3,6}', 30)
on conflict do nothing;

-- Every doctor offers a consultation; specialists also offer their own work.
insert into public.doctor_services (doctor_id, service_id)
select d.id, s.id
from public.doctors d
         join public.services s on true
where s.name_ar = 'كشف وتشخيص'
on conflict do nothing;

insert into public.doctor_services (doctor_id, service_id)
select d.id, s.id
from public.doctors d
         join public.services s on s.name_ar in ('تنظيف جير وتلميع', 'حشو تجميلي', 'خلع', 'تبييض أسنان')
where d.full_name_ar = 'د. أحمد سمير'
on conflict do nothing;

insert into public.doctor_services (doctor_id, service_id)
select d.id, s.id
from public.doctors d
         join public.services s on s.name_ar in ('متابعة تقويم')
where d.full_name_ar = 'د. منى خالد'
on conflict do nothing;

insert into public.doctor_services (doctor_id, service_id)
select d.id, s.id
from public.doctors d
         join public.services s on s.name_ar in ('علاج عصب', 'حشو تجميلي')
where d.full_name_ar = 'د. يوسف هاني'
on conflict do nothing;
