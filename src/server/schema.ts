/**
 * مخطط قاعدة بيانات SQLite — جداول حقيقية لا مستند JSON واحد،
 * فيمكن الاستعلام عنها ونسخها احتياطيًا بأي أداة قياسية.
 *
 * يُستخدم فقط على سيرفر المركز حيث يوجد قرص دائم. النشر على Netlify
 * أو Vercel يبقى على مخازنه كما هو.
 */
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/** صف واحد فقط (id = 1) يحمل إعدادات المركز */
export const settings = sqliteTable('settings', {
    id: integer('id').primaryKey(),
    name: text('name').notNull().default(''),
    doctorName: text('doctor_name').notNull().default(''),
    phone: text('phone').notNull().default(''),
    address: text('address').notNull().default(''),
    currency: text('currency').notNull().default('ج.م'),
    defaultSessionPrice: integer('default_session_price').notNull().default(0),
    defaultDuration: integer('default_duration').notNull().default(45),
    workStart: text('work_start').notNull().default('09:00'),
    workEnd: text('work_end').notNull().default('21:00'),
    version: integer('version').notNull().default(1)
});

export const patients = sqliteTable('patients', {
    id: text('id').primaryKey(),
    code: text('code').notNull().default(''),
    name: text('name').notNull().default(''),
    phone: text('phone').notNull().default(''),
    gender: text('gender').notNull().default('male'),
    birthDate: text('birth_date').notNull().default(''),
    address: text('address').notNull().default(''),
    job: text('job').notNull().default(''),
    diagnosis: text('diagnosis').notNull().default(''),
    referredBy: text('referred_by').notNull().default(''),
    history: text('history').notNull().default(''),
    notes: text('notes').notNull().default(''),
    plannedSessions: integer('planned_sessions').notNull().default(0),
    sessionPrice: integer('session_price').notNull().default(0),
    archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('created_at').notNull().default('')
});

export const therapists = sqliteTable('therapists', {
    id: text('id').primaryKey(),
    name: text('name').notNull().default(''),
    phone: text('phone').notNull().default(''),
    specialty: text('specialty').notNull().default(''),
    active: integer('active', { mode: 'boolean' }).notNull().default(true)
});

export const appointments = sqliteTable('appointments', {
    id: text('id').primaryKey(),
    patientId: text('patient_id').notNull().default(''),
    therapistId: text('therapist_id').notNull().default(''),
    date: text('date').notNull().default(''),
    time: text('time').notNull().default(''),
    duration: integer('duration').notNull().default(45),
    status: text('status').notNull().default('scheduled'),
    notes: text('notes').notNull().default(''),
    createdAt: text('created_at').notNull().default('')
});

export const sessions = sqliteTable('sessions', {
    id: text('id').primaryKey(),
    patientId: text('patient_id').notNull().default(''),
    therapistId: text('therapist_id').notNull().default(''),
    appointmentId: text('appointment_id').notNull().default(''),
    date: text('date').notNull().default(''),
    // مصفوفة نصوص، تُخزَّن JSON في عمود نصي
    treatments: text('treatments').notNull().default('[]'),
    painBefore: integer('pain_before').notNull().default(0),
    painAfter: integer('pain_after').notNull().default(0),
    notes: text('notes').notNull().default(''),
    homeProgram: text('home_program').notNull().default(''),
    price: integer('price').notNull().default(0),
    createdAt: text('created_at').notNull().default('')
});

export const payments = sqliteTable('payments', {
    id: text('id').primaryKey(),
    patientId: text('patient_id').notNull().default(''),
    date: text('date').notNull().default(''),
    amount: integer('amount').notNull().default(0),
    method: text('method').notNull().default('cash'),
    notes: text('notes').notNull().default(''),
    createdAt: text('created_at').notNull().default('')
});

export const expenses = sqliteTable('expenses', {
    id: text('id').primaryKey(),
    date: text('date').notNull().default(''),
    title: text('title').notNull().default(''),
    category: text('category').notNull().default(''),
    amount: integer('amount').notNull().default(0),
    notes: text('notes').notNull().default(''),
    createdAt: text('created_at').notNull().default('')
});

export const bookings = sqliteTable('bookings', {
    id: text('id').primaryKey(),
    name: text('name').notNull().default(''),
    phone: text('phone').notNull().default(''),
    email: text('email').notNull().default(''),
    serviceSlug: text('service_slug').notNull().default(''),
    therapistId: text('therapist_id').notNull().default(''),
    date: text('date').notNull().default(''),
    time: text('time').notNull().default(''),
    message: text('message').notNull().default(''),
    lang: text('lang').notNull().default('ar'),
    status: text('status').notNull().default('new'),
    patientId: text('patient_id').notNull().default(''),
    appointmentId: text('appointment_id').notNull().default(''),
    createdAt: text('created_at').notNull().default('')
});

export const users = sqliteTable('users', {
    id: text('id').primaryKey(),
    username: text('username').notNull().default(''),
    name: text('name').notNull().default(''),
    role: text('role').notNull().default('reception'),
    therapistId: text('therapist_id').notNull().default(''),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    passwordHash: text('password_hash').notNull().default(''),
    passwordSalt: text('password_salt').notNull().default(''),
    iterations: integer('iterations').notNull().default(0),
    lastLoginAt: text('last_login_at').notNull().default(''),
    createdAt: text('created_at').notNull().default('')
});

export const authSessions = sqliteTable('auth_sessions', {
    tokenHash: text('token_hash').primaryKey(),
    userId: text('user_id').notNull().default(''),
    createdAt: text('created_at').notNull().default(''),
    expiresAt: text('expires_at').notNull().default('')
});

/**
 * تُنفَّذ عند أول اتصال. اخترنا CREATE TABLE IF NOT EXISTS بدل أداة هجرة
 * منفصلة حتى يبقى تشغيل البرنامج بالنقر المزدوج بلا أي خطوة إضافية.
 */
export const CREATE_TABLES = `
CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL DEFAULT '', doctor_name TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '', currency TEXT NOT NULL DEFAULT 'ج.م',
    default_session_price INTEGER NOT NULL DEFAULT 0, default_duration INTEGER NOT NULL DEFAULT 45,
    work_start TEXT NOT NULL DEFAULT '09:00', work_end TEXT NOT NULL DEFAULT '21:00', version INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS patients (
    id TEXT PRIMARY KEY, code TEXT NOT NULL DEFAULT '', name TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '',
    gender TEXT NOT NULL DEFAULT 'male', birth_date TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '',
    job TEXT NOT NULL DEFAULT '', diagnosis TEXT NOT NULL DEFAULT '', referred_by TEXT NOT NULL DEFAULT '',
    history TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', planned_sessions INTEGER NOT NULL DEFAULT 0,
    session_price INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS therapists (
    id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '',
    specialty TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS appointments (
    id TEXT PRIMARY KEY, patient_id TEXT NOT NULL DEFAULT '', therapist_id TEXT NOT NULL DEFAULT '',
    date TEXT NOT NULL DEFAULT '', time TEXT NOT NULL DEFAULT '', duration INTEGER NOT NULL DEFAULT 45,
    status TEXT NOT NULL DEFAULT 'scheduled', notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY, patient_id TEXT NOT NULL DEFAULT '', therapist_id TEXT NOT NULL DEFAULT '',
    appointment_id TEXT NOT NULL DEFAULT '', date TEXT NOT NULL DEFAULT '', treatments TEXT NOT NULL DEFAULT '[]',
    pain_before INTEGER NOT NULL DEFAULT 0, pain_after INTEGER NOT NULL DEFAULT 0, notes TEXT NOT NULL DEFAULT '',
    home_program TEXT NOT NULL DEFAULT '', price INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY, patient_id TEXT NOT NULL DEFAULT '', date TEXT NOT NULL DEFAULT '',
    amount INTEGER NOT NULL DEFAULT 0, method TEXT NOT NULL DEFAULT 'cash', notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY, date TEXT NOT NULL DEFAULT '', title TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT '', amount INTEGER NOT NULL DEFAULT 0, notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS bookings (
    id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '',
    service_slug TEXT NOT NULL DEFAULT '', therapist_id TEXT NOT NULL DEFAULT '', date TEXT NOT NULL DEFAULT '',
    time TEXT NOT NULL DEFAULT '', message TEXT NOT NULL DEFAULT '', lang TEXT NOT NULL DEFAULT 'ar',
    status TEXT NOT NULL DEFAULT 'new', patient_id TEXT NOT NULL DEFAULT '', appointment_id TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, username TEXT NOT NULL DEFAULT '', name TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT 'reception', therapist_id TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1,
    password_hash TEXT NOT NULL DEFAULT '', password_salt TEXT NOT NULL DEFAULT '', iterations INTEGER NOT NULL DEFAULT 0,
    last_login_at TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS auth_sessions (
    token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT '',
    expires_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments (date);
CREATE INDEX IF NOT EXISTS idx_sessions_patient ON sessions (patient_id);
CREATE INDEX IF NOT EXISTS idx_payments_patient ON payments (patient_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings (status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users (username);
`;
