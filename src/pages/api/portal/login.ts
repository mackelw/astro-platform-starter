import type { APIRoute } from 'astro';
import { json } from '../../../server/auth';
import { readDatabase } from '../../../server/db';
import { loginByCode, portalView } from '../../../server/portal';

export const prerender = false;

/** دخول برقم الموبايل ورمز الدخول الذي سلّمه المركز */
export const POST: APIRoute = async (context) => {
    const body = (await context.request.json().catch(() => ({}))) as { phone?: string; code?: string };
    const db = await readDatabase();

    const result = await loginByCode(context, db, String(body.phone ?? ''), String(body.code ?? ''));
    if ('error' in result) return json({ error: result.error }, 401);

    return json({ authenticated: true, view: portalView(await readDatabase(), result.patient) });
};
