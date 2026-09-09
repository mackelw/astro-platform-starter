/**
 * تطبيق التعديلات القادمة من الواجهة على قاعدة البيانات، مع فرض الصلاحيات
 * وتنقية الحقول — فلا يُحفظ إلا ما هو معروف ومسموح لهذا الدور.
 */
import type { Database, ID } from '../clinic/types';
import { can, type Action, type Resource } from '../clinic/permissions';
import { newId } from './auth';
import type { ServerDatabase, ServerUser } from './db';

type FieldType = 'string' | 'number' | 'boolean' | 'string[]';

const SCHEMAS: Record<Exclude<Resource, 'users'>, Record<string, FieldType>> = {
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
    bookings: {
        name: 'string',
        phone: 'string',
        email: 'string',
        serviceSlug: 'string',
        therapistId: 'string',
        date: 'string',
        time: 'string',
        message: 'string',
        lang: 'string',
        status: 'string',
        patientId: 'string',
        appointmentId: 'string'
    },
    expenses: { date: 'string', title: 'string', category: 'string', amount: 'number', notes: 'string' },
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

/**
 * القيم المسموحة لكل حقل، مفهرسة بالمورد ثم الحقل.
 * الفهرسة بالمورد ضرورية لأن اسم الحقل وحده يتكرر: status في المواعيد
 * غير status في الحجوزات، وخلطهما كان يحفظ قيمة خاطئة بلا أي خطأ ظاهر.
 */
const ENUMS: Partial<Record<Exclude<Resource, 'users'>, Record<string, string[]>>> = {
    patients: { gender: ['male', 'female'] },
    appointments: { status: ['scheduled', 'done', 'cancelled', 'noshow'] },
    payments: { method: ['cash', 'card', 'transfer', 'insurance'] },
    bookings: { status: ['new', 'confirmed', 'rejected', 'converted'], lang: ['ar', 'en'] }
};

/** يحوّل ما أرسله العميل إلى حقول معروفة بأنواع صحيحة ويتجاهل أي شيء آخر */
function sanitize(resource: Exclude<Resource, 'users'>, input: unknown): Record<string, unknown> {
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
        } else {
            const text = String(value ?? '').slice(0, 2000);
            const allowed = ENUMS[resource]?.[field];
            clean[field] = allowed && !allowed.includes(text) ? allowed[0] : text;
        }
    }
    return clean;
}

export type Mutation =
    | { resource: Exclude<Resource, 'users' | 'settings'>; op: 'create'; data: unknown }
    | { resource: Exclude<Resource, 'users' | 'settings'>; op: 'createMany'; items: unknown[] }
    | { resource: Exclude<Resource, 'users' | 'settings'>; op: 'update'; id: ID; data: unknown }
    | { resource: Exclude<Resource, 'users' | 'settings'>; op: 'delete'; id: ID }
    | { resource: 'settings'; op: 'update'; data: unknown };

const COLLECTIONS = ['patients', 'therapists', 'appointments', 'sessions', 'payments', 'expenses', 'bookings'] as const;
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
        }
        return null;
    }

    // استيراد دفعة واحدة (قائمة مرضى مثلًا) — نفس التنقية المطبقة على السجل المفرد
    if (mutation.op === 'createMany') {
        for (const item of mutation.items) {
            const row = sanitize(collection, item);
            if (collection === 'sessions' && !can(user.role, 'payments', 'read')) delete row.price;
            list.push(buildRecord(db, collection, row));
        }
        return null;
    }

    const clean = sanitize(collection, mutation.data);

    // من لا يرى البيانات المالية لا يحدد أسعار الجلسات — السعر يأتي من ملف المريض
    if (collection === 'sessions' && !can(user.role, 'payments', 'read')) {
        delete clean.price;
    }

    if (mutation.op === 'create') {
        list.push(buildRecord(db, collection, clean));
        return null;
    }

    const target = list.find((row) => row.id === mutation.id);
    if (!target) return 'العنصر غير موجود';
    Object.assign(target, clean);
    return null;
}

function buildRecord(db: ServerDatabase, collection: CollectionName, clean: Record<string, unknown>): Record<string, unknown> {
    const record: Record<string, unknown> = { ...clean, id: newId(collection[0] + '_'), createdAt: new Date().toISOString() };
    if (collection === 'sessions' && record.price === undefined) {
        const patient = db.patients.find((p) => p.id === record.patientId);
        record.price = patient?.sessionPrice ?? db.settings.defaultSessionPrice;
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
        bookings: db.bookings
    };

    if (!can(user.role, 'payments', 'read')) {
        view.payments = [];
        view.sessions = view.sessions.map((s) => ({ ...s, price: 0 }));
        view.patients = view.patients.map((p) => ({ ...p, sessionPrice: 0 }));
    }
    if (!can(user.role, 'expenses', 'read')) view.expenses = [];
    // طلبات الحجز تحمل بيانات تواصل لغير المرضى — لا تُرسل أصلًا لمن لا يملك صلاحيتها
    if (!can(user.role, 'bookings', 'read')) view.bookings = [];
    return view;
}
