import React, { useMemo } from 'react';
import { useStore } from '../../store';
import { usePortal } from '../context';
import { Card, CardHeader, EmptyState } from '../../components/ui';
import { patientBalance } from '../../utils';

function Row({ label, value }: { label: string; value: string }) {
    if (!value || value === '—') return null;
    return (
        <div className="flex justify-between gap-3 py-1.5 text-sm">
            <span className="text-slate-500">{label}</span>
            <span className="font-semibold text-slate-800">{value}</span>
        </div>
    );
}

export default function PortalRecord() {
    const { db } = useStore();
    const { t, patient, date, money } = usePortal();

    const sessions = useMemo(() => {
        if (!patient) return [];
        return [...db.sessions.filter((s) => s.patientId === patient.id)].sort((a, b) => b.date.localeCompare(a.date));
    }, [db.sessions, patient]);

    if (!patient) return null;
    const balance = patientBalance(db, patient.id);

    return (
        <div className="space-y-4">
            <Card className="p-4">
                <h1 className="text-lg font-extrabold text-slate-800">{patient.name}</h1>
                <p className="mt-0.5 text-xs text-slate-400">
                    {t('rec.file')}: {patient.code}
                </p>
                <div className="mt-3 divide-y divide-slate-100">
                    <Row label={t('home.diagnosis')} value={patient.diagnosis} />
                    <Row label={t('common.phone')} value={patient.phone} />
                    <Row label={t('common.birthDate')} value={patient.birthDate} />
                    <Row label={t('home.plan')} value={patient.plannedSessions ? `${sessions.length} / ${patient.plannedSessions}` : `${sessions.length}`} />
                </div>
            </Card>

            <Card>
                <CardHeader title={t('rec.account')} />
                <div className="space-y-1 px-4 py-3">
                    <div className="flex justify-between text-sm">
                        <span className="text-slate-500">{t('rec.charges')}</span>
                        <span className="font-semibold">{money(balance.charges)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-slate-500">{t('rec.paid')}</span>
                        <span className="font-semibold text-emerald-700">{money(balance.paid)}</span>
                    </div>
                    <div className="flex justify-between border-t border-slate-100 pt-2 text-sm">
                        <span className="font-bold text-slate-600">{t('rec.due')}</span>
                        <span className={`font-extrabold ${balance.due > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                            {balance.due > 0 ? money(balance.due) : t('rec.settled')}
                        </span>
                    </div>
                </div>
            </Card>

            <Card>
                <CardHeader title={t('rec.sessions')} />
                {sessions.length === 0 ? (
                    <EmptyState title={t('rec.noSessions')} />
                ) : (
                    <div className="divide-y divide-slate-100">
                        {sessions.map((session) => (
                            <div key={session.id} className="px-4 py-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="text-sm font-bold text-slate-800">{date(session.date, true)}</p>
                                    <p className="text-[11px] text-slate-500">
                                        {t('rec.painBefore')} {session.painBefore}/10 → {t('rec.painAfter')} {session.painAfter}/10
                                    </p>
                                </div>
                                {session.treatments.length ? (
                                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                                        {session.treatments.map((treatment, i) => (
                                            <span key={i} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] text-slate-600">
                                                {treatment}
                                            </span>
                                        ))}
                                    </div>
                                ) : null}
                                {session.homeProgram ? (
                                    <p className="mt-2 text-xs text-slate-600">
                                        <span className="font-bold">{t('rec.homeProgram')}: </span>
                                        {session.homeProgram}
                                    </p>
                                ) : null}
                            </div>
                        ))}
                    </div>
                )}
            </Card>
        </div>
    );
}
