import { useEffect, useState, type FormEvent } from 'react';
import type { HepExercise } from '../../lib/models';
import { api, embedUrl, Empty, Logo, Notice, useLang } from './ui';

interface PortalData {
    patient: { name: string; code: string; diagnosis: string };
    exercises: HepExercise[];
    updatedAt: string | null;
    sessionsCompleted: number;
}

export default function Portal() {
    const { lang, setLang, t } = useLang();
    const isAr = lang === 'ar';
    const [code, setCode] = useState('');
    const [data, setData] = useState<PortalData | null>(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        const fromUrl = new URLSearchParams(window.location.search).get('code');
        if (fromUrl) {
            setCode(fromUrl);
            lookup(fromUrl);
        }
    }, []);

    async function lookup(value: string) {
        setBusy(true);
        setError('');
        try {
            setData(await api<PortalData>(`portal?code=${encodeURIComponent(value)}`));
        } catch (err) {
            setData(null);
            setError(err instanceof Error ? err.message : 'Lookup failed');
        } finally {
            setBusy(false);
        }
    }

    function submit(event: FormEvent) {
        event.preventDefault();
        if (code.trim()) lookup(code.trim());
    }

    return (
        <div className="min-h-screen bg-slate-50">
            <header className="border-b border-[var(--color-line)] bg-white">
                <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-3 px-4 py-4">
                    <Logo />
                    <div>
                        <p className="font-extrabold text-brand-500">{t('portalTitle')}</p>
                        <p className="k-hint">
                            {isAr ? 'تمارينك المنزلية والفيديوهات من طبيبك' : 'Your assigned home exercises and video demonstrations'}
                        </p>
                    </div>
                    <div className="ms-auto flex gap-2">
                        <button type="button" className="k-btn-ghost" onClick={() => setLang(isAr ? 'en' : 'ar')}>
                            🌐 {t('langToggle')}
                        </button>
                        <a href="/" className="k-btn-ghost no-underline">
                            → {isAr ? 'الرئيسية' : 'Home'}
                        </a>
                    </div>
                </div>
            </header>

            <main className="mx-auto max-w-3xl space-y-6 px-4 py-6">
                <form className="k-card p-5" onSubmit={submit}>
                    <label className="k-label" htmlFor="portal-code">
                        🔍 {t('portalHint')}
                    </label>
                    <input
                        id="portal-code"
                        className="k-input"
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        placeholder="PAT-8597"
                        dir="ltr"
                    />
                    <button type="submit" className="k-btn-primary mt-4 w-full" disabled={busy}>
                        {busy ? t('loading') : t('viewExercises')}
                    </button>
                </form>

                {error && <Notice kind="error">{error}</Notice>}

                {data && (
                    <>
                        <section className="k-card p-5">
                            <h2 className="text-brand-500">{data.patient.name}</h2>
                            <p className="k-hint mt-1" dir="ltr">
                                {data.patient.code}
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2">
                                {data.patient.diagnosis && (
                                    <span className="k-chip bg-brand-500 text-white">{data.patient.diagnosis}</span>
                                )}
                                <span className="k-chip bg-emerald-100 text-emerald-900">
                                    {data.sessionsCompleted} {isAr ? 'جلسة مكتملة' : 'sessions completed'}
                                </span>
                            </div>
                        </section>

                        <section>
                            <h2 className="text-brand-500">{t('yourProgram')}</h2>
                            {data.exercises.length === 0 ? (
                                <Empty text={isAr ? 'لم يتم تعيين تمارين بعد.' : 'No exercises assigned yet.'} />
                            ) : (
                                <ul className="mt-4 space-y-4">
                                    {data.exercises.map((exercise) => {
                                        const embed = embedUrl(exercise.mediaUrl);
                                        return (
                                            <li key={exercise.id} className="k-card p-5">
                                                <h3 className="text-brand-500">{exercise.name}</h3>
                                                <div className="mt-2 flex flex-wrap gap-2">
                                                    {exercise.setsReps && (
                                                        <span className="k-chip bg-brand-500 text-white" dir="auto">
                                                            {exercise.setsReps}
                                                        </span>
                                                    )}
                                                    {exercise.frequency && (
                                                        <span className="k-chip border border-[var(--color-line)]" dir="auto">
                                                            {exercise.frequency}
                                                        </span>
                                                    )}
                                                </div>
                                                {embed ? (
                                                    <iframe
                                                        className="mt-4 aspect-video w-full rounded-lg"
                                                        src={embed}
                                                        title={exercise.name}
                                                        allowFullScreen
                                                        loading="lazy"
                                                    />
                                                ) : exercise.mediaUrl ? (
                                                    <img src={exercise.mediaUrl} alt={exercise.name} className="mt-4 w-full rounded-lg" loading="lazy" />
                                                ) : null}
                                                {exercise.advice && (
                                                    <p className="mt-4 rounded-lg bg-[var(--color-canvas)] p-3 text-sm">{exercise.advice}</p>
                                                )}
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </section>
                    </>
                )}
            </main>
        </div>
    );
}
