import type { APIRoute } from 'astro';
import { json } from '../../../server/auth';
import { readDatabase } from '../../../server/db';
import { availableSlots, isBookableDate } from '../../../server/public';

export const prerender = false;

/**
 * المواعيد الشاغرة في يوم واحد.
 * الرد أوقات فارغة فقط — لا مواعيد ولا أسماء مرضى ولا حتى عدد المحجوز،
 * حتى لا يستدل زائر على حركة المركز من صفحة عامة.
 */
export const GET: APIRoute = async ({ url }) => {
    const date = url.searchParams.get('date') ?? '';
    const therapistId = url.searchParams.get('therapistId') ?? '';

    if (!isBookableDate(date)) return json({ error: 'التاريخ خارج المدة المتاحة للحجز' }, 400);

    try {
        const db = await readDatabase();
        if (therapistId && !db.therapists.some((th) => th.id === therapistId && th.active)) {
            return json({ error: 'الأخصائي المطلوب غير متاح' }, 400);
        }
        return json({
            date,
            duration: db.settings.defaultDuration,
            slots: availableSlots(db, date, therapistId)
        });
    } catch {
        return json({ error: 'تعذر تحميل المواعيد المتاحة' }, 503);
    }
};
