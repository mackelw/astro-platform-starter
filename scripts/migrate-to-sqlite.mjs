/**
 * ينقل بيانات المركز من ملف JSON إلى قاعدة SQLite.
 *
 *   npm run db:migrate                       # من .data/clinic-db.json إلى .data/clinic.sqlite
 *   npm run db:migrate -- --from x --to y    # مسارات مخصصة
 *   npm run db:migrate -- --force            # يسمح بالكتابة فوق قاعدة تحتوي بيانات
 *
 * لا يمس الملف الأصلي إطلاقًا — يبقى كما هو نسخةً احتياطية.
 */
import { readFile } from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const arg = (name, fallback) => {
    const index = process.argv.indexOf(`--${name}`);
    return index !== -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
};

const force = process.argv.includes('--force');
const source = resolve(arg('from', process.env.CLINIC_DATA_FILE || '.data/clinic-db.json'));
const target = resolve(arg('to', process.env.CLINIC_SQLITE_FILE || '.data/clinic.sqlite'));

if (!existsSync(source)) {
    console.error(`لم يُعثر على ملف البيانات: ${source}`);
    process.exit(1);
}

let Database;
try {
    Database = (await import('better-sqlite3')).default;
} catch {
    console.error('حزمة better-sqlite3 غير مثبتة. ثبّتها أولًا:  npm install better-sqlite3');
    process.exit(1);
}

const { CREATE_TABLES } = await import('../src/server/schema.ts').catch(() => ({}));
if (!CREATE_TABLES) {
    console.error('تعذر قراءة مخطط الجداول من src/server/schema.ts');
    process.exit(1);
}

const raw = JSON.parse(await readFile(source, 'utf8'));
const list = (key) => (Array.isArray(raw[key]) ? raw[key] : []);

mkdirSync(dirname(target), { recursive: true });
const db = new Database(target);
db.pragma('journal_mode = WAL');
db.exec(CREATE_TABLES);

// حماية من الكتابة فوق قاعدة عاملة بالخطأ
const existing = db.prepare('SELECT COUNT(*) AS n FROM patients').get().n + db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
if (existing > 0 && !force) {
    console.error(`القاعدة الهدف تحتوي بيانات بالفعل (${existing} صفًا في المرضى والمستخدمين).`);
    console.error('أضف --force إن كنت متأكدًا أنك تريد استبدالها.');
    process.exit(1);
}

const insert = (table, columns, rows) => {
    db.prepare(`DELETE FROM ${table}`).run();
    if (rows.length === 0) return 0;
    const statement = db.prepare(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`);
    for (const row of rows) statement.run(...row);
    return rows.length;
};

const s = raw.settings ?? {};
const counts = {};

db.transaction(() => {
    insert(
        'settings',
        ['id', 'name', 'doctor_name', 'phone', 'address', 'currency', 'default_session_price', 'default_duration', 'work_start', 'work_end', 'version'],
        [
            [
                1,
                s.name ?? '',
                s.doctorName ?? '',
                s.phone ?? '',
                s.address ?? '',
                s.currency ?? 'ج.م',
                Number(s.defaultSessionPrice) || 0,
                Number(s.defaultDuration) || 45,
                s.workStart ?? '09:00',
                s.workEnd ?? '21:00',
                Number(raw.version) || 1
            ]
        ]
    );

    counts.patients = insert(
        'patients',
        ['id', 'code', 'name', 'phone', 'gender', 'birth_date', 'address', 'job', 'diagnosis', 'referred_by', 'history', 'notes', 'planned_sessions', 'session_price', 'archived', 'created_at'],
        list('patients').map((p) => [p.id, p.code ?? '', p.name ?? '', p.phone ?? '', p.gender ?? 'male', p.birthDate ?? '', p.address ?? '', p.job ?? '', p.diagnosis ?? '', p.referredBy ?? '', p.history ?? '', p.notes ?? '', Number(p.plannedSessions) || 0, Number(p.sessionPrice) || 0, p.archived ? 1 : 0, p.createdAt ?? ''])
    );

    counts.therapists = insert(
        'therapists',
        ['id', 'name', 'phone', 'specialty', 'active'],
        list('therapists').map((t) => [t.id, t.name ?? '', t.phone ?? '', t.specialty ?? '', t.active === false ? 0 : 1])
    );

    counts.appointments = insert(
        'appointments',
        ['id', 'patient_id', 'therapist_id', 'date', 'time', 'duration', 'status', 'notes', 'created_at'],
        list('appointments').map((a) => [a.id, a.patientId ?? '', a.therapistId ?? '', a.date ?? '', a.time ?? '', Number(a.duration) || 45, a.status ?? 'scheduled', a.notes ?? '', a.createdAt ?? ''])
    );

    counts.sessions = insert(
        'sessions',
        ['id', 'patient_id', 'therapist_id', 'appointment_id', 'date', 'treatments', 'pain_before', 'pain_after', 'notes', 'home_program', 'price', 'created_at'],
        list('sessions').map((x) => [x.id, x.patientId ?? '', x.therapistId ?? '', x.appointmentId ?? '', x.date ?? '', JSON.stringify(Array.isArray(x.treatments) ? x.treatments : []), Number(x.painBefore) || 0, Number(x.painAfter) || 0, x.notes ?? '', x.homeProgram ?? '', Number(x.price) || 0, x.createdAt ?? ''])
    );

    counts.payments = insert(
        'payments',
        ['id', 'patient_id', 'date', 'amount', 'method', 'notes', 'created_at'],
        list('payments').map((p) => [p.id, p.patientId ?? '', p.date ?? '', Number(p.amount) || 0, p.method ?? 'cash', p.notes ?? '', p.createdAt ?? ''])
    );

    counts.expenses = insert(
        'expenses',
        ['id', 'date', 'title', 'category', 'amount', 'notes', 'created_at'],
        list('expenses').map((e) => [e.id, e.date ?? '', e.title ?? '', e.category ?? '', Number(e.amount) || 0, e.notes ?? '', e.createdAt ?? ''])
    );

    counts.bookings = insert(
        'bookings',
        ['id', 'name', 'phone', 'email', 'service_slug', 'therapist_id', 'date', 'time', 'message', 'lang', 'status', 'patient_id', 'appointment_id', 'created_at'],
        list('bookings').map((b) => [b.id, b.name ?? '', b.phone ?? '', b.email ?? '', b.serviceSlug ?? '', b.therapistId ?? '', b.date ?? '', b.time ?? '', b.message ?? '', b.lang ?? 'ar', b.status ?? 'new', b.patientId ?? '', b.appointmentId ?? '', b.createdAt ?? ''])
    );

    counts.users = insert(
        'users',
        ['id', 'username', 'name', 'role', 'therapist_id', 'active', 'password_hash', 'password_salt', 'iterations', 'last_login_at', 'created_at'],
        list('users').map((u) => [u.id, u.username ?? '', u.name ?? '', u.role ?? 'reception', u.therapistId ?? '', u.active === false ? 0 : 1, u.passwordHash ?? '', u.passwordSalt ?? '', Number(u.iterations) || 0, u.lastLoginAt ?? '', u.createdAt ?? ''])
    );

    // جلسات الدخول لا تُنقل: سيسجل الجميع الدخول من جديد بعد النقل
    insert('auth_sessions', ['token_hash', 'user_id', 'created_at', 'expires_at'], []);
})();

console.log(`تم النقل من ${source}`);
console.log(`إلى ${target}`);
for (const [table, n] of Object.entries(counts)) console.log(`  ${table}: ${n}`);
console.log('\nلتشغيل السيرفر على القاعدة الجديدة:');
console.log('  CLINIC_DB=sqlite npm run build:server && CLINIC_DB=sqlite npm run start:server');
