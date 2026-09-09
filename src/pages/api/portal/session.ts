import type { APIRoute } from 'astro';
import { json } from '../../../server/auth';
import { readDatabase } from '../../../server/db';
import { currentPatient, loginByToken, portalView } from '../../../server/portal';

export const prerender = false;

/**
 * حالة المريض الحالية. إن جاء الرابط السري في `?t=` نبدّله بجلسة كوكي
 * حتى لا يبقى الرمز في شريط العنوان ولا في سجل المتصفح بعد أول فتح.
 */
export const GET: APIRoute = async (context) => {
    const db = await readDatabase();
    const token = context.url.searchParams.get('t');

    if (token) {
        const patient = await loginByToken(context, db, token);
        if (!patient) return json({ authenticated: false, error: 'هذا الرابط لم يعد صالحًا. اطلب رابطًا جديدًا من المركز.' }, 401);
        // نقرأ من جديد لأن إنشاء الجلسة كتب في القاعدة
        return json({ authenticated: true, view: portalView(await readDatabase(), patient) });
    }

    const patient = await currentPatient(context, db);
    if (!patient) return json({ authenticated: false });
    return json({ authenticated: true, view: portalView(db, patient) });
};
