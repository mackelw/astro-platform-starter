import React, { useMemo, useState } from 'react';
import { useStore } from '../../store';
import { usePortal } from '../context';
import { Card, CardHeader, EmptyState } from '../../components/ui';
import type { Booking, BookingStatus } from '../../types';
import { todayISO } from '../../utils';

const STATUS_CLASS: Record<BookingStatus, string> = {
    new: 'bg-sky-100 text-sky-800 ring-sky-200',
    confirmed: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
    rejected: 'bg-rose-100 text-rose-800 ring-rose-200',
    cancelled: 'bg-slate-200 text-slate-700 ring-slate-300',
    done: 'bg-teal-100 text-teal-800 ring-teal-200'
};

/** هل الوقت المطلوب داخل مواعيد عمل المركز؟ الجمعة لها مواعيد مختلفة */
function withinHours(dateISO: string, time: string, hours: { workStart: string; workEnd: string; fridayStart: string; fridayEnd: string }): boolean {
    if (!dateISO || !time) return true;
    const day = new Date(dateISO + 'T00:00:00').getDay(); // 5 = الجمعة
    const start = day === 5 ? hours.fridayStart : hours.workStart;
    const end = day === 5 ? hours.fridayEnd : hours.workEnd;
    return time >= start && time <= end;
}

function BookingForm() {
    const { db, add } = useStore();
    const { t, lang, patient } = usePortal();
    const [serviceId, setServiceId] = useState('');
    const [place, setPlace] = useState<'clinic' | 'home'>('clinic');
    const [area, setArea] = useState('');
    const [date, setDate] = useState('');
    const [time, setTime] = useState('');
    const [notes, setNotes] = useState('');
    const [sent, setSent] = useState(false);

    const areas = db.settings.homeVisitAreas
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);

    const services = db.services.filter((s) => s.active && (place === 'home' ? s.homeVisit : true));
    const offHours = !withinHours(date, time, db.settings);

    const submit = (event: React.FormEvent) => {
        event.preventDefault();
        if (!patient || !date) return;
        add('bookings', {
            patientId: patient.id,
            serviceId,
            place,
            area: place === 'home' ? area : '',
            date,
            time,
            notes,
            status: 'new',
            appointmentId: '',
            replyNote: ''
        });
        setSent(true);
        setServiceId('');
        setArea('');
        setDate('');
        setTime('');
        setNotes('');
    };

    const label = 'mb-1 block text-xs font-semibold text-slate-600';
    const control = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-500';

    return (
        <Card>
            <CardHeader title={t('book.title')} subtitle={t('book.subtitle')} />
            <form onSubmit={submit} className="space-y-3 px-4 py-4">
                <div>
                    <span className={label}>{t('book.place')}</span>
                    <div className="grid grid-cols-2 gap-2">
                        {(['clinic', 'home'] as const).map((option) => (
                            <button
                                key={option}
                                type="button"
                                onClick={() => setPlace(option)}
                                className={`cursor-pointer rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                                    place === option ? 'border-teal-600 bg-teal-50 text-teal-700' : 'border-slate-300 bg-white text-slate-600'
                                }`}
                            >
                                {t(option === 'clinic' ? 'book.clinic' : 'book.home')}
                            </button>
                        ))}
                    </div>
                </div>

                <label className="block">
                    <span className={label}>{t('book.service')}</span>
                    <select value={serviceId} onChange={(e) => setServiceId(e.target.value)} className={`${control} cursor-pointer`}>
                        <option value="">—</option>
                        {services.map((service) => (
                            <option key={service.id} value={service.id}>
                                {lang === 'ar' ? service.name : service.nameEn || service.name}
                            </option>
                        ))}
                    </select>
                </label>

                {place === 'home' && areas.length ? (
                    <label className="block">
                        <span className={label}>{t('book.area')}</span>
                        <select value={area} onChange={(e) => setArea(e.target.value)} className={`${control} cursor-pointer`}>
                            <option value="">—</option>
                            {areas.map((value) => (
                                <option key={value} value={value}>
                                    {value}
                                </option>
                            ))}
                        </select>
                    </label>
                ) : null}

                <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block">
                        <span className={label}>{t('book.preferredDate')}</span>
                        <input type="date" required min={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} className={control} />
                    </label>
                    <label className="block">
                        <span className={label}>{t('book.preferredTime')}</span>
                        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={control} />
                    </label>
                </div>

                {offHours ? <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">{t('book.outsideHours')}</p> : null}

                <label className="block">
                    <span className={label}>
                        {t('common.notes')} <span className="font-normal text-slate-400">({t('common.optional')})</span>
                    </span>
                    <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={control} />
                </label>

                <button
                    type="submit"
                    className="w-full cursor-pointer rounded-lg bg-teal-600 px-3 py-2.5 text-sm font-bold text-white transition hover:bg-teal-700"
                >
                    {t('book.submit')}
                </button>
                {sent ? <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">{t('book.sent')}</p> : null}
            </form>
        </Card>
    );
}

function BookingRow({ booking }: { booking: Booking }) {
    const { db, update } = useStore();
    const { t, lang, date, time } = usePortal();
    const service = db.services.find((s) => s.id === booking.serviceId);
    const canCancel = booking.status === 'new' || booking.status === 'confirmed';

    return (
        <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
                <p className="text-sm font-bold text-slate-800">
                    {service ? (lang === 'ar' ? service.name : service.nameEn || service.name) : t('book.noService')}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                    {date(booking.date)} {booking.time ? `— ${time(booking.time)}` : ''} · {t(booking.place === 'home' ? 'book.home' : 'book.clinic')}
                    {booking.area ? ` (${booking.area})` : ''}
                </p>
                {booking.replyNote ? (
                    <p className="mt-1 rounded bg-slate-50 px-2 py-1 text-[11px] text-slate-600">
                        <span className="font-bold">{t('book.reply')}: </span>
                        {booking.replyNote}
                    </p>
                ) : null}
            </div>
            <div className="flex flex-col items-end gap-1.5">
                <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ${STATUS_CLASS[booking.status]}`}>
                    {t(`status.${booking.status}`)}
                </span>
                {canCancel ? (
                    <button
                        type="button"
                        onClick={() => update('bookings', booking.id, { status: 'cancelled' })}
                        className="cursor-pointer text-[11px] font-semibold text-rose-600 underline"
                    >
                        {t('book.cancel')}
                    </button>
                ) : null}
            </div>
        </div>
    );
}

export default function PortalAppointments() {
    const { db } = useStore();
    const { t, patient, date, time } = usePortal();
    const today = todayISO();

    const { upcoming, past } = useMemo(() => {
        const mine = patient ? db.appointments.filter((a) => a.patientId === patient.id) : [];
        const sorted = [...mine].sort((a, b) => (a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date)));
        return {
            upcoming: sorted.filter((a) => a.date >= today && a.status === 'scheduled'),
            past: sorted.filter((a) => a.date < today || a.status !== 'scheduled').reverse()
        };
    }, [db.appointments, patient, today]);

    const bookings = patient ? [...db.bookings.filter((b) => b.patientId === patient.id)].reverse() : [];

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader title={t('appt.upcoming')} />
                {upcoming.length === 0 ? (
                    <EmptyState title={t('appt.none')} />
                ) : (
                    <div className="divide-y divide-slate-100">
                        {upcoming.map((appointment) => {
                            const therapist = db.therapists.find((x) => x.id === appointment.therapistId)?.name;
                            return (
                                <div key={appointment.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                                    <div>
                                        <p className="text-sm font-bold text-slate-800">{date(appointment.date, true)}</p>
                                        <p className="mt-0.5 text-xs text-slate-500">
                                            {time(appointment.time)} · {appointment.duration} {t('common.minutes')}
                                            {therapist ? ` · ${t('appt.with')} ${therapist}` : ''}
                                        </p>
                                    </div>
                                    <span className="inline-flex rounded-full bg-sky-100 px-2.5 py-0.5 text-[11px] font-semibold text-sky-800 ring-1 ring-sky-200">
                                        {t('status.scheduled')}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                )}
            </Card>

            <BookingForm />

            {bookings.length ? (
                <Card>
                    <CardHeader title={t('book.myRequests')} />
                    <div className="divide-y divide-slate-100">
                        {bookings.map((booking) => (
                            <BookingRow key={booking.id} booking={booking} />
                        ))}
                    </div>
                </Card>
            ) : null}

            {past.length ? (
                <Card>
                    <CardHeader title={t('appt.past')} />
                    <div className="divide-y divide-slate-100">
                        {past.slice(0, 20).map((appointment) => (
                            <div key={appointment.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                                <span className="text-slate-600">{date(appointment.date)}</span>
                                <span className="text-xs text-slate-400">
                                    {time(appointment.time)} · {t(`status.${appointment.status}`)}
                                </span>
                            </div>
                        ))}
                    </div>
                </Card>
            ) : null}
        </div>
    );
}
