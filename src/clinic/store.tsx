import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type {
    Appointment,
    Booking,
    ClinicSettings,
    Database,
    Exercise,
    ExerciseLog,
    Expense,
    ID,
    Patient,
    Payment,
    Prescription,
    PublicUser,
    Service,
    Session,
    Therapist
} from './types';
import { DB_KEY, emptyDatabase, loadDatabase, normalize, saveDatabase, seedDatabase, uid } from './storage';
import { api, ApiError, MODE } from './api';
import { can as canRole, type Action, type Resource } from './permissions';
import { clearOfflineData } from './pwa';

type Collection =
    | 'patients'
    | 'therapists'
    | 'appointments'
    | 'sessions'
    | 'payments'
    | 'expenses'
    | 'exercises'
    | 'prescriptions'
    | 'exerciseLogs'
    | 'services'
    | 'bookings';

type ItemOf = {
    patients: Patient;
    therapists: Therapist;
    appointments: Appointment;
    sessions: Session;
    payments: Payment;
    expenses: Expense;
    exercises: Exercise;
    prescriptions: Prescription;
    exerciseLogs: ExerciseLog;
    services: Service;
    bookings: Booking;
};

type Status = 'loading' | 'setup' | 'login' | 'ready' | 'error';

interface StoreValue {
    db: Database;
    user: PublicUser | null;
    status: Status;
    error: string;
    clearError: () => void;
    can: (resource: Resource, action: Action) => boolean;
    add: <K extends Collection>(collection: K, item: Omit<ItemOf[K], 'id' | 'createdAt'>) => void;
    addMany: <K extends Collection>(collection: K, items: Omit<ItemOf[K], 'id' | 'createdAt'>[]) => Promise<void>;
    update: <K extends Collection>(collection: K, id: ID, patch: Partial<ItemOf[K]>) => void;
    remove: (collection: Collection, id: ID) => void;
    updateSettings: (patch: Partial<ClinicSettings>) => void;
    signIn: (username: string, password: string) => Promise<void>;
    signOut: () => Promise<void>;
    setupAdmin: (payload: { username: string; password: string; name: string; clinicName?: string }) => Promise<void>;
    refresh: () => Promise<void>;
    // متاحة في النسخة المحلية فقط
    replaceAll: (next: Database) => void;
    resetToSeed: () => void;
    clearAll: () => void;
}

const StoreContext = createContext<StoreValue | null>(null);

const REFRESH_MS = 30_000;

export function StoreProvider({ children }: { children: React.ReactNode }) {
    const isLocal = MODE === 'local';
    const [db, setDb] = useState<Database>(() => (isLocal && typeof window !== 'undefined' ? loadDatabase() : emptyDatabase()));
    const [user, setUser] = useState<PublicUser | null>(null);
    const [status, setStatus] = useState<Status>(isLocal ? 'ready' : 'loading');
    const [error, setError] = useState('');
    const statusRef = useRef(status);
    statusRef.current = status;

    /* ------------------------- النسخة المحلية ------------------------- */

    useEffect(() => {
        if (isLocal) saveDatabase(db);
    }, [db, isLocal]);

    useEffect(() => {
        if (!isLocal) return;
        const onStorage = (event: StorageEvent) => {
            if (event.key === DB_KEY && event.newValue) {
                try {
                    setDb(normalize(JSON.parse(event.newValue)));
                } catch {
                    /* تجاهل البيانات غير الصالحة */
                }
            }
        };
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, [isLocal]);

    /* -------------------------- نسخة السيرفر -------------------------- */

    const handleFailure = useCallback((err: unknown) => {
        if (err instanceof ApiError && err.status === 401) {
            setUser(null);
            setStatus('login');
            clearOfflineData(); // انتهت الجلسة: لا يبقى ملف طبي على الجهاز
        }
        setError(err instanceof Error ? err.message : 'حدث خطأ غير متوقع');
    }, []);

    const refresh = useCallback(async () => {
        if (isLocal) return;
        try {
            const info = await api.session();
            if (info.setupRequired) {
                setStatus('setup');
                setUser(null);
                return;
            }
            if (!info.authenticated || !info.user || !info.db) {
                setStatus('login');
                setUser(null);
                return;
            }
            setUser(info.user);
            setDb(normalize(info.db));
            setStatus('ready');
        } catch (err) {
            // تعذر الوصول للسيرفر: نعرض السبب وزر إعادة المحاولة بدل شاشة تحميل لا تنتهي
            if (err instanceof ApiError && err.status === 401) {
                setStatus('login');
                setUser(null);
                clearOfflineData();
                return;
            }
            setStatus('error');
            setError(err instanceof Error ? err.message : 'تعذر الاتصال بالسيرفر');
        }
    }, [isLocal]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    // تحديث دوري وعند العودة للنافذة، حتى تظهر تعديلات الأجهزة الأخرى
    useEffect(() => {
        if (isLocal) return;
        const tick = () => {
            if (statusRef.current === 'ready' && document.visibilityState === 'visible') void refresh();
        };
        const timer = window.setInterval(tick, REFRESH_MS);
        window.addEventListener('focus', tick);
        return () => {
            window.clearInterval(timer);
            window.removeEventListener('focus', tick);
        };
    }, [isLocal, refresh]);

    const send = useCallback(
        async (mutation: { resource: string; op: 'create' | 'createMany' | 'update' | 'delete'; id?: ID; data?: unknown; items?: unknown[] }) => {
            try {
                const { db: next } = await api.mutate(mutation);
                setDb(normalize(next));
            } catch (err) {
                handleFailure(err);
            }
        },
        [handleFailure]
    );

    /* --------------------------- التعديلات --------------------------- */

    const add = useCallback(
        <K extends Collection>(collection: K, item: Omit<ItemOf[K], 'id' | 'createdAt'>) => {
            if (!isLocal) {
                void send({ resource: collection, op: 'create', data: item });
                return;
            }
            const created = { ...(item as object), id: uid(collection[0] + '_'), createdAt: new Date().toISOString() } as ItemOf[K];
            setDb((prev) => ({ ...prev, [collection]: [...(prev[collection] as ItemOf[K][]), created] }) as Database);
        },
        [isLocal, send]
    );

    /** إضافة عدة سجلات دفعة واحدة (استيراد قائمة مرضى مثلًا) */
    const addMany = useCallback(
        async <K extends Collection>(collection: K, items: Omit<ItemOf[K], 'id' | 'createdAt'>[]) => {
            if (items.length === 0) return;
            if (!isLocal) {
                await send({ resource: collection, op: 'createMany', items });
                return;
            }
            const created = items.map((item) => ({ ...(item as object), id: uid(collection[0] + '_'), createdAt: new Date().toISOString() }) as ItemOf[K]);
            setDb((prev) => ({ ...prev, [collection]: [...(prev[collection] as ItemOf[K][]), ...created] }) as Database);
        },
        [isLocal, send]
    );

    const update = useCallback(
        <K extends Collection>(collection: K, id: ID, patch: Partial<ItemOf[K]>) => {
            if (!isLocal) {
                void send({ resource: collection, op: 'update', id, data: patch });
                return;
            }
            setDb(
                (prev) =>
                    ({
                        ...prev,
                        [collection]: (prev[collection] as ItemOf[K][]).map((row) => (row.id === id ? { ...row, ...patch } : row))
                    }) as Database
            );
        },
        [isLocal, send]
    );

    const remove = useCallback(
        (collection: Collection, id: ID) => {
            if (!isLocal) {
                void send({ resource: collection, op: 'delete', id });
                return;
            }
            setDb((prev) => {
                const next = { ...prev, [collection]: (prev[collection] as { id: ID }[]).filter((row) => row.id !== id) } as Database;
                // حذف مريض يحذف معه كل ما يرتبط به من سجلات
                if (collection === 'patients') {
                    next.appointments = next.appointments.filter((a) => a.patientId !== id);
                    next.sessions = next.sessions.filter((s) => s.patientId !== id);
                    next.payments = next.payments.filter((p) => p.patientId !== id);
                    next.prescriptions = next.prescriptions.filter((r) => r.patientId !== id);
                    next.exerciseLogs = next.exerciseLogs.filter((l) => l.patientId !== id);
                    next.bookings = next.bookings.filter((b) => b.patientId !== id);
                }
                if (collection === 'exercises') {
                    const dropped = next.prescriptions.filter((r) => r.exerciseId === id).map((r) => r.id);
                    next.prescriptions = next.prescriptions.filter((r) => r.exerciseId !== id);
                    next.exerciseLogs = next.exerciseLogs.filter((l) => !dropped.includes(l.prescriptionId));
                }
                if (collection === 'prescriptions') {
                    next.exerciseLogs = next.exerciseLogs.filter((l) => l.prescriptionId !== id);
                }
                return next;
            });
        },
        [isLocal, send]
    );

    const updateSettings = useCallback(
        (patch: Partial<ClinicSettings>) => {
            if (!isLocal) {
                void send({ resource: 'settings', op: 'update', data: patch });
                return;
            }
            setDb((prev) => ({ ...prev, settings: { ...prev.settings, ...patch } }));
        },
        [isLocal, send]
    );

    /* ------------------------- الدخول والخروج ------------------------- */

    const signIn = useCallback(async (username: string, password: string) => {
        const info = await api.login(username, password);
        setUser(info.user);
        setDb(normalize(info.db));
        setStatus('ready');
        setError('');
    }, []);

    const signOut = useCallback(async () => {
        try {
            await api.logout();
        } finally {
            clearOfflineData(); // الخروج يمحو البيانات المحفوظة للعمل بلا إنترنت
            setUser(null);
            setDb(emptyDatabase());
            setStatus('login');
        }
    }, []);

    const setupAdmin = useCallback(async (payload: { username: string; password: string; name: string; clinicName?: string }) => {
        const info = await api.setup(payload);
        setUser(info.user);
        setDb(normalize(info.db));
        setStatus('ready');
    }, []);

    const can = useCallback(
        (resource: Resource, action: Action) => {
            if (isLocal) return true; // النسخة المحلية بلا مستخدمين: صاحب الجهاز يملك كل شيء
            return user ? canRole(user.role, resource, action) : false;
        },
        [isLocal, user]
    );

    const replaceAll = useCallback((next: Database) => setDb(normalize(next)), []);
    const resetToSeed = useCallback(() => setDb(seedDatabase()), []);
    const clearAll = useCallback(() => setDb((prev) => ({ ...emptyDatabase(), settings: prev.settings })), []);
    const clearError = useCallback(() => setError(''), []);

    const value = useMemo<StoreValue>(
        () => ({
            db,
            user,
            status,
            error,
            clearError,
            can,
            add,
            addMany,
            update,
            remove,
            updateSettings,
            signIn,
            signOut,
            setupAdmin,
            refresh,
            replaceAll,
            resetToSeed,
            clearAll
        }),
        [
            db,
            user,
            status,
            error,
            clearError,
            can,
            add,
            addMany,
            update,
            remove,
            updateSettings,
            signIn,
            signOut,
            setupAdmin,
            refresh,
            replaceAll,
            resetToSeed,
            clearAll
        ]
    );

    return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
    const ctx = useContext(StoreContext);
    if (!ctx) throw new Error('useStore يجب أن يُستخدم داخل StoreProvider');
    return ctx;
}
