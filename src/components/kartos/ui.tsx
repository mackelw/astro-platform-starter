import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { translate, type Lang, type StringKey } from '../../lib/i18n';
import type { PublicUser } from '../../lib/models';

export async function api<T = any>(path: string, options: RequestInit & { body?: any } = {}): Promise<T> {
    const init: RequestInit = { ...options };
    if (options.body !== undefined && typeof options.body !== 'string') {
        init.body = JSON.stringify(options.body);
        init.headers = { 'content-type': 'application/json', ...(options.headers ?? {}) };
    }
    const res = await fetch(`/api/${path}`, init);
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data as T;
}

const LANG_KEY = 'kartos.lang';

export function useLang() {
    const [lang, setLangState] = useState<Lang>('en');

    useEffect(() => {
        const stored = window.localStorage.getItem(LANG_KEY);
        if (stored === 'ar' || stored === 'en') applyLang(stored, setLangState);
        else applyLang('en', setLangState);
    }, []);

    const setLang = useCallback((next: Lang) => {
        window.localStorage.setItem(LANG_KEY, next);
        applyLang(next, setLangState);
    }, []);

    const t = useCallback((key: StringKey) => translate(lang, key), [lang]);
    return { lang, setLang, t, dir: lang === 'ar' ? 'rtl' : ('ltr' as const) };
}

function applyLang(lang: Lang, set: (l: Lang) => void) {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    set(lang);
}

export function Logo({ size = 40 }: { size?: number }) {
    return (
        <span
            className="inline-flex shrink-0 items-center justify-center rounded-xl bg-brand-700 font-black text-gold-400 ring-2 ring-gold-400"
            style={{ width: size, height: size, fontSize: size * 0.5 }}
            aria-hidden="true"
        >
            K
        </span>
    );
}

interface ShellProps {
    subtitle: string;
    children: ReactNode;
    lang: Lang;
    onToggleLang: () => void;
    right?: ReactNode;
    user?: PublicUser | null;
}

export function Shell({ subtitle, children, lang, onToggleLang, right, user }: ShellProps) {
    async function logout() {
        await api('auth/logout', { method: 'POST' });
        window.location.href = '/login';
    }

    return (
        <div className="min-h-screen bg-[var(--color-canvas)]">
            <header className="sticky top-0 z-20 border-b border-[var(--color-line)] bg-white/95 backdrop-blur">
                <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
                    <a href="/" className="flex items-center gap-3 no-underline">
                        <Logo />
                        <span>
                            <span className="block text-lg font-extrabold text-brand-500">{translate(lang, 'brand')}</span>
                            <span className="block text-xs text-[var(--color-muted)]">{subtitle}</span>
                        </span>
                    </a>
                    <div className="ms-auto flex flex-wrap items-center gap-2">
                        {right}
                        {user && <span className="hidden text-sm text-[var(--color-muted)] sm:inline">{user.name}</span>}
                        <button type="button" className="k-btn-ghost" onClick={onToggleLang}>
                            🌐 {translate(lang, 'langToggle')}
                        </button>
                        {user && (
                            <button type="button" className="k-btn-danger" onClick={logout}>
                                {translate(lang, 'logout')}
                            </button>
                        )}
                    </div>
                </div>
            </header>
            <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>
        </div>
    );
}

export function Card({ title, subtitle, children, action }: { title?: string; subtitle?: string; children: ReactNode; action?: ReactNode }) {
    return (
        <section className="k-card">
            {(title || action) && (
                <header className="k-card-head flex flex-wrap items-center gap-3">
                    <div>
                        {title && <h3 className="text-brand-500">{title}</h3>}
                        {subtitle && <p className="k-hint mt-0.5">{subtitle}</p>}
                    </div>
                    {action && <div className="ms-auto flex flex-wrap gap-2">{action}</div>}
                </header>
            )}
            <div className="p-5">{children}</div>
        </section>
    );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
    return (
        <label className="block">
            <span className="k-label">{label}</span>
            {children}
            {hint && <span className="k-hint mt-1 block">{hint}</span>}
        </label>
    );
}

export function Stat({ label, value, tone = 'brand' }: { label: string; value: ReactNode; tone?: 'brand' | 'green' | 'amber' | 'blue' }) {
    const tones = {
        brand: 'border-s-brand-500',
        green: 'border-s-emerald-600',
        amber: 'border-s-amber-500',
        blue: 'border-s-sky-600'
    };
    return (
        <div className={`k-card border-s-4 p-4 ${tones[tone]}`}>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">{label}</p>
            <p className="mt-1 text-2xl font-bold">{value}</p>
        </div>
    );
}

export function Tabs<T extends string>({ tabs, active, onChange }: { tabs: { id: T; label: string; badge?: ReactNode }[]; active: T; onChange: (id: T) => void }) {
    return (
        <div className="k-scroll border-b border-[var(--color-line)]">
            <div className="flex min-w-max">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        type="button"
                        onClick={() => onChange(tab.id)}
                        className={`k-tab ${active === tab.id ? 'k-tab-active' : ''}`}
                    >
                        {tab.label}
                        {tab.badge !== undefined && (
                            <span className="ms-2 rounded-full bg-[var(--color-canvas)] px-2 py-0.5 text-xs">{tab.badge}</span>
                        )}
                    </button>
                ))}
            </div>
        </div>
    );
}

export function Notice({ kind, children }: { kind: 'error' | 'info' | 'success'; children: ReactNode }) {
    const styles = {
        error: 'border-rose-200 bg-rose-50 text-rose-800',
        info: 'border-sky-200 bg-sky-50 text-sky-900',
        success: 'border-emerald-200 bg-emerald-50 text-emerald-900'
    };
    return <div className={`rounded-lg border px-4 py-3 text-sm ${styles[kind]}`}>{children}</div>;
}

export function Empty({ text }: { text: string }) {
    return <p className="py-8 text-center text-sm text-[var(--color-muted)]">{text}</p>;
}

/** Turns a YouTube watch/share URL into an embeddable one; other URLs pass through. */
export function embedUrl(raw: string): string | null {
    if (!raw) return null;
    try {
        const url = new URL(raw);
        if (url.hostname.includes('youtube.com') && url.searchParams.get('v')) {
            return `https://www.youtube.com/embed/${url.searchParams.get('v')}`;
        }
        if (url.hostname === 'youtu.be') return `https://www.youtube.com/embed${url.pathname}`;
        return null;
    } catch {
        return null;
    }
}

export function money(value: number, currency = 'ج.م'): string {
    return `${Number(value ?? 0).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${currency}`;
}
