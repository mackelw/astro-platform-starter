import React, { useEffect, useState } from 'react';
import { StoreProvider, useStore } from './store';
import Dashboard from './views/Dashboard';
import Patients from './views/Patients';
import PatientProfile from './views/PatientProfile';
import Appointments from './views/Appointments';
import SessionsView from './views/Sessions';
import Billing from './views/Billing';
import Reports from './views/Reports';
import Settings from './views/Settings';
import { formatDateLong, todayISO } from './utils';

type View = 'dashboard' | 'appointments' | 'patients' | 'sessions' | 'billing' | 'reports' | 'settings';

const NAV: { key: View; label: string; icon: string }[] = [
    { key: 'dashboard', label: 'لوحة التحكم', icon: '▦' },
    { key: 'appointments', label: 'المواعيد', icon: '🗓' },
    { key: 'patients', label: 'المرضى', icon: '👤' },
    { key: 'sessions', label: 'الجلسات', icon: '🩺' },
    { key: 'billing', label: 'الحسابات', icon: '💳' },
    { key: 'reports', label: 'التقارير', icon: '📊' },
    { key: 'settings', label: 'الإعدادات', icon: '⚙' }
];

function isView(value: string): value is View {
    return NAV.some((item) => item.key === value);
}

function Shell() {
    const { db } = useStore();
    const [view, setView] = useState<View>('dashboard');
    const [patientId, setPatientId] = useState<string | null>(null);
    const [menuOpen, setMenuOpen] = useState(false);

    // حفظ الصفحة الحالية في عنوان المتصفح حتى يعمل زر الرجوع والتحديث
    useEffect(() => {
        const apply = () => {
            const hash = window.location.hash.replace('#', '');
            const [name, id] = hash.split('/');
            if (name === 'patient' && id) {
                setPatientId(id);
                setView('patients');
            } else if (isView(name)) {
                setPatientId(null);
                setView(name);
            }
        };
        apply();
        window.addEventListener('hashchange', apply);
        return () => window.removeEventListener('hashchange', apply);
    }, []);

    const go = (next: View) => {
        setPatientId(null);
        setView(next);
        setMenuOpen(false);
        window.location.hash = next;
    };

    const openPatient = (id: string) => {
        setPatientId(id);
        setView('patients');
        setMenuOpen(false);
        window.location.hash = `patient/${id}`;
    };

    const backToPatients = () => {
        setPatientId(null);
        window.location.hash = 'patients';
    };

    let content: React.ReactNode = null;
    if (patientId) content = <PatientProfile patientId={patientId} onBack={backToPatients} />;
    else if (view === 'dashboard') content = <Dashboard onOpenPatient={openPatient} onGo={(v) => go(v as View)} />;
    else if (view === 'appointments') content = <Appointments onOpenPatient={openPatient} />;
    else if (view === 'patients') content = <Patients onOpenPatient={openPatient} />;
    else if (view === 'sessions') content = <SessionsView onOpenPatient={openPatient} />;
    else if (view === 'billing') content = <Billing onOpenPatient={openPatient} />;
    else if (view === 'reports') content = <Reports />;
    else content = <Settings />;

    return (
        <div className="min-h-screen bg-slate-100 text-slate-800">
            <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
                <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            className="cursor-pointer rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
                            onClick={() => setMenuOpen((v) => !v)}
                            aria-label="القائمة"
                        >
                            ☰
                        </button>
                        <div className="flex size-9 items-center justify-center rounded-lg bg-teal-600 text-lg text-white">✚</div>
                        <div>
                            <p className="text-sm font-extrabold text-slate-800">{db.settings.name}</p>
                            <p className="text-[11px] text-slate-500">نظام إدارة عيادة العلاج الطبيعي</p>
                        </div>
                    </div>
                    <div className="hidden items-center gap-3 sm:flex">
                        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">يعمل محليًا بدون إنترنت</span>
                        <span className="text-xs text-slate-500">{formatDateLong(todayISO())}</span>
                    </div>
                </div>
            </header>

            <div className="mx-auto flex max-w-7xl gap-5 px-4 py-5">
                <aside
                    className={`${menuOpen ? 'block' : 'hidden'} fixed inset-x-0 bottom-0 top-16 z-30 overflow-y-auto bg-white p-4 lg:static lg:block lg:w-56 lg:shrink-0 lg:bg-transparent lg:p-0`}
                >
                    <nav className="space-y-1">
                        {NAV.map((item) => {
                            const active = !patientId && view === item.key;
                            return (
                                <button
                                    key={item.key}
                                    type="button"
                                    onClick={() => go(item.key)}
                                    className={`flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
                                        active ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-600 hover:bg-white hover:text-teal-700'
                                    }`}
                                >
                                    <span aria-hidden="true">{item.icon}</span>
                                    {item.label}
                                </button>
                            );
                        })}
                    </nav>
                    <p className="mt-6 rounded-lg bg-white px-3 py-3 text-[11px] leading-relaxed text-slate-500 lg:bg-white/70">
                        البيانات محفوظة في متصفح هذا الجهاز فقط. استخدم صفحة الإعدادات لأخذ نسخة احتياطية.
                    </p>
                </aside>

                <main className="min-w-0 grow">{content}</main>
            </div>
        </div>
    );
}

export default function ClinicApp() {
    return (
        <StoreProvider>
            <Shell />
        </StoreProvider>
    );
}
