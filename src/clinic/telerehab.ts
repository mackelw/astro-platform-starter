/**
 * حسابات وحدة التأهيل عن بُعد.
 *
 * كل رقم في لوحة المتابعة مشتق من علاقة واحدة: البرنامج ← سجل المريض اليومي.
 * تجميعها هنا يمنع اختلاف طريقة الحساب بين شاشة وأخرى.
 */
import type { BodyRegion, Database, ID, Program, ProgramLog, PromResponse, Side } from './types';
import { promTemplate, PROM_MCID } from './prom';
import { addDays, todayISO } from './utils';

export const REGION_LABELS: Record<BodyRegion, string> = {
    neck: 'الرقبة',
    shoulder: 'الكتف',
    elbow: 'الكوع',
    wrist: 'الرسغ واليد',
    back: 'الظهر',
    hip: 'الحوض والفخذ',
    knee: 'الركبة',
    ankle: 'الكاحل والقدم',
    core: 'عضلات الجذع',
    balance: 'الاتزان',
    general: 'عام'
};

export const LEVEL_LABELS = { easy: 'سهل', medium: 'متوسط', hard: 'متقدم' } as const;

export const SIDE_LABELS: Record<Side, string> = { both: 'الجهتان', right: 'اليمين', left: 'اليسار' };

export const PROGRAM_STATUS_LABELS = { active: 'نشط', paused: 'موقوف مؤقتًا', done: 'منتهٍ' } as const;

export const PROGRAM_STATUS_CLASSES = {
    active: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
    paused: 'bg-amber-100 text-amber-800 ring-amber-200',
    done: 'bg-slate-200 text-slate-700 ring-slate-300'
} as const;

/** عدد الأيام بين تاريخين (شامل الطرفين) */
export function daysBetween(from: string, to: string): number {
    if (!from || !to) return 0;
    const a = new Date(from + 'T00:00:00').getTime();
    const b = new Date(to + 'T00:00:00').getTime();
    if (Number.isNaN(a) || Number.isNaN(b)) return 0;
    return Math.floor((b - a) / 86_400_000) + 1;
}

export interface Adherence {
    /** الأيام التي نفّذ فيها المريض تمرينًا واحدًا على الأقل */
    doneDays: number;
    /** الأيام المتوقعة حتى اليوم حسب عدد أيام التدريب في الأسبوع */
    expectedDays: number;
    percent: number;
    /** آخر يوم سجّل فيه المريض شيئًا */
    lastDate: string;
    /** كم يومًا مضى بلا تسجيل — أساس تنبيه الانقطاع */
    daysSilent: number;
    /** أيام متتالية من الالتزام حتى اليوم */
    streak: number;
    averagePain: number | null;
    /** فرق متوسط الألم بين أول ثلاثة أيام وآخر ثلاثة (بالسالب = تحسّن) */
    painChange: number | null;
}

export function adherence(program: Program | null, logs: ProgramLog[], today = todayISO()): Adherence {
    const empty: Adherence = { doneDays: 0, expectedDays: 0, percent: 0, lastDate: '', daysSilent: 0, streak: 0, averagePain: null, painChange: null };
    if (!program) return empty;

    const own = logs.filter((g) => g.programId === program.id && g.date <= today).sort((a, b) => a.date.localeCompare(b.date));

    const active = own.filter((g) => g.doneItemIds.length > 0);
    const until = program.endDate && program.endDate < today ? program.endDate : today;
    const elapsed = Math.max(0, daysBetween(program.startDate, until));
    const perWeek = Math.min(7, Math.max(1, program.daysPerWeek || 7));
    const expectedDays = Math.max(1, Math.round((elapsed * perWeek) / 7));

    const lastDate = active.length ? active[active.length - 1].date : '';
    const daysSilent = lastDate ? Math.max(0, daysBetween(lastDate, today) - 1) : elapsed;

    // سلسلة الالتزام: نعدّ للخلف من اليوم أو من الأمس (حتى لا تنكسر قبل أن ينتهي اليوم)
    const doneSet = new Set(active.map((g) => g.date));
    let streak = 0;
    let cursor = doneSet.has(today) ? today : addDays(today, -1);
    while (doneSet.has(cursor)) {
        streak += 1;
        cursor = addDays(cursor, -1);
    }

    const pains = active.map((g) => g.pain).filter((p) => Number.isFinite(p));
    const averagePain = pains.length ? Math.round((pains.reduce((t, v) => t + v, 0) / pains.length) * 10) / 10 : null;

    let painChange: number | null = null;
    if (pains.length >= 4) {
        const mean = (list: number[]) => list.reduce((t, v) => t + v, 0) / list.length;
        painChange = Math.round((mean(pains.slice(-3)) - mean(pains.slice(0, 3))) * 10) / 10;
    }

    return {
        doneDays: active.length,
        expectedDays,
        percent: Math.min(100, Math.round((active.length / expectedDays) * 100)),
        lastDate,
        daysSilent,
        streak,
        averagePain,
        painChange
    };
}

/** البرنامج النشط لمريض (أو آخر برنامج غير منتهٍ) */
export function activeProgram(db: Database, patientId: ID): Program | null {
    return db.programs.filter((p) => p.patientId === patientId && p.status !== 'done').sort((a, b) => b.startDate.localeCompare(a.startDate))[0] ?? null;
}

export function programLogs(db: Database, programId: ID): ProgramLog[] {
    return db.programLogs.filter((g) => g.programId === programId).sort((a, b) => b.date.localeCompare(a.date));
}

export function exerciseName(db: Database, exerciseId: ID): string {
    return db.exercises.find((x) => x.id === exerciseId)?.name ?? 'تمرين محذوف';
}

/** وصف البارامترات في سطر واحد كما يُطبع للمريض: «٣ مجموعات × ١٢ تكرار — ثبات ٥ ث» */
export function itemSummary(item: { sets: number; reps: number; hold: number; perDay: number; side: Side; resistance: string }): string {
    const parts: string[] = [];
    if (item.sets > 0) parts.push(`${item.sets} مجموعة`);
    if (item.reps > 0) parts.push(`${item.reps} تكرار`);
    if (item.hold > 0) parts.push(`ثبات ${item.hold} ثانية`);
    if (item.perDay > 1) parts.push(`${item.perDay} مرات يوميًا`);
    if (item.side !== 'both') parts.push(SIDE_LABELS[item.side]);
    if (item.resistance) parts.push(item.resistance);
    return parts.join(' · ') || '—';
}

export interface PromTrend {
    templateId: PromResponse['templateId'];
    name: string;
    unit: string;
    first: PromResponse;
    last: PromResponse;
    change: number;
    /** هل التغير تجاوز الفرق الأدنى المهم إكلينيكيًا؟ */
    meaningful: boolean;
    improved: boolean;
}

/** اتجاه كل مقياس أجاب عليه المريض مرتين فأكثر */
export function promTrends(responses: PromResponse[]): PromTrend[] {
    const byTemplate = new Map<string, PromResponse[]>();
    for (const row of responses) {
        const list = byTemplate.get(row.templateId) ?? [];
        list.push(row);
        byTemplate.set(row.templateId, list);
    }

    const trends: PromTrend[] = [];
    for (const [id, list] of byTemplate) {
        if (list.length < 2) continue;
        const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
        const template = promTemplate(sorted[0].templateId);
        if (!template) continue;
        const first = sorted[0];
        const last = sorted[sorted.length - 1];
        const change = Math.round((last.score - first.score) * 10) / 10;
        const improved = template.betterWhen === 'lower' ? change < 0 : change > 0;
        trends.push({
            templateId: sorted[0].templateId,
            name: template.short,
            unit: template.unit,
            first,
            last,
            change,
            meaningful: Math.abs(change) >= PROM_MCID[template.id],
            improved
        });
        void id;
    }
    return trends;
}

/** تنبيهات لوحة المتابعة، الأهم أولًا */
export type AlertLevel = 'danger' | 'warn' | 'ok';

export function adherenceLevel(a: Adherence): AlertLevel {
    if (a.daysSilent >= 5 || a.percent < 40) return 'danger';
    if (a.daysSilent >= 3 || a.percent < 70) return 'warn';
    return 'ok';
}

export const LEVEL_CLASSES: Record<AlertLevel, string> = {
    danger: 'bg-rose-100 text-rose-800 ring-rose-200',
    warn: 'bg-amber-100 text-amber-800 ring-amber-200',
    ok: 'bg-emerald-100 text-emerald-800 ring-emerald-200'
};

/* ------------------------------- وسائط التمرين ------------------------------- */

export type VideoKind = 'file' | 'youtube' | 'vimeo' | 'link' | 'none';

/**
 * يقرر كيف يُعرض رابط الفيديو.
 * التضمين مسموح ليوتيوب وفيميو فقط، وأي رابط آخر يُفتح في تبويب جديد —
 * فلا نضع صفحة عشوائية داخل إطار في صفحة المريض.
 */
export function videoEmbed(url: string): { kind: VideoKind; src: string } {
    const raw = (url || '').trim();
    if (!raw) return { kind: 'none', src: '' };

    let parsed: URL;
    try {
        parsed = new URL(raw);
    } catch {
        return { kind: 'none', src: '' };
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return { kind: 'none', src: '' };

    const host = parsed.hostname.replace(/^www\./, '');

    if (host === 'youtube.com' || host === 'm.youtube.com') {
        const id = parsed.searchParams.get('v');
        if (id) return { kind: 'youtube', src: `https://www.youtube.com/embed/${encodeURIComponent(id)}` };
    }
    if (host === 'youtu.be') {
        const id = parsed.pathname.slice(1);
        if (id) return { kind: 'youtube', src: `https://www.youtube.com/embed/${encodeURIComponent(id)}` };
    }
    if (host === 'vimeo.com') {
        const id = parsed.pathname.split('/').filter(Boolean)[0];
        if (id && /^\d+$/.test(id)) return { kind: 'vimeo', src: `https://player.vimeo.com/video/${id}` };
    }
    if (/\.(mp4|webm|ogg|ogv|mov)$/i.test(parsed.pathname)) return { kind: 'file', src: raw };

    return { kind: 'link', src: raw };
}
