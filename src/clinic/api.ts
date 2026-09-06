import type { Database, PublicUser, Role } from './types';

declare const __CLINIC_MODE__: 'server' | 'local' | undefined;

/** 'local' = ملف يعمل بالنقر المزدوج ويحفظ في المتصفح، 'server' = نسخة مشتركة بتسجيل دخول */
export const MODE: 'server' | 'local' = typeof __CLINIC_MODE__ === 'undefined' ? 'server' : __CLINIC_MODE__;

export class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
        super(message);
        this.status = status;
    }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
    let response: Response;
    try {
        response = await fetch(url, { credentials: 'same-origin', headers: { 'content-type': 'application/json' }, ...init });
    } catch {
        throw new ApiError('تعذر الاتصال بالسيرفر — تأكد من الشبكة', 0);
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
        // ذكر كود الخطأ يساعد على تشخيص مشاكل النشر (404 = خدمة السيرفر غير منشورة)
        const fallback = response.status === 404 ? 'لم يتم العثور على خدمة السيرفر (404)' : `تعذر الوصول للسيرفر (كود ${response.status})`;
        throw new ApiError((body as { error?: string }).error ?? fallback, response.status);
    }
    return body as T;
}

export interface SessionResponse {
    authenticated: boolean;
    setupRequired: boolean;
    user?: PublicUser;
    db?: Database;
}

export const api = {
    session: () => request<SessionResponse>('/api/clinic/session'),

    setup: (payload: { username: string; password: string; name: string; clinicName?: string }) =>
        request<{ user: PublicUser; db: Database }>('/api/clinic/setup', { method: 'POST', body: JSON.stringify(payload) }),

    login: (username: string, password: string) =>
        request<{ user: PublicUser; db: Database }>('/api/clinic/login', { method: 'POST', body: JSON.stringify({ username, password }) }),

    logout: () => request<{ ok: boolean }>('/api/clinic/logout', { method: 'POST' }),

    mutate: (mutation: { resource: string; op: 'create' | 'update' | 'delete'; id?: string; data?: unknown }) =>
        request<{ db: Database }>('/api/clinic/mutate', { method: 'POST', body: JSON.stringify(mutation) }),

    listUsers: () => request<{ users: PublicUser[] }>('/api/clinic/users'),

    createUser: (payload: { username: string; password: string; name: string; role: Role; therapistId?: string }) =>
        request<{ users: PublicUser[] }>('/api/clinic/users', { method: 'POST', body: JSON.stringify(payload) }),

    updateUser: (payload: { id: string; name?: string; role?: Role; therapistId?: string; active?: boolean; password?: string }) =>
        request<{ users: PublicUser[] }>('/api/clinic/users', { method: 'PATCH', body: JSON.stringify(payload) }),

    deleteUser: (id: string) => request<{ users: PublicUser[] }>(`/api/clinic/users?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
};
