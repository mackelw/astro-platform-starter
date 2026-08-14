import { useState, type FormEvent } from 'react';
import { ROLE_HOME, type PublicUser } from '../../lib/models';
import { api, Field, Logo, Notice, useLang } from './ui';

export default function Auth({ mode }: { mode: 'login' | 'register' }) {
    const { lang, setLang, t } = useLang();
    const isAr = lang === 'ar';
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError('');
        setBusy(true);
        const form = new FormData(event.currentTarget);
        const payload = Object.fromEntries(form.entries());

        try {
            const path = mode === 'login' ? 'auth/login' : 'auth/register-clinic';
            const { user } = await api<{ user: PublicUser }>(path, { method: 'POST', body: payload });
            window.location.href = ROLE_HOME[user.role];
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Request failed');
            setBusy(false);
        }
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-brand-700 to-brand-900 px-4 py-10">
            <div className="w-full max-w-md">
                <div className="k-card overflow-hidden">
                    <div className="flex items-center gap-3 border-b border-[var(--color-line)] px-6 py-4">
                        <Logo />
                        <div>
                            <p className="font-extrabold text-brand-500">{t('brand')}</p>
                            <p className="k-hint">{t('tagline')}</p>
                        </div>
                        <button type="button" className="k-btn-ghost ms-auto" onClick={() => setLang(isAr ? 'en' : 'ar')}>
                            🌐 {t('langToggle')}
                        </button>
                    </div>

                    <form className="space-y-4 p-6" onSubmit={submit}>
                        <h2 className="text-brand-500">{mode === 'login' ? t('login') : t('registerClinic')}</h2>

                        {mode === 'register' && (
                            <>
                                <Field label={t('clinicName')}>
                                    <input name="clinicName" className="k-input" required autoComplete="organization" />
                                </Field>
                                <Field label={t('ownerName')}>
                                    <input name="ownerName" className="k-input" required autoComplete="name" />
                                </Field>
                            </>
                        )}

                        <Field label={t('email')}>
                            <input
                                name="email"
                                type="email"
                                className="k-input"
                                required
                                autoComplete="email"
                                placeholder="doctor@clinic.com"
                                dir="ltr"
                            />
                        </Field>

                        <Field
                            label={t('password')}
                            hint={mode === 'register' ? (isAr ? '8 أحرف على الأقل' : 'At least 8 characters') : undefined}
                        >
                            <input
                                name="password"
                                type="password"
                                className="k-input"
                                required
                                minLength={mode === 'register' ? 8 : undefined}
                                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                                dir="ltr"
                            />
                        </Field>

                        {error && <Notice kind="error">{error}</Notice>}

                        <button type="submit" className="k-btn-primary w-full" disabled={busy}>
                            {busy ? t('loading') : mode === 'login' ? t('enterSystem') : t('registerClinic')}
                        </button>

                        <div className="border-t border-[var(--color-line)] pt-4 text-center text-sm">
                            {mode === 'login' ? (
                                <a href="/register" className="text-brand-500">
                                    {t('registerClinic')}
                                </a>
                            ) : (
                                <a href="/login" className="text-brand-500">
                                    {t('login')}
                                </a>
                            )}
                            <span className="mx-2 text-[var(--color-muted)]">·</span>
                            <a href="/portal" className="text-brand-500">
                                {t('patientPortal')}
                            </a>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
