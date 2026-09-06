import type { Appointment, AppointmentStatus, Database, ID, Patient, PaymentMethod } from './types';

export const todayISO = (): string => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
};

export const addDays = (isoDate: string, days: number): string => {
    const d = new Date(isoDate + 'T00:00:00');
    d.setDate(d.getDate() + days);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
};

export const monthKey = (isoDate: string): string => isoDate.slice(0, 7);

const dayNames = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const monthNames = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

export function formatDate(isoDate: string): string {
    if (!isoDate) return '—';
    const d = new Date(isoDate + 'T00:00:00');
    if (Number.isNaN(d.getTime())) return isoDate;
    return `${d.getDate()} ${monthNames[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatDateLong(isoDate: string): string {
    if (!isoDate) return '—';
    const d = new Date(isoDate + 'T00:00:00');
    if (Number.isNaN(d.getTime())) return isoDate;
    return `${dayNames[d.getDay()]} ${d.getDate()} ${monthNames[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatMonth(key: string): string {
    const [y, m] = key.split('-');
    return `${monthNames[Number(m) - 1]} ${y}`;
}

export function formatTime(time: string): string {
    if (!time) return '—';
    const [hRaw, m] = time.split(':');
    const h = Number(hRaw);
    const period = h < 12 ? 'ص' : 'م';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${m} ${period}`;
}

export function money(amount: number, currency = 'ج.م'): string {
    const value = Number.isFinite(amount) ? amount : 0;
    return `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${currency}`;
}

export function age(birthDate: string): string {
    if (!birthDate) return '—';
    const b = new Date(birthDate + 'T00:00:00');
    if (Number.isNaN(b.getTime())) return '—';
    const now = new Date();
    let years = now.getFullYear() - b.getFullYear();
    const beforeBirthday = now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate());
    if (beforeBirthday) years -= 1;
    return `${years} سنة`;
}

export const statusLabels: Record<AppointmentStatus, string> = {
    scheduled: 'محجوز',
    done: 'تم الحضور',
    cancelled: 'ملغي',
    noshow: 'لم يحضر'
};

export const statusClasses: Record<AppointmentStatus, string> = {
    scheduled: 'bg-sky-100 text-sky-800 ring-sky-200',
    done: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
    cancelled: 'bg-slate-200 text-slate-700 ring-slate-300',
    noshow: 'bg-amber-100 text-amber-800 ring-amber-200'
};

export const methodLabels: Record<PaymentMethod, string> = {
    cash: 'نقدي',
    card: 'بطاقة',
    transfer: 'تحويل',
    insurance: 'تأمين'
};

export const genderLabels = { male: 'ذكر', female: 'أنثى' } as const;

/** إجمالي مستحقات المريض = قيمة الجلسات - المدفوعات */
export function patientBalance(db: Database, patientId: ID) {
    const charges = db.sessions.filter((s) => s.patientId === patientId).reduce((sum, s) => sum + (Number(s.price) || 0), 0);
    const paid = db.payments.filter((p) => p.patientId === patientId).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    return { charges, paid, due: charges - paid };
}

export function patientName(db: Database, patientId: ID): string {
    return db.patients.find((p) => p.id === patientId)?.name ?? 'مريض محذوف';
}

export function therapistName(db: Database, therapistId: ID | ''): string {
    if (!therapistId) return 'غير محدد';
    return db.therapists.find((t) => t.id === therapistId)?.name ?? 'غير محدد';
}

export function sortAppointments(list: Appointment[]): Appointment[] {
    return [...list].sort((a, b) => (a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date)));
}

export function nextPatientCode(patients: Patient[]): string {
    const numbers = patients.map((p) => Number(String(p.code).replace(/\D/g, ''))).filter((n) => Number.isFinite(n) && n > 0);
    const next = numbers.length ? Math.max(...numbers) + 1 : 1001;
    return `P-${next}`;
}

export function searchPatients(patients: Patient[], query: string): Patient[] {
    const q = query.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter((p) => [p.name, p.phone, p.code, p.diagnosis].join(' ').toLowerCase().includes(q));
}

declare global {
    interface Window {
        claude?: { use?: (name: string) => Promise<{ save?: (request: { filename: string; data: string }) => Promise<unknown> } | null> };
    }
}

/**
 * تنزيل ملف من المتصفح. داخل صفحة Artifact على claude.ai لا تعمل روابط
 * التنزيل العادية، فنستخدم واجهة الحفظ التي توفرها المنصة إن وُجدت.
 */
export async function downloadFile(filename: string, content: string, type = 'application/json;charset=utf-8'): Promise<void> {
    try {
        const downloads = await window.claude?.use?.('downloads');
        if (downloads?.save) {
            await downloads.save({ filename, data: content });
            return;
        }
    } catch {
        // المستخدم رفض الحفظ أو الواجهة غير متاحة — نكمل بالطريقة العادية
        return;
    }

    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

export function toCSV(rows: (string | number)[][]): string {
    const escape = (cell: string | number) => `"${String(cell ?? '').replace(/"/g, '""')}"`;
    // إشارة BOM حتى تفتح الملفات العربية بشكل صحيح في Excel
    return '﻿' + rows.map((row) => row.map(escape).join(',')).join('\r\n');
}

export function escapeHtml(value: unknown): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** طباعة تقرير عبر إطار مخفي (أفضل من نافذة منبثقة قد يحجبها المتصفح) */
export function printHTML(title: string, innerHtml: string): void {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;left:-9999px;top:0;width:794px;height:1123px;border:0;';
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    if (!doc) {
        document.body.removeChild(frame);
        return;
    }
    doc.open();
    doc.write(`<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
        *{box-sizing:border-box}
        body{font-family:"Segoe UI",Tahoma,Arial,sans-serif;color:#1e293b;margin:28px;line-height:1.7}
        h1{font-size:20px;margin:0 0 4px}
        h2{font-size:15px;margin:22px 0 8px;color:#0f766e}
        .muted{color:#64748b;font-size:12px;margin:0}
        .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0f766e;padding-bottom:10px;margin-bottom:16px}
        table{width:100%;border-collapse:collapse;font-size:12px;margin-top:6px}
        th,td{border:1px solid #cbd5e1;padding:6px 8px;text-align:right}
        th{background:#f1f5f9}
        .totals{margin-top:14px;font-size:13px}
        .totals div{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px dashed #cbd5e1;max-width:320px}
        .due{font-weight:700;color:#be123c}
        .sign{margin-top:48px;display:flex;justify-content:space-between;font-size:12px;color:#475569}
        @page{margin:14mm}
    </style></head><body>${innerHtml}</body></html>`);
    doc.close();
    const cleanup = () => setTimeout(() => frame.remove(), 800);
    frame.contentWindow?.addEventListener('afterprint', cleanup);
    setTimeout(() => {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
        cleanup();
    }, 250);
}
