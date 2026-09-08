import React, { useMemo } from 'react';
import { useStore } from '../../store';
import { usePortal, whatsappLink } from '../context';
import type { PortalView } from '../PortalApp';
import { Card } from '../../components/ui';
import { safeUrl, todayISO } from '../../utils';

function Tile({ icon, label, value, hint }: { icon: string; label: string; value: string; hint?: string }) {
    return (
        <Card className="flex items-center gap-3 p-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-xl">{icon}</div>
            <div className="min-w-0">
                <p className="text-[11px] font-semibold text-slate-500">{label}</p>
                <p className="truncate text-lg font-extrabold text-slate-800">{value}</p>
                {hint ? <p className="truncate text-[11px] text-slate-400">{hint}</p> : null}
            </div>
        </Card>
    );
}

export default function PortalHome({ onGo }: { onGo: (view: PortalView) => void }) {
    const { db } = useStore();
    const { t, patient, date, time, lang } = usePortal();
    const today = todayISO();

    const next = useMemo(() => {
        if (!patient) return null;
        return db.appointments
            .filter((a) => a.patientId === patient.id && a.status === 'scheduled' && a.date >= today)
            .sort((a, b) => (a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date)))[0];
    }, [db.appointments, patient, today]);

    const doneSessions = patient ? db.sessions.filter((s) => s.patientId === patient.id).length : 0;

    const exercisesToday = useMemo(() => {
        if (!patient) return { total: 0, done: 0 };
        const active = db.prescriptions.filter((r) => r.patientId === patient.id && r.active && (!r.endDate || r.endDate >= today));
        const doneIds = new Set(db.exerciseLogs.filter((l) => l.patientId === patient.id && l.date === today && l.done).map((l) => l.prescriptionId));
        return { total: active.length, done: active.filter((r) => doneIds.has(r.id)).length };
    }, [db.prescriptions, db.exerciseLogs, patient, today]);

    const therapist = next ? db.therapists.find((x) => x.id === next.therapistId)?.name : '';
    const whatsapp = db.settings.whatsapp || db.settings.phone;
    const greetingName = patient?.name ?? '';
    const map = safeUrl(db.settings.mapUrl);

    return (
        <div className="space-y-4">
            <div className="rounded-2xl bg-gradient-to-l from-teal-700 to-teal-500 px-5 py-6 text-white shadow-sm">
                <p className="text-xs text-white/80">{t('home.hello')}</p>
                <h1 className="mt-0.5 text-xl font-extrabold">{greetingName}</h1>
                <p className="mt-1 text-xs text-white/80">{lang === 'ar' ? db.settings.address : db.settings.addressEn || db.settings.address}</p>
            </div>

            <Card className="p-4">
                <p className="text-xs font-bold text-slate-500">{t('home.nextVisit')}</p>
                {next ? (
                    <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
                        <div>
                            <p className="text-lg font-extrabold text-teal-700">
                                {date(next.date, true)} — {time(next.time)}
                            </p>
                            {therapist ? (
                                <p className="mt-0.5 text-xs text-slate-500">
                                    {t('appt.with')} {therapist}
                                </p>
                            ) : null}
                        </div>
                        <button
                            type="button"
                            onClick={() => onGo('appointments')}
                            className="cursor-pointer rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-bold text-teal-700 transition hover:bg-teal-100"
                        >
                            {t('nav.appointments')}
                        </button>
                    </div>
                ) : (
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                        <p className="text-sm text-slate-500">{t('home.noVisit')}</p>
                        <button
                            type="button"
                            onClick={() => onGo('appointments')}
                            className="cursor-pointer rounded-lg bg-teal-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-teal-700"
                        >
                            {t('home.bookNow')}
                        </button>
                    </div>
                )}
            </Card>

            <div className="grid gap-3 sm:grid-cols-2">
                <Tile
                    icon="🩺"
                    label={t('home.plan')}
                    value={patient?.plannedSessions ? `${doneSessions} ${t('home.ofPlanned')} ${patient.plannedSessions}` : `${doneSessions}`}
                    hint={t('home.sessionsDone')}
                />
                <Tile icon="🤸" label={t('home.todayExercises')} value={`${exercisesToday.done} / ${exercisesToday.total}`} hint={t('home.doneToday')} />
            </div>

            {patient?.diagnosis ? (
                <Card className="p-4">
                    <p className="text-xs font-bold text-slate-500">{t('home.diagnosis')}</p>
                    <p className="mt-1 text-sm font-semibold text-slate-700">{patient.diagnosis}</p>
                </Card>
            ) : null}

            {exercisesToday.total > 0 ? (
                <button
                    type="button"
                    onClick={() => onGo('exercises')}
                    className="w-full cursor-pointer rounded-xl bg-teal-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-teal-700"
                >
                    {t('home.openExercises')}
                </button>
            ) : null}

            <Card className="p-4">
                <p className="text-xs font-bold text-slate-500">{t('home.hours')}</p>
                <div className="mt-2 space-y-1 text-sm text-slate-700">
                    <p className="flex justify-between gap-3">
                        <span>{t('home.hoursDaily')}</span>
                        <span className="font-semibold" dir="ltr">
                            {db.settings.workStart} – {db.settings.workEnd}
                        </span>
                    </p>
                    <p className="flex justify-between gap-3">
                        <span>{t('home.hoursFriday')}</span>
                        <span className="font-semibold" dir="ltr">
                            {db.settings.fridayStart} – {db.settings.fridayEnd}
                        </span>
                    </p>
                </div>
                {map ? (
                    <a href={map} target="_blank" rel="noreferrer" className="mt-3 inline-block text-xs font-bold text-teal-700 underline">
                        {t('contact.map')}
                    </a>
                ) : null}
            </Card>

            <div className="grid gap-3 sm:grid-cols-2">
                {whatsapp ? (
                    <a
                        href={whatsappLink(whatsapp, `${db.settings.name} — ${greetingName}`)}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700"
                    >
                        <span aria-hidden="true">💬</span>
                        {t('home.whatsapp')}
                    </a>
                ) : null}
                {db.settings.phone ? (
                    <a
                        href={`tel:${db.settings.phone.replace(/\s/g, '')}`}
                        className="flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
                    >
                        <span aria-hidden="true">📞</span>
                        {t('home.call')}
                    </a>
                ) : null}
            </div>
        </div>
    );
}
