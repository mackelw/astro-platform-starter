import React, { useMemo } from 'react';
import { useStore } from '../store';
import { Card, CardHeader, EmptyState, Table, Td } from '../components/ui';
import { formatMonth, money, monthKey, statusLabels, todayISO } from '../utils';

function lastMonths(count: number): string[] {
    const keys: string[] = [];
    const d = new Date(todayISO() + 'T00:00:00');
    d.setDate(1);
    for (let i = count - 1; i >= 0; i--) {
        const m = new Date(d);
        m.setMonth(d.getMonth() - i);
        keys.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`);
    }
    return keys;
}

export default function Reports() {
    const { db } = useStore();
    const currency = db.settings.currency;

    const months = useMemo(() => {
        const keys = lastMonths(6);
        return keys.map((key) => ({
            key,
            income: db.payments.filter((p) => monthKey(p.date) === key).reduce((sum, p) => sum + (Number(p.amount) || 0), 0),
            expenses: db.expenses.filter((e) => monthKey(e.date) === key).reduce((sum, e) => sum + (Number(e.amount) || 0), 0),
            sessions: db.sessions.filter((s) => monthKey(s.date) === key).length
        }));
    }, [db]);

    const maxIncome = Math.max(1, ...months.map((m) => Math.max(m.income, m.expenses)));

    const byTherapist = useMemo(
        () =>
            db.therapists
                .map((t) => {
                    const sessions = db.sessions.filter((s) => s.therapistId === t.id);
                    return {
                        therapist: t,
                        count: sessions.length,
                        revenue: sessions.reduce((sum, s) => sum + (Number(s.price) || 0), 0),
                        appointments: db.appointments.filter((a) => a.therapistId === t.id).length
                    };
                })
                .sort((a, b) => b.count - a.count),
        [db]
    );

    const diagnoses = useMemo(() => {
        const map = new Map<string, number>();
        db.patients.forEach((p) => {
            const key = (p.diagnosis || 'غير محدد').trim();
            map.set(key, (map.get(key) ?? 0) + 1);
        });
        return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    }, [db.patients]);

    const attendance = useMemo(() => {
        const total = db.appointments.length || 1;
        const counts = { scheduled: 0, done: 0, cancelled: 0, noshow: 0 };
        db.appointments.forEach((a) => (counts[a.status] += 1));
        return Object.entries(counts).map(([key, value]) => ({ key: key as keyof typeof counts, value, pct: Math.round((value / total) * 100) }));
    }, [db.appointments]);

    const painGain = useMemo(() => {
        if (!db.sessions.length) return 0;
        const total = db.sessions.reduce((sum, s) => sum + (s.painBefore - s.painAfter), 0);
        return Math.round((total / db.sessions.length) * 10) / 10;
    }, [db.sessions]);

    return (
        <div className="space-y-5">
            <div>
                <h2 className="text-xl font-extrabold text-slate-800">التقارير</h2>
                <p className="mt-1 text-sm text-slate-500">ملخص أداء العيادة</p>
            </div>

            <Card>
                <CardHeader title="التحصيل والمصروفات (آخر 6 أشهر)" />
                <div className="flex items-end justify-between gap-2 px-4 py-6" style={{ height: 220 }}>
                    {months.map((m) => (
                        <div key={m.key} className="flex flex-1 flex-col items-center gap-2">
                            <div className="flex h-36 w-full items-end justify-center gap-1">
                                <div
                                    className="w-1/3 rounded-t bg-emerald-500 transition-all"
                                    style={{ height: `${Math.round((m.income / maxIncome) * 100)}%` }}
                                    title={`تحصيل: ${money(m.income, currency)}`}
                                />
                                <div
                                    className="w-1/3 rounded-t bg-amber-400 transition-all"
                                    style={{ height: `${Math.round((m.expenses / maxIncome) * 100)}%` }}
                                    title={`مصروفات: ${money(m.expenses, currency)}`}
                                />
                            </div>
                            <span className="text-center text-[11px] font-semibold text-slate-600">{formatMonth(m.key)}</span>
                            <span className="text-[11px] text-slate-400">{m.sessions} جلسة</span>
                        </div>
                    ))}
                </div>
                <div className="flex gap-4 border-t border-slate-200 px-4 py-2 text-xs text-slate-500">
                    <span className="flex items-center gap-1.5">
                        <span className="inline-block size-3 rounded bg-emerald-500" /> تحصيل
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="inline-block size-3 rounded bg-amber-400" /> مصروفات
                    </span>
                </div>
            </Card>

            <div className="grid gap-5 lg:grid-cols-2">
                <Card>
                    <CardHeader title="أداء الأخصائيين" />
                    {byTherapist.length === 0 ? (
                        <EmptyState title="لم تتم إضافة أخصائيين بعد" />
                    ) : (
                        <Table head={['الأخصائي', 'الجلسات', 'المواعيد', 'الإيراد']}>
                            {byTherapist.map((row) => (
                                <tr key={row.therapist.id}>
                                    <Td className="font-semibold text-slate-700">{row.therapist.name}</Td>
                                    <Td>{row.count}</Td>
                                    <Td>{row.appointments}</Td>
                                    <Td className="font-semibold text-teal-700">{money(row.revenue, currency)}</Td>
                                </tr>
                            ))}
                        </Table>
                    )}
                </Card>

                <Card>
                    <CardHeader title="أكثر التشخيصات تكرارًا" />
                    {diagnoses.length === 0 ? (
                        <EmptyState title="لا توجد بيانات" />
                    ) : (
                        <ul className="divide-y divide-slate-100">
                            {diagnoses.map(([name, count]) => (
                                <li key={name} className="flex items-center justify-between px-4 py-2.5 text-sm">
                                    <span className="text-slate-700">{name}</span>
                                    <span className="font-bold text-slate-500">{count}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </Card>

                <Card>
                    <CardHeader title="نسب حضور المواعيد" />
                    <div className="space-y-3 px-4 py-4">
                        {attendance.map((row) => (
                            <div key={row.key}>
                                <div className="mb-1 flex justify-between text-xs font-semibold text-slate-600">
                                    <span>{statusLabels[row.key]}</span>
                                    <span>
                                        {row.value} ({row.pct}%)
                                    </span>
                                </div>
                                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                                    <div className="h-full rounded-full bg-teal-600" style={{ width: `${row.pct}%` }} />
                                </div>
                            </div>
                        ))}
                    </div>
                </Card>

                <Card>
                    <CardHeader title="مؤشر تحسن الألم" subtitle="متوسط الفرق بين الألم قبل الجلسة وبعدها" />
                    <div className="flex flex-col items-center gap-1 px-4 py-8">
                        <p className="text-4xl font-extrabold text-teal-600">{painGain}</p>
                        <p className="text-sm text-slate-500">نقطة تحسّن في المتوسط لكل جلسة</p>
                        <p className="mt-2 text-xs text-slate-400">محسوبة من {db.sessions.length} جلسة مسجلة</p>
                    </div>
                </Card>
            </div>
        </div>
    );
}
