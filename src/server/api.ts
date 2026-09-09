/**
 * تطبيق التعديلات القادمة من الواجهة على قاعدة البيانات، مع فرض الصلاحيات
 * وتنقية الحقول — فلا يُحفظ إلا ما هو معروف ومسموح لهذا الدور.
 */
import type { Database, ID, ProgramItem, PromTemplateId, Side } from '../clinic/types';
import { can, type Action, type Resource } from '../clinic/permissions';
import { promTemplate } from '../clinic/prom';
import { newId } from './auth';
import type { ServerDatabase, ServerUser } from './db';

type FieldType = 'string' | 'number' | 'boolean' | 'string[]' | 'number[]' | 'url' | 'programItems' | 'proms';

/** المجموعات التي تُعدَّل عبر /api/clinic/mutate. سجل المريض ومفاتيح البوابة لها مساراتها الخاصة. */
type SchemaResource = Exclude<Resource, 'users' | 'programLogs' | 'patientAccess'>;

const SCHEMAS: Record<SchemaResource, Record<string, FieldType>> = {
    patients: {
        code: 'string',
        name: 'string',
        phone: 'string',
        gender: 'string',
        birthDate: 'string',
        address: 'string',
        job: 'string',
        diagnosis: 'string',
        referredBy: 'string',
        history: 'string',
        notes: 'string',
        plannedSessions: 'number',
        sessionPrice: 'number',
        archived: 'boolean'
    },
    therapists: { name: 'string', phone: 'string', specialty: 'string', active: 'boolean' },
    appointments: {
        patientId: 'string',
        therapistId: 'string',
        date: 'string',
        time: 'string',
        duration: 'number',
        status: 'string',
        notes: 'string'
    },
    sessions: {
        patientId: 'string',
        therapistId: 'string',
        appointmentId: 'string',
        date: 'string',
        treatments: 'string[]',
        painBefore: 'number',
        painAfter: 'number',
        notes: 'string',
        homeProgram: 'string',
        price: 'number'
    },
    payments: { patientId: 'string', date: 'string', amount: 'number', method: 'string', notes: 'string' },
    expenses: { date: 'string', title: 'string', category: 'string', amount: 'number', notes: 'string' },
    exercises: {
        name: 'string',
        region: 'string',
        equipment: 'string',
        level: 'string',
        instructions: 'string',
        videoUrl: 'url',
        imageUrl: 'url',
        defaultSets: 'number',
        defaultReps: 'number',
        defaultHold: 'number',
        defaultPerDay: 'number',
        tags: 'string[]',
        active: 'boolean'
    },
    programs: {
        patientId: 'string',
        therapistId: 'string',
        title: 'string',
        startDate: 'string',
        endDate: 'string',
        daysPerWeek: 'number',
        status: 'string',
        notes: 'string',
        items: 'programItems',
        proms: 'proms'
    },
    programTemplates: {
        title: 'string',
        diagnosis: 'string',
        daysPerWeek: 'number',
        notes: 'string',
        items: 'programItems',
        proms: 'proms'
    },
    promResponses: { patientId: 'string', templateId: 'string', date: 'string', answers: 'number[]' },
    portalMessages: { patientId: 'string', text: 'string', readByStaff: 'boolean' },
    settings: {
        name: 'string',
        doctorName: 'string',
        phone: 'string',
        address: 'string',
        currency: 'string',
        defaultSessionPrice: 'number',
        defaultDuration: 'number',
        workStart: 'string',
        workEnd: 'string'
    }
};

/** القيم المسموحة لكل حقل. المفتاح `مجموعة.حقل` يسبق المفتاح المجرد عند التعارض (status مثلًا). */
const ENUMS: Record<string, string[]> = {
    gender: ['male', 'female'],
    status: ['scheduled', 'done', 'cancelled', 'noshow'],
    'programs.status': ['active', 'paused', 'done'],
    method: ['cash', 'card', 'transfer', 'insurance'],
    region: ['neck', 'shoulder', 'elbow', 'wrist', 'back', 'hip', 'knee', 'ankle', 'core', 'balance', 'general'],
    level: ['easy', 'medium', 'hard'],
    templateId: ['nprs', 'odi', 'quickdash', 'lefs']
};

const PROM_IDS: PromTemplateId[] = ['nprs', 'odi', 'quickdash', 'lefs'];
const SIDES: Side[] = ['both', 'right', 'left'];

/** أعلى عدد تمارين في برنامج واحد */
const MAX_ITEMS = 60;

function clampInt(value: unknown, fallback: number, max: number): number {
    const n = Math.round(Number(value));
    return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : fallback;
}

/**
 * روابط الوسائط تُعرض داخل src و href، فلا نقبل إلا http/https —
 * وإلا صار الحقل بابًا لتنفيذ سكربت عبر javascript:
 */
function safeUrl(value: unknown): string {
    const text = String(value ?? '')
        .trim()
        .slice(0, 500);
    if (!text) return '';
    try {
        const parsed = new URL(text);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? text : '';
    } catch {
        return '';
    }
}

/** تنقية سطور البرنامج مع ضمان تفرّد المعرّفات حتى لا يختلط سجل إنجاز المريض */
function sanitizeItems(input: unknown): ProgramItem[] {
    if (!Array.isArray(input)) return [];
    const seen = new Set<string>();
    return input.slice(0, MAX_ITEMS).map((raw) => {
        const row = (raw ?? {}) as Record<string, unknown>;
        let id = typeof row.id === 'string' && row.id ? row.id.slice(0, 40) : '';
        if (!id || seen.has(id)) id = newId('i_');
        seen.add(id);
        const side = String(row.side ?? 'both');
        return {
            id,
            exerciseId: String(row.exerciseId ?? '').slice(0, 40),
            sets: clampInt(row.sets, 3, 20),
            reps: clampInt(row.reps, 10, 300),
            hold: clampInt(row.hold, 0, 600),
            rest: clampInt(row.rest, 30, 600),
            perDay: clampInt(row.perDay, 1, 10),
            side: (SIDES as string[]).includes(side) ? (side as Side) : 'both',
            resistance: String(row.resistance ?? '').slice(0, 60),
            note: String(row.note ?? '').slice(0, 300)
        };
    });
}

function sanitizeProms(input: unknown): PromTemplateId[] {
    if (!Array.isArray(input)) return [];
    const wanted = input.map((v) => String(v));
    return PROM_IDS.filter((id) => wanted.includes(id));
}

/** يحوّل ما أرسله العميل إلى حقول معروفة بأنواع صحيحة ويتجاهل أي شيء آخر */
function sanitize(resource: SchemaResource, input: unknown): Record<string, unknown> {
    const schema = SCHEMAS[resource];
    const data = (input ?? {}) as Record<string, unknown>;
    const clean: Record<string, unknown> = {};

    for (const [field, type] of Object.entries(schema)) {
        if (!(field in data)) continue;
        const value = data[field];
        if (type === 'number') {
            const num = Number(value);
            clean[field] = Number.isFinite(num) ? num : 0;
        } else if (type === 'boolean') {
            clean[field] = Boolean(value);
        } else if (type === 'string[]') {
            clean[field] = Array.isArray(value) ? value.map((v) => String(v).slice(0, 200)).slice(0, 50) : [];
        } else if (type === 'number[]') {
            clean[field] = Array.isArray(value) ? value.slice(0, 60).map((v) => clampInt(v, 0, 100)) : [];
        } else if (type === 'url') {
            clean[field] = safeUrl(value);
        } else if (type === 'programItems') {
            clean[field] = sanitizeItems(value);
        } else if (type === 'proms') {
            clean[field] = sanitizeProms(value);
        } else {
            const text = String(value ?? '').slice(0, 2000);
            const allowed = ENUMS[`${resource}.${field}`] ?? ENUMS[field];
            clean[field] = allowed && !allowed.includes(text) ? allowed[0] : text;
        }
    }
    return clean;
}

export type Mutation =
    | { resource: Exclude<SchemaResource, 'settings'>; op: 'create'; data: unknown }
    | { resource: Exclude<SchemaResource, 'settings'>; op: 'createMany'; items: unknown[] }
    | { resource: Exclude<SchemaResource, 'settings'>; op: 'update'; id: ID; data: unknown }
    | { resource: Exclude<SchemaResource, 'settings'>; op: 'delete'; id: ID }
    | { resource: 'settings'; op: 'update'; data: unknown };

const COLLECTIONS = [
    'patients',
    'therapists',
    'appointments',
    'sessions',
    'payments',
    'expenses',
    'exercises',
    'programs',
    'programTemplates',
    'promResponses',
    'portalMessages'
] as const;
type CollectionName = (typeof COLLECTIONS)[number];

/** أقصى عدد سجلات في عملية استيراد واحدة */
export const MAX_IMPORT = 500;

export function isValidMutation(body: unknown): body is Mutation {
    const m = body as Mutation;
    if (!m || typeof m !== 'object') return false;
    if (m.resource === 'settings') return m.op === 'update';
    if (!COLLECTIONS.includes(m.resource as CollectionName)) return false;
    if (m.op === 'create') return true;
    if (m.op === 'createMany') return Array.isArray(m.items) && m.items.length > 0 && m.items.length <= MAX_IMPORT;
    return (m.op === 'update' || m.op === 'delete') && typeof (m as { id?: unknown }).id === 'string';
}

/** يطبّق التعديل بعد التأكد من الصلاحية، ويعيد رسالة خطأ إن كان ممنوعًا */
export function applyMutation(db: ServerDatabase, user: ServerUser, mutation: Mutation): string | null {
    const action: Action = mutation.op === 'createMany' ? 'create' : mutation.op;
    if (!can(user.role, mutation.resource, action)) return 'ليس لديك صلاحية لهذا الإجراء';

    if (mutation.resource === 'settings') {
        Object.assign(db.settings, sanitize('settings', mutation.data));
        return null;
    }

    const collection = mutation.resource as CollectionName;
    const list = db[collection] as unknown as Record<string, unknown>[];

    if (mutation.op === 'delete') {
        const exists = list.some((row) => row.id === mutation.id);
        if (!exists) return 'العنصر غير موجود';
        db[collection] = list.filter((row) => row.id !== mutation.id) as never;
        if (collection === 'patients') {
            db.appointments = db.appointments.filter((a) => a.patientId !== mutation.id);
            db.sessions = db.sessions.filter((s) => s.patientId !== mutation.id);
            db.payments = db.payments.filter((p) => p.patientId !== mutation.id);
            db.programs = db.programs.filter((p) => p.patientId !== mutation.id);
            db.programLogs = db.programLogs.filter((g) => g.patientId !== mutation.id);
            db.promResponses = db.promResponses.filter((r) => r.patientId !== mutation.id);
            db.portalMessages = db.portalMessages.filter((m) => m.patientId !== mutation.id);
            db.patientAccess = db.patientAccess.filter((a) => a.patientId !== mutation.id);
        }
        // حذف برنامج يحذف معه سجل التزام المريض به
        if (collection === 'programs') {
            db.programLogs = db.programLogs.filter((g) => g.programId !== mutation.id);
        }
        return null;
    }

    // استيراد دفعة واحدة (قائمة مرضى مثلًا) — نفس التنقية المطبقة على السجل المفرد
    if (mutation.op === 'createMany') {
        for (const item of mutation.items) {
            const row = sanitize(collection, item);
            if (collection === 'sessions' && !can(user.role, 'payments', 'read')) delete row.price;
            list.push(buildRecord(db, user, collection, row));
        }
        return null;
    }

    const clean = sanitize(collection, mutation.data);

    // من لا يرى البيانات المالية لا يحدد أسعار الجلسات — السعر يأتي من ملف المريض
    if (collection === 'sessions' && !can(user.role, 'payments', 'read')) {
        delete clean.price;
    }

    if (mutation.op === 'create') {
        list.push(buildRecord(db, user, collection, clean));
        return null;
    }

    // إجابة استبيان لا تُغيَّر بعد حفظ درجتها، ونص رسالة أُرسلت لا يُعدَّل —
    // التعديل الوحيد المسموح على الرسالة هو تعليمها كمقروءة
    if (collection === 'promResponses') return 'لا يمكن تعديل هذا السجل بعد حفظه';
    if (collection === 'portalMessages') {
        const target = list.find((row) => row.id === mutation.id);
        if (!target) return 'العنصر غير موجود';
        target.readByStaff = Boolean((mutation.data as { readByStaff?: unknown })?.readByStaff);
        return null;
    }

    const target = list.find((row) => row.id === mutation.id);
    if (!target) return 'العنصر غير موجود';
    Object.assign(target, clean);
    return null;
}

function buildRecord(db: ServerDatabase, user: ServerUser, collection: CollectionName, clean: Record<string, unknown>): Record<string, unknown> {
    const record: Record<string, unknown> = { ...clean, id: newId(collection[0] + '_'), createdAt: new Date().toISOString() };

    if (collection === 'sessions' && record.price === undefined) {
        const patient = db.patients.find((p) => p.id === record.patientId);
        record.price = patient?.sessionPrice ?? db.settings.defaultSessionPrice;
    }

    // الدرجة تُحسب على السيرفر من معادلة المقياس، فلا يرسلها العميل ولا تتغير لاحقًا
    if (collection === 'promResponses') {
        const template = promTemplate(String(record.templateId) as PromTemplateId);
        const answers = Array.isArray(record.answers) ? (record.answers as number[]) : [];
        record.answers = answers.slice(0, template?.items.length ?? 0);
        record.score = template ? template.score(record.answers as number[]) : 0;
        record.filledBy = 'staff';
    }

    // هوية المرسل تأتي من الجلسة لا من الطلب
    if (collection === 'portalMessages') {
        record.from = 'staff';
        record.authorName = user.name;
        record.readByStaff = true;
    }

    return record;
}

/** النسخة التي يراها هذا الدور: تُحذف منها البيانات المالية لمن لا يملك صلاحيتها */
export function visibleDatabase(db: ServerDatabase, user: ServerUser): Database {
    const view: Database = {
        version: db.version,
        settings: db.settings,
        patients: db.patients,
        therapists: db.therapists,
        appointments: db.appointments,
        sessions: db.sessions,
        payments: db.payments,
        expenses: db.expenses,
        exercises: db.exercises,
        programs: db.programs,
        programTemplates: db.programTemplates,
        programLogs: db.programLogs,
        promResponses: db.promResponses,
        portalMessages: db.portalMessages,
        patientAccess: db.patientAccess
    };

    if (!can(user.role, 'payments', 'read')) {
        view.payments = [];
        view.sessions = view.sessions.map((s) => ({ ...s, price: 0 }));
        view.patients = view.patients.map((p) => ({ ...p, sessionPrice: 0 }));
    }
    if (!can(user.role, 'expenses', 'read')) view.expenses = [];
    return view;
}
