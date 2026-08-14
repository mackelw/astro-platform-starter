/**
 * Session auth for Kartos.
 *
 * Passwords use scrypt with a per-user salt; sessions are opaque tokens stored
 * server-side and carried in an HttpOnly cookie. This is deliberately simple —
 * a real clinical deployment should add MFA, rate limiting, and audit logging.
 */

import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { COLLECTIONS, type PublicUser, type Role, type SessionRecord, type User } from './models';
import { mutate, readCollection, writeCollection } from './store';

const scrypt = promisify(scryptCb) as (pw: string, salt: string, len: number) => Promise<Buffer>;

export const COOKIE_NAME = 'kartos_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;

export async function hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16).toString('hex');
    const derived = await scrypt(password, salt, 64);
    return `${salt}:${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
    const [salt, hash] = stored.split(':');
    if (!salt || !hash) return false;
    const derived = await scrypt(password, salt, 64);
    const expected = Buffer.from(hash, 'hex');
    return derived.length === expected.length && timingSafeEqual(derived, expected);
}

export async function createSession(user: User): Promise<string> {
    const token = randomBytes(32).toString('hex');
    const record: SessionRecord = {
        token,
        userId: user.id,
        clinicId: user.clinicId,
        role: user.role,
        expiresAt: Date.now() + SESSION_TTL_MS
    };
    await mutate<SessionRecord, void>(COLLECTIONS.authSessions, (rows) => {
        // Drop expired records opportunistically so the collection stays small.
        const live = rows.filter((r) => r.expiresAt > Date.now());
        rows.length = 0;
        rows.push(...live, record);
    });
    return token;
}

export async function destroySession(token: string): Promise<void> {
    const rows = await readCollection<SessionRecord>(COLLECTIONS.authSessions);
    await writeCollection(
        COLLECTIONS.authSessions,
        rows.filter((r) => r.token !== token)
    );
}

export function toPublicUser(user: User): PublicUser {
    const { passwordHash: _ignored, ...rest } = user;
    return rest;
}

export interface AuthContext {
    user: PublicUser;
    session: SessionRecord;
}

/** Resolves the caller from the session cookie, or null if unauthenticated. */
export async function getAuth(request: Request): Promise<AuthContext | null> {
    const token = readCookie(request.headers.get('cookie'), COOKIE_NAME);
    if (!token) return null;

    const sessions = await readCollection<SessionRecord>(COLLECTIONS.authSessions);
    const session = sessions.find((s) => s.token === token);
    if (!session || session.expiresAt <= Date.now()) return null;

    const users = await readCollection<User>(COLLECTIONS.users);
    const user = users.find((u) => u.id === session.userId);
    if (!user || user.status !== 'active') return null;

    return { user: toPublicUser(user), session };
}

/** Throws a Response when the caller is missing or lacks one of `roles`. */
export async function requireAuth(request: Request, roles?: Role[]): Promise<AuthContext> {
    const auth = await getAuth(request);
    if (!auth) throw jsonError('Not authenticated', 401);
    if (roles && !roles.includes(auth.user.role)) throw jsonError('Not authorised for this action', 403);
    return auth;
}

export function jsonError(message: string, status: number): Response {
    return new Response(JSON.stringify({ error: message }), {
        status,
        headers: { 'content-type': 'application/json' }
    });
}

export function sessionCookie(token: string): string {
    const attrs = [
        `${COOKIE_NAME}=${token}`,
        'Path=/',
        'HttpOnly',
        'SameSite=Lax',
        `Max-Age=${SESSION_TTL_MS / 1000}`,
        'Secure'
    ];
    return attrs.join('; ');
}

export function clearCookie(): string {
    return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

function readCookie(header: string | null, name: string): string | null {
    if (!header) return null;
    for (const part of header.split(';')) {
        const [key, ...rest] = part.trim().split('=');
        if (key === name) return rest.join('=');
    }
    return null;
}
