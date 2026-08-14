import type { APIRoute } from 'astro';
import {
    clearCookie,
    createSession,
    destroySession,
    getAuth,
    hashPassword,
    jsonError,
    requireAuth,
    sessionCookie,
    toPublicUser,
    verifyPassword
} from '../../lib/auth';
import {
    COLLECTIONS,
    ROLES,
    type Adjustment,
    type Attendance,
    type Clinic,
    type Hep,
    type Patient,
    type Program,
    type QueueEntry,
    type Role,
    type Session,
    type User
} from '../../lib/models';
import { computePayroll, payrollToCsv } from '../../lib/payroll';
import { findPapers, suggestExercises } from '../../lib/research';
import { id, mutate, readCollection, shortCode, writeCollection } from '../../lib/store';

export const prerender = false;

const CLINIC_TZ = process.env.CLINIC_TIMEZONE || 'Africa/Cairo';

function today(): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: CLINIC_TZ }).format(new Date());
}

function clockTime(): string {
    return new Intl.DateTimeFormat('en-GB', {
        timeZone: CLINIC_TZ,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    }).format(new Date());
}

function json(data: unknown, init: ResponseInit = {}): Response {
    return new Response(JSON.stringify(data), {
        ...init,
        headers: { 'content-type': 'application/json', ...(init.headers ?? {}) }
    });
}

const CLINICAL: Role[] = ['owner', 'senior_doctor', 'doctor'];
const DESK: Role[] = ['owner', 'secretary'];
const ADMIN: Role[] = ['owner', 'hr'];

/** Every route is dispatched from here so auth and clinic scoping stay in one place. */
async function handle(request: Request, url: URL, method: string, path: string): Promise<Response> {
    switch (`${method} ${path}`) {
        // ---------------------------------------------------------------- auth
        case 'POST auth/register-clinic': {
            const body = await request.json();
            const email = String(body.email ?? '')
                .trim()
                .toLowerCase();
            const password = String(body.password ?? '');
            if (!body.clinicName || !body.ownerName || !email || password.length < 8) {
                return jsonError('Clinic name, owner name, email and a password of at least 8 characters are required', 400);
            }

            const users = await readCollection<User>(COLLECTIONS.users);
            if (users.some((u) => u.email === email)) return jsonError('That email is already registered', 409);

            const clinic: Clinic = {
                id: id('cln'),
                name: String(body.clinicName),
                currency: String(body.currency ?? 'ج.م'),
                createdAt: new Date().toISOString()
            };
            await mutate<Clinic, void>(COLLECTIONS.clinics, (rows) => {
                rows.push(clinic);
            });

            const owner: User = {
                id: id('usr'),
                clinicId: clinic.id,
                name: String(body.ownerName),
                email,
                passwordHash: await hashPassword(password),
                role: 'owner',
                employmentType: 'full_time',
                baseSalary: 0,
                shiftRate: 0,
                commissionPct: 0,
                status: 'active',
                createdAt: new Date().toISOString()
            };
            await mutate<User, void>(COLLECTIONS.users, (rows) => {
                rows.push(owner);
            });

            const token = await createSession(owner);
            return json({ clinic, user: toPublicUser(owner) }, { headers: { 'set-cookie': sessionCookie(token) } });
        }

        case 'POST auth/login': {
            const body = await request.json();
            const email = String(body.email ?? '')
                .trim()
                .toLowerCase();
            const users = await readCollection<User>(COLLECTIONS.users);
            const user = users.find((u) => u.email === email);
            if (!user || !(await verifyPassword(String(body.password ?? ''), user.passwordHash))) {
                return jsonError('Incorrect email or password', 401);
            }
            if (user.status !== 'active') return jsonError('This account is frozen. Contact the clinic owner.', 403);

            const clinics = await readCollection<Clinic>(COLLECTIONS.clinics);
            const token = await createSession(user);
            return json(
                { user: toPublicUser(user), clinic: clinics.find((c) => c.id === user.clinicId) ?? null },
                { headers: { 'set-cookie': sessionCookie(token) } }
            );
        }

        case 'POST auth/logout': {
            const auth = await getAuth(request);
            if (auth) await destroySession(auth.session.token);
            return json({ ok: true }, { headers: { 'set-cookie': clearCookie() } });
        }

        case 'GET auth/me': {
            const auth = await getAuth(request);
            if (!auth) return json({ user: null, clinic: null });
            const clinics = await readCollection<Clinic>(COLLECTIONS.clinics);
            return json({ user: auth.user, clinic: clinics.find((c) => c.id === auth.user.clinicId) ?? null });
        }

        // --------------------------------------------------------------- staff
        case 'GET staff': {
            const { user } = await requireAuth(request);
            const users = await readCollection<User>(COLLECTIONS.users);
            const staff = users.filter((u) => u.clinicId === user.clinicId).map(toPublicUser);
            // Only owner/HR see compensation figures.
            if (ADMIN.includes(user.role)) return json({ staff });
            return json({
                staff: staff.map((s) => ({ ...s, baseSalary: 0, shiftRate: 0, commissionPct: 0 }))
            });
        }

        case 'POST staff': {
            const { user } = await requireAuth(request, ADMIN);
            const body = await request.json();
            const email = String(body.email ?? '')
                .trim()
                .toLowerCase();
            const password = String(body.password ?? '');
            if (!body.name || !email || password.length < 8) {
                return jsonError('Name, email and a password of at least 8 characters are required', 400);
            }
            if (!ROLES.includes(body.role)) return jsonError('Unknown role', 400);

            const users = await readCollection<User>(COLLECTIONS.users);
            if (users.some((u) => u.email === email)) return jsonError('That email is already registered', 409);

            const created: User = {
                id: id('usr'),
                clinicId: user.clinicId,
                name: String(body.name),
                email,
                passwordHash: await hashPassword(password),
                role: body.role,
                phone: body.phone ? String(body.phone) : '',
                license: body.license ? String(body.license) : '',
                employmentType: body.employmentType === 'part_time' ? 'part_time' : 'full_time',
                baseSalary: Number(body.baseSalary) || 0,
                shiftRate: Number(body.shiftRate) || 0,
                commissionPct: Number(body.commissionPct) || 0,
                status: 'active',
                createdAt: new Date().toISOString()
            };
            await mutate<User, void>(COLLECTIONS.users, (rows) => {
                rows.push(created);
            });
            return json({ user: toPublicUser(created) }, { status: 201 });
        }

        case 'PATCH staff': {
            const { user } = await requireAuth(request, ADMIN);
            const body = await request.json();
            const result = await mutate<User, User | null>(COLLECTIONS.users, async (rows) => {
                const target = rows.find((u) => u.id === body.id && u.clinicId === user.clinicId);
                if (!target) return null;
                const editable = ['name', 'phone', 'license', 'employmentType', 'status', 'role'] as const;
                for (const key of editable) {
                    if (body[key] !== undefined) (target as any)[key] = body[key];
                }
                for (const key of ['baseSalary', 'shiftRate', 'commissionPct'] as const) {
                    if (body[key] !== undefined) target[key] = Number(body[key]) || 0;
                }
                if (body.password) target.passwordHash = await hashPassword(String(body.password));
                return target;
            });
            if (!result) return jsonError('Staff member not found', 404);
            return json({ user: toPublicUser(result) });
        }

        case 'DELETE staff': {
            const { user } = await requireAuth(request, ADMIN);
            const targetId = url.searchParams.get('id');
            if (targetId === user.id) return jsonError('You cannot delete your own account', 400);
            const rows = await readCollection<User>(COLLECTIONS.users);
            const target = rows.find((u) => u.id === targetId && u.clinicId === user.clinicId);
            if (!target) return jsonError('Staff member not found', 404);
            await writeCollection(
                COLLECTIONS.users,
                rows.filter((u) => u.id !== targetId)
            );
            return json({ ok: true });
        }

        // ------------------------------------------------------------ patients
        case 'GET patients': {
            const { user } = await requireAuth(request);
            const search = (url.searchParams.get('q') ?? '').trim().toLowerCase();
            const patients = (await readCollection<Patient>(COLLECTIONS.patients))
                .filter((p) => p.clinicId === user.clinicId)
                .filter(
                    (p) =>
                        !search ||
                        p.name.toLowerCase().includes(search) ||
                        p.code.toLowerCase().includes(search) ||
                        p.phone.includes(search)
                )
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
            return json({ patients });
        }

        case 'POST patients': {
            const { user } = await requireAuth(request, [...DESK, ...CLINICAL]);
            const body = await request.json();
            if (!body.name) return jsonError('Patient name is required', 400);

            const patients = await readCollection<Patient>(COLLECTIONS.patients);
            let code = shortCode('PAT');
            while (patients.some((p) => p.code === code)) code = shortCode('PAT');

            const patient: Patient = {
                id: id('pat'),
                clinicId: user.clinicId,
                code,
                name: String(body.name),
                age: body.age === '' || body.age === undefined ? null : Number(body.age),
                gender: body.gender === 'male' || body.gender === 'female' ? body.gender : '',
                phone: String(body.phone ?? ''),
                diagnosis: String(body.diagnosis ?? ''),
                medicalHistory: String(body.medicalHistory ?? ''),
                contraindications: String(body.contraindications ?? ''),
                createdAt: new Date().toISOString()
            };
            await mutate<Patient, void>(COLLECTIONS.patients, (rows) => {
                rows.push(patient);
            });

            if (body.addToQueue) {
                const entry: QueueEntry = {
                    id: id('que'),
                    clinicId: user.clinicId,
                    patientId: patient.id,
                    patientName: patient.name,
                    patientCode: patient.code,
                    status: 'waiting',
                    day: today(),
                    arrivedAt: clockTime(),
                    doctorId: String(body.doctorId ?? ''),
                    fee: Number(body.fee) || 0,
                    paid: false,
                    note: ''
                };
                await mutate<QueueEntry, void>(COLLECTIONS.queue, (rows) => {
                    rows.push(entry);
                });
            }
            return json({ patient }, { status: 201 });
        }

        case 'PATCH patients': {
            const { user } = await requireAuth(request, [...DESK, ...CLINICAL]);
            const body = await request.json();
            const result = await mutate<Patient, Patient | null>(COLLECTIONS.patients, (rows) => {
                const target = rows.find((p) => p.id === body.id && p.clinicId === user.clinicId);
                if (!target) return null;
                for (const key of ['name', 'phone', 'diagnosis', 'medicalHistory', 'contraindications', 'gender'] as const) {
                    if (body[key] !== undefined) (target as any)[key] = String(body[key]);
                }
                if (body.age !== undefined) target.age = body.age === '' ? null : Number(body.age);
                return target;
            });
            if (!result) return jsonError('Patient not found', 404);
            return json({ patient: result });
        }

        // --------------------------------------------------------------- queue
        case 'GET queue': {
            const { user } = await requireAuth(request);
            const day = url.searchParams.get('day') || today();
            const all = await readCollection<QueueEntry>(COLLECTIONS.queue);
            const queue = all
                .filter((q) => q.clinicId === user.clinicId && (url.searchParams.get('all') ? true : q.day === day))
                .sort((a, b) => a.arrivedAt.localeCompare(b.arrivedAt));
            return json({
                queue,
                day,
                stats: {
                    waiting: queue.filter((q) => q.status === 'waiting').length,
                    inRoom: queue.filter((q) => q.status === 'in_room').length,
                    done: queue.filter((q) => q.status === 'done' || q.status === 'paid').length,
                    collected: queue.filter((q) => q.paid).reduce((sum, q) => sum + q.fee, 0)
                }
            });
        }

        case 'POST queue': {
            const { user } = await requireAuth(request, [...DESK, ...CLINICAL]);
            const body = await request.json();
            const patients = await readCollection<Patient>(COLLECTIONS.patients);
            const patient = patients.find((p) => p.id === body.patientId && p.clinicId === user.clinicId);
            if (!patient) return jsonError('Patient not found', 404);

            const entry: QueueEntry = {
                id: id('que'),
                clinicId: user.clinicId,
                patientId: patient.id,
                patientName: patient.name,
                patientCode: patient.code,
                status: 'waiting',
                day: String(body.day || today()),
                arrivedAt: clockTime(),
                doctorId: String(body.doctorId ?? ''),
                fee: Number(body.fee) || 0,
                paid: false,
                note: String(body.note ?? '')
            };
            await mutate<QueueEntry, void>(COLLECTIONS.queue, (rows) => {
                rows.push(entry);
            });
            return json({ entry }, { status: 201 });
        }

        case 'PATCH queue': {
            const { user } = await requireAuth(request);
            const body = await request.json();
            const result = await mutate<QueueEntry, QueueEntry | null>(COLLECTIONS.queue, (rows) => {
                const target = rows.find((q) => q.id === body.id && q.clinicId === user.clinicId);
                if (!target) return null;
                if (body.status) target.status = body.status;
                if (body.paid !== undefined) {
                    target.paid = Boolean(body.paid);
                    if (target.paid) target.status = 'paid';
                }
                if (body.fee !== undefined) target.fee = Number(body.fee) || 0;
                if (body.doctorId !== undefined) target.doctorId = String(body.doctorId);
                if (body.note !== undefined) target.note = String(body.note);
                return target;
            });
            if (!result) return jsonError('Queue entry not found', 404);
            return json({ entry: result });
        }

        // ------------------------------------------------------------ sessions
        case 'GET sessions': {
            const { user } = await requireAuth(request);
            const patientId = url.searchParams.get('patientId');
            const sessions = (await readCollection<Session>(COLLECTIONS.sessions))
                .filter((s) => s.clinicId === user.clinicId && (!patientId || s.patientId === patientId))
                .sort((a, b) => b.date.localeCompare(a.date));
            return json({ sessions });
        }

        case 'POST sessions': {
            const { user } = await requireAuth(request, CLINICAL);
            const body = await request.json();
            const patients = await readCollection<Patient>(COLLECTIONS.patients);
            const patient = patients.find((p) => p.id === body.patientId && p.clinicId === user.clinicId);
            if (!patient) return jsonError('Patient not found', 404);

            const existing = await readCollection<Session>(COLLECTIONS.sessions);
            const number = existing.filter((s) => s.patientId === patient.id).length + 1;

            // Commission is a share of what reception charged, so the session
            // inherits the queue entry's fee unless one is passed explicitly.
            let fee = Number(body.fee) || 0;
            if (!fee) {
                const queue = await readCollection<QueueEntry>(COLLECTIONS.queue);
                const entry =
                    queue.find((q) => q.id === body.queueId) ??
                    queue.find((q) => q.patientId === patient.id && q.day === today());
                fee = entry?.fee ?? 0;
            }

            const session: Session = {
                id: id('ses'),
                clinicId: user.clinicId,
                patientId: patient.id,
                doctorId: user.id,
                doctorName: user.name,
                number,
                date: new Date().toISOString(),
                execution: Array.isArray(body.execution) ? body.execution : [],
                metrics: Array.isArray(body.metrics) ? body.metrics : [],
                observations: String(body.observations ?? ''),
                progressNotes: String(body.progressNotes ?? ''),
                fee
            };
            await mutate<Session, void>(COLLECTIONS.sessions, (rows) => {
                rows.push(session);
            });

            // Close out the matching queue entry so the waiting board stays live.
            if (body.queueId) {
                await mutate<QueueEntry, void>(COLLECTIONS.queue, (rows) => {
                    const entry = rows.find((q) => q.id === body.queueId && q.clinicId === user.clinicId);
                    if (entry && entry.status !== 'paid') entry.status = 'done';
                });
            }
            return json({ session }, { status: 201 });
        }

        // ------------------------------------------------- program (in-clinic)
        case 'GET program': {
            const { user } = await requireAuth(request);
            const patientId = url.searchParams.get('patientId');
            const programs = await readCollection<Program>(COLLECTIONS.programs);
            return json({ program: programs.find((p) => p.patientId === patientId && p.clinicId === user.clinicId) ?? null });
        }

        case 'PUT program': {
            const { user } = await requireAuth(request, CLINICAL);
            const body = await request.json();
            const result = await mutate<Program, Program>(COLLECTIONS.programs, (rows) => {
                let program = rows.find((p) => p.patientId === body.patientId && p.clinicId === user.clinicId);
                if (!program) {
                    program = {
                        id: id('prg'),
                        clinicId: user.clinicId,
                        patientId: String(body.patientId),
                        items: [],
                        updatedAt: '',
                        updatedBy: ''
                    };
                    rows.push(program);
                }
                program.items = (Array.isArray(body.items) ? body.items : []).map((item: any) => ({
                    id: item.id || id('itm'),
                    name: String(item.name ?? ''),
                    instructions: String(item.instructions ?? ''),
                    sets: String(item.sets ?? ''),
                    reps: String(item.reps ?? ''),
                    duration: String(item.duration ?? ''),
                    video: String(item.video ?? '')
                }));
                program.updatedAt = new Date().toISOString();
                program.updatedBy = user.name;
                return program;
            });
            return json({ program: result });
        }

        // ----------------------------------------------------------- HEP (home)
        case 'GET hep': {
            const { user } = await requireAuth(request);
            const patientId = url.searchParams.get('patientId');
            const heps = await readCollection<Hep>(COLLECTIONS.heps);
            return json({ hep: heps.find((h) => h.patientId === patientId && h.clinicId === user.clinicId) ?? null });
        }

        case 'PUT hep': {
            const { user } = await requireAuth(request, CLINICAL);
            const body = await request.json();
            const result = await mutate<Hep, Hep>(COLLECTIONS.heps, (rows) => {
                let hep = rows.find((h) => h.patientId === body.patientId && h.clinicId === user.clinicId);
                if (!hep) {
                    hep = {
                        id: id('hep'),
                        clinicId: user.clinicId,
                        patientId: String(body.patientId),
                        exercises: [],
                        updatedAt: '',
                        updatedBy: ''
                    };
                    rows.push(hep);
                }
                hep.exercises = (Array.isArray(body.exercises) ? body.exercises : []).map((e: any) => ({
                    id: e.id || id('hex'),
                    name: String(e.name ?? ''),
                    setsReps: String(e.setsReps ?? ''),
                    frequency: String(e.frequency ?? ''),
                    mediaUrl: String(e.mediaUrl ?? ''),
                    advice: String(e.advice ?? '')
                }));
                hep.updatedAt = new Date().toISOString();
                hep.updatedBy = user.name;
                return hep;
            });
            return json({ hep: result });
        }

        // ---------------------------------------------------------- attendance
        case 'GET attendance': {
            const { user } = await requireAuth(request);
            const day = url.searchParams.get('day') || today();
            const month = url.searchParams.get('month');
            const rows = (await readCollection<Attendance>(COLLECTIONS.attendance)).filter(
                (a) => a.clinicId === user.clinicId && (month ? a.day.startsWith(month) : a.day === day)
            );
            return json({ attendance: rows, day });
        }

        case 'POST attendance': {
            const { user } = await requireAuth(request);
            const body = await request.json();
            const targetId = String(body.userId ?? user.id);
            // Only owner/HR may record attendance on someone else's behalf.
            if (targetId !== user.id && !ADMIN.includes(user.role)) {
                return jsonError('Not authorised to record attendance for other staff', 403);
            }
            const day = String(body.day || today());
            const action = String(body.action ?? 'check_in');

            const result = await mutate<Attendance, Attendance>(COLLECTIONS.attendance, (rows) => {
                let record = rows.find((a) => a.userId === targetId && a.day === day && a.clinicId === user.clinicId);
                if (!record) {
                    record = {
                        id: id('att'),
                        clinicId: user.clinicId,
                        userId: targetId,
                        day,
                        checkIn: null,
                        checkOut: null,
                        status: 'present',
                        shifts: 0
                    };
                    rows.push(record);
                }
                if (action === 'check_in') {
                    record.checkIn = clockTime();
                    record.status = 'present';
                    if (record.shifts === 0) record.shifts = 1;
                } else if (action === 'check_out') {
                    record.checkOut = clockTime();
                } else if (action === 'absent') {
                    record.status = 'absent';
                    record.shifts = 0;
                } else if (action === 'leave') {
                    record.status = 'leave';
                    record.shifts = 0;
                }
                return record;
            });
            return json({ attendance: result });
        }

        // ------------------------------------------------------------- payroll
        case 'GET payroll': {
            const { user } = await requireAuth(request, ADMIN);
            const month = url.searchParams.get('month') || today().slice(0, 7);
            const [users, attendance, sessions, adjustments] = await Promise.all([
                readCollection<User>(COLLECTIONS.users),
                readCollection<Attendance>(COLLECTIONS.attendance),
                readCollection<Session>(COLLECTIONS.sessions),
                readCollection<Adjustment>(COLLECTIONS.adjustments)
            ]);
            const staff = users.filter((u) => u.clinicId === user.clinicId).map(toPublicUser);
            const rows = computePayroll(
                month,
                staff,
                attendance.filter((a) => a.clinicId === user.clinicId),
                sessions.filter((s) => s.clinicId === user.clinicId),
                adjustments.filter((a) => a.clinicId === user.clinicId)
            );

            if (url.searchParams.get('format') === 'csv') {
                return new Response(payrollToCsv(rows, month), {
                    headers: {
                        'content-type': 'text/csv; charset=utf-8',
                        'content-disposition': `attachment; filename="payroll-${month}.csv"`
                    }
                });
            }
            return json({ month, rows, total: rows.reduce((sum, r) => sum + r.net, 0) });
        }

        case 'POST adjustments': {
            const { user } = await requireAuth(request, ADMIN);
            const body = await request.json();
            const adjustment: Adjustment = {
                id: id('adj'),
                clinicId: user.clinicId,
                userId: String(body.userId),
                month: String(body.month || today().slice(0, 7)),
                kind: body.kind === 'bonus' ? 'bonus' : 'deduction',
                amount: Number(body.amount) || 0,
                reason: String(body.reason ?? ''),
                createdAt: new Date().toISOString()
            };
            await mutate<Adjustment, void>(COLLECTIONS.adjustments, (rows) => {
                rows.push(adjustment);
            });
            return json({ adjustment }, { status: 201 });
        }

        // ------------------------------------------------------------ research
        case 'POST research': {
            const { user } = await requireAuth(request, CLINICAL);
            const body = await request.json();
            const diagnosis = String(body.diagnosis ?? '').trim();
            if (!diagnosis) return jsonError('A diagnosis is required', 400);

            const papers = await findPapers(diagnosis);
            const suggestion = await suggestExercises(diagnosis, papers, {
                age: body.age ?? null,
                contraindications: body.contraindications ?? '',
                medicalHistory: body.medicalHistory ?? ''
            });
            return json({ diagnosis, papers, ...suggestion, requestedBy: user.name });
        }

        // -------------------------------------------------- patient portal (public)
        case 'GET portal': {
            const lookup = (url.searchParams.get('code') ?? '').trim().toLowerCase();
            if (!lookup) return jsonError('Enter your patient code or registered phone number', 400);

            const patients = await readCollection<Patient>(COLLECTIONS.patients);
            const patient = patients.find(
                (p) => p.code.toLowerCase() === lookup || (p.phone && p.phone === lookup)
            );
            if (!patient) return jsonError('No patient found for that code or phone number', 404);

            const [heps, sessions] = await Promise.all([
                readCollection<Hep>(COLLECTIONS.heps),
                readCollection<Session>(COLLECTIONS.sessions)
            ]);
            const hep = heps.find((h) => h.patientId === patient.id);
            return json({
                patient: { name: patient.name, code: patient.code, diagnosis: patient.diagnosis },
                exercises: hep?.exercises ?? [],
                updatedAt: hep?.updatedAt ?? null,
                sessionsCompleted: sessions.filter((s) => s.patientId === patient.id).length
            });
        }

        default:
            return jsonError(`Unknown endpoint: ${method} /api/${path}`, 404);
    }
}

const dispatch: APIRoute = async ({ request, params }) => {
    const path = (params.route ?? '').replace(/^\/+|\/+$/g, '');
    try {
        return await handle(request, new URL(request.url), request.method, path);
    } catch (error) {
        if (error instanceof Response) return error;
        console.error(`[api] ${request.method} /${path}`, error);
        return jsonError('Something went wrong handling that request', 500);
    }
};

export const GET = dispatch;
export const POST = dispatch;
export const PATCH = dispatch;
export const PUT = dispatch;
export const DELETE = dispatch;
