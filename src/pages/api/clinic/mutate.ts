import type { APIRoute } from 'astro';
import { currentUser, json } from '../../../server/auth';
import { mutateDatabase } from '../../../server/db';
import { applyMutation, isValidMutation, visibleDatabase } from '../../../server/api';

export const prerender = false;

/** كل تعديل يمر من هنا: يُتحقق من الجلسة ثم من صلاحية الدور قبل الحفظ */
export const POST: APIRoute = async (context) => {
    const body = await context.request.json().catch(() => null);
    if (!isValidMutation(body)) return json({ error: 'طلب غير صالح' }, 400);

    let denied: string | null = null;
    let unauthenticated = false;

    const { db } = await mutateDatabase(async (current) => {
        const user = await currentUser(context, current);
        if (!user) {
            unauthenticated = true;
            return;
        }
        denied = applyMutation(current, user, body);
    });

    if (unauthenticated) return json({ error: 'انتهت الجلسة، سجّل الدخول من جديد' }, 401);
    if (denied) return json({ error: denied }, 403);

    const user = await currentUser(context, db);
    if (!user) return json({ error: 'انتهت الجلسة، سجّل الدخول من جديد' }, 401);
    return json({ db: visibleDatabase(db, user) });
};
