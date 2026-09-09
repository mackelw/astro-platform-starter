/**
 * تخزين بيانات المركز على السيرفر.
 *
 * يختار الطبقة المناسبة تلقائيًا حسب مكان التشغيل:
 *   1. Upstash Redis عبر REST — إن وُجد متغيرا البيئة (النشر على Vercel)
 *   2. Netlify Blobs — عند النشر على Netlify
 *   3. ملف JSON محلي — على جهاز داخل المركز أو أثناء التطوير
 * فيعمل نفس الكود في الحالات الثلاث بلا تغيير.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { Database, ID, PatientAccessInfo, Role } from '../clinic/types';
import { emptyDatabase, normalize } from '../clinic/storage';

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

/** جلسة مريض داخل بوابة التأهيل — منفصلة تمامًا عن جلسات موظفي المركز */
export interface PortalSession {
    tokenHash: string;
    patientId: ID;
    createdAt: string;
    expiresAt: string;
}

/**
 * مفتاح البوابة كما يُحفظ فعلًا.
 * الرابط السري رمز عشوائي طويل فتكفيه تجزئة SHA-256 كجلسات الدخول،
 * أما رمز الستة أرقام فمجاله صغير (مليون احتمال) فيُجزّأ بـ PBKDF2 بملح خاص.
 */
export interface ServerPatientAccess extends PatientAccessInfo {
    tokenHash: string;
    codeHash: string;
    codeSalt: string;
    iterations: number;
}

export interface ServerDatabase extends Database {
    patientAccess: ServerPatientAccess[];
    users: ServerUser[];
    authSessions: ServerSession[]; // جلسات تسجيل الدخول (غير الجلسات العلاجية)
    portalSessions: PortalSession[];
}

const BLOB_STORE = 'clinic';
const BLOB_KEY = 'database';
const REDIS_KEY = 'clinic:database';
const LOCK_KEY = 'clinic:lock';
/** عمر القفل — أطول بكثير من دورة قراءة وكتابة، وأقصر من صبر المستخدم */
const LOCK_TTL_MS = 15_000;
/** أقصى انتظار قبل الاستسلام: يكفي لانتهاء قفل نسخة متعطلة */
const LOCK_WAIT_MS = 20_000;
const FILE_PATH = resolve(process.env.CLINIC_DATA_FILE || '.data/clinic-db.json');

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomToken(): string {
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function emptyServerDatabase(): ServerDatabase {
    return { ...emptyDatabase(), users: [], authSessions: [], portalSessions: [], patientAccess: [] };
}

function normalizeServer(raw: unknown): ServerDatabase {
    const source = (raw ?? {}) as Partial<ServerDatabase>;
    return {
        ...normalize(raw),
        users: Array.isArray(source.users) ? source.users : [],
        authSessions: Array.isArray(source.authSessions) ? source.authSessions : [],
        portalSessions: Array.isArray(source.portalSessions) ? source.portalSessions : [],
        // normalize العامة تُرجع النسخة المنزوعة الأسرار، فنستعيد الحقول المُجزّأة من المصدر
        patientAccess: Array.isArray(source.patientAccess) ? source.patientAccess : []
    };
}

/* --------------------------- طبقة التخزين --------------------------- */

type Backend = {
    read: () => Promise<unknown>;
    /**
     * قفل موزَّع اختياري حول دورة قراءة-تعديل-كتابة.
     * لازم على الاستضافات التي تشغّل عدة نسخ متوازية (Vercel مثلًا)، لأن القفل
     * داخل العملية الواحدة لا يرى النسخ الأخرى فتضيع الكتابات بصمت.
     * يعيد دالة فك القفل.
     */
    lock?: () => Promise<() => Promise<void>>;
    write: (db: ServerDatabase) => Promise<void>;
};

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

    const command = async (path: string, init?: RequestInit): Promise<unknown> => {
        const response = await fetch(`${url}/${path}`, { headers, cache: 'no-store', ...init });
        if (!response.ok) throw new Error(`تعذر الوصول للمخزن (${response.status})`);
        return ((await response.json()) as { result?: unknown }).result;
    };

    return {
        /**
         * قفل بسيط: مفتاح يُكتب بشرط عدم وجوده وبعمر قصير، فلو تعطلت نسخة
         * وهي ممسكة به انتهى وحده بدل أن يجمّد المركز.
         */
        lock: async () => {
            const owner = randomToken();
            const deadline = Date.now() + LOCK_WAIT_MS;
            let wait = 25;

            while (Date.now() < deadline) {
                const acquired = await command(`set/${encodeURIComponent(LOCK_KEY)}/${owner}/NX/PX/${LOCK_TTL_MS}`, { method: 'POST' });
                if (acquired === 'OK') {
                    return async () => {
                        try {
                            // لا نحرّر إلا قفلنا نحن، تحسبًا لانتهاء عمره وأخذ نسخة أخرى له
                            const current = await command(`get/${encodeURIComponent(LOCK_KEY)}`);
                            if (current === owner) await command(`del/${encodeURIComponent(LOCK_KEY)}`, { method: 'POST' });
                        } catch {
                            // القفل ينتهي وحده بعد LOCK_TTL_MS، فلا داعي لإفشال العملية
                        }
                    };
                }
                await sleep(wait);
                wait = Math.min(wait * 2, 400);
            }

            throw new Error('الخادم مشغول بحفظ تعديل آخر. حاول مرة أخرى بعد لحظات.');
        },

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

/**
 * يقرأ أحدث نسخة، يطبّق التعديل، ثم يحفظ — داخل قفلين:
 * قفل داخل العملية يمنع تداخل الطلبات على نفس النسخة، وقفل موزَّع (إن وفّره المخزن)
 * يمنع نسخة أخرى من الخادم من الكتابة فوق تعديلنا.
 */
export async function mutateDatabase<T>(mutator: (db: ServerDatabase) => T | Promise<T>): Promise<{ db: ServerDatabase; result: T }> {
    return serialize(async () => {
        const store = await getBackend();
        const release = store.lock ? await store.lock() : null;
        try {
            const db = normalizeServer(await store.read());
            const result = await mutator(db);
            await store.write(db);
            return { db, result };
        } finally {
            if (release) await release();
        }
    });
}
