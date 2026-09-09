import type { APIRoute } from 'astro';
import { currentUser, json, newId } from '../../../server/auth';
import { mutateDatabase } from '../../../server/db';
import { visibleDatabase } from '../../../server/api';
import { can } from '../../../clinic/permissions';
import { nextPatientCode } from '../../../clinic/utils';

export const prerender = false;

type Outcome = { ok: true } | { ok: false; message: string; status: number };

/**
 * تحويل طلب حجز إلى مريض وموعد حقيقيين.
 *
 * الثلاثة (إنشاء المريض، إنشاء الموعد، تحديث الطلب) تجري داخل عملية حفظ
 * واحدة، فلا يحدث أن يُنشأ مريض ثم يفشل الموعد ويبقى الطلب معلقًا.
 * لو كان للمريض ملف سابق بنفس رقم الهاتف نربط به بدل تكرار الملف.
 */
export const POST: APIRoute = async (context) => {
    const body = (await context.request.json().catch(() => ({}))) as { id?: string };
    const bookingId = String(body.id ?? '');
    if (!bookingId) return json({ error: 'طلب غير صالح' }, 400);

    let outcome: Outcome = { ok: false, message: 'انتهت الجلسة، سجّل الدخول من جديد', status: 401 };

    const { db } = await mutateDatabase((current) => {
        return currentUser(context, current).then((user) => {
            if (!user) return;

            if (!can(user.role, 'bookings', 'update') || !can(user.role, 'patients', 'create') || !can(user.role, 'appointments', 'create')) {
                outcome = { ok: false, message: 'ليس لديك صلاحية لهذا الإجراء', status: 403 };
                return;
            }

            const booking = current.bookings.find((b) => b.id === bookingId);
            if (!booking) {
                outcome = { ok: false, message: 'الطلب غير موجود', status: 404 };
                return;
            }
            if (booking.status === 'converted') {
                outcome = { ok: false, message: 'تم تحويل هذا الطلب من قبل', status: 409 };
                return;
            }

            const now = new Date().toISOString();

            // ملف قديم بنفس الرقم؟ نستخدمه بدل إنشاء ملف مكرر لنفس الشخص
            const existing = current.patients.find((p) => p.phone && p.phone === booking.phone);
            let patientId = existing?.id ?? '';

            if (!patientId) {
                patientId = newId('p_');
                current.patients.push({
                    id: patientId,
                    code: nextPatientCode(current.patients),
                    name: booking.name,
                    phone: booking.phone,
                    gender: 'male',
                    birthDate: '',
                    address: '',
                    job: '',
                    diagnosis: '',
                    referredBy: '',
                    history: booking.message,
                    notes: booking.email ? `البريد: ${booking.email}` : '',
                    plannedSessions: 0,
                    sessionPrice: current.settings.defaultSessionPrice,
                    archived: false,
                    createdAt: now
                });
            }

            const appointmentId = newId('a_');
            current.appointments.push({
                id: appointmentId,
                patientId,
                therapistId: booking.therapistId,
                date: booking.date,
                time: booking.time,
                duration: current.settings.defaultDuration,
                status: 'scheduled',
                notes: booking.message ? `حجز من الموقع: ${booking.message}` : 'حجز من الموقع',
                createdAt: now
            });

            booking.status = 'converted';
            booking.patientId = patientId;
            booking.appointmentId = appointmentId;
            outcome = { ok: true };
        });
    });

    if (!outcome.ok) return json({ error: outcome.message }, outcome.status);

    const user = await currentUser(context, db);
    if (!user) return json({ error: 'انتهت الجلسة، سجّل الدخول من جديد' }, 401);
    return json({ db: visibleDatabase(db, user) });
};
