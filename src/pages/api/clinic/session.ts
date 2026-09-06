import type { APIRoute } from 'astro';
import { currentUser, json, toPublicUser } from '../../../server/auth';
import { readDatabase } from '../../../server/db';
import { visibleDatabase } from '../../../server/api';

export const prerender = false;

/** حالة الدخول الحالية: هل يحتاج المركز إعدادًا أوليًا؟ ومن المستخدم الحالي؟ */
export const GET: APIRoute = async (context) => {
    const db = await readDatabase();
    if (db.users.length === 0) return json({ authenticated: false, setupRequired: true });

    const user = await currentUser(context, db);
    if (!user) return json({ authenticated: false, setupRequired: false });

    return json({ authenticated: true, setupRequired: false, user: toPublicUser(user), db: visibleDatabase(db, user) });
};
