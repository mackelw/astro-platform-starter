export const SESSION_COOKIE = 'brain_session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

// Unset password = open mode. Useful for `netlify dev`, and surfaced in the UI as
// a warning banner so it can never be an unnoticed default in production.
export function brainPassword(): string {
    return process.env.SECOND_BRAIN_PASSWORD ?? '';
}

export function authDisabled(): boolean {
    return !brainPassword();
}

function constantTimeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
        diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
}

async function sign(payload: string, secret: string): Promise<string> {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
    return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function checkPassword(candidate: string): boolean {
    const password = brainPassword();
    return !!password && constantTimeEqual(candidate ?? '', password);
}

export async function createSession(): Promise<{ value: string; maxAge: number }> {
    const expiresAt = Date.now() + SESSION_MAX_AGE * 1000;
    const signature = await sign(String(expiresAt), brainPassword());
    return { value: `${expiresAt}.${signature}`, maxAge: SESSION_MAX_AGE };
}

export async function verifySession(token?: string): Promise<boolean> {
    if (authDisabled()) return true;
    if (!token) return false;

    const [expiresAt, signature] = token.split('.');
    if (!expiresAt || !signature) return false;
    if (!Number(expiresAt) || Number(expiresAt) < Date.now()) return false;

    return constantTimeEqual(signature, await sign(expiresAt, brainPassword()));
}
