import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { Clinic, Patient, PublicUser, QueueEntry } from '../../lib/models';
import { api, Card, Empty, Field, money, Notice, Shell, Stat, useLang } from './ui';

interface QueueResponse {
    queue: QueueEntry[];
    day: string;
    stats: { waiting: number; inRoom: number; done: number; collected: number };
}

const STATUS_TONE: Record<string, string> = {
    waiting: 'bg-amber-100 text-amber-900',
    in_room: 'bg-sky-100 text-sky-900',
    done: 'bg-emerald-100 text-emerald-900',
    paid: 'bg-emerald-700 text-white'
};

export default function Reception() {
    const { lang, setLang, t } = useLang();
    const isAr = lang === 'ar';
    const [me, setMe] = useState<{ user: PublicUser | null; clinic: Clinic | null }>({ user: null, clinic: null });
    const [data, setData] = useState<QueueResponse | null>(null);
    const [doctors, setDoctors] = useState<PublicUser[]>([]);
    const [existing, setExisting] = useState<Patient[]>([]);
    const [search, setSearch] = useState('');
    const [error, setError] = useState('');
    const [flash, setFlash] = useState('');

    const currency = me.clinic?.currency ?? 'ج.م';

    const loadQueue = useCallback(async () => {
        try {
            setData(await api<QueueResponse>('queue'));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load the queue');
        }
    }, []);

    useEffect(() => {
        api('auth/me').then((res) => {
            if (!res.user) window.location.href = '/login';
            else setMe(res);
        });
        api<{ staff: PublicUser[] }>('staff').then((res) =>
            setDoctors(res.staff.filter((s) => ['owner', 'senior_doctor', 'doctor'].includes(s.role)))
        );
        loadQueue();
        // The board is shared with the clinicians' screens, so keep it fresh.
        const timer = setInterval(loadQueue, 10_000);
        return () => clearInterval(timer);
    }, [loadQueue]);

    useEffect(() => {
        const handle = setTimeout(() => {
            if (!search.trim()) return setExisting([]);
            api<{ patients: Patient[] }>(`patients?q=${encodeURIComponent(search)}`).then((res) =>
                setExisting(res.patients.slice(0, 6))
            );
        }, 250);
        return () => clearTimeout(handle);
    }, [search]);

    async function registerPatient(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError('');
        const form = event.currentTarget;
        const payload = Object.fromEntries(new FormData(form).entries()) as any;
        payload.addToQueue = form.addToQueue.checked;
        try {
            const { patient } = await api<{ patient: Patient }>('patients', { method: 'POST', body: payload });
            form.reset();
            setFlash(isAr ? `تم تسجيل ${patient.name} — الكود ${patient.code}` : `Registered ${patient.name} — code ${patient.code}`);
            loadQueue();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not register the patient');
        }
    }

    async function enqueue(patient: Patient) {
        await api('queue', { method: 'POST', body: { patientId: patient.id } });
        setSearch('');
        setExisting([]);
        loadQueue();
    }

    async function updateEntry(id: string, patch: Record<string, unknown>) {
        await api('queue', { method: 'PATCH', body: { id, ...patch } });
        loadQueue();
    }

    function whatsapp(entry: QueueEntry, phone: string) {
        const text = isAr
            ? `تذكير من ${me.clinic?.name ?? 'العيادة'}: موعد ${entry.patientName} (${entry.patientCode}) اليوم. برجاء الحضور في الوقت المحدد.`
            : `Reminder from ${me.clinic?.name ?? 'the clinic'}: ${entry.patientName} (${entry.patientCode}) has an appointment today.`;
        const number = phone.replace(/[^\d]/g, '');
        window.open(`https://wa.me/${number}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
    }

    return (
        <Shell
            subtitle={t('reception')}
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

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <Stat label={t('waiting')} value={data?.stats.waiting ?? '—'} tone="amber" />
                    <Stat label={t('inRoom')} value={data?.stats.inRoom ?? '—'} tone="blue" />
                    <Stat label={t('doneSessions')} value={data?.stats.done ?? '—'} tone="green" />
                    <Stat label={t('collected')} value={money(data?.stats.collected ?? 0, currency)} tone="brand" />
                </div>

                <Card title={t('liveQueue')} subtitle={data ? `${data.day}` : ''}>
                    {!data ? (
                        <Empty text={t('loading')} />
                    ) : data.queue.length === 0 ? (
                        <Empty text={t('none')} />
                    ) : (
                        <div className="k-scroll">
                            <table className="k-table">
                                <thead>
                                    <tr>
                                        <th>{t('patientName')}</th>
                                        <th>{isAr ? 'وقت الوصول' : 'Arrived'}</th>
                                        <th>{t('fee')}</th>
                                        <th>{isAr ? 'الحالة' : 'Status'}</th>
                                        <th />
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.queue.map((entry) => (
                                        <tr key={entry.id}>
                                            <td>
                                                <p className="font-semibold">{entry.patientName}</p>
                                                <p className="k-hint" dir="ltr">
                                                    {entry.patientCode}
                                                </p>
                                            </td>
                                            <td dir="ltr">{entry.arrivedAt}</td>
                                            <td>
                                                <input
                                                    className="k-input w-28"
                                                    type="number"
                                                    min={0}
                                                    defaultValue={entry.fee}
                                                    onBlur={(e) => updateEntry(entry.id, { fee: Number(e.target.value) })}
                                                />
                                            </td>
                                            <td>
                                                <span className={`k-chip ${STATUS_TONE[entry.status]}`}>
                                                    {entry.status === 'waiting'
                                                        ? t('waiting')
                                                        : entry.status === 'in_room'
                                                          ? t('inRoom')
                                                          : entry.status === 'paid'
                                                            ? isAr
                                                                ? 'تم التحصيل'
                                                                : 'Paid'
                                                            : t('doneSessions')}
                                                </span>
                                            </td>
                                            <td>
                                                <div className="flex flex-wrap gap-2">
                                                    {entry.status === 'waiting' && (
                                                        <button
                                                            type="button"
                                                            className="k-btn-green"
                                                            onClick={() => updateEntry(entry.id, { status: 'in_room' })}
                                                        >
                                                            {t('sendToDoctor')}
                                                        </button>
                                                    )}
                                                    {!entry.paid && (
                                                        <button
                                                            type="button"
                                                            className="k-btn-primary"
                                                            onClick={() => updateEntry(entry.id, { paid: true })}
                                                        >
                                                            {t('markPaid')}
                                                        </button>
                                                    )}
                                                    <button
                                                        type="button"
                                                        className="k-btn-ghost"
                                                        onClick={() => whatsapp(entry, prompt(t('phone')) ?? '')}
                                                    >
                                                        💬 {t('whatsappReminder')}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Card>

                <div className="grid gap-6 lg:grid-cols-2">
                    <Card title={t('registerPatient')}>
                        <form className="space-y-4" onSubmit={registerPatient}>
                            <Field label={t('patientName')}>
                                <input name="name" className="k-input" required />
                            </Field>
                            <div className="grid gap-4 sm:grid-cols-3">
                                <Field label={t('age')}>
                                    <input name="age" type="number" min={0} max={120} className="k-input" />
                                </Field>
                                <Field label={t('gender')}>
                                    <select name="gender" className="k-input">
                                        <option value="">—</option>
                                        <option value="male">{t('male')}</option>
                                        <option value="female">{t('female')}</option>
                                    </select>
                                </Field>
                                <Field label={t('phone')}>
                                    <input name="phone" className="k-input" dir="ltr" />
                                </Field>
                            </div>
                            <Field label={t('diagnosis')} hint={t('optional')}>
                                <input name="diagnosis" className="k-input" placeholder="LBP" />
                            </Field>
                            <div className="grid gap-4 sm:grid-cols-2">
                                <Field label={t('fee')}>
                                    <input name="fee" type="number" min={0} defaultValue={0} className="k-input" />
                                </Field>
                                <Field label={isAr ? 'الطبيب المعالج' : 'Assigned clinician'}>
                                    <select name="doctorId" className="k-input">
                                        <option value="">—</option>
                                        {doctors.map((d) => (
                                            <option key={d.id} value={d.id}>
                                                {d.name}
                                            </option>
                                        ))}
                                    </select>
                                </Field>
                            </div>
                            <label className="flex items-center gap-2 text-sm">
                                <input name="addToQueue" type="checkbox" defaultChecked className="size-4 accent-[var(--color-brand-500)]" />
                                {t('addToQueue')}
                            </label>
                            <button type="submit" className="k-btn-primary w-full">
                                + {t('registerPatient')}
                            </button>
                        </form>
                    </Card>

                    <Card title={isAr ? 'حجز موعد لمريض سابق' : 'Book a returning patient'}>
                        <Field label={t('searchPatients')}>
                            <input
                                className="k-input"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder={isAr ? 'بالاسم أو الكود أو الهاتف…' : 'By name, code or phone…'}
                            />
                        </Field>
                        <ul className="mt-4 space-y-2">
                            {existing.map((patient) => (
                                <li
                                    key={patient.id}
                                    className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--color-line)] p-3"
                                >
                                    <div>
                                        <p className="font-semibold">{patient.name}</p>
                                        <p className="k-hint" dir="ltr">
                                            {patient.code} {patient.phone && `· ${patient.phone}`}
                                        </p>
                                    </div>
                                    <button type="button" className="k-btn-green ms-auto" onClick={() => enqueue(patient)}>
                                        + {t('addToQueue')}
                                    </button>
                                </li>
                            ))}
                            {search && existing.length === 0 && <Empty text={t('none')} />}
                        </ul>
                    </Card>
                </div>
            </div>
        </Shell>
    );
}
