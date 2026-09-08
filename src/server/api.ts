/**
 * تطبيق التعديلات القادمة من الواجهة على قاعدة البيانات، مع فرض الصلاحيات
 * وتنقية الحقول — فلا يُحفظ إلا ما هو معروف ومسموح لهذا الدور.
 *
 * دور المريض له طبقة إضافية: كل قراءة وكتابة تُقصر على ملفه وملفات
 * حساباته الفرعية، فلا يصل إلى بيانات أي مريض آخر مهما كان الطلب المُرسل.
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
    expenses: { date: 'string', title: 'string', category: 'string', amount: 'number', notes: 'string' },
    exercises: {
        name: 'string',
        nameEn: 'string',
        category: 'string',
        description: 'string',
        descriptionEn: 'string',
        mediaType: 'string',
        mediaUrl: 'string',
        active: 'boolean'
    },
    prescriptions: {
        patientId: 'string',
        exerciseId: 'string',
        sets: 'number',
        reps: 'number',
        holdSeconds: 'number',
        perDay: 'number',
        daysPerWeek: 'number',
        startDate: 'string',
        endDate: 'string',
        notes: 'string',
        active: 'boolean'
    },
    exerciseLogs: { patientId: 'string', prescriptionId: 'string', date: 'string', done: 'boolean', painLevel: 'number', note: 'string' },
    services: {
        name: 'string',
        nameEn: 'string',
        description: 'string',
        descriptionEn: 'string',
        price: 'number',
        duration: 'number',
        homeVisit: 'boolean',
        active: 'boolean'
    },
    bookings: {
        patientId: 'string',
        serviceId: 'string',
        place: 'string',
        area: 'string',
        date: 'string',
        time: 'string',
        notes: 'string',
        status: 'string',
        appointmentId: 'string',
        replyNote: 'string'
    },
    settings: {
        name: 'string',
        nameEn: 'string',
        doctorName: 'string',
        phone: 'string',
        whatsapp: 'string',
        address: 'string',
        addressEn: 'string',
        currency: 'string',
        defaultSessionPrice: 'number',
        examPrice: 'number',
        defaultDuration: 'number',
        workStart: 'string',
        workEnd: 'string',
        fridayStart: 'string',
        fridayEnd: 'string',
        homeVisitAreas: 'string',
        mapUrl: 'string'
    }
};

/** القيم المسموح بها لكل حقل — مفصولة حسب المجموعة لأن حقل status مثلًا يختلف معناه بينها */
const ENUMS: Partial<Record<Exclude<Resource, 'users'>, Record<string, string[]>>> = {
    patients: { gender: ['male', 'female'] },
    appointments: { status: ['scheduled', 'done', 'cancelled', 'noshow'] },
    payments: { method: ['cash', 'card', 'transfer', 'insurance'] },
    exercises: { mediaType: ['video', 'image', 'none'] },
    bookings: { place: ['clinic', 'home'], status: ['new', 'confirmed', 'rejected', 'cancelled', 'done'] }
};

/** يحوّل ما أرسله العميل إلى حقول معروفة بأنواع صحيحة ويتجاهل أي شيء آخر */
function sanitize(resource: Exclude<Resource, 'users'>, input: unknown): Record<string, unknown> {
    const schema = SCHEMAS[resource];
    const enums = ENUMS[resource] ?? {};
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
            clean[field] = enums[field] && !enums[field].includes(text) ? enums[field][0] : text;
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

const COLLECTIONS = [
    'patients',
    'therapists',
    'appointments',
    'sessions',
    'payments',
    'expenses',
    'exercises',
    'prescriptions',
    'exerciseLogs',
    'services',
    'bookings'
] as const;
type CollectionName = (typeof COLLECTIONS)[number];

/** أقصى عدد سجلات في عملية استيراد واحدة */
export const MAX_IMPORT = 500;

/** أقصى عدد حسابات فرعية يضيفها المريض لأفراد أسرته */
export const MAX_MEMBERS = 8;

export function isValidMutation(body: unknown): body is Mutation {
    const m = body as Mutation;
    if (!m || typeof m !== 'object') return false;
    if (m.resource === 'settings') return m.op === 'update';
    if (!COLLECTIONS.includes(m.resource as CollectionName)) return false;
    if (m.op === 'create') return true;
    if (m.op === 'createMany') return Array.isArray(m.items) && m.items.length > 0 && m.items.length <= MAX_IMPORT;
    return (m.op === 'update' || m.op === 'delete') && typeof (m as { id?: unknown }).id === 'string';
}

/* ------------------------- نطاق المريض ------------------------- */

/** الملفات التي يملك هذا الحساب حق رؤيتها: ملفه + ملفات أسرته */
export function patientScope(user: ServerUser): Set<ID> {
    const ids = new Set<ID>();
    if (user.patientId) ids.add(user.patientId);
    for (const id of user.memberIds ?? []) if (id) ids.add(id);
    return ids;
}

/** الحقول التي يعدّلها المريض بنفسه — البيانات الإكلينيكية والمالية للمركز وحده */
const PATIENT_EDITABLE = ['name', 'phone', 'gender', 'birthDate', 'address', 'job'];

function pick(source: Record<string, unknown>, fields: string[]): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const field of fields) if (field in source) out[field] = source[field];
    return out;
}

function nextCode(db: ServerDatabase): string {
    const numbers = db.patients.map((p) => Number(String(p.code).replace(/\D/g, ''))).filter((n) => Number.isFinite(n) && n > 0);
    return `P-${numbers.length ? Math.max(...numbers) + 1 : 1001}`;
}

/**
 * تعديلات المريض على نفسه: تُعاد كتابتها بالكامل هنا فلا يُحفظ إلا ما نسمح به،
 * وتُرفض أي محاولة للوصول إلى ملف خارج نطاق حسابه.
 */
function applyPatientMutation(db: ServerDatabase, user: ServerUser, mutation: Mutation): string | null {
    const scope = patientScope(user);

    if (mutation.resource === 'patients') {
        if (mutation.op === 'create') {
            if (scope.size >= MAX_MEMBERS + 1) return `لا يمكن إضافة أكثر من ${MAX_MEMBERS} حسابات فرعية`;
            const clean = pick(sanitize('patients', mutation.data), PATIENT_EDITABLE);
            if (!String(clean.name ?? '').trim()) return 'اسم فرد الأسرة مطلوب';
            const record = {
                ...clean,
                code: nextCode(db),
                diagnosis: '',
                referredBy: '',
                history: '',
                notes: '',
                plannedSessions: 0,
                sessionPrice: db.settings.defaultSessionPrice,
                archived: false,
                id: newId('p_'),
                createdAt: new Date().toISOString()
            };
            db.patients.push(record as never);

            // ربط الملف الجديد بحساب الأب/الأم حتى يظهر له مباشرة بلا تسجيل خروج
            const account = db.users.find((u) => u.id === user.id);
            if (account) account.memberIds = [...(account.memberIds ?? []), record.id as ID];
            return null;
        }

        if (mutation.op === 'update') {
            if (!scope.has(mutation.id)) return 'هذا الملف ليس ضمن حسابك';
            const target = db.patients.find((p) => p.id === mutation.id);
            if (!target) return 'العنصر غير موجود';
            Object.assign(target, pick(sanitize('patients', mutation.data), PATIENT_EDITABLE));
            return null;
        }
        return 'ليس لديك صلاحية لهذا الإجراء';
    }

    if (mutation.resource === 'bookings') {
        if (mutation.op === 'create') {
            const clean = sanitize('bookings', mutation.data);
            const patientId = String(clean.patientId ?? '');
            if (!scope.has(patientId)) return 'هذا الملف ليس ضمن حسابك';
            db.bookings.push({
                id: newId('b_'),
                patientId,
                serviceId: String(clean.serviceId ?? ''),
                place: (clean.place as 'clinic' | 'home') ?? 'clinic',
                area: String(clean.area ?? ''),
                date: String(clean.date ?? ''),
                time: String(clean.time ?? ''),
                notes: String(clean.notes ?? ''),
                status: 'new', // حالة الطلب تحددها الإدارة وحدها
                appointmentId: '',
                replyNote: '',
                createdAt: new Date().toISOString()
            });
            return null;
        }

        if (mutation.op === 'update') {
            const target = db.bookings.find((b) => b.id === mutation.id);
            if (!target) return 'العنصر غير موجود';
            if (!scope.has(target.patientId)) return 'هذا الطلب ليس ضمن حسابك';
            if (target.status === 'done') return 'لا يمكن تعديل طلب منتهٍ';
            // المريض لا يملك إلا الإلغاء وتعديل ملاحظته
            const clean = sanitize('bookings', mutation.data);
            if ('notes' in clean) target.notes = String(clean.notes);
            if (clean.status === 'cancelled') target.status = 'cancelled';
            return null;
        }
        return 'ليس لديك صلاحية لهذا الإجراء';
    }

    if (mutation.resource === 'exerciseLogs') {
        if (mutation.op === 'create') {
            const clean = sanitize('exerciseLogs', mutation.data);
            const patientId = String(clean.patientId ?? '');
            if (!scope.has(patientId)) return 'هذا الملف ليس ضمن حسابك';
            const prescription = db.prescriptions.find((r) => r.id === String(clean.prescriptionId ?? ''));
            if (!prescription || prescription.patientId !== patientId) return 'هذا التمرين غير موصوف لهذا الملف';
            db.exerciseLogs.push({
                id: newId('l_'),
                patientId,
                prescriptionId: prescription.id,
                date: String(clean.date ?? ''),
                done: Boolean(clean.done),
                painLevel: Number(clean.painLevel ?? 0),
                note: String(clean.note ?? ''),
                createdAt: new Date().toISOString()
            });
            return null;
        }

        if (mutation.op === 'update') {
            const target = db.exerciseLogs.find((l) => l.id === mutation.id);
            if (!target) return 'العنصر غير موجود';
            if (!scope.has(target.patientId)) return 'هذا السجل ليس ضمن حسابك';
            const clean = pick(sanitize('exerciseLogs', mutation.data), ['done', 'painLevel', 'note']);
            Object.assign(target, clean);
            return null;
        }
        return 'ليس لديك صلاحية لهذا الإجراء';
    }

    return 'ليس لديك صلاحية لهذا الإجراء';
}

/** يطبّق التعديل بعد التأكد من الصلاحية، ويعيد رسالة خطأ إن كان ممنوعًا */
export function applyMutation(db: ServerDatabase, user: ServerUser, mutation: Mutation): string | null {
    const action: Action = mutation.op === 'createMany' ? 'create' : mutation.op;
    if (!can(user.role, mutation.resource, action)) return 'ليس لديك صلاحية لهذا الإجراء';

    // المريض له مسار خاص يفرض ملكية السجل قبل أي كتابة
    if (user.role === 'patient') return applyPatientMutation(db, user, mutation);

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
        cascadeDelete(db, collection, mutation.id);
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

/** حذف سجل يجرّ معه السجلات المعلقة به حتى لا تبقى بيانات يتيمة */
function cascadeDelete(db: ServerDatabase, collection: CollectionName, id: ID): void {
    if (collection === 'patients') {
        db.appointments = db.appointments.filter((a) => a.patientId !== id);
        db.sessions = db.sessions.filter((s) => s.patientId !== id);
        db.payments = db.payments.filter((p) => p.patientId !== id);
        db.prescriptions = db.prescriptions.filter((r) => r.patientId !== id);
        db.exerciseLogs = db.exerciseLogs.filter((l) => l.patientId !== id);
        db.bookings = db.bookings.filter((b) => b.patientId !== id);
        // فك ارتباط الملف المحذوف بأي حساب دخول
        for (const account of db.users) {
            if (account.patientId === id) account.patientId = '';
            if (account.memberIds?.includes(id)) account.memberIds = account.memberIds.filter((m) => m !== id);
        }
        return;
    }
    if (collection === 'exercises') {
        const dropped = db.prescriptions.filter((r) => r.exerciseId === id).map((r) => r.id);
        db.prescriptions = db.prescriptions.filter((r) => r.exerciseId !== id);
        db.exerciseLogs = db.exerciseLogs.filter((l) => !dropped.includes(l.prescriptionId));
        return;
    }
    if (collection === 'prescriptions') {
        db.exerciseLogs = db.exerciseLogs.filter((l) => l.prescriptionId !== id);
    }
}

function buildRecord(db: ServerDatabase, collection: CollectionName, clean: Record<string, unknown>): Record<string, unknown> {
    const record: Record<string, unknown> = { ...clean, id: newId(collection[0] + '_'), createdAt: new Date().toISOString() };
    if (collection === 'sessions' && record.price === undefined) {
        const patient = db.patients.find((p) => p.id === record.patientId);
        record.price = patient?.sessionPrice ?? db.settings.defaultSessionPrice;
    }
    if (collection === 'bookings' && record.status === undefined) record.status = 'new';
    // رقم الملف يُولَّد على السيرفر إن لم يرسله العميل، فلا يبقى مريض بلا رقم
    if (collection === 'patients' && !String(record.code ?? '').trim()) record.code = nextCode(db);
    return record;
}

/** النسخة التي يراها هذا الدور: تُحذف منها البيانات المالية لمن لا يملك صلاحيتها */
export function visibleDatabase(db: ServerDatabase, user: ServerUser): Database {
    if (user.role === 'patient') return patientView(db, user);

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
        prescriptions: db.prescriptions,
        exerciseLogs: db.exerciseLogs,
        services: db.services,
        bookings: db.bookings
    };

    if (!can(user.role, 'payments', 'read')) {
        view.payments = [];
        view.sessions = view.sessions.map((s) => ({ ...s, price: 0 }));
        view.patients = view.patients.map((p) => ({ ...p, sessionPrice: 0 }));
    }
    if (!can(user.role, 'expenses', 'read')) view.expenses = [];
    return view;
}

/**
 * ما يصل فعليًا إلى جهاز المريض: ملفه وملفات أسرته فقط.
 * أي سجل لمريض آخر لا يغادر السيرفر أصلًا، فلا يكفي تعديل الواجهة لرؤيته.
 */
function patientView(db: ServerDatabase, user: ServerUser): Database {
    const scope = patientScope(user);
    const mine = <T extends { patientId: ID }>(rows: T[]) => rows.filter((row) => scope.has(row.patientId));

    const prescriptions = mine(db.prescriptions);
    const prescribed = new Set(prescriptions.map((r) => r.exerciseId));

    return {
        version: db.version,
        settings: db.settings,
        patients: db.patients.filter((p) => scope.has(p.id)),
        // أسماء الأخصائيين تظهر في المواعيد، أما أرقامهم فلا تخص المريض
        therapists: db.therapists.filter((t) => t.active).map((t) => ({ ...t, phone: '' })),
        appointments: mine(db.appointments),
        sessions: mine(db.sessions),
        payments: mine(db.payments),
        expenses: [],
        exercises: db.exercises.filter((x) => prescribed.has(x.id)),
        prescriptions,
        exerciseLogs: mine(db.exerciseLogs),
        services: db.services.filter((s) => s.active),
        bookings: mine(db.bookings)
    };
}
