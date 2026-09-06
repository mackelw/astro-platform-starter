import React, { useMemo } from 'react';
import { useStore } from '../store';
import { Badge, Button, Card, CardHeader, EmptyState, Table, Td } from '../components/ui';
import {
    formatDateLong,
    formatTime,
    money,
    monthKey,
    patientBalance,
    patientName,
    sortAppointments,
    statusClasses,
    statusLabels,
    therapistName,
    todayISO
} from '../utils';

function Stat({ label, value, sub, tone = 'teal', className = '' }: { label: string; value: string; sub?: string; tone?: string; className?: string }) {
    const tones: Record<string, string> = {
        teal: 'bg-teal-50 text-teal-700',
        sky: 'bg-sky-50 text-sky-700',
        amber: 'bg-amber-50 text-amber-700',
        rose: 'bg-rose-50 text-rose-700',
        slate: 'bg-slate-100 text-slate-700'
    };
    return (
        <Card className={`p-4 ${className}`}>
            <p className="text-xs font-semibold text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-extrabold text-slate-800">{value}</p>
            {sub ? <span className={`mt-2 inline-block rounded-md px-2 py-0.5 text-[11px] font-semibold ${tones[tone]}`}>{sub}</span> : null}
        </Card>
    );
}

export default function Dashboard({ onOpenPatient, onGo }: { onOpenPatient: (id: string) => void; onGo: (view: string) => void }) {
    const { db, update, can } = useStore();
    const today = todayISO();
    const currency = db.settings.currency;

    const stats = useMemo(() => {
        const active = db.patients.filter((p) => !p.archived);
        const todays = sortAppointments(db.appointments.filter((a) => a.date === today));
        const thisMonth = monthKey(today);
        const monthSessions = db.sessions.filter((s) => monthKey(s.date) === thisMonth);
        const monthIncome = db.payments.filter((p) => monthKey(p.date) === thisMonth).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
        const monthExpenses = db.expenses.filter((e) => monthKey(e.date) === thisMonth).reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
        const dues = active
            .map((p) => ({ patient: p, ...patientBalance(db, p.id) }))
            .filter((row) => row.due > 0)
            .sort((a, b) => b.due - a.due);
        const totalDue = dues.reduce((sum, row) => sum + row.due, 0);
        return { active, todays, monthSessions, monthIncome, monthExpenses, dues, totalDue };
    }, [db, today]);

    const upcoming = useMemo(
        () => sortAppointments(db.appointments.filter((a) => a.date > today && a.status === 'scheduled')).slice(0, 5),
        [db.appointments, today]
    );

    return (
        <div className="space-y-5">
            <div>
                <h2 className="text-xl font-extrabold text-slate-800">لوحة التحكم</h2>
                <p className="mt-1 text-sm text-slate-500">{formatDateLong(today)}</p>
            </div>

            <div className={`grid grid-cols-2 gap-3 ${can('payments', 'read') ? 'lg:grid-cols-5' : 'lg:grid-cols-3'}`}>
                <Stat label="المرضى النشطون" value={String(stats.active.length)} sub={`إجمالي الملفات ${db.patients.length}`} />
                <Stat
                    label="مواعيد اليوم"
                    value={String(stats.todays.length)}
                    sub={`${stats.todays.filter((a) => a.status === 'done').length} تم حضورها`}
                    tone="sky"
                />
                <Stat label="جلسات هذا الشهر" value={String(stats.monthSessions.length)} tone="slate" sub={`${db.sessions.length} جلسة إجمالًا`} />
                {can('payments', 'read') ? (
                    <>
                        <Stat
                            label="تحصيل هذا الشهر"
                            value={money(stats.monthIncome, currency)}
                            tone="teal"
                            sub={`مصروفات ${money(stats.monthExpenses, currency)}`}
                        />
                        <Stat
                            label="مستحقات غير محصّلة"
                            value={money(stats.totalDue, currency)}
                            tone="rose"
                            sub={`${stats.dues.length} مريض`}
                            className="col-span-2 lg:col-span-1"
                        />
                    </>
                ) : null}
            </div>

            <div className="grid gap-5 lg:grid-cols-3">
                <Card className="lg:col-span-2">
                    <CardHeader
                        title="جدول اليوم"
                        subtitle="يمكنك تسجيل الحضور مباشرة من هنا"
                        action={
                            <Button variant="secondary" onClick={() => onGo('appointments')}>
                                كل المواعيد
                            </Button>
                        }
                    />
                    {stats.todays.length === 0 ? (
                        <EmptyState
                            title="لا توجد مواعيد اليوم"
                            hint="أضف موعدًا جديدًا من صفحة المواعيد"
                            action={<Button onClick={() => onGo('appointments')}>حجز موعد</Button>}
                        />
                    ) : (
                        <Table head={['الوقت', 'المريض', 'الأخصائي', 'الحالة', '']}>
                            {stats.todays.map((a) => (
                                <tr key={a.id} className="hover:bg-slate-50">
                                    <Td className="font-semibold text-slate-800">{formatTime(a.time)}</Td>
                                    <Td>
                                        <button
                                            type="button"
                                            className="cursor-pointer font-semibold text-teal-700 hover:underline"
                                            onClick={() => onOpenPatient(a.patientId)}
                                        >
                                            {patientName(db, a.patientId)}
                                        </button>
                                    </Td>
                                    <Td className="text-slate-500">{therapistName(db, a.therapistId)}</Td>
                                    <Td>
                                        <Badge className={statusClasses[a.status]}>{statusLabels[a.status]}</Badge>
                                    </Td>
                                    <Td className="text-left">
                                        {a.status === 'scheduled' && can('appointments', 'update') ? (
                                            <div className="flex justify-end gap-1">
                                                <Button
                                                    variant="subtle"
                                                    className="px-2 py-1 text-xs"
                                                    onClick={() => update('appointments', a.id, { status: 'done' })}
                                                >
                                                    حضر
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    className="px-2 py-1 text-xs"
                                                    onClick={() => update('appointments', a.id, { status: 'noshow' })}
                                                >
                                                    لم يحضر
                                                </Button>
                                            </div>
                                        ) : null}
                                    </Td>
                                </tr>
                            ))}
                        </Table>
                    )}
                </Card>

                <div className="space-y-5">
                    {can('payments', 'read') ? (
                        <Card>
                            <CardHeader title="أعلى المستحقات" subtitle="مرضى عليهم مبالغ غير مسددة" />
                            {stats.dues.length === 0 ? (
                                <EmptyState title="لا توجد مستحقات متأخرة" />
                            ) : (
                                <ul className="divide-y divide-slate-100">
                                    {stats.dues.slice(0, 5).map((row) => (
                                        <li key={row.patient.id} className="flex items-center justify-between px-4 py-2.5">
                                            <button
                                                type="button"
                                                className="cursor-pointer text-sm font-semibold text-slate-700 hover:text-teal-700"
                                                onClick={() => onOpenPatient(row.patient.id)}
                                            >
                                                {row.patient.name}
                                            </button>
                                            <span className="text-sm font-bold text-rose-600">{money(row.due, currency)}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </Card>
                    ) : null}

                    <Card>
                        <CardHeader title="مواعيد قادمة" />
                        {upcoming.length === 0 ? (
                            <EmptyState title="لا توجد مواعيد قادمة" />
                        ) : (
                            <ul className="divide-y divide-slate-100">
                                {upcoming.map((a) => (
                                    <li key={a.id} className="px-4 py-2.5">
                                        <p className="text-sm font-semibold text-slate-700">{patientName(db, a.patientId)}</p>
                                        <p className="text-xs text-slate-500">
                                            {formatDateLong(a.date)} — {formatTime(a.time)}
                                        </p>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Card>
                </div>
            </div>
        </div>
    );
}
