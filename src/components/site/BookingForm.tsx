import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations, type Lang } from '../../i18n/ui';

interface ClinicInfo {
    name: string;
    phone: string;
    address: string;
    workStart: string;
    workEnd: string;
    defaultDuration: number;
    therapists: { id: string; name: string; specialty: string }[];
}

interface Props {
    lang: Lang;
    services: { slug: string; title: string }[];
}

/** أقصى مدى يُسمح بالحجز فيه — نفس الحد مطبَّق على السيرفر */
const MAX_DAYS_AHEAD = 60;

function todayISO(): string {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
}

function maxDateISO(): string {
    const d = new Date();
    d.setDate(d.getDate() + MAX_DAYS_AHEAD);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
}

/** يعرض 09:00 كـ «9:00 ص» بالعربية و«9:00 AM» بالإنجليزية */
function formatTime(time: string, lang: Lang): string {
    const [hRaw, m] = time.split(':');
    const h = Number(hRaw);
    const h12 = h % 12 === 0 ? 12 : h % 12;
    if (lang === 'ar') return `${h12}:${m} ${h < 12 ? 'ص' : 'م'}`;
    return `${h12}:${m} ${h < 12 ? 'AM' : 'PM'}`;
}

const controlClass =
    'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-100';

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
    return (
        <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-slate-700">{label}</span>
            {children}
            {hint ? <span className="mt-1 block text-xs text-slate-400">{hint}</span> : null}
        </label>
    );
}

export default function BookingForm({ lang, services }: Props) {
    const t = useTranslations(lang);

    const [info, setInfo] = useState<ClinicInfo | null>(null);
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');
    const [serviceSlug, setServiceSlug] = useState('');
    const [therapistId, setTherapistId] = useState('');
    const [date, setDate] = useState('');
    const [time, setTime] = useState('');
    const [message, setMessage] = useState('');

    const [slots, setSlots] = useState<string[]>([]);
    const [loadingSlots, setLoadingSlots] = useState(false);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState('');
    const [reference, setReference] = useState('');

    // دفاعان بسيطان ضد الإرسال الآلي: حقل مخفي لا يملؤه إلا الروبوت،
    // وزمن أدنى لملء النموذج يرسله العميل ويتحقق منه السيرفر.
    const [honeypot, setHoneypot] = useState('');
    const startedAt = useRef(Date.now());

    const minDate = useMemo(todayISO, []);
    const maxDate = useMemo(maxDateISO, []);

    useEffect(() => {
        let cancelled = false;
        fetch('/api/public/clinic-info')
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => {
                if (!cancelled && data) setInfo(data as ClinicInfo);
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, []);

    // كلما تغير اليوم أو الأخصائي نعيد سؤال السيرفر عن المواعيد المتاحة فعلًا
    useEffect(() => {
        if (!date) {
            setSlots([]);
            return;
        }
        let cancelled = false;
        setLoadingSlots(true);
        setTime('');
        const query = new URLSearchParams({ date, ...(therapistId ? { therapistId } : {}) });
        fetch(`/api/public/availability?${query}`)
            .then((r) => (r.ok ? r.json() : { slots: [] }))
            .then((data: { slots?: string[] }) => {
                if (!cancelled) setSlots(Array.isArray(data.slots) ? data.slots : []);
            })
            .catch(() => {
                if (!cancelled) setSlots([]);
            })
            .finally(() => {
                if (!cancelled) setLoadingSlots(false);
            });
        return () => {
            cancelled = true;
        };
    }, [date, therapistId]);

    const submit = useCallback(
        async (event: React.FormEvent) => {
            event.preventDefault();
            setError('');

            if (!name.trim() || !phone.trim() || !date || !time) {
                setError(t('book.error.required'));
                return;
            }
            if (name.trim().length < 2) {
                setError(t('book.error.name'));
                return;
            }
            if (!/^[0-9+\-\s()]{7,20}$/.test(phone.trim())) {
                setError(t('book.error.phone'));
                return;
            }

            setSending(true);
            try {
                const response = await fetch('/api/public/booking', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({
                        name: name.trim(),
                        phone: phone.trim(),
                        email: email.trim(),
                        serviceSlug,
                        therapistId,
                        date,
                        time,
                        message: message.trim(),
                        lang,
                        website: honeypot,
                        elapsed: Date.now() - startedAt.current
                    })
                });
                const body = (await response.json().catch(() => ({}))) as { reference?: string; error?: string };
                if (!response.ok) {
                    setError(body.error || t('book.error.generic'));
                    return;
                }
                setReference(body.reference ?? '');
            } catch {
                setError(t('book.error.generic'));
            } finally {
                setSending(false);
            }
        },
        [name, phone, email, serviceSlug, therapistId, date, time, message, lang, honeypot, t]
    );

    if (reference) {
        return (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-8 text-center">
                <p className="text-3xl" aria-hidden="true">
                    ✓
                </p>
                <h2 className="mt-3 text-xl font-extrabold text-emerald-900">{t('book.success.title')}</h2>
                <p className="mt-2 text-sm text-emerald-800">
                    {t('book.success.body')} <span className="font-mono font-bold">{reference}</span>
                </p>
                <button
                    type="button"
                    onClick={() => {
                        setReference('');
                        setName('');
                        setPhone('');
                        setEmail('');
                        setMessage('');
                        setDate('');
                        setTime('');
                        startedAt.current = Date.now();
                    }}
                    className="mt-5 cursor-pointer rounded-lg border border-emerald-300 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-50"
                >
                    {t('book.success.again')}
                </button>
            </div>
        );
    }

    return (
        <form onSubmit={submit} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm" noValidate>
            {error ? <p className="mb-4 rounded-lg bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</p> : null}

            <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('book.name')}>
                    <input className={controlClass} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
                </Field>
                <Field label={t('book.phone')}>
                    <input
                        className={controlClass}
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        inputMode="tel"
                        autoComplete="tel"
                        required
                        dir="ltr"
                    />
                </Field>
                <Field label={t('book.email')}>
                    <input className={controlClass} value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" dir="ltr" />
                </Field>
                <Field label={t('book.service')}>
                    <select className={controlClass} value={serviceSlug} onChange={(e) => setServiceSlug(e.target.value)}>
                        <option value="">{t('book.service.any')}</option>
                        {services.map((s) => (
                            <option key={s.slug} value={s.slug}>
                                {s.title}
                            </option>
                        ))}
                    </select>
                </Field>
                <Field label={t('book.therapist')}>
                    <select className={controlClass} value={therapistId} onChange={(e) => setTherapistId(e.target.value)}>
                        <option value="">{t('book.therapist.any')}</option>
                        {(info?.therapists ?? []).map((th) => (
                            <option key={th.id} value={th.id}>
                                {th.name}
                                {th.specialty ? ` — ${th.specialty}` : ''}
                            </option>
                        ))}
                    </select>
                </Field>
                <Field label={t('book.date')}>
                    <input className={controlClass} type="date" value={date} min={minDate} max={maxDate} onChange={(e) => setDate(e.target.value)} required />
                </Field>
            </div>

            <div className="mt-4">
                <span className="mb-1.5 block text-sm font-semibold text-slate-700">{t('book.time')}</span>
                {!date ? (
                    <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-500">{t('book.time.choose')}</p>
                ) : loadingSlots ? (
                    <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-500">{t('book.time.loading')}</p>
                ) : slots.length === 0 ? (
                    <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">{t('book.time.none')}</p>
                ) : (
                    <div className="flex flex-wrap gap-2">
                        {slots.map((slot) => (
                            <button
                                key={slot}
                                type="button"
                                onClick={() => setTime(slot)}
                                aria-pressed={time === slot}
                                className={`cursor-pointer rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                                    time === slot ? 'border-teal-600 bg-teal-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                                }`}
                            >
                                {formatTime(slot, lang)}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <div className="mt-4">
                <Field label={t('book.message')}>
                    <textarea className={`${controlClass} min-h-24`} value={message} onChange={(e) => setMessage(e.target.value)} rows={3} />
                </Field>
            </div>

            {/* حقل الفخ: مخفي عن المستخدم، والروبوتات تملؤه فيُرفض الطلب */}
            <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
                <label>
                    Website
                    <input tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
                </label>
            </div>

            <button
                type="submit"
                disabled={sending}
                className="mt-6 w-full cursor-pointer rounded-lg bg-teal-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
                {sending ? t('book.sending') : t('book.submit')}
            </button>

            <p className="mt-3 text-center text-xs text-slate-400">{t('book.note')}</p>
        </form>
    );
}
