import type { APIRoute } from 'astro';
import { json, login, setSessionCookie, toPublicUser } from '../../../server/auth';
import { readDatabase } from '../../../server/db';
import { visibleDatabase } from '../../../server/api';

export const prerender = false;

export const POST: APIRoute = async (context) => {
    const body = (await context.request.json().catch(() => ({}))) as { username?: string; password?: string };
    const outcome = await login(String(body.username ?? ''), String(body.password ?? ''));
    if ('error' in outcome) return json({ error: outcome.error }, 401);

    setSessionCookie(context, outcome.token);
    const db = await readDatabase();
    return json({ user: toPublicUser(outcome.user), db: visibleDatabase(db, outcome.user) });
};
