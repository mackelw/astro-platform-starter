import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Appointment, ClinicSettings, Database, Expense, ID, Patient, Payment, Session, Therapist } from './types';
import { DB_KEY, emptyDatabase, loadDatabase, normalize, saveDatabase, seedDatabase, uid } from './storage';

type Collection = 'patients' | 'therapists' | 'appointments' | 'sessions' | 'payments' | 'expenses';

type ItemOf = {
    patients: Patient;
    therapists: Therapist;
    appointments: Appointment;
    sessions: Session;
    payments: Payment;
    expenses: Expense;
};

interface StoreValue {
    db: Database;
    add: <K extends Collection>(collection: K, item: Omit<ItemOf[K], 'id' | 'createdAt'>) => ItemOf[K];
    update: <K extends Collection>(collection: K, id: ID, patch: Partial<ItemOf[K]>) => void;
    remove: (collection: Collection, id: ID) => void;
    updateSettings: (patch: Partial<ClinicSettings>) => void;
    replaceAll: (next: Database) => void;
    resetToSeed: () => void;
    clearAll: () => void;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
    const [db, setDb] = useState<Database>(() => (typeof window === 'undefined' ? emptyDatabase() : loadDatabase()));

    useEffect(() => {
        saveDatabase(db);
    }, [db]);

    // مزامنة بين تبويبات المتصفح المفتوحة على نفس الجهاز
    useEffect(() => {
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
    }, []);

    const add = useCallback(<K extends Collection>(collection: K, item: Omit<ItemOf[K], 'id' | 'createdAt'>) => {
        const created = { ...(item as object), id: uid(collection[0] + '_'), createdAt: new Date().toISOString() } as ItemOf[K];
        setDb((prev) => ({ ...prev, [collection]: [...(prev[collection] as ItemOf[K][]), created] }) as Database);
        return created;
    }, []);

    const update = useCallback(<K extends Collection>(collection: K, id: ID, patch: Partial<ItemOf[K]>) => {
        setDb(
            (prev) =>
                ({
                    ...prev,
                    [collection]: (prev[collection] as ItemOf[K][]).map((row) => (row.id === id ? { ...row, ...patch } : row))
                }) as Database
        );
    }, []);

    const remove = useCallback((collection: Collection, id: ID) => {
        setDb((prev) => {
            const next = { ...prev, [collection]: (prev[collection] as { id: ID }[]).filter((row) => row.id !== id) } as Database;
            // حذف مريض يحذف معه كل ما يرتبط به من سجلات
            if (collection === 'patients') {
                next.appointments = next.appointments.filter((a) => a.patientId !== id);
                next.sessions = next.sessions.filter((s) => s.patientId !== id);
                next.payments = next.payments.filter((p) => p.patientId !== id);
            }
            return next;
        });
    }, []);

    const updateSettings = useCallback((patch: Partial<ClinicSettings>) => {
        setDb((prev) => ({ ...prev, settings: { ...prev.settings, ...patch } }));
    }, []);

    const replaceAll = useCallback((next: Database) => setDb(normalize(next)), []);
    const resetToSeed = useCallback(() => setDb(seedDatabase()), []);
    const clearAll = useCallback(() => setDb((prev) => ({ ...emptyDatabase(), settings: prev.settings })), []);

    const value = useMemo<StoreValue>(
        () => ({ db, add, update, remove, updateSettings, replaceAll, resetToSeed, clearAll }),
        [db, add, update, remove, updateSettings, replaceAll, resetToSeed, clearAll]
    );

    return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
    const ctx = useContext(StoreContext);
    if (!ctx) throw new Error('useStore يجب أن يُستخدم داخل StoreProvider');
    return ctx;
}
