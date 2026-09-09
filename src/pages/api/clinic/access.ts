import type { APIRoute } from 'astro';
import { currentUser, json } from '../../../server/auth';
import { mutateDatabase, readDatabase } from '../../../server/db';
import { visibleDatabase } from '../../../server/api';
import { issueAccess, revokeAccess } from '../../../server/portal';
import { can } from '../../../clinic/permissions';
import type { PatientAccessSecret } from '../../../clinic/types';

export const prerender = false;

/** إصدار مفتاح دخول المريض للبوابة أو تجديده أو إبطاله */
export const POST: APIRoute = async (context) => {
    const body = (await context.request.json().catch(() => ({}))) as { patientId?: string; action?: string };
    const patientId = String(body.patientId ?? '');
    const action = String(body.action ?? '');
    if (!patientId || !['issue', 'regenerate', 'revoke'].includes(action)) return json({ error: 'طلب غير صالح' }, 400);

    let unauthenticated = false;
    let denied: string | null = null;
    // النص الصريح للرابط والرمز يخرج من هنا مرة واحدة ولا يُحفظ في أي مكان
    let secret: PatientAccessSecret | null = null;

    await mutateDatabase(async (db) => {
        const user = await currentUser(context, db);
        if (!user) {
            unauthenticated = true;
            return;
        }
        if (!can(user.role, 'patientAccess', action === 'issue' ? 'create' : 'update')) {
            denied = 'ليس لديك صلاحية لهذا الإجراء';
            return;
        }
        if (!db.patients.some((p) => p.id === patientId)) {
            denied = 'المريض غير موجود';
            return;
        }
        if (action === 'revoke') revokeAccess(db, patientId);
        else secret = await issueAccess(db, patientId, action === 'regenerate');
    });

    if (unauthenticated) return json({ error: 'انتهت الجلسة، سجّل الدخول من جديد' }, 401);
    if (denied) return json({ error: denied }, 403);

    const db = await readDatabase();
    const user = await currentUser(context, db);
    if (!user) return json({ error: 'انتهت الجلسة، سجّل الدخول من جديد' }, 401);
    return json({ db: visibleDatabase(db, user), secret });
};
