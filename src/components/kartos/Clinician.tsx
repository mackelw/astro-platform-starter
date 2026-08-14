import { useCallback, useEffect, useState } from 'react';
import type { Clinic, Hep, HepExercise, Patient, Program, ProgramItem, PublicUser, QueueEntry, Session } from '../../lib/models';
import type { Paper, SuggestedExercise } from '../../lib/research';
import { api, Card, embedUrl, Empty, Field, Notice, Shell, Tabs, useLang } from './ui';

type TabId = 'session' | 'program' | 'hep' | 'research' | 'history';

export default function Clinician() {
    const { lang, setLang, t } = useLang();
    const isAr = lang === 'ar';
    const [me, setMe] = useState<{ user: PublicUser | null; clinic: Clinic | null }>({ user: null, clinic: null });
    const [queue, setQueue] = useState<QueueEntry[]>([]);
    const [search, setSearch] = useState('');
    const [results, setResults] = useState<Patient[]>([]);
    const [patient, setPatient] = useState<Patient | null>(null);
    const [queueId, setQueueId] = useState<string>('');
    const [tab, setTab] = useState<TabId>('session');
    const [error, setError] = useState('');
    const [flash, setFlash] = useState('');

    const [program, setProgram] = useState<ProgramItem[]>([]);
    const [hep, setHep] = useState<HepExercise[]>([]);
    const [sessions, setSessions] = useState<Session[]>([]);

    const loadQueue = useCallback(async () => {
        const res = await api<{ queue: QueueEntry[] }>('queue');
        setQueue(res.queue.filter((q) => q.status === 'waiting' || q.status === 'in_room'));
    }, []);

    useEffect(() => {
        api('auth/me').then((res) => {
            if (!res.user) window.location.href = '/login';
            else setMe(res);
        });
        loadQueue();
        const timer = setInterval(loadQueue, 10_000);
        return () => clearInterval(timer);
    }, [loadQueue]);

    useEffect(() => {
        const handle = setTimeout(() => {
            if (!search.trim()) return setResults([]);
            api<{ patients: Patient[] }>(`patients?q=${encodeURIComponent(search)}`).then((res) => setResults(res.patients.slice(0, 8)));
        }, 250);
        return () => clearTimeout(handle);
    }, [search]);

    const openPatient = useCallback(async (next: Patient, fromQueue = '') => {
        setPatient(next);
        setQueueId(fromQueue);
        setResults([]);
        setSearch('');
        setTab('session');
        const [prog, home, log] = await Promise.all([
            api<{ program: Program | null }>(`program?patientId=${next.id}`),
            api<{ hep: Hep | null }>(`hep?patientId=${next.id}`),
            api<{ sessions: Session[] }>(`sessions?patientId=${next.id}`)
        ]);
        setProgram(prog.program?.items ?? []);
        setHep(home.hep?.exercises ?? []);
        setSessions(log.sessions);
    }, []);

    async function openFromQueue(entry: QueueEntry) {
        const res = await api<{ patients: Patient[] }>(`patients?q=${encodeURIComponent(entry.patientCode)}`);
        const found = res.patients.find((p) => p.id === entry.patientId);
        if (!found) return setError(isAr ? 'تعذر فتح ملف المريض' : 'Could not open that patient file');
        if (entry.status === 'waiting') await api('queue', { method: 'PATCH', body: { id: entry.id, status: 'in_room' } });
        loadQueue();
        openPatient(found, entry.id);
    }

    async function saveProgram(items: ProgramItem[]) {
        if (!patient) return;
        setProgram(items);
        await api('program', { method: 'PUT', body: { patientId: patient.id, items } });
        setFlash(isAr ? 'تم حفظ البرنامج العلاجي' : 'Treatment program saved');
    }

    async function saveHep(exercises: HepExercise[]) {
        if (!patient) return;
        setHep(exercises);
        await api('hep', { method: 'PUT', body: { patientId: patient.id, exercises } });
        setFlash(isAr ? 'تم حفظ البرنامج المنزلي' : 'Home program saved');
    }

    async function savePatientField(patch: Partial<Patient>) {
        if (!patient) return;
        const { patient: updated } = await api<{ patient: Patient }>('patients', {
            method: 'PATCH',
            body: { id: patient.id, ...patch }
        });
        setPatient(updated);
    }

    const tabs: { id: TabId; label: string; badge?: number }[] = [
        { id: 'session', label: t('sessionNotes') },
        { id: 'program', label: t('programBuilder'), badge: program.length },
        { id: 'hep', label: t('hepBuilder'), badge: hep.length },
        { id: 'research', label: t('researchHub') },
        { id: 'history', label: t('history'), badge: sessions.length }
    ];

    return (
        <Shell
            subtitle={t('clinicianDesk')}
            lang={lang}
            user={me.user}
            onToggleLang={() => setLang(isAr ? 'en' : 'ar')}
            right={
                <button type="button" className="k-btn-ghost" onClick={loadQueue}>
                    🔄 {t('refresh')}
                </button>
            }
        >
            <div className="space-y-6">
                {error && <Notice kind="error">{error}</Notice>}
                {flash && <Notice kind="success">{flash}</Notice>}

                <Card title={t('liveQueue')} subtitle={`${queue.length} ${isAr ? 'في الانتظار' : 'in the queue'}`}>
                    {queue.length === 0 ? (
                        <Empty text={t('none')} />
                    ) : (
                        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {queue.map((entry) => (
                                <li key={entry.id} className="rounded-lg border border-[var(--color-line)] p-4">
                                    <div className="flex items-center gap-2">
                                        <span className="k-chip bg-emerald-100 text-emerald-900" dir="ltr">
                                            {entry.patientCode}
                                        </span>
                                        <span className="k-hint ms-auto" dir="ltr">
                                            {entry.arrivedAt}
                                        </span>
                                    </div>
                                    <p className="mt-2 font-semibold">{entry.patientName}</p>
                                    <button type="button" className="k-btn-green mt-3 w-full" onClick={() => openFromQueue(entry)}>
                                        {t('startSession')}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </Card>

                <Card title={t('searchPatients')}>
                    <input
                        className="k-input"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={isAr ? 'بالاسم أو الكود أو الهاتف…' : 'By name, code or phone…'}
                    />
                    {results.length > 0 && (
                        <ul className="mt-4 space-y-2">
                            {results.map((p) => (
                                <li key={p.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--color-line)] p-3">
                                    <div>
                                        <p className="font-semibold">{p.name}</p>
                                        <p className="k-hint" dir="ltr">
                                            {p.code} {p.diagnosis && `· ${p.diagnosis}`}
                                        </p>
                                    </div>
                                    <button type="button" className="k-btn-primary ms-auto" onClick={() => openPatient(p)}>
                                        {t('startSession')}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </Card>

                {patient && (
                    <>
                        <section className="k-card overflow-hidden">
                            <div className="bg-gradient-to-r from-brand-700 to-gold-400 px-5 py-5 text-white">
                                <div className="flex flex-wrap items-center gap-4">
                                    <div>
                                        <h2 className="text-white">{patient.name}</h2>
                                        <p className="text-sm text-white/90">
                                            {patient.code} · {patient.age ?? '—'} {isAr ? 'سنة' : 'yrs'} ·{' '}
                                            {patient.gender ? t(patient.gender as 'male' | 'female') : '—'}
                                        </p>
                                    </div>
                                    <div className="ms-auto rounded-lg bg-white/20 px-4 py-2 text-center">
                                        <p className="text-xs uppercase tracking-wide">{isAr ? 'الجلسة الحالية' : 'Current session'}</p>
                                        <p className="text-2xl font-bold">#{sessions.length + 1}</p>
                                    </div>
                                </div>
                            </div>
                            <div className="grid gap-4 p-5 sm:grid-cols-3">
                                <Field label={t('diagnosis')}>
                                    <input
                                        className="k-input"
                                        defaultValue={patient.diagnosis}
                                        onBlur={(e) => savePatientField({ diagnosis: e.target.value })}
                                    />
                                </Field>
                                <Field label={t('contraindications')}>
                                    <input
                                        className="k-input"
                                        defaultValue={patient.contraindications}
                                        onBlur={(e) => savePatientField({ contraindications: e.target.value })}
                                    />
                                </Field>
                                <Field label={t('medicalHistory')}>
                                    <input
                                        className="k-input"
                                        defaultValue={patient.medicalHistory}
                                        onBlur={(e) => savePatientField({ medicalHistory: e.target.value })}
                                    />
                                </Field>
                            </div>
                            {patient.contraindications && (
                                <div className="border-t border-rose-200 bg-rose-50 px-5 py-3 text-sm text-rose-800">
                                    ⚠️ {t('contraindications')}: <strong>{patient.contraindications}</strong>
                                </div>
                            )}
                        </section>

                        <div className="k-card overflow-hidden">
                            <Tabs tabs={tabs} active={tab} onChange={setTab} />
                            <div className="p-5">
                                {tab === 'session' && (
                                    <SessionForm
                                        patient={patient}
                                        program={program}
                                        queueId={queueId}
                                        lang={lang}
                                        onSaved={(session) => {
                                            setSessions([session, ...sessions]);
                                            setFlash(isAr ? 'تم حفظ الجلسة' : 'Session saved');
                                            loadQueue();
                                        }}
                                    />
                                )}
                                {tab === 'program' && <ProgramBuilder items={program} onChange={saveProgram} lang={lang} />}
                                {tab === 'hep' && <HepBuilder exercises={hep} onChange={saveHep} patientCode={patient.code} lang={lang} />}
                                {tab === 'research' && (
                                    <ResearchPanel
                                        patient={patient}
                                        lang={lang}
                                        onAddToProgram={(e) =>
                                            saveProgram([
                                                ...program,
                                                {
                                                    id: `itm_${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
                                                    name: isAr ? e.nameAr || e.name : e.name,
                                                    instructions: e.instructions,
                                                    sets: e.sets,
                                                    reps: e.reps,
                                                    duration: e.duration,
                                                    video: ''
                                                }
                                            ])
                                        }
                                        onAddToHep={(e) =>
                                            saveHep([
                                                ...hep,
                                                {
                                                    id: `hex_${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
                                                    name: isAr ? e.nameAr || e.name : e.name,
                                                    setsReps: `${e.sets} × ${e.reps}`,
                                                    frequency: e.duration,
                                                    mediaUrl: '',
                                                    advice: e.instructions
                                                }
                                            ])
                                        }
                                    />
                                )}
                                {tab === 'history' && <History sessions={sessions} lang={lang} />}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </Shell>
    );
}

function SessionForm({
    patient,
    program,
    queueId,
    lang,
    onSaved
}: {
    patient: Patient;
    program: ProgramItem[];
    queueId: string;
    lang: string;
    onSaved: (session: Session) => void;
}) {
    const isAr = lang === 'ar';
    const [done, setDone] = useState<Record<string, boolean>>({});
    const [metrics, setMetrics] = useState<{ name: string; value: string }[]>([]);
    const [metricName, setMetricName] = useState('');
    const [metricValue, setMetricValue] = useState('');
    const [observations, setObservations] = useState('');
    const [notes, setNotes] = useState('');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        setDone({});
        setMetrics([]);
        setObservations('');
        setNotes('');
    }, [patient.id]);

    async function save() {
        setBusy(true);
        try {
            const { session } = await api<{ session: Session }>('sessions', {
                method: 'POST',
                body: {
                    patientId: patient.id,
                    queueId,
                    execution: program.map((item) => ({ name: item.name, done: Boolean(done[item.id]) })),
                    metrics,
                    observations,
                    progressNotes: notes
                }
            });
            onSaved(session);
            setDone({});
            setMetrics([]);
            setObservations('');
            setNotes('');
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-brand-500">{isAr ? 'تنفيذ البرنامج' : 'Program execution'}</h3>
                {program.length === 0 ? (
                    <Empty text={isAr ? 'لا يوجد برنامج علاجي بعد — أنشئه من تبويب البرنامج.' : 'No treatment program yet — build one in the Program tab.'} />
                ) : (
                    <ul className="mt-3 space-y-2">
                        {program.map((item) => (
                            <li key={item.id} className="rounded-lg border border-[var(--color-line)] p-3">
                                <label className="flex cursor-pointer items-start gap-3">
                                    <input
                                        type="checkbox"
                                        className="mt-1 size-4 accent-[var(--color-brand-500)]"
                                        checked={Boolean(done[item.id])}
                                        onChange={(e) => setDone({ ...done, [item.id]: e.target.checked })}
                                    />
                                    <span>
                                        <span className="font-semibold">{item.name}</span>
                                        {item.instructions && <span className="k-hint mt-1 block">{item.instructions}</span>}
                                        <span className="k-hint mt-1 block">
                                            {[item.sets, item.reps, item.duration].filter(Boolean).join(' · ')}
                                        </span>
                                    </span>
                                </label>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
                <Field label={isAr ? 'الملاحظات الإكلينيكية' : 'Clinical observations'}>
                    <textarea
                        className="k-input min-h-28"
                        value={observations}
                        onChange={(e) => setObservations(e.target.value)}
                        placeholder={isAr ? 'أي تغيرات في الحالة أو ملاحظات…' : 'Changes in condition, concerns…'}
                    />
                </Field>
                <Field label={isAr ? 'ملاحظات التقدم' : 'Progress notes'}>
                    <textarea
                        className="k-input min-h-28"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder={isAr ? 'ملخص العلاج واستجابة المريض…' : 'Treatment provided, patient response…'}
                    />
                </Field>
            </div>

            <div>
                <h3 className="text-brand-500">{isAr ? 'مقاييس التقييم' : 'Assessment metrics'}</h3>
                <p className="k-hint mt-1">{isAr ? 'مثل VAS و ROM و MMT' : 'e.g. VAS, ROM, MMT'}</p>
                <div className="mt-3 flex flex-wrap items-end gap-3">
                    <Field label={isAr ? 'المقياس' : 'Metric'}>
                        <input className="k-input w-40" value={metricName} onChange={(e) => setMetricName(e.target.value)} placeholder="VAS" />
                    </Field>
                    <Field label={isAr ? 'القيمة' : 'Value'}>
                        <input className="k-input w-32" value={metricValue} onChange={(e) => setMetricValue(e.target.value)} placeholder="5" />
                    </Field>
                    <button
                        type="button"
                        className="k-btn-primary"
                        disabled={!metricName.trim()}
                        onClick={() => {
                            setMetrics([...metrics, { name: metricName.trim(), value: metricValue.trim() }]);
                            setMetricName('');
                            setMetricValue('');
                        }}
                    >
                        + {isAr ? 'إضافة' : 'Add'}
                    </button>
                </div>
                {metrics.length > 0 && (
                    <ul className="mt-3 flex flex-wrap gap-2">
                        {metrics.map((m, i) => (
                            <li key={`${m.name}-${i}`} className="k-chip bg-amber-100 text-amber-900">
                                {m.name}: {m.value}
                                <button type="button" onClick={() => setMetrics(metrics.filter((_, idx) => idx !== i))} aria-label="remove">
                                    ✕
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <button type="button" className="k-btn-primary w-full" onClick={save} disabled={busy}>
                {busy ? '…' : isAr ? 'إنهاء وحفظ الجلسة' : 'Complete & save session'}
            </button>
        </div>
    );
}

function ProgramBuilder({ items, onChange, lang }: { items: ProgramItem[]; onChange: (items: ProgramItem[]) => void; lang: string }) {
    const isAr = lang === 'ar';
    const [draft, setDraft] = useState({ name: '', instructions: '', sets: '', reps: '', duration: '', video: '' });

    function add() {
        if (!draft.name.trim()) return;
        onChange([...items, { id: `itm_${Date.now()}${Math.random().toString(36).slice(2, 6)}`, ...draft }]);
        setDraft({ name: '', instructions: '', sets: '', reps: '', duration: '', video: '' });
    }

    return (
        <div className="space-y-5">
            <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-canvas)] p-4">
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label={isAr ? 'اسم التمرين' : 'Exercise / task name'}>
                        <input className="k-input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Quadriceps Setting" />
                    </Field>
                    <Field label={isAr ? 'رابط فيديو (اختياري)' : 'Video link (optional)'}>
                        <input className="k-input" dir="ltr" value={draft.video} onChange={(e) => setDraft({ ...draft, video: e.target.value })} placeholder="https://…" />
                    </Field>
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-3">
                    <Field label={isAr ? 'المجموعات' : 'Sets'}>
                        <input className="k-input" value={draft.sets} onChange={(e) => setDraft({ ...draft, sets: e.target.value })} placeholder="3 sets" />
                    </Field>
                    <Field label={isAr ? 'التكرارات' : 'Reps'}>
                        <input className="k-input" value={draft.reps} onChange={(e) => setDraft({ ...draft, reps: e.target.value })} placeholder="10 reps" />
                    </Field>
                    <Field label={isAr ? 'مدة التثبيت' : 'Hold / duration'}>
                        <input className="k-input" value={draft.duration} onChange={(e) => setDraft({ ...draft, duration: e.target.value })} placeholder="Hold 10s" />
                    </Field>
                </div>
                <Field label={isAr ? 'التعليمات' : 'Instructions'}>
                    <textarea className="k-input mt-4 min-h-24" value={draft.instructions} onChange={(e) => setDraft({ ...draft, instructions: e.target.value })} />
                </Field>
                <button type="button" className="k-btn-primary mt-4 w-full" onClick={add}>
                    + {isAr ? 'إضافة للبرنامج' : 'Add item to program'}
                </button>
            </div>

            {items.length === 0 ? (
                <Empty text={isAr ? 'البرنامج فارغ.' : 'The program is empty.'} />
            ) : (
                <ol className="space-y-3">
                    {items.map((item, index) => (
                        <li key={item.id} className="rounded-lg border-s-4 border-brand-500 bg-white p-4 shadow-sm">
                            <div className="flex items-start gap-3">
                                <div>
                                    <p className="font-semibold text-brand-500">
                                        {index + 1}. {item.name}
                                    </p>
                                    {item.instructions && <p className="mt-1 text-sm">{item.instructions}</p>}
                                    <p className="k-hint mt-1">{[item.sets, item.reps, item.duration].filter(Boolean).join(' | ')}</p>
                                </div>
                                <button
                                    type="button"
                                    className="ms-auto text-[var(--color-muted)] hover:text-rose-600"
                                    onClick={() => onChange(items.filter((i) => i.id !== item.id))}
                                    aria-label="remove"
                                >
                                    ✕
                                </button>
                            </div>
                        </li>
                    ))}
                </ol>
            )}
        </div>
    );
}

function HepBuilder({
    exercises,
    onChange,
    patientCode,
    lang
}: {
    exercises: HepExercise[];
    onChange: (list: HepExercise[]) => void;
    patientCode: string;
    lang: string;
}) {
    const isAr = lang === 'ar';
    const [draft, setDraft] = useState({ name: '', setsReps: '', frequency: '', mediaUrl: '', advice: '' });
    const portalLink = typeof window !== 'undefined' ? `${window.location.origin}/portal?code=${patientCode}` : '';

    function add() {
        if (!draft.name.trim()) return;
        onChange([...exercises, { id: `hex_${Date.now()}${Math.random().toString(36).slice(2, 6)}`, ...draft }]);
        setDraft({ name: '', setsReps: '', frequency: '', mediaUrl: '', advice: '' });
    }

    return (
        <div className="space-y-5">
            <div className="rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm">
                <p className="font-semibold text-sky-900">{isAr ? 'رابط المريض' : 'Patient link'}</p>
                <p className="mt-1 break-all text-sky-800" dir="ltr">
                    {portalLink}
                </p>
                <button type="button" className="k-btn-ghost mt-3" onClick={() => navigator.clipboard?.writeText(portalLink)}>
                    {isAr ? 'نسخ الرابط' : 'Copy link'}
                </button>
            </div>

            <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-canvas)] p-4">
                <Field label={isAr ? 'اسم التمرين' : 'Exercise name'}>
                    <input className="k-input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Clams Exercise" />
                </Field>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <Field label={isAr ? 'المجموعات والتكرارات' : 'Sets & repetitions'}>
                        <input className="k-input" value={draft.setsReps} onChange={(e) => setDraft({ ...draft, setsReps: e.target.value })} placeholder="3 sets x 10 reps" />
                    </Field>
                    <Field label={isAr ? 'التكرار اليومي' : 'Daily frequency'}>
                        <input className="k-input" value={draft.frequency} onChange={(e) => setDraft({ ...draft, frequency: e.target.value })} placeholder="Twice daily" />
                    </Field>
                </div>
                <Field label={isAr ? 'رابط فيديو / صورة' : 'Video / image link'} hint={isAr ? 'رابط يوتيوب أو صورة تشريحية' : 'YouTube URL or anatomical image'}>
                    <input className="k-input mt-4" dir="ltr" value={draft.mediaUrl} onChange={(e) => setDraft({ ...draft, mediaUrl: e.target.value })} placeholder="https://www.youtube.com/watch?v=…" />
                </Field>
                <Field label={isAr ? 'نصائح الطبيب' : 'Doctor advice'}>
                    <textarea className="k-input mt-4 min-h-24" value={draft.advice} onChange={(e) => setDraft({ ...draft, advice: e.target.value })} />
                </Field>
                <button type="button" className="k-btn-primary mt-4 w-full" onClick={add}>
                    + {isAr ? 'إضافة التمرين للمريض' : 'Add exercise to patient program'}
                </button>
            </div>

            {exercises.length === 0 ? (
                <Empty text={isAr ? 'لا توجد تمارين منزلية بعد.' : 'No home exercises yet.'} />
            ) : (
                <ul className="grid gap-4 sm:grid-cols-2">
                    {exercises.map((exercise) => {
                        const embed = embedUrl(exercise.mediaUrl);
                        return (
                            <li key={exercise.id} className="k-card p-4">
                                <div className="flex items-start gap-2">
                                    <h3 className="text-brand-500">{exercise.name}</h3>
                                    <button
                                        type="button"
                                        className="ms-auto text-[var(--color-muted)] hover:text-rose-600"
                                        onClick={() => onChange(exercises.filter((e) => e.id !== exercise.id))}
                                        aria-label="remove"
                                    >
                                        ✕
                                    </button>
                                </div>
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
                                        className="mt-3 aspect-video w-full rounded-lg"
                                        src={embed}
                                        title={exercise.name}
                                        allowFullScreen
                                        loading="lazy"
                                    />
                                ) : exercise.mediaUrl ? (
                                    <img src={exercise.mediaUrl} alt={exercise.name} className="mt-3 w-full rounded-lg" loading="lazy" />
                                ) : null}
                                {exercise.advice && <p className="mt-3 text-sm text-[var(--color-muted)]">{exercise.advice}</p>}
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}

function ResearchPanel({
    patient,
    lang,
    onAddToProgram,
    onAddToHep
}: {
    patient: Patient;
    lang: string;
    onAddToProgram: (e: SuggestedExercise) => void;
    onAddToHep: (e: SuggestedExercise) => void;
}) {
    const isAr = lang === 'ar';
    const [diagnosis, setDiagnosis] = useState(patient.diagnosis);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState<{ papers: Paper[]; exercises: SuggestedExercise[]; usedAi: boolean; note?: string } | null>(null);
    const [view, setView] = useState<'papers' | 'exercises'>('exercises');

    useEffect(() => setDiagnosis(patient.diagnosis), [patient.id, patient.diagnosis]);

    async function run() {
        if (!diagnosis.trim()) return;
        setBusy(true);
        setError('');
        try {
            setResult(
                await api('research', {
                    method: 'POST',
                    body: {
                        diagnosis,
                        age: patient.age,
                        contraindications: patient.contraindications,
                        medicalHistory: patient.medicalHistory
                    }
                })
            );
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Search failed');
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-64 flex-1">
                    <Field label={isAr ? 'التشخيص' : 'Diagnosis'}>
                        <input className="k-input" value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} placeholder="LBP" />
                    </Field>
                </div>
                <button type="button" className="k-btn-gold" onClick={run} disabled={busy || !diagnosis.trim()}>
                    🔍 {busy ? '…' : isAr ? 'بحث عن أبحاث' : 'Find papers'}
                </button>
            </div>

            {error && <Notice kind="error">{error}</Notice>}

            {result && (
                <div className="k-card overflow-hidden">
                    <div className="bg-brand-700 px-5 py-4 text-white">
                        <p className="text-lg font-bold">✨ {isAr ? 'مركز دمج الأبحاث' : 'Research Integration Hub'}</p>
                        <p className="text-sm text-white/80">
                            {result.usedAi ? 'Powered by Claude & Semantic Scholar' : 'Semantic Scholar / PubMed + protocol library'}
                        </p>
                    </div>
                    <Tabs
                        tabs={[
                            { id: 'papers', label: isAr ? 'الأبحاث' : 'Research papers', badge: result.papers.length },
                            { id: 'exercises', label: isAr ? 'التمارين المقترحة' : 'Suggested exercises', badge: result.exercises.length }
                        ]}
                        active={view}
                        onChange={(id) => setView(id as 'papers' | 'exercises')}
                    />
                    <div className="space-y-4 p-5">
                        {result.note && <Notice kind="info">{result.note}</Notice>}

                        {view === 'papers' &&
                            (result.papers.length === 0 ? (
                                <Empty text={isAr ? 'لم يتم العثور على أبحاث.' : 'No papers found.'} />
                            ) : (
                                <ul className="space-y-3">
                                    {result.papers.map((paper) => (
                                        <li key={paper.url || paper.title} className="rounded-lg border border-[var(--color-line)] p-4">
                                            <p className="font-semibold">{paper.title}</p>
                                            <p className="k-hint mt-1">
                                                {[paper.authors, paper.venue, paper.year].filter(Boolean).join(' · ')}
                                            </p>
                                            {paper.abstract && (
                                                <p className="mt-2 line-clamp-4 text-sm text-[var(--color-muted)]">{paper.abstract}</p>
                                            )}
                                            {paper.url && (
                                                <a href={paper.url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm text-brand-500">
                                                    {isAr ? 'فتح البحث ↗' : 'Open paper ↗'}
                                                </a>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            ))}

                        {view === 'exercises' &&
                            result.exercises.map((exercise, index) => (
                                <div key={`${exercise.name}-${index}`} className="rounded-lg border border-[var(--color-line)] p-4">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <p className="font-semibold text-brand-500">
                                            {exercise.name}
                                            {exercise.nameAr && <span className="ms-2 text-[var(--color-muted)]">{exercise.nameAr}</span>}
                                        </p>
                                        <span
                                            className={`k-chip ms-auto ${exercise.origin === 'ai' ? 'bg-gold-400 text-brand-900' : 'bg-[var(--color-canvas)] text-[var(--color-muted)]'}`}
                                        >
                                            {exercise.origin === 'ai' ? 'AI' : isAr ? 'مكتبة البروتوكولات' : 'Protocol library'}
                                        </span>
                                    </div>
                                    <p className="mt-2 text-sm">{exercise.instructions}</p>
                                    <p className="k-hint mt-1">{[exercise.sets, exercise.reps, exercise.duration].filter(Boolean).join(' · ')}</p>
                                    <p className="mt-2 text-sm italic text-[var(--color-muted)]">{exercise.rationale}</p>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        <button type="button" className="k-btn-primary" onClick={() => onAddToProgram(exercise)}>
                                            + {isAr ? 'أضف للبرنامج' : 'Add to program'}
                                        </button>
                                        <button type="button" className="k-btn-ghost" onClick={() => onAddToHep(exercise)}>
                                            + {isAr ? 'أضف للبرنامج المنزلي' : 'Add to home program'}
                                        </button>
                                    </div>
                                </div>
                            ))}
                    </div>
                </div>
            )}

            <Notice kind="info">
                {isAr
                    ? 'الاقتراحات للمراجعة الإكلينيكية فقط — القرار النهائي للطبيب المعالج.'
                    : 'Suggestions are for clinician review — the treating clinician makes the final decision.'}
            </Notice>
        </div>
    );
}

function History({ sessions, lang }: { sessions: Session[]; lang: string }) {
    const isAr = lang === 'ar';
    if (sessions.length === 0) return <Empty text={isAr ? 'لا توجد جلسات سابقة.' : 'No previous sessions.'} />;

    return (
        <ol className="relative space-y-5 border-s-2 border-[var(--color-line)] ps-6">
            {sessions.map((session) => (
                <li key={session.id} className="relative">
                    <span className="absolute -start-[2.05rem] flex size-8 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-white">
                        #{session.number}
                    </span>
                    <div className="k-card p-4">
                        <p className="font-semibold text-brand-500">
                            {new Date(session.date).toLocaleString(isAr ? 'ar-EG' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
                        </p>
                        <p className="k-hint mt-0.5">
                            {isAr ? 'المعالج' : 'Clinician'}: {session.doctorName}
                        </p>

                        {session.execution.length > 0 && (
                            <ul className="mt-3 space-y-1 rounded-lg bg-[var(--color-canvas)] p-3 text-sm">
                                {session.execution.map((item, i) => (
                                    <li key={`${item.name}-${i}`} className={item.done ? 'font-semibold text-emerald-800' : 'text-[var(--color-muted)] line-through'}>
                                        {item.done ? '✓' : '✕'} {item.name}
                                    </li>
                                ))}
                            </ul>
                        )}

                        {session.metrics.length > 0 && (
                            <ul className="mt-3 flex flex-wrap gap-2">
                                {session.metrics.map((m, i) => (
                                    <li key={`${m.name}-${i}`} className="k-chip bg-amber-100 text-amber-900">
                                        {m.name}: {m.value}
                                    </li>
                                ))}
                            </ul>
                        )}

                        {session.observations && (
                            <p className="mt-3 text-sm">
                                <span className="k-hint block">{isAr ? 'ملاحظات إكلينيكية' : 'Clinical observations'}</span>
                                {session.observations}
                            </p>
                        )}
                        {session.progressNotes && (
                            <p className="mt-2 text-sm">
                                <span className="k-hint block">{isAr ? 'ملاحظات التقدم' : 'Progress notes'}</span>
                                {session.progressNotes}
                            </p>
                        )}
                    </div>
                </li>
            ))}
        </ol>
    );
}
