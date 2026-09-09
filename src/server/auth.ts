/**
 * تسجيل الدخول والجلسات.
 *
 * كلمات السر تُخزَّن مُجزّأة (PBKDF2-SHA256 بملح عشوائي) ولا تُحفظ أبدًا كنص صريح،
 * ورمز الجلسة يُخزَّن مُجزّأً أيضًا فلا يمكن انتحاله حتى لو تسربت قاعدة البيانات.
 */
import type { APIContext } from 'astro';
import type { ID, PublicUser, Role } from '../clinic/types';
import { mutateDatabase, readDatabase, type ServerDatabase, type ServerUser } from './db';

export const SESSION_COOKIE = 'clinic_session';
const SESSION_HOURS = 12;
const ITERATIONS = 210_000;
const MAX_ATTEMPTS = 8;
const LOCKOUT_MINUTES = 10;

const encoder = new TextEncoder();

function toHex(buffer: ArrayBuffer): string {
    return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomHex(bytes: number): string {
    const array = new Uint8Array(bytes);
    crypto.getRandomValues(array);
    return [...array].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hashPassword(password: string, salt: string, iterations = ITERATIONS): Promise<string> {
    const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(salt), iterations }, key, 256);
    return toHex(bits);
}

export async function createPasswordFields(password: string) {
    const passwordSalt = randomHex(16);
    return { passwordSalt, iterations: ITERATIONS, passwordHash: await hashPassword(password, passwordSalt, ITERATIONS) };
}

/** مقارنة ثابتة الزمن حتى لا يكشف زمن الرد عن صحة جزء من القيمة */
export function safeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

export async function hashToken(token: string): Promise<string> {
    return toHex(await crypto.subtle.digest('SHA-256', encoder.encode(token)));
}

export function toPublicUser(user: ServerUser): PublicUser {
    return {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        therapistId: user.therapistId,
        active: user.active,
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt
    };
}

export function newId(prefix: string): ID {
    return prefix + randomHex(8);
}

/* ------------------------ محاولات الدخول الفاشلة ------------------------ */

const attempts = new Map<string, { count: number; until: number }>();

export function isLockedOut(username: string): number {
    const entry = attempts.get(username.toLowerCase());
    if (!entry || entry.until < Date.now()) return 0;
    return entry.count >= MAX_ATTEMPTS ? Math.ceil((entry.until - Date.now()) / 60000) : 0;
}

function recordFailure(username: string): void {
    const key = username.toLowerCase();
    const entry = attempts.get(key);
    const until = Date.now() + LOCKOUT_MINUTES * 60_000;
    attempts.set(key, entry && entry.until > Date.now() ? { count: entry.count + 1, until } : { count: 1, until });
}

function clearFailures(username: string): void {
    attempts.delete(username.toLowerCase());
}

/* ------------------------------ الجلسات ------------------------------ */

export function setSessionCookie(context: APIContext, token: string): void {
    context.cookies.set(SESSION_COOKIE, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: context.url.protocol === 'https:',
        path: '/',
        maxAge: SESSION_HOURS * 3600
    });
}

export function clearSessionCookie(context: APIContext): void {
    context.cookies.delete(SESSION_COOKIE, { path: '/' });
}

/** يتحقق من كلمة السر وينشئ جلسة جديدة، ويعيد الرمز مع بيانات المستخدم */
export async function login(username: string, password: string): Promise<{ token: string; user: ServerUser } | { error: string }> {
    const waitMinutes = isLockedOut(username);
    if (waitMinutes) return { error: `تم إيقاف المحاولات مؤقتًا بسبب تكرار الخطأ. حاول بعد ${waitMinutes} دقيقة.` };

    const db = await readDatabase();
    const user = db.users.find((u) => u.username.toLowerCase() === username.trim().toLowerCase());

    // نحسب التجزئة حتى مع عدم وجود المستخدم حتى لا يكشف زمن الرد عن الأسماء الموجودة
    const salt = user?.passwordSalt ?? 'placeholder-salt';
    const iterations = user?.iterations ?? ITERATIONS;
    const candidate = await hashPassword(password, salt, iterations);

    if (!user || !safeEqual(candidate, user.passwordHash)) {
        recordFailure(username);
        return { error: 'اسم المستخدم أو كلمة السر غير صحيحة' };
    }
    if (!user.active) return { error: 'هذا الحساب موقوف. راجع مدير النظام.' };

    clearFailures(username);
    const token = randomHex(32);
    const tokenHash = await hashToken(token);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SESSION_HOURS * 3600_000).toISOString();

    await mutateDatabase((current) => {
        current.authSessions = current.authSessions.filter((s) => s.expiresAt > now.toISOString());
        current.authSessions.push({ tokenHash, userId: user.id, createdAt: now.toISOString(), expiresAt });
        const stored = current.users.find((u) => u.id === user.id);
        if (stored) stored.lastLoginAt = now.toISOString();
    });

    return { token, user };
}

export async function logout(context: APIContext): Promise<void> {
    const token = context.cookies.get(SESSION_COOKIE)?.value;
    clearSessionCookie(context);
    if (!token) return;
    const tokenHash = await hashToken(token);
    await mutateDatabase((db) => {
        db.authSessions = db.authSessions.filter((s) => s.tokenHash !== tokenHash);
    });
}

/** يعيد المستخدم صاحب الجلسة الحالية، أو null إذا لم يسجّل الدخول أو انتهت جلسته */
export async function currentUser(context: APIContext, db?: ServerDatabase): Promise<ServerUser | null> {
    const token = context.cookies.get(SESSION_COOKIE)?.value;
    if (!token) return null;
    const data = db ?? (await readDatabase());
    const tokenHash = await hashToken(token);
    const session = data.authSessions.find((s) => s.tokenHash === tokenHash);
    if (!session || session.expiresAt <= new Date().toISOString()) return null;
    const user = data.users.find((u) => u.id === session.userId);
    return user && user.active ? user : null;
}

export function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
}

export function requireRole(user: ServerUser | null, roles: Role[]): boolean {
    return Boolean(user && roles.includes(user.role));
}
