import type { ID, PromTemplateId, Side } from '../types';

/** الحمولة التي يرسلها السيرفر للمريض — نسخة مطابقة لما في src/server/portal.ts */
export interface PortalExercise {
    id: ID;
    name: string;
    nameEn: string;
    summary: string;
    summaryEn: string;
    instructions: string;
    instructionsEn: string;
    cautions: string;
    cautionsEn: string;
    videoUrl: string;
    imageUrl: string;
    equipment: string;
    equipmentEn: string;
}

export interface PortalItem {
    id: ID;
    exerciseId: ID;
    sets: number;
    reps: number;
    hold: number;
    rest: number;
    perDay: number;
    side: Side;
    resistance: string;
    note: string;
}

export interface PortalView {
    clinicName: string;
    clinicPhone: string;
    patient: { id: ID; name: string; code: string };
    program: {
        id: ID;
        title: string;
        notes: string;
        startDate: string;
        endDate: string;
        daysPerWeek: number;
        status: string;
        items: PortalItem[];
    } | null;
    exercises: PortalExercise[];
    logs: { date: string; doneItemIds: ID[]; pain: number; difficulty: number; note: string }[];
    proms: PromTemplateId[];
    promHistory: { templateId: PromTemplateId; date: string; score: number }[];
    messages: { from: string; authorName: string; text: string; createdAt: string }[];
    appointments: { date: string; time: string; status: string }[];
}

export class PortalError extends Error {
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
        throw new PortalError('تعذر الاتصال بالإنترنت. تحقق من الشبكة وحاول من جديد.', 0);
    }
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) throw new PortalError(body.error ?? 'حدث خطأ غير متوقع', response.status);
    return body as T;
}

export const portalApi = {
    session: (token?: string) => request<{ authenticated: boolean; view?: PortalView }>(`/api/portal/session${token ? `?t=${encodeURIComponent(token)}` : ''}`),

    login: (phone: string, code: string) =>
        request<{ authenticated: boolean; view: PortalView }>('/api/portal/login', { method: 'POST', body: JSON.stringify({ phone, code }) }),

    logout: () => request<{ ok: boolean }>('/api/portal/logout', { method: 'POST' }),

    saveLog: (payload: { date: string; doneItemIds: ID[]; pain: number; difficulty: number; note: string }) =>
        request<{ view: PortalView }>('/api/portal/submit', { method: 'POST', body: JSON.stringify({ action: 'log', ...payload }) }),

    saveProm: (templateId: PromTemplateId, answers: number[]) =>
        request<{ view: PortalView }>('/api/portal/submit', { method: 'POST', body: JSON.stringify({ action: 'prom', templateId, answers }) }),

    sendMessage: (text: string) => request<{ view: PortalView }>('/api/portal/submit', { method: 'POST', body: JSON.stringify({ action: 'message', text }) })
};
