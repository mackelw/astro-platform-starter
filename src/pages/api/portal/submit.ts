import type { APIRoute } from 'astro';
import { json } from '../../../server/auth';
import { mutateDatabase, readDatabase } from '../../../server/db';
import { addPatientMessage, addPromResponse, currentPatient, portalView, upsertLog } from '../../../server/portal';

export const prerender = false;

type Body = {
    action?: 'log' | 'prom' | 'message';
    date?: unknown;
    doneItemIds?: unknown;
    pain?: unknown;
    difficulty?: unknown;
    note?: unknown;
    templateId?: unknown;
    answers?: unknown;
    text?: unknown;
};

/** كل ما يكتبه المريض يمر من هنا: سجل اليوم، إجابة استبيان، رسالة */
export const POST: APIRoute = async (context) => {
    const body = (await context.request.json().catch(() => ({}))) as Body;
    if (!body.action || !['log', 'prom', 'message'].includes(body.action)) return json({ error: 'طلب غير صالح' }, 400);

    let unauthenticated = false;
    let denied: string | null = null;

    await mutateDatabase(async (db) => {
        const patient = await currentPatient(context, db);
        if (!patient) {
            unauthenticated = true;
            return;
        }
        if (body.action === 'log') denied = upsertLog(db, patient, body);
        else if (body.action === 'prom') denied = addPromResponse(db, patient, body.templateId, body.answers);
        else denied = addPatientMessage(db, patient, body.text);
    });

    if (unauthenticated) return json({ error: 'انتهت جلستك، افتح الرابط من جديد' }, 401);
    if (denied) return json({ error: denied }, 400);

    const db = await readDatabase();
    const patient = await currentPatient(context, db);
    if (!patient) return json({ error: 'انتهت جلستك، افتح الرابط من جديد' }, 401);
    return json({ view: portalView(db, patient) });
};
