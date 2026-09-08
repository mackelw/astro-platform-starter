import type { APIRoute } from 'astro';
import { createPasswordFields, json, newId, setSessionCookie, login, toPublicUser } from '../../../server/auth';
import { mutateDatabase } from '../../../server/db';
import { visibleDatabase } from '../../../server/api';
import { defaultExercises, defaultServices } from '../../../clinic/storage';

export const prerender = false;

/** إنشاء حساب المدير الأول — متاح فقط ما دام لا يوجد أي مستخدم */
export const POST: APIRoute = async (context) => {
    const body = (await context.request.json().catch(() => ({}))) as { username?: string; password?: string; name?: string; clinicName?: string };
    const username = String(body.username ?? '').trim();
    const password = String(body.password ?? '');
    const name = String(body.name ?? '').trim() || username;

    if (username.length < 3) return json({ error: 'اسم المستخدم يجب ألا يقل عن 3 أحرف' }, 400);
    if (password.length < 8) return json({ error: 'كلمة السر يجب ألا تقل عن 8 أحرف' }, 400);

    const { result } = await mutateDatabase(async (db) => {
        if (db.users.length > 0) return 'تم إعداد النظام بالفعل';
        db.users.push({
            id: newId('u_'),
            username,
            name,
            role: 'admin',
            therapistId: '',
            patientId: '',
            memberIds: [],
            active: true,
            lastLoginAt: '',
            createdAt: new Date().toISOString(),
            ...(await createPasswordFields(password))
        });
        if (body.clinicName) db.settings.name = String(body.clinicName).slice(0, 200);

        // قائمة خدمات ومكتبة تمارين جاهزة من أول تشغيل — يعدّلها المركز كما يشاء
        const now = new Date().toISOString();
        if (db.services.length === 0) db.services = defaultServices().map((service) => ({ ...service, id: newId('v_'), createdAt: now }));
        if (db.exercises.length === 0) db.exercises = defaultExercises().map((exercise) => ({ ...exercise, id: newId('x_'), createdAt: now }));
        return null;
    });

    if (result) return json({ error: result }, 409);

    const outcome = await login(username, password);
    if ('error' in outcome) return json({ error: outcome.error }, 500);
    setSessionCookie(context, outcome.token);

    const { db } = await mutateDatabase((current) => current);
    return json({ user: toPublicUser(outcome.user), db: visibleDatabase(db, outcome.user) });
};
