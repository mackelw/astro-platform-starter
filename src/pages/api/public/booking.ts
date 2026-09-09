import type { APIRoute } from 'astro';
import { json, newId } from '../../../server/auth';
import { mutateDatabase } from '../../../server/db';
import { availableSlots, clientKey, isHoneypotTrapped, rateLimited, submittedTooFast, tooManyPending, validateBooking } from '../../../server/public';

export const prerender = false;

type Outcome = { ok: true; id: string } | { ok: false; message: string; status: number };

/**
 * استقبال طلب حجز من زائر — بلا تسجيل دخول.
 *
 * لا يمر هذا الطلب من /api/clinic/mutate إطلاقًا: تلك النقطة تتطلب جلسة
 * وتفحص صلاحية الدور، وتبقى كذلك. هنا مسار ضيق يكتب في مجموعة الحجوزات
 * وحدها، ويفرض الحقول الحساسة من طرف السيرفر مهما أرسل العميل.
 */
export const POST: APIRoute = async ({ request }) => {
    const body = await request.json().catch(() => null);
    if (!body) return json({ error: 'طلب غير صالح' }, 400);

    // حقل الفخ إشارة قاطعة على روبوت: نرد بنجاح ظاهري فلا يعرف أن الطلب رُفض
    if (isHoneypotTrapped(body)) return json({ ok: true, reference: 'B-000000' });

    // السرعة إشارة ظنية: نرد بخطأ يمكن إعادة المحاولة بعده بدل ابتلاع الطلب
    if (submittedTooFast(body)) return json({ error: 'تعذر إرسال الطلب. من فضلك حاول مرة أخرى.' }, 400);

    let outcome: Outcome;
    try {
        // نعيد النتيجة من داخل المُعدِّل بدل التقاطها في متغير خارجي،
        // فيبقى النوع مضمونًا ولا يضيع التمييز بين النجاح والفشل.
        const { result } = await mutateDatabase<Outcome>((db) => {
            const checked = validateBooking(db, body);
            if ('error' in checked) return { ok: false, message: checked.error, status: 400 };
            const value = checked.value;

            if (rateLimited(clientKey(request, value.phone))) {
                return { ok: false, message: 'وصلتنا عدة طلبات من نفس الرقم. حاول بعد قليل أو اتصل بنا مباشرة.', status: 429 };
            }
            if (tooManyPending(db)) {
                return { ok: false, message: 'الحجز عبر الموقع متوقف مؤقتًا. من فضلك اتصل بنا لتحديد موعد.', status: 503 };
            }

            // الفحص الحاسم: التوقيت ما زال شاغرًا الآن. يجري داخل القفل نفسه
            // الذي يحمي القراءة والكتابة، فلا يفوز طلبان بنفس الموعد.
            if (!availableSlots(db, value.date, value.therapistId).includes(value.time)) {
                return { ok: false, message: 'هذا الموعد لم يعد متاحًا. اختر وقتًا آخر من فضلك.', status: 409 };
            }

            const id = newId('b_');
            db.bookings.push({
                ...value,
                id,
                // تُفرض من السيرفر مهما أرسل العميل
                status: 'new',
                patientId: '',
                appointmentId: '',
                createdAt: new Date().toISOString()
            });
            return { ok: true, id };
        });
        outcome = result;
    } catch {
        return json({ error: 'تعذر حفظ الطلب. حاول مرة أخرى.' }, 503);
    }

    if (!outcome.ok) return json({ error: outcome.message }, outcome.status);
    // رقم مرجعي قصير يذكره الزائر عند الاتصال — لا يكشف بنية المعرّفات
    return json({ ok: true, reference: `B-${outcome.id.slice(-6).toUpperCase()}` });
};
