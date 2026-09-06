import React, { useMemo, useState } from 'react';
import { useStore } from '../store';
import type { Session } from '../types';
import { SessionForm } from '../components/forms';
import { Badge, Button, Card, EmptyState, Input, Select, Table, Td } from '../components/ui';
import { addDays, downloadFile, formatDate, money, patientName, therapistName, toCSV, todayISO } from '../utils';

export default function Sessions({ onOpenPatient }: { onOpenPatient: (id: string) => void }) {
    const { db, remove, can } = useStore();
    const canSeeMoney = can('payments', 'read');
    const [from, setFrom] = useState(addDays(todayISO(), -30));
    const [to, setTo] = useState(todayISO());
    const [therapistFilter, setTherapistFilter] = useState('');
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<Session | null>(null);

    const rows = useMemo(() => {
        const q = query.trim().toLowerCase();
        return db.sessions
            .filter((s) => s.date >= from && s.date <= to)
            .filter((s) => (therapistFilter ? s.therapistId === therapistFilter : true))
            .filter((s) => (q ? `${patientName(db, s.patientId)} ${s.treatments.join(' ')} ${s.notes}`.toLowerCase().includes(q) : true))
            .sort((a, b) => b.date.localeCompare(a.date));
    }, [db, from, to, therapistFilter, query]);

    const total = rows.reduce((sum, s) => sum + (Number(s.price) || 0), 0);

    const exportCSV = () => {
        const data = [
            ['التاريخ', 'المريض', 'الأخصائي', 'الإجراءات', 'ألم قبل', 'ألم بعد', 'القيمة', 'ملاحظات'],
            ...rows.map((s) => [
                formatDate(s.date),
                patientName(db, s.patientId),
                therapistName(db, s.therapistId),
                s.treatments.join(' / '),
                s.painBefore,
                s.painAfter,
                s.price,
                s.notes
            ])
        ];
        void downloadFile(`sessions-${from}_${to}.csv`, toCSV(data), 'text/csv;charset=utf-8');
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-xl font-extrabold text-slate-800">سجل الجلسات</h2>
                    <p className="mt-1 text-sm text-slate-500">
                        {rows.length} جلسة{canSeeMoney ? ` بقيمة ${money(total, db.settings.currency)}` : ''}
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="secondary" onClick={exportCSV}>
                        تصدير CSV
                    </Button>
                    {can('sessions', 'create') ? (
                        <Button
                            onClick={() => {
                                setEditing(null);
                                setOpen(true);
                            }}
                        >
                            + تسجيل جلسة
                        </Button>
                    ) : null}
                </div>
            </div>

            <Card className="p-3">
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    <label className="block">
                        <span className="mb-1 block text-xs font-semibold text-slate-600">من تاريخ</span>
                        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                    </label>
                    <label className="block">
                        <span className="mb-1 block text-xs font-semibold text-slate-600">إلى تاريخ</span>
                        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                    </label>
                    <label className="block">
                        <span className="mb-1 block text-xs font-semibold text-slate-600">الأخصائي</span>
                        <Select value={therapistFilter} onChange={(e) => setTherapistFilter(e.target.value)}>
                            <option value="">الكل</option>
                            {db.therapists.map((t) => (
                                <option key={t.id} value={t.id}>
                                    {t.name}
                                </option>
                            ))}
                        </Select>
                    </label>
                    <label className="block">
                        <span className="mb-1 block text-xs font-semibold text-slate-600">بحث</span>
                        <Input placeholder="اسم مريض أو إجراء…" value={query} onChange={(e) => setQuery(e.target.value)} />
                    </label>
                </div>
            </Card>

            <Card>
                {rows.length === 0 ? (
                    <EmptyState title="لا توجد جلسات في هذه الفترة" hint="غيّر نطاق التاريخ أو سجّل جلسة جديدة" />
                ) : (
                    <Table head={['التاريخ', 'المريض', 'الأخصائي', 'الإجراءات', 'الألم', ...(canSeeMoney ? ['القيمة'] : []), '']}>
                        {rows.map((s) => (
                            <tr key={s.id} className="hover:bg-slate-50">
                                <Td className="font-semibold text-slate-700">{formatDate(s.date)}</Td>
                                <Td>
                                    <button
                                        type="button"
                                        className="cursor-pointer font-semibold text-teal-700 hover:underline"
                                        onClick={() => onOpenPatient(s.patientId)}
                                    >
                                        {patientName(db, s.patientId)}
                                    </button>
                                </Td>
                                <Td className="text-slate-500">{therapistName(db, s.therapistId)}</Td>
                                <Td className="max-w-64 truncate text-slate-600" title={s.treatments.join('، ')}>
                                    {s.treatments.join('، ') || '—'}
                                </Td>
                                <Td>
                                    <Badge
                                        className={
                                            s.painAfter < s.painBefore
                                                ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                                                : 'bg-slate-100 text-slate-600 ring-slate-200'
                                        }
                                    >
                                        قبل {s.painBefore} · بعد {s.painAfter}
                                    </Badge>
                                </Td>
                                {canSeeMoney ? <Td className="font-semibold text-slate-700">{money(s.price, db.settings.currency)}</Td> : null}
                                <Td className="text-left">
                                    <div className="flex justify-end gap-1">
                                        {can('sessions', 'update') ? (
                                            <Button
                                                variant="ghost"
                                                className="px-2 py-1 text-xs"
                                                onClick={() => {
                                                    setEditing(s);
                                                    setOpen(true);
                                                }}
                                            >
                                                تعديل
                                            </Button>
                                        ) : null}
                                        {can('sessions', 'delete') ? (
                                            <Button
                                                variant="ghost"
                                                className="px-2 py-1 text-xs text-rose-600 hover:bg-rose-50"
                                                onClick={() => window.confirm('حذف هذه الجلسة؟') && remove('sessions', s.id)}
                                            >
                                                حذف
                                            </Button>
                                        ) : null}
                                    </div>
                                </Td>
                            </tr>
                        ))}
                    </Table>
                )}
            </Card>

            <SessionForm
                open={open}
                onClose={() => {
                    setOpen(false);
                    setEditing(null);
                }}
                editing={editing}
            />
        </div>
    );
}
