import type { APIRoute } from 'astro';
import { json, hashToken } from '../../../server/auth';
import { mutateDatabase } from '../../../server/db';
import { clearPortalCookie, PORTAL_COOKIE } from '../../../server/portal';

export const prerender = false;

export const POST: APIRoute = async (context) => {
    const token = context.cookies.get(PORTAL_COOKIE)?.value;
    clearPortalCookie(context);
    if (token) {
        const tokenHash = await hashToken(token);
        await mutateDatabase((db) => {
            db.portalSessions = db.portalSessions.filter((s) => s.tokenHash !== tokenHash);
        });
    }
    return json({ ok: true });
};
