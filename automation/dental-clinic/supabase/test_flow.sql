\set ON_ERROR_STOP on
\pset pager off

-- Pin identifiers used across the run.
select id as doc from doctors where full_name_ar = 'د. أحمد سمير' \gset
select id as svc from services where name_ar = 'كشف وتشخيص' \gset
select id as svc_ortho from services where name_ar = 'متابعة تقويم' \gset

\echo '=== 1. available_slots returns real slots inside working hours ==='
select count(*) as slot_count,
       min(local_time) as first_time,
       max(local_time) as last_time
from available_slots(:'doc', :'svc');

\echo '=== 2. slots never start before now, never end after 18:00 Cairo ==='
select count(*) filter (where slot_start <= now())                              as in_past,
       count(*) filter (where (slot_end at time zone 'Africa/Cairo')::time > '18:00') as after_hours,
       count(*) filter (where extract(dow from (slot_start at time zone 'Africa/Cairo'))::int = 5) as on_friday
from available_slots(:'doc', :'svc');

\echo '=== 3. book the first free slot ==='
select slot_start as s1 from available_slots(:'doc', :'svc') limit 1 \gset
select book_appointment('0100 123 4567', :'doc', :'svc', :'s1', 'محمد مجدي', 'وجع في ضرس') -> 'ok' as booked,
       book_appointment('0100 123 4567', :'doc', :'svc', :'s1', 'محمد مجدي') ->> 'reason' as second_try_reason,
       jsonb_array_length(book_appointment('0111111111', :'doc', :'svc', :'s1', 'مريض تاني') -> 'alternatives') as alternatives_offered;

\echo '=== 4. the taken slot disappeared from availability ==='
select count(*) as still_offered from available_slots(:'doc', :'svc') where slot_start = :'s1';

\echo '=== 5. phone normalised to E.164 digits (leading 0 -> country code) ==='
select phone, full_name from patients;

\echo '=== 6. guard rails ==='
select book_appointment('01001234567', :'doc', :'svc_ortho', :'s1') ->> 'reason' as wrong_service,
       book_appointment('01001234567', :'doc', :'svc', now() - interval '1 day') ->> 'reason' as in_past,
       book_appointment('01001234567', :'doc', :'svc', (current_date + 40)::timestamptz + interval '3 hours') ->> 'reason' as at_3am,
       book_appointment('', :'doc', :'svc', :'s1') ->> 'reason' as no_phone;

\echo '=== 7. concurrent booking of the same slot: exactly one wins ==='
select slot_start as s2 from available_slots(:'doc', :'svc') limit 1 \gset
-- Two sessions racing is simulated by a savepoint-free double insert at the
-- same isolation level; the exclusion constraint is what actually decides.
select count(*) filter (where r ->> 'ok' = 'true')  as winners,
       count(*) filter (where r ->> 'reason' = 'slot_taken') as losers
from (select book_appointment('0122222222', :'doc', :'svc', :'s2', 'مريض أ') as r
      union all
      select book_appointment('0133333333', :'doc', :'svc', :'s2', 'مريض ب')) t;

\echo '=== 8. patient_history ==='
select patient_history('01001234567') -> 'patient' ->> 'full_name'         as name,
       jsonb_array_length(patient_history('01001234567') -> 'appointments') as appointments;

\echo '=== 9. reschedule: ownership is enforced by phone ==='
select (patient_history('01001234567') -> 'appointments' -> 0 ->> 'appointment_id') as appt \gset
select slot_start as s3 from available_slots(:'doc', :'svc') offset 3 limit 1 \gset
select reschedule_appointment('09999999999', :'appt', :'s3') ->> 'reason' as wrong_owner,
       reschedule_appointment('01001234567', :'appt', :'s3') ->> 'ok'     as rightful_owner,
       reschedule_appointment('01001234567', :'appt', :'s2') ->> 'reason' as onto_taken_slot;

\echo '=== 10. cancel frees the slot again ==='
select cancel_appointment('01001234567', :'appt', 'ظروف طارئة') ->> 'ok' as cancelled;
select count(*) as slot_is_free_again from available_slots(:'doc', :'svc') where slot_start = :'s3';
select cancel_appointment('01001234567', :'appt') ->> 'reason' as cancel_twice;

\echo '=== 11. complaints ==='
select log_complaint('01001234567', 'تأخير في الموعد', 'استنيت ساعة كاملة', 'high') ->> 'ok' as logged;
select subject, severity, status from complaints;

\echo '=== 12. weekly follow-up loop ==='
-- Backdate a booking so it looks like last week's visit.
insert into appointments (patient_id, doctor_id, service_id, starts_at, ends_at, status)
select p.id, :'doc', :'svc', now() - interval '3 days', now() - interval '3 days' + interval '30 minutes', 'booked'
from patients p where p.phone = normalize_phone('01001234567');

select mark_past_appointments_completed() as newly_completed;
select count(*) as pending_followup from visits_pending_feedback(7);

select appointment_id as fid from visits_pending_feedback(7) limit 1 \gset
select mark_feedback_requested(array[:'fid']::uuid[]) as marked;
select count(*) as pending_after_marking from visits_pending_feedback(7);

\echo '=== 13. feedback classified as a complaint opens a complaint row ==='
select record_feedback('01001234567', 2, 'negative', 'استنى كتير قبل الكشف',
                       array['الانتظار'], 'انتظرت ساعة والتعامل مكانش كويس', true) ->> 'ok' as recorded;
select (select count(*) from feedback)  as feedback_rows,
       (select count(*) from complaints) as complaint_rows,
       (select severity from complaints order by created_at desc limit 1) as escalated_severity;

\echo '=== 14. a cancelled appointment does not block re-booking the slot ==='
select book_appointment('01001234567', :'doc', :'svc', :'s3', 'محمد مجدي') ->> 'ok' as rebooked;
