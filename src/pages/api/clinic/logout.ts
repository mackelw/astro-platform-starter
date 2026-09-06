import type { APIRoute } from 'astro';
import { json, logout } from '../../../server/auth';

export const prerender = false;

export const POST: APIRoute = async (context) => {
    await logout(context);
    return json({ ok: true });
};
