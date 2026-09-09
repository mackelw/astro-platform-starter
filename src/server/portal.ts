/**
 * بوابة المريض: دخول بلا كلمة سر.
 *
 * مساران مقبولان:
 *   1. رابط سري يحمل رمزًا طويلًا عشوائيًا  →  /p?t=…
 *   2. رقم الموبايل + رمز من ستة أرقام يسلّمه الاستقبال
 *
 * الجلسة الناتجة عن أي منهما كوكي httpOnly منفصل عن كوكي الموظفين،
 * ولا يرى المريض من قاعدة البيانات إلا ما يخصه هو.
 */
import type { APIContext } from 'astro';
import type { Exercise, ID, Patient, PatientAccessSecret, PromTemplateId } from '../clinic/types';
import { promTemplate } from '../clinic/prom';
import { hashPassword, hashToken, randomHex, safeEqual } from './auth';
import { mutateDatabase, type ServerDatabase } from './db';

export const PORTAL_COOKIE = 'clinic_portal';
const PORTAL_DAYS = 30;
const MAX_CODE_ATTEMPTS = 6;
const LOCKOUT_MINUTES = 15;
/** رمز الستة أرقام مجاله صغير، فتجزئته بطيئة عمدًا حتى لو تسربت القاعدة */
const CODE_ITERATIONS = 210_000;

/* ------------------------------ إصدار المفاتيح ------------------------------ */

/** رمز من ستة أرقام يسهل إملاؤه على الهاتف */
export function newAccessCode(): string {
    const array = new Uint32Array(1);
    crypto.getRandomValues(array);
    return String(array[0] % 1_000_000).padStart(6, '0');
}

export function newAccessToken(): string {
    return randomHex(24);
}

/**
 * ينشئ مفتاح دخول جديدًا للمريض ويعيد نصه الصريح **مرة واحدة**.
 * المحفوظ في القاعدة تجزئات فقط، فلا سبيل لاسترجاع الرمز لاحقًا — من فقده يُصدَر له غيره.
 */
export async function issueAccess(db: ServerDatabase, patientId: ID, regenerate: boolean): Promise<PatientAccessSecret | null> {
    const existing = db.patientAccess.find((a) => a.patientId === patientId);

    // إعادة تفعيل مفتاح موقوف: الرمز القديم ما زال صالحًا عند المريض فلا نولّد غيره
    if (existing && !regenerate) {
        existing.enabled = true;
        return null;
    }

    const token = newAccessToken();
    const code = newAccessCode();
    const codeSalt = randomHex(16);

    const record = {
        patientId,
        tokenHash: await hashToken(token),
        codeHash: await hashPassword(code, codeSalt, CODE_ITERATIONS),
        codeSalt,
        iterations: CODE_ITERATIONS,
        enabled: true,
        createdAt: new Date().toISOString(),
        lastSeenAt: existing?.lastSeenAt ?? ''
    };

    if (existing) Object.assign(existing, record);
    else db.patientAccess.push(record);

    // المفتاح الجديد يُنهي أي جلسة قائمة بالمفتاح القديم
    db.portalSessions = db.portalSessions.filter((s) => s.patientId !== patientId);

    return { token, code };
}

export function revokeAccess(db: ServerDatabase, patientId: ID): void {
    const existing = db.patientAccess.find((a) => a.patientId === patientId);
    if (existing) existing.enabled = false;
    db.portalSessions = db.portalSessions.filter((s) => s.patientId !== patientId);
}

/* ------------------------------ محاولات الرمز ------------------------------ */

const attempts = new Map<string, { count: number; until: number }>();

function lockedFor(phone: string): number {
    const entry = attempts.get(phone);
    if (!entry || entry.until < Date.now()) return 0;
    return entry.count >= MAX_CODE_ATTEMPTS ? Math.ceil((entry.until - Date.now()) / 60_000) : 0;
}

function recordFailure(phone: string): void {
    const entry = attempts.get(phone);
    const until = Date.now() + LOCKOUT_MINUTES * 60_000;
    attempts.set(phone, entry && entry.until > Date.now() ? { count: entry.count + 1, until } : { count: 1, until });
}

/* -------------------------------- الجلسات -------------------------------- */

function setCookie(context: APIContext, token: string): void {
    context.cookies.set(PORTAL_COOKIE, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: context.url.protocol === 'https:',
        path: '/',
        maxAge: PORTAL_DAYS * 24 * 3600
    });
}

export function clearPortalCookie(context: APIContext): void {
    context.cookies.delete(PORTAL_COOKIE, { path: '/' });
}

/** ينشئ جلسة بوابة للمريض ويضع الكوكي */
async function startSession(context: APIContext, patientId: ID): Promise<void> {
    const token = randomHex(32);
    const tokenHash = await hashToken(token);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + PORTAL_DAYS * 24 * 3600_000).toISOString();

    await mutateDatabase((db) => {
        db.portalSessions = db.portalSessions.filter((s) => s.expiresAt > now.toISOString());
        db.portalSessions.push({ tokenHash, patientId, createdAt: now.toISOString(), expiresAt });
        const access = db.patientAccess.find((a) => a.patientId === patientId);
        if (access) access.lastSeenAt = now.toISOString();
    });

    setCookie(context, token);
}

/** المريض صاحب الجلسة الحالية، أو null */
export async function currentPatient(context: APIContext, db: ServerDatabase): Promise<Patient | null> {
    const token = context.cookies.get(PORTAL_COOKIE)?.value;
    if (!token) return null;
    const tokenHash = await hashToken(token);
    const session = db.portalSessions.find((s) => s.tokenHash === tokenHash);
    if (!session || session.expiresAt <= new Date().toISOString()) return null;
    const access = db.patientAccess.find((a) => a.patientId === session.patientId);
    if (!access?.enabled) return null;
    return db.patients.find((p) => p.id === session.patientId && !p.archived) ?? null;
}

/** دخول بالرابط السري — نطابق تجزئة الرمز لا الرمز نفسه */
export async function loginByToken(context: APIContext, db: ServerDatabase, token: string): Promise<Patient | null> {
    const tokenHash = await hashToken(token);
    const access = db.patientAccess.find((a) => a.enabled && safeEqual(a.tokenHash, tokenHash));
    if (!access) return null;
    const patient = db.patients.find((p) => p.id === access.patientId && !p.archived);
    if (!patient) return null;
    await startSession(context, patient.id);
    return patient;
}

/** دخول برقم الموبايل ورمز المرور */
export async function loginByCode(context: APIContext, db: ServerDatabase, phone: string, code: string): Promise<{ patient: Patient } | { error: string }> {
    const digits = phone.replace(/\D/g, '');
    if (!digits || !/^\d{4,10}$/.test(code.trim())) return { error: 'أدخل رقم الموبايل ورمز الدخول' };

    const wait = lockedFor(digits);
    if (wait) return { error: `تم إيقاف المحاولات مؤقتًا. حاول بعد ${wait} دقيقة.` };

    // مطابقة آخر أرقام الهاتف حتى لا يفشل الدخول بسبب صفر بادئ أو مفتاح دولة
    const candidates = db.patients
        .filter((p) => {
            const stored = p.phone.replace(/\D/g, '');
            return stored.length >= 6 && !p.archived && (stored.endsWith(digits) || digits.endsWith(stored));
        })
        .map((patient) => ({ patient, access: db.patientAccess.find((a) => a.patientId === patient.id && a.enabled) }))
        .filter((row) => row.access);

    let matched: Patient | null = null;
    for (const row of candidates) {
        const access = row.access!;
        const candidate = await hashPassword(code.trim(), access.codeSalt, access.iterations || CODE_ITERATIONS);
        if (safeEqual(candidate, access.codeHash)) {
            matched = row.patient;
            break;
        }
    }

    // حساب تجزئة وهمية عند عدم وجود أي مرشّح حتى لا يكشف زمن الرد عن الأرقام المسجلة
    if (!candidates.length) await hashPassword(code.trim(), 'placeholder-salt', CODE_ITERATIONS);

    if (!matched) {
        recordFailure(digits);
        return { error: 'رقم الموبايل أو رمز الدخول غير صحيح' };
    }

    attempts.delete(digits);
    await startSession(context, matched.id);
    return { patient: matched };
}

/* ------------------------------ ما يراه المريض ------------------------------ */

export interface PortalExercise {
    id: ID;
    name: string;
    nameEn: string;
    summary: string;
    summaryEn: string;
    instructions: string;
    instructionsEn: string;
    cautions: string;
    cautionsEn: string;
    videoUrl: string;
    imageUrl: string;
    equipment: string;
    equipmentEn: string;
}

export interface PortalView {
    clinicName: string;
    clinicPhone: string;
    patient: { id: ID; name: string; code: string };
    program: {
        id: ID;
        title: string;
        notes: string;
        startDate: string;
        endDate: string;
        daysPerWeek: number;
        status: string;
        items: {
            id: ID;
            exerciseId: ID;
            sets: number;
            reps: number;
            hold: number;
            rest: number;
            perDay: number;
            side: string;
            resistance: string;
            note: string;
        }[];
    } | null;
    exercises: PortalExercise[];
    logs: { date: string; doneItemIds: ID[]; pain: number; difficulty: number; note: string }[];
    proms: PromTemplateId[];
    promHistory: { templateId: PromTemplateId; date: string; score: number }[];
    messages: { from: string; authorName: string; text: string; createdAt: string }[];
    appointments: { date: string; time: string; status: string }[];
}

/**
 * الحمولة التي تذهب للمريض — بيانات مريض واحد فقط،
 * بلا أسعار ولا مدفوعات ولا أي شيء يخص مرضى آخرين.
 */
export function portalView(db: ServerDatabase, patient: Patient): PortalView {
    const program =
        db.programs.filter((p) => p.patientId === patient.id && p.status !== 'done').sort((a, b) => b.startDate.localeCompare(a.startDate))[0] ?? null;

    const usedIds = new Set((program?.items ?? []).map((i) => i.exerciseId));
    const exercises: PortalExercise[] = db.exercises
        .filter((x: Exercise) => usedIds.has(x.id))
        .map((x) => ({
            id: x.id,
            name: x.name,
            nameEn: x.nameEn ?? '',
            summary: x.summary ?? '',
            summaryEn: x.summaryEn ?? '',
            instructions: x.instructions,
            instructionsEn: x.instructionsEn ?? '',
            cautions: x.cautions ?? '',
            cautionsEn: x.cautionsEn ?? '',
            videoUrl: x.videoUrl,
            imageUrl: x.imageUrl,
            equipment: x.equipment,
            equipmentEn: x.equipmentEn ?? ''
        }));

    const today = new Date().toISOString().slice(0, 10);

    return {
        clinicName: db.settings.name,
        clinicPhone: db.settings.phone,
        patient: { id: patient.id, name: patient.name, code: patient.code },
        program: program
            ? {
                  id: program.id,
                  title: program.title,
                  notes: program.notes,
                  startDate: program.startDate,
                  endDate: program.endDate,
                  daysPerWeek: program.daysPerWeek,
                  status: program.status,
                  items: program.items
              }
            : null,
        exercises,
        logs: db.programLogs
            .filter((g) => g.patientId === patient.id)
            .sort((a, b) => b.date.localeCompare(a.date))
            .slice(0, 120)
            .map((g) => ({ date: g.date, doneItemIds: g.doneItemIds, pain: g.pain, difficulty: g.difficulty, note: g.note })),
        proms: program?.proms ?? [],
        promHistory: db.promResponses
            .filter((r) => r.patientId === patient.id)
            .sort((a, b) => a.date.localeCompare(b.date))
            .map((r) => ({ templateId: r.templateId, date: r.date, score: r.score })),
        messages: db.portalMessages
            .filter((m) => m.patientId === patient.id)
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
            .slice(-50)
            .map((m) => ({ from: m.from, authorName: m.authorName, text: m.text, createdAt: m.createdAt })),
        appointments: db.appointments
            .filter((a) => a.patientId === patient.id && a.date >= today && a.status === 'scheduled')
            .sort((a, b) => (a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date)))
            .slice(0, 5)
            .map((a) => ({ date: a.date, time: a.time, status: a.status }))
    };
}

/* ------------------------------ كتابة المريض ------------------------------ */

const MAX_TEXT = 800;

/** يسجّل يوم المريض — يوم واحد لكل تاريخ، فالإرسال المتكرر يحدّث نفس السجل */
export function upsertLog(
    db: ServerDatabase,
    patient: Patient,
    input: { date?: unknown; doneItemIds?: unknown; pain?: unknown; difficulty?: unknown; note?: unknown }
): string | null {
    const program = db.programs.filter((p) => p.patientId === patient.id && p.status === 'active').sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
    if (!program) return 'لا يوجد برنامج نشط';

    const raw = String(input.date ?? '');
    const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : new Date().toISOString().slice(0, 10);
    // لا يُسجَّل يوم في المستقبل
    if (date > new Date().toISOString().slice(0, 10)) return 'تاريخ غير صالح';

    const validIds = new Set(program.items.map((i) => i.id));
    const doneItemIds = Array.isArray(input.doneItemIds) ? [...new Set(input.doneItemIds.map((v) => String(v)).filter((id) => validIds.has(id)))] : [];

    const clamp = (value: unknown, max: number) => {
        const n = Math.round(Number(value));
        return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : 0;
    };

    const patch = {
        doneItemIds,
        pain: clamp(input.pain, 10),
        difficulty: clamp(input.difficulty, 5),
        note: String(input.note ?? '').slice(0, MAX_TEXT)
    };

    const existing = db.programLogs.find((g) => g.patientId === patient.id && g.programId === program.id && g.date === date);
    if (existing) Object.assign(existing, patch);
    else db.programLogs.push({ id: 'g_' + randomHex(8), programId: program.id, patientId: patient.id, date, ...patch, createdAt: new Date().toISOString() });

    return null;
}

export function addPromResponse(db: ServerDatabase, patient: Patient, templateId: unknown, answers: unknown): string | null {
    const template = promTemplate(String(templateId) as PromTemplateId);
    if (!template) return 'استبيان غير معروف';
    if (!Array.isArray(answers) || answers.length !== template.items.length) return 'أجب عن كل الأسئلة';

    const clean = answers.map((value, index) => {
        const n = Math.round(Number(value));
        const max = template.items[index].options.length - 1;
        return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : 0;
    });

    db.promResponses.push({
        id: 'r_' + randomHex(8),
        patientId: patient.id,
        templateId: template.id,
        date: new Date().toISOString().slice(0, 10),
        answers: clean,
        score: template.score(clean),
        filledBy: 'patient',
        createdAt: new Date().toISOString()
    });
    return null;
}

export function addPatientMessage(db: ServerDatabase, patient: Patient, text: unknown): string | null {
    const body = String(text ?? '')
        .trim()
        .slice(0, MAX_TEXT);
    if (!body) return 'اكتب رسالتك أولًا';
    db.portalMessages.push({
        id: 'm_' + randomHex(8),
        patientId: patient.id,
        from: 'patient',
        authorName: patient.name,
        text: body,
        readByStaff: false,
        createdAt: new Date().toISOString()
    });
    return null;
}
