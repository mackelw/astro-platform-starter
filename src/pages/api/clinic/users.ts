import type { APIRoute } from 'astro';
import type { Role } from '../../../clinic/types';
import { createPasswordFields, currentUser, json, newId, toPublicUser } from '../../../server/auth';
import { mutateDatabase, readDatabase, type ServerDatabase, type ServerUser } from '../../../server/db';

export const prerender = false;

const ROLES: Role[] = ['admin', 'reception', 'therapist'];

type Guard = { ok: true; user: ServerUser; db: ServerDatabase } | { ok: false; response: Response };

async function adminOnly(context: Parameters<APIRoute>[0]): Promise<Guard> {
    const db = await readDatabase();
    const user = await currentUser(context, db);
    if (!user) return { ok: false, response: json({ error: 'انتهت الجلسة، سجّل الدخول من جديد' }, 401) };
    if (user.role !== 'admin') return { ok: false, response: json({ error: 'هذه الصفحة للمدير فقط' }, 403) };
    return { ok: true, user, db };
}

export const GET: APIRoute = async (context) => {
    const guard = await adminOnly(context);
    if (!guard.ok) return guard.response;
    return json({ users: guard.db.users.map(toPublicUser) });
};

export const POST: APIRoute = async (context) => {
    const guard = await adminOnly(context);
    if (!guard.ok) return guard.response;

    const body = (await context.request.json().catch(() => ({}))) as {
        username?: string;
        password?: string;
        name?: string;
        role?: Role;
        therapistId?: string;
    };
    const username = String(body.username ?? '').trim();
    const password = String(body.password ?? '');
    const role = ROLES.includes(body.role as Role) ? (body.role as Role) : 'reception';

    if (username.length < 3) return json({ error: 'اسم المستخدم يجب ألا يقل عن 3 أحرف' }, 400);
    if (password.length < 8) return json({ error: 'كلمة السر يجب ألا تقل عن 8 أحرف' }, 400);

    const { db, result } = await mutateDatabase(async (current) => {
        if (current.users.some((u) => u.username.toLowerCase() === username.toLowerCase())) return 'اسم المستخدم موجود بالفعل';
        current.users.push({
            id: newId('u_'),
            username,
            name: String(body.name ?? '').trim() || username,
            role,
            therapistId: String(body.therapistId ?? ''),
            active: true,
            lastLoginAt: '',
            createdAt: new Date().toISOString(),
            ...(await createPasswordFields(password))
        });
        return null;
    });

    if (result) return json({ error: result }, 409);
    return json({ users: db.users.map(toPublicUser) });
};

export const PATCH: APIRoute = async (context) => {
    const guard = await adminOnly(context);
    if (!guard.ok) return guard.response;

    const body = (await context.request.json().catch(() => ({}))) as {
        id?: string;
        name?: string;
        role?: Role;
        therapistId?: string;
        active?: boolean;
        password?: string;
    };
    if (!body.id) return json({ error: 'طلب غير صالح' }, 400);
    if (body.password !== undefined && String(body.password).length < 8) return json({ error: 'كلمة السر يجب ألا تقل عن 8 أحرف' }, 400);

    const { db, result } = await mutateDatabase(async (current) => {
        const target = current.users.find((u) => u.id === body.id);
        if (!target) return 'المستخدم غير موجود';

        const admins = current.users.filter((u) => u.role === 'admin' && u.active);
        const losesAdmin = target.role === 'admin' && ((body.role && body.role !== 'admin') || body.active === false);
        if (losesAdmin && admins.length <= 1) return 'لا يمكن إلغاء آخر حساب مدير في النظام';

        if (body.name !== undefined) target.name = String(body.name).trim() || target.name;
        if (body.role && ROLES.includes(body.role)) target.role = body.role;
        if (body.therapistId !== undefined) target.therapistId = String(body.therapistId);
        if (body.active !== undefined) target.active = Boolean(body.active);
        if (body.password) {
            Object.assign(target, await createPasswordFields(String(body.password)));
            // تغيير كلمة السر ينهي كل جلسات هذا المستخدم المفتوحة
            current.authSessions = current.authSessions.filter((s) => s.userId !== target.id);
        }
        return null;
    });

    if (result) return json({ error: result }, 409);
    return json({ users: db.users.map(toPublicUser) });
};

export const DELETE: APIRoute = async (context) => {
    const guard = await adminOnly(context);
    if (!guard.ok) return guard.response;

    const id = new URL(context.url).searchParams.get('id');
    if (!id) return json({ error: 'طلب غير صالح' }, 400);
    if (id === guard.user.id) return json({ error: 'لا يمكنك حذف حسابك الحالي' }, 409);

    const { db, result } = await mutateDatabase((current) => {
        const target = current.users.find((u) => u.id === id);
        if (!target) return 'المستخدم غير موجود';
        if (target.role === 'admin' && current.users.filter((u) => u.role === 'admin').length <= 1) return 'لا يمكن حذف آخر حساب مدير';
        current.users = current.users.filter((u) => u.id !== id);
        current.authSessions = current.authSessions.filter((s) => s.userId !== id);
        return null;
    });

    if (result) return json({ error: result }, 409);
    return json({ users: db.users.map(toPublicUser) });
};
