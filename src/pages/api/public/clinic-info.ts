import type { APIRoute } from 'astro';
import { json } from '../../../server/auth';
import { readDatabase } from '../../../server/db';

export const prerender = false;

/**
 * بيانات المركز المعلنة على الموقع. تُرسل الحقول المذكورة صراحة فقط،
 * فلا يتسرب سعر الجلسة الافتراضي ولا هواتف الأخصائيين ولا أي بيان آخر.
 */
export const GET: APIRoute = async () => {
    try {
        const db = await readDatabase();
        return json({
            name: db.settings.name,
            phone: db.settings.phone,
            address: db.settings.address,
            workStart: db.settings.workStart,
            workEnd: db.settings.workEnd,
            defaultDuration: db.settings.defaultDuration,
            therapists: db.therapists.filter((th) => th.active).map((th) => ({ id: th.id, name: th.name, specialty: th.specialty }))
        });
    } catch {
        return json({ error: 'تعذر تحميل بيانات المركز' }, 503);
    }
};
