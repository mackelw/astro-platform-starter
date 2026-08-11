import type { APIRoute } from 'astro';
import { SESSION_COOKIE, authDisabled, checkPassword, createSession } from '../../../lib/brain/auth';
import { json } from '../../../lib/brain/http';

export const prerender = false;

// Only ever redirect within this site, so a crafted ?next= can't bounce the
// browser to another origin after a successful login.
function safeNext(value: unknown): string {
    const next = typeof value === 'string' ? value : '';
    return next.startsWith('/') && !next.startsWith('//') ? next : '/brain';
}

export const POST: APIRoute = async ({ request, cookies }) => {
    if (authDisabled()) return json({ error: 'No password is configured for this brain' }, 400);

    const isForm = (request.headers.get('content-type') ?? '').includes('form');
    let password = '';
    let next = '/brain';

    if (isForm) {
        const form = await request.formData();
        password = String(form.get('password') ?? '');
        next = safeNext(form.get('next'));
    } else {
        const body = await request.json().catch(() => null);
        password = String(body?.password ?? '');
        next = safeNext(body?.next);
    }

    if (!checkPassword(password)) {
        return isForm
            ? new Response(null, { status: 303, headers: { Location: `/brain/login?error=1&next=${encodeURIComponent(next)}` } })
            : json({ error: 'Wrong password' }, 401);
    }

    const session = await createSession();
    cookies.set(SESSION_COOKIE, session.value, {
        httpOnly: true,
        secure: import.meta.env.PROD,
        sameSite: 'lax',
        path: '/',
        maxAge: session.maxAge
    });

    return isForm ? new Response(null, { status: 303, headers: { Location: next } }) : json({ ok: true });
};
