/**
 * تخزين بيانات المركز على السيرفر.
 *
 * يختار الطبقة المناسبة تلقائيًا حسب مكان التشغيل:
 *   1. SQLite — إن طُلبت صراحة بمتغير بيئة (سيرفر المركز، قرص دائم)
 *   2. Upstash Redis عبر REST — إن وُجد متغيرا البيئة (النشر على Vercel)
 *   3. Netlify Blobs — عند النشر على Netlify
 *   4. ملف JSON محلي — على جهاز داخل المركز أو أثناء التطوير
 * فيعمل نفس الكود في الحالات الأربع بلا تغيير.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { Database, ID, Role } from '../clinic/types';
import { emptyDatabase, normalize } from '../clinic/storage';
import { sqliteBackend } from './sqlite';

export interface ServerUser {
    id: ID;
    username: string;
    name: string;
    role: Role;
    therapistId: ID | '';
    active: boolean;
    passwordHash: string;
    passwordSalt: string;
    iterations: number;
    lastLoginAt: string;
    createdAt: string;
}

export interface ServerSession {
    tokenHash: string;
    userId: ID;
    createdAt: string;
    expiresAt: string;
}

export interface ServerDatabase extends Database {
    users: ServerUser[];
    authSessions: ServerSession[]; // جلسات تسجيل الدخول (غير الجلسات العلاجية)
}

const BLOB_STORE = 'clinic';
const BLOB_KEY = 'database';
const REDIS_KEY = 'clinic:database';
const FILE_PATH = resolve(process.env.CLINIC_DATA_FILE || '.data/clinic-db.json');

export function emptyServerDatabase(): ServerDatabase {
    return { ...emptyDatabase(), users: [], authSessions: [] };
}

function normalizeServer(raw: unknown): ServerDatabase {
    const source = (raw ?? {}) as Partial<ServerDatabase>;
    return {
        ...normalize(raw),
        users: Array.isArray(source.users) ? source.users : [],
        authSessions: Array.isArray(source.authSessions) ? source.authSessions : []
    };
}

/* --------------------------- طبقة التخزين --------------------------- */

type Backend = { read: () => Promise<unknown>; write: (db: ServerDatabase) => Promise<void> };

let backend: Backend | null = null;

async function blobBackend(): Promise<Backend | null> {
    try {
        const { getStore } = await import('@netlify/blobs');
        const store = getStore({ name: BLOB_STORE, consistency: 'strong' });
        await store.get(BLOB_KEY, { type: 'json' }); // يفشل فورًا إذا لم نكن على Netlify
        return {
            read: () => store.get(BLOB_KEY, { type: 'json' }),
            write: (db) => store.setJSON(BLOB_KEY, db)
        };
    } catch {
        return null;
    }
}

/**
 * Upstash Redis عبر REST — قاعدة البيانات كلها مستند JSON واحد تحت مفتاح واحد.
 * تُستخدم عند النشر على Vercel لأن نظام الملفات هناك للقراءة فقط.
 */
function upstashBackend(): Backend | null {
    const url = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, '');
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) return null;

    const headers = { authorization: `Bearer ${token}` };

    return {
        read: async () => {
            const response = await fetch(`${url}/get/${encodeURIComponent(REDIS_KEY)}`, { headers, cache: 'no-store' });
            if (!response.ok) throw new Error(`تعذر قراءة البيانات من المخزن (${response.status})`);
            const body = (await response.json()) as { result?: string | null };
            return body.result ? JSON.parse(body.result) : null;
        },
        write: async (db) => {
            const response = await fetch(`${url}/set/${encodeURIComponent(REDIS_KEY)}`, {
                method: 'POST',
                headers,
                body: JSON.stringify(db)
            });
            if (!response.ok) throw new Error(`تعذر حفظ البيانات في المخزن (${response.status})`);
        }
    };
}

function fileBackend(): Backend {
    return {
        read: async () => {
            try {
                return JSON.parse(await readFile(FILE_PATH, 'utf8'));
            } catch {
                return null;
            }
        },
        write: async (db) => {
            await mkdir(dirname(FILE_PATH), { recursive: true });
            // كتابة ذرّية: ملف مؤقت ثم إعادة تسمية، حتى لا تتلف البيانات لو توقف السيرفر أثناء الحفظ
            const tmp = `${FILE_PATH}.${Date.now()}.tmp`;
            await writeFile(tmp, JSON.stringify(db, null, 2), 'utf8');
            await rename(tmp, FILE_PATH);
        }
    };
}

async function getBackend(): Promise<Backend> {
    if (backend) return backend;

    // اختيار صريح أولًا: من ضبط CLINIC_DB=sqlite يقصدها ولا يريد مخزنًا آخر
    const sqlite = await sqliteBackend();
    if (sqlite) {
        backend = sqlite;
        return backend;
    }

    const upstash = upstashBackend();
    if (upstash) {
        backend = upstash;
        return backend;
    }

    const blobs = await blobBackend();
    if (blobs) {
        backend = blobs;
        return backend;
    }

    // على Vercel نظام الملفات للقراءة فقط، فلا فائدة من التخزين المحلي — نوضح السبب بدل خطأ غامض
    if (process.env.VERCEL) {
        throw new Error('لم يتم ضبط قاعدة البيانات. أضف المتغيرين UPSTASH_REDIS_REST_URL و UPSTASH_REDIS_REST_TOKEN في إعدادات المشروع ثم أعد النشر.');
    }

    backend = fileBackend();
    return backend;
}

/* ------------------------- قراءة وكتابة مُتسلسلة ------------------------- */

let queue: Promise<unknown> = Promise.resolve();

/** يمنع تداخل عمليتي قراءة-تعديل-كتابة داخل نفس العملية فتضيع إحداهما */
function serialize<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(task, task);
    queue = run.catch(() => undefined);
    return run;
}

export async function readDatabase(): Promise<ServerDatabase> {
    const store = await getBackend();
    return normalizeServer(await store.read());
}

/** يقرأ أحدث نسخة، يطبّق التعديل، ثم يحفظ — كل ذلك داخل قفل واحد */
export async function mutateDatabase<T>(mutator: (db: ServerDatabase) => T | Promise<T>): Promise<{ db: ServerDatabase; result: T }> {
    return serialize(async () => {
        const store = await getBackend();
        const db = normalizeServer(await store.read());
        const result = await mutator(db);
        await store.write(db);
        return { db, result };
    });
}
