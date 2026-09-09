/**
 * طبقة تخزين SQLite — جداول حقيقية خلف نفس واجهة Backend.
 *
 * الواجهة القائمة تقرأ القاعدة كاملة وتكتبها كاملة، فالقراءة هنا تجمع
 * الجداول في كائن ServerDatabase، والكتابة تستبدل محتوى الجداول داخل
 * معاملة واحدة. هذا مقبول تمامًا لحجم بيانات مركز واحد (آلاف الصفوف على
 * الأكثر)، والمكسب أن البيانات صارت علائقية يمكن الاستعلام عنها ونسخها
 * بأي أداة SQLite قياسية بدل مستند JSON مبهم.
 */
import type { Database as ClinicDatabase } from '../clinic/types';
import { emptyServerDatabase, type ServerDatabase } from './db';
import { CREATE_TABLES } from './schema';

type Row = Record<string, unknown>;

interface SqliteHandle {
    exec(sql: string): unknown;
    prepare(sql: string): { all(...args: unknown[]): Row[]; run(...args: unknown[]): unknown };
    transaction<T extends (...args: never[]) => unknown>(fn: T): T;
    pragma(source: string): unknown;
}

const str = (v: unknown) => (v == null ? '' : String(v));
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const bool = (v: unknown) => Boolean(v);
/** 0/1 للتخزين في عمود INTEGER */
const flag = (v: unknown) => (v ? 1 : 0);

function parseTreatments(value: unknown): string[] {
    try {
        const parsed = JSON.parse(str(value) || '[]');
        return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
        return [];
    }
}

/** الاتصال يُنشأ مرة واحدة ويُعاد استخدامه */
let handle: SqliteHandle | null = null;

async function connect(file: string): Promise<SqliteHandle | null> {
    if (handle) return handle;
    try {
        // وحدة أصلية اختيارية: غيابها لا يكسر البناء ولا التنصيب،
        // وإنما يعني ببساطة أن هذه الطبقة غير متاحة هنا.
        //
        // اسم الوحدة في متغير مع @vite-ignore عمدًا: لو كُتب نصًا صريحًا لحاول
        // Rollup حلّه وقت بناء Netlify أو Vercel — حيث الحزمة غير مثبتة أصلًا —
        // فيفشل البناء كله بسبب طبقة لا تُستخدم هناك.
        const moduleName = 'better-sqlite3';
        const module = await import(/* @vite-ignore */ moduleName);
        const Ctor = (module.default ?? module) as unknown as new (path: string) => SqliteHandle;
        const db = new Ctor(file);
        db.pragma('journal_mode = WAL'); // يسمح بقارئ وكاتب معًا على شبكة المركز
        db.pragma('busy_timeout = 5000');
        db.pragma('foreign_keys = ON');
        db.exec(CREATE_TABLES);
        handle = db;
        return handle;
    } catch (error) {
        console.error('تعذر فتح قاعدة بيانات SQLite:', error instanceof Error ? error.message : error);
        return null;
    }
}

function readAll(db: SqliteHandle): ServerDatabase {
    const base = emptyServerDatabase();
    const rows = (table: string): Row[] => db.prepare(`SELECT * FROM ${table}`).all();

    const settingsRow = rows('settings')[0];
    const settings: ClinicDatabase['settings'] = settingsRow
        ? {
              name: str(settingsRow.name) || base.settings.name,
              doctorName: str(settingsRow.doctor_name),
              phone: str(settingsRow.phone),
              address: str(settingsRow.address),
              currency: str(settingsRow.currency) || base.settings.currency,
              defaultSessionPrice: num(settingsRow.default_session_price),
              defaultDuration: num(settingsRow.default_duration) || base.settings.defaultDuration,
              workStart: str(settingsRow.work_start) || base.settings.workStart,
              workEnd: str(settingsRow.work_end) || base.settings.workEnd
          }
        : base.settings;

    return {
        version: base.version,
        settings,
        patients: rows('patients').map((r) => ({
            id: str(r.id),
            code: str(r.code),
            name: str(r.name),
            phone: str(r.phone),
            gender: str(r.gender) === 'female' ? 'female' : 'male',
            birthDate: str(r.birth_date),
            address: str(r.address),
            job: str(r.job),
            diagnosis: str(r.diagnosis),
            referredBy: str(r.referred_by),
            history: str(r.history),
            notes: str(r.notes),
            plannedSessions: num(r.planned_sessions),
            sessionPrice: num(r.session_price),
            archived: bool(r.archived),
            createdAt: str(r.created_at)
        })),
        therapists: rows('therapists').map((r) => ({
            id: str(r.id),
            name: str(r.name),
            phone: str(r.phone),
            specialty: str(r.specialty),
            active: bool(r.active)
        })),
        appointments: rows('appointments').map((r) => ({
            id: str(r.id),
            patientId: str(r.patient_id),
            therapistId: str(r.therapist_id),
            date: str(r.date),
            time: str(r.time),
            duration: num(r.duration),
            status: str(r.status) as ClinicDatabase['appointments'][number]['status'],
            notes: str(r.notes),
            createdAt: str(r.created_at)
        })),
        sessions: rows('sessions').map((r) => ({
            id: str(r.id),
            patientId: str(r.patient_id),
            therapistId: str(r.therapist_id),
            appointmentId: str(r.appointment_id),
            date: str(r.date),
            treatments: parseTreatments(r.treatments),
            painBefore: num(r.pain_before),
            painAfter: num(r.pain_after),
            notes: str(r.notes),
            homeProgram: str(r.home_program),
            price: num(r.price),
            createdAt: str(r.created_at)
        })),
        payments: rows('payments').map((r) => ({
            id: str(r.id),
            patientId: str(r.patient_id),
            date: str(r.date),
            amount: num(r.amount),
            method: str(r.method) as ClinicDatabase['payments'][number]['method'],
            notes: str(r.notes),
            createdAt: str(r.created_at)
        })),
        expenses: rows('expenses').map((r) => ({
            id: str(r.id),
            date: str(r.date),
            title: str(r.title),
            category: str(r.category),
            amount: num(r.amount),
            notes: str(r.notes),
            createdAt: str(r.created_at)
        })),
        bookings: rows('bookings').map((r) => ({
            id: str(r.id),
            name: str(r.name),
            phone: str(r.phone),
            email: str(r.email),
            serviceSlug: str(r.service_slug),
            therapistId: str(r.therapist_id),
            date: str(r.date),
            time: str(r.time),
            message: str(r.message),
            lang: str(r.lang),
            status: str(r.status) as ClinicDatabase['bookings'][number]['status'],
            patientId: str(r.patient_id),
            appointmentId: str(r.appointment_id),
            createdAt: str(r.created_at)
        })),
        users: rows('users').map((r) => ({
            id: str(r.id),
            username: str(r.username),
            name: str(r.name),
            role: str(r.role) as ServerDatabase['users'][number]['role'],
            therapistId: str(r.therapist_id),
            active: bool(r.active),
            passwordHash: str(r.password_hash),
            passwordSalt: str(r.password_salt),
            iterations: num(r.iterations),
            lastLoginAt: str(r.last_login_at),
            createdAt: str(r.created_at)
        })),
        authSessions: rows('auth_sessions').map((r) => ({
            tokenHash: str(r.token_hash),
            userId: str(r.user_id),
            createdAt: str(r.created_at),
            expiresAt: str(r.expires_at)
        }))
    };
}

function writeAll(db: SqliteHandle, data: ServerDatabase): void {
    const replace = (table: string, columns: string[], rows: unknown[][]) => {
        db.prepare(`DELETE FROM ${table}`).run();
        if (rows.length === 0) return;
        const statement = db.prepare(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`);
        for (const row of rows) statement.run(...row);
    };

    // كل قيمة تمر عبر str/num/flag قبل الحفظ. هذا ليس تجميلًا: تنقية المدخلات
    // في server/api.ts تنسخ الحقول المرسلة فقط، فقد يصل سجل بحقل غير معرّف —
    // وهو ما يتساهل معه ملف JSON بينما ترفضه أعمدة NOT NULL هنا.
    const s = data.settings;
    replace(
        'settings',
        ['id', 'name', 'doctor_name', 'phone', 'address', 'currency', 'default_session_price', 'default_duration', 'work_start', 'work_end', 'version'],
        [
            [
                1,
                str(s.name),
                str(s.doctorName),
                str(s.phone),
                str(s.address),
                str(s.currency),
                num(s.defaultSessionPrice),
                num(s.defaultDuration),
                str(s.workStart),
                str(s.workEnd),
                num(data.version)
            ]
        ]
    );

    replace(
        'patients',
        [
            'id',
            'code',
            'name',
            'phone',
            'gender',
            'birth_date',
            'address',
            'job',
            'diagnosis',
            'referred_by',
            'history',
            'notes',
            'planned_sessions',
            'session_price',
            'archived',
            'created_at'
        ],
        data.patients.map((p) => [
            str(p.id),
            str(p.code),
            str(p.name),
            str(p.phone),
            str(p.gender) || 'male',
            str(p.birthDate),
            str(p.address),
            str(p.job),
            str(p.diagnosis),
            str(p.referredBy),
            str(p.history),
            str(p.notes),
            num(p.plannedSessions),
            num(p.sessionPrice),
            flag(p.archived),
            str(p.createdAt)
        ])
    );

    replace(
        'therapists',
        ['id', 'name', 'phone', 'specialty', 'active'],
        data.therapists.map((t) => [str(t.id), str(t.name), str(t.phone), str(t.specialty), flag(t.active)])
    );

    replace(
        'appointments',
        ['id', 'patient_id', 'therapist_id', 'date', 'time', 'duration', 'status', 'notes', 'created_at'],
        data.appointments.map((a) => [
            str(a.id),
            str(a.patientId),
            str(a.therapistId),
            str(a.date),
            str(a.time),
            num(a.duration),
            str(a.status) || 'scheduled',
            str(a.notes),
            str(a.createdAt)
        ])
    );

    replace(
        'sessions',
        [
            'id',
            'patient_id',
            'therapist_id',
            'appointment_id',
            'date',
            'treatments',
            'pain_before',
            'pain_after',
            'notes',
            'home_program',
            'price',
            'created_at'
        ],
        data.sessions.map((x) => [
            str(x.id),
            str(x.patientId),
            str(x.therapistId),
            str(x.appointmentId),
            str(x.date),
            JSON.stringify(Array.isArray(x.treatments) ? x.treatments : []),
            num(x.painBefore),
            num(x.painAfter),
            str(x.notes),
            str(x.homeProgram),
            num(x.price),
            str(x.createdAt)
        ])
    );

    replace(
        'payments',
        ['id', 'patient_id', 'date', 'amount', 'method', 'notes', 'created_at'],
        data.payments.map((p) => [str(p.id), str(p.patientId), str(p.date), num(p.amount), str(p.method) || 'cash', str(p.notes), str(p.createdAt)])
    );

    replace(
        'expenses',
        ['id', 'date', 'title', 'category', 'amount', 'notes', 'created_at'],
        data.expenses.map((e) => [str(e.id), str(e.date), str(e.title), str(e.category), num(e.amount), str(e.notes), str(e.createdAt)])
    );

    replace(
        'bookings',
        [
            'id',
            'name',
            'phone',
            'email',
            'service_slug',
            'therapist_id',
            'date',
            'time',
            'message',
            'lang',
            'status',
            'patient_id',
            'appointment_id',
            'created_at'
        ],
        data.bookings.map((b) => [
            str(b.id),
            str(b.name),
            str(b.phone),
            str(b.email),
            str(b.serviceSlug),
            str(b.therapistId),
            str(b.date),
            str(b.time),
            str(b.message),
            str(b.lang) || 'ar',
            str(b.status) || 'new',
            str(b.patientId),
            str(b.appointmentId),
            str(b.createdAt)
        ])
    );

    replace(
        'users',
        ['id', 'username', 'name', 'role', 'therapist_id', 'active', 'password_hash', 'password_salt', 'iterations', 'last_login_at', 'created_at'],
        data.users.map((u) => [
            str(u.id),
            str(u.username),
            str(u.name),
            str(u.role) || 'reception',
            str(u.therapistId),
            flag(u.active),
            str(u.passwordHash),
            str(u.passwordSalt),
            num(u.iterations),
            str(u.lastLoginAt),
            str(u.createdAt)
        ])
    );

    replace(
        'auth_sessions',
        ['token_hash', 'user_id', 'created_at', 'expires_at'],
        data.authSessions.map((a) => [str(a.tokenHash), str(a.userId), str(a.createdAt), str(a.expiresAt)])
    );
}

/**
 * تُفعَّل صراحةً بمتغير بيئة، فلا تسبق مخازن الاستضافة بالخطأ.
 * ترجع null إن تعذر تحميل الوحدة الأصلية، فيكمل الاختيار للطبقات التالية.
 */
export async function sqliteBackend(): Promise<{ read: () => Promise<unknown>; write: (db: ServerDatabase) => Promise<void> } | null> {
    const explicit = process.env.CLINIC_SQLITE_FILE;
    const requested = explicit || (process.env.CLINIC_DB === 'sqlite' ? '.data/clinic.sqlite' : '');
    if (!requested) return null;

    const { mkdir } = await import('node:fs/promises');
    const { dirname, resolve } = await import('node:path');
    const file = resolve(requested);
    await mkdir(dirname(file), { recursive: true });

    const db = await connect(file);
    if (!db) return null;

    return {
        read: async () => readAll(db),
        // معاملة واحدة: إما تُكتب القاعدة كلها أو لا يتغير شيء
        write: async (data) => {
            db.transaction(() => writeAll(db, data))();
        }
    };
}
