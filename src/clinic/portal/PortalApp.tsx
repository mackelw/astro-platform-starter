import React, { useEffect, useState } from 'react';
import { useStore } from '../store';
import { PortalProvider, usePortal } from './context';
import { useInstallPrompt, useOnline } from '../pwa';
import PortalHome from './views/Home';
import PortalExercises from './views/Exercises';
import PortalAppointments from './views/Appointments';
import PortalRecord from './views/Record';
import PortalServices from './views/Services';
import PortalFamily from './views/Family';
import PortalContact from './views/Contact';

export type PortalView = 'home' | 'exercises' | 'appointments' | 'record' | 'services' | 'family' | 'contact';

const NAV: { key: PortalView; icon: string }[] = [
    { key: 'home', icon: '🏠' },
    { key: 'exercises', icon: '🤸' },
    { key: 'appointments', icon: '🗓' },
    { key: 'record', icon: '📋' },
    { key: 'services', icon: '💠' },
    { key: 'family', icon: '👨‍👩‍👧' },
    { key: 'contact', icon: '💬' }
];

/** الأيقونات الظاهرة في الشريط السفلي على الموبايل — الباقي داخل صفحة التواصل والقائمة */
const QUICK: PortalView[] = ['home', 'exercises', 'appointments', 'record', 'contact'];

function ProfileSwitcher() {
    const { profiles, activeId, setActiveId, t } = usePortal();
    if (profiles.length < 2) return null;
    return (
        <label className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-white/70">{t('common.for')}</span>
            <select
                value={activeId}
                onChange={(e) => setActiveId(e.target.value)}
                className="cursor-pointer rounded-lg border border-white/30 bg-white/10 px-2 py-1 text-xs font-semibold text-white outline-none"
            >
                {profiles.map((profile) => (
                    <option key={profile.id} value={profile.id} className="text-slate-800">
                        {profile.name}
                    </option>
                ))}
            </select>
        </label>
    );
}

/** دعوة تثبيت التطبيق على شاشة الموبايل — تظهر حين يتيحها المتصفح فقط */
function InstallBanner() {
    const { t } = usePortal();
    const { canInstall, install, dismiss } = useInstallPrompt();
    if (!canInstall) return null;

    return (
        <div className="mx-auto mt-4 flex max-w-5xl flex-wrap items-center justify-between gap-3 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3">
            <div className="min-w-0">
                <p className="text-sm font-bold text-teal-900">{t('pwa.install')}</p>
                <p className="text-[11px] text-teal-700">{t('pwa.installHint')}</p>
            </div>
            <div className="flex gap-2">
                <button
                    type="button"
                    onClick={() => void install()}
                    className="cursor-pointer rounded-lg bg-teal-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-teal-700"
                >
                    {t('pwa.installNow')}
                </button>
                <button type="button" onClick={dismiss} className="cursor-pointer rounded-lg px-3 py-2 text-xs font-semibold text-teal-700 hover:bg-teal-100">
                    {t('pwa.later')}
                </button>
            </div>
        </div>
    );
}

/** تنبيه انقطاع الشبكة — يوضح للمريض أن ما يراه آخر نسخة محفوظة على جهازه */
function OfflineBanner() {
    const { t } = usePortal();
    const online = useOnline();
    if (online) return null;

    return (
        <div className="flex items-center justify-center gap-2 bg-amber-100 px-4 py-2 text-xs font-semibold text-amber-900">
            <span aria-hidden="true">⚡</span>
            {t('pwa.offline')}
        </div>
    );
}

function Shell() {
    const { db, user, error, clearError, signOut } = useStore();
    const { t, lang, setLang, dir } = usePortal();
    const [view, setView] = useState<PortalView>('home');

    // اتجاه الصفحة يتبع اللغة المختارة حتى تنقلب الواجهة بالكامل
    useEffect(() => {
        document.documentElement.setAttribute('dir', dir);
        document.documentElement.setAttribute('lang', lang);
    }, [dir, lang]);

    // حفظ الشاشة الحالية في العنوان حتى يعمل زر الرجوع في الهاتف
    useEffect(() => {
        const apply = () => {
            const hash = window.location.hash.replace('#', '') as PortalView;
            if (NAV.some((item) => item.key === hash)) setView(hash);
        };
        apply();
        window.addEventListener('hashchange', apply);
        return () => window.removeEventListener('hashchange', apply);
    }, []);

    const go = (next: PortalView) => {
        setView(next);
        window.location.hash = next;
        window.scrollTo({ top: 0 });
    };

    const clinicName = lang === 'ar' ? db.settings.name : db.settings.nameEn || db.settings.name;

    let content: React.ReactNode = null;
    if (view === 'exercises') content = <PortalExercises />;
    else if (view === 'appointments') content = <PortalAppointments />;
    else if (view === 'record') content = <PortalRecord />;
    else if (view === 'services') content = <PortalServices onBook={() => go('appointments')} />;
    else if (view === 'family') content = <PortalFamily />;
    else if (view === 'contact') content = <PortalContact />;
    else content = <PortalHome onGo={go} />;

    return (
        <div className="min-h-screen bg-slate-100 pb-20 text-slate-800 lg:pb-0">
            <header className="sticky top-0 z-40 bg-gradient-to-l from-teal-700 to-teal-600 text-white shadow-md">
                <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/15 text-lg">✚</div>
                        <div className="min-w-0">
                            <p className="truncate text-sm font-extrabold">{clinicName}</p>
                            <p className="truncate text-[11px] text-white/70">{user?.name}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <ProfileSwitcher />
                        <button
                            type="button"
                            onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
                            className="cursor-pointer rounded-lg border border-white/30 px-2.5 py-1 text-xs font-bold transition hover:bg-white/10"
                        >
                            {lang === 'ar' ? 'EN' : 'ع'}
                        </button>
                        <button
                            type="button"
                            onClick={() => void signOut()}
                            className="cursor-pointer rounded-lg border border-white/30 px-2.5 py-1 text-xs font-semibold transition hover:bg-white/10"
                        >
                            {t('nav.signout')}
                        </button>
                    </div>
                </div>
                <OfflineBanner />
                {error ? (
                    <div className="flex items-center justify-between gap-3 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700">
                        <span>{error}</span>
                        <button type="button" onClick={clearError} className="cursor-pointer rounded px-2 hover:bg-rose-100" aria-label={t('common.close')}>
                            ✕
                        </button>
                    </div>
                ) : null}
            </header>

            <InstallBanner />

            <div className="mx-auto flex max-w-5xl gap-5 px-4 py-5">
                <aside className="hidden w-52 shrink-0 lg:block">
                    <nav className="sticky top-24 space-y-1">
                        {NAV.map((item) => (
                            <button
                                key={item.key}
                                type="button"
                                onClick={() => go(item.key)}
                                className={`flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                                    view === item.key ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-600 hover:bg-white'
                                }`}
                            >
                                <span aria-hidden="true">{item.icon}</span>
                                {t(`nav.${item.key}`)}
                            </button>
                        ))}
                    </nav>
                </aside>
                <main className="min-w-0 grow">{content}</main>
            </div>

            {/* شريط سفلي للهاتف — أهم خمس شاشات في متناول الإبهام */}
            <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white lg:hidden">
                <div className="mx-auto flex max-w-lg">
                    {QUICK.map((key) => {
                        const item = NAV.find((n) => n.key === key)!;
                        return (
                            <button
                                key={key}
                                type="button"
                                onClick={() => go(key)}
                                className={`flex flex-1 cursor-pointer flex-col items-center gap-0.5 px-1 py-2 text-[10px] font-semibold transition ${
                                    view === key ? 'text-teal-700' : 'text-slate-400'
                                }`}
                            >
                                <span className="text-lg" aria-hidden="true">
                                    {item.icon}
                                </span>
                                <span className="truncate">{t(`nav.${key}`)}</span>
                            </button>
                        );
                    })}
                </div>
            </nav>
        </div>
    );
}

export default function PortalApp() {
    return (
        <PortalProvider>
            <Shell />
        </PortalProvider>
    );
}
