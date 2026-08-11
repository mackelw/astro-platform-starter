import { defineMiddleware } from 'astro:middleware';
import { SESSION_COOKIE, authDisabled, verifySession } from './lib/brain/auth';

const PROTECTED = [/^\/brain(\/|$)/, /^\/api\/notes(\/|$)/, /^\/api\/capture$/];
const PUBLIC = [/^\/brain\/login$/, /^\/api\/auth\//];

export const onRequest = defineMiddleware(async ({ url, cookies, request }, next) => {
    const path = url.pathname.replace(/\/$/, '') || '/';
    const needsAuth = PROTECTED.some((pattern) => pattern.test(path)) && !PUBLIC.some((pattern) => pattern.test(path));

    if (!needsAuth || authDisabled()) return next();
    if (await verifySession(cookies.get(SESSION_COOKIE)?.value)) return next();

    // API callers get a status they can act on; browsers get sent to the login form.
    if (path.startsWith('/api/') || request.headers.get('accept')?.includes('application/json')) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
        });
    }
    return Response.redirect(new URL(`/brain/login?next=${encodeURIComponent(url.pathname)}`, url), 302);
});
