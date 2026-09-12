/**
 * حفظ يوم المريض حين تنقطع الشبكة.
 *
 * المريض يعلّم تمارينه في مكان بلا إنترنت، فلو ضاع ما سجّله فقدنا أهم بيانات
 * الوحدة كلها — وفقدنا ثقته. نحفظ ما أرسله على جهازه ونعيد إرساله فور عودة الشبكة.
 *
 * إعادة الإرسال آمنة لأن السيرفر يعامل سجل اليوم كتحديث لا كإضافة: إرسال نفس
 * التاريخ مرتين يحدّث السجل نفسه ولا ينشئ ثانيًا.
 */
import type { ID } from '../types';

const PENDING_KEY = 'clinic-portal-pending-log';

export interface PendingLog {
    date: string;
    doneItemIds: ID[];
    pain: number;
    difficulty: number;
    note: string;
    /** متى سُجّل على الجهاز — يُعرض للمريض حتى يعرف أن ما يراه غير محفوظ بعد */
    savedAt: string;
}

export function readPending(): PendingLog | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = window.localStorage.getItem(PENDING_KEY);
        if (!raw) return null;
        const value = JSON.parse(raw) as PendingLog;
        return value && typeof value.date === 'string' && Array.isArray(value.doneItemIds) ? value : null;
    } catch {
        return null;
    }
}

export function writePending(log: Omit<PendingLog, 'savedAt'>): PendingLog | null {
    const value: PendingLog = { ...log, savedAt: new Date().toISOString() };
    try {
        window.localStorage.setItem(PENDING_KEY, JSON.stringify(value));
        return value;
    } catch {
        // المتصفح يمنع التخزين — لا نستطيع الوعد بالحفظ، والواجهة تُخبر المريض
        return null;
    }
}

export function clearPending(): void {
    try {
        window.localStorage.removeItem(PENDING_KEY);
    } catch {
        /* تجاهل */
    }
}
