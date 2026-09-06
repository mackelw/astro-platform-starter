import React, { useMemo, useState } from 'react';
import { useStore } from '../store';
import type { Expense, Payment } from '../types';
import { PaymentForm } from '../components/forms';
import { Badge, Button, Card, EmptyState, Field, Input, Modal, Table, Td } from '../components/ui';
import { addDays, downloadFile, formatDate, methodLabels, money, patientBalance, patientName, toCSV, todayISO } from '../utils';

function ExpenseForm({ open, onClose, editing }: { open: boolean; onClose: () => void; editing: Expense | null }) {
    const { db, add, update } = useStore();
    const [draft, setDraft] = useState({ date: todayISO(), title: '', category: 'مستلزمات', amount: 0, notes: '' });

    React.useEffect(() => {
        if (!open) return;
        setDraft(editing ? { ...editing } : { date: todayISO(), title: '', category: 'مستلزمات', amount: 0, notes: '' });
    }, [open, editing]);

    const submit = () => {
        if (!draft.title.trim() || !draft.amount) return;
        if (editing) update('expenses', editing.id, draft);
        else add('expenses', draft);
        onClose();
    };

    return (
        <Modal
            open={open}
            title={editing ? 'تعديل مصروف' : 'تسجيل مصروف'}
            onClose={onClose}
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>
                        إلغاء
                    </Button>
                    <Button onClick={submit}>حفظ</Button>
                </>
            }
        >
            <div className="grid gap-3 sm:grid-cols-2">
                <Field label="البيان *" className="sm:col-span-2">
                    <Input
                        value={draft.title}
                        onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                        placeholder="مثال: إيجار — كهرباء — مستلزمات"
                    />
                </Field>
                <Field label="التاريخ">
                    <Input type="date" value={draft.date} onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))} />
                </Field>
                <Field label={`المبلغ (${db.settings.currency})`}>
                    <Input type="number" min={0} value={draft.amount} onChange={(e) => setDraft((d) => ({ ...d, amount: Number(e.target.value) }))} />
                </Field>
                <Field label="التصنيف">
                    <Input value={draft.category} onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))} />
                </Field>
                <Field label="ملاحظات">
                    <Input value={draft.notes} onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))} />
                </Field>
            </div>
        </Modal>
    );
}

export default function Billing({ onOpenPatient }: { onOpenPatient: (id: string) => void }) {
    const { db, remove } = useStore();
    const [tab, setTab] = useState<'dues' | 'payments' | 'expenses'>('dues');
    const [from, setFrom] = useState(addDays(todayISO(), -30));
    const [to, setTo] = useState(todayISO());
    const [paymentOpen, setPaymentOpen] = useState(false);
    const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
    const [expenseOpen, setExpenseOpen] = useState(false);
    const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

    const currency = db.settings.currency;

    const payments = useMemo(
        () => db.payments.filter((p) => p.date >= from && p.date <= to).sort((a, b) => b.date.localeCompare(a.date)),
        [db.payments, from, to]
    );
    const expenses = useMemo(
        () => db.expenses.filter((e) => e.date >= from && e.date <= to).sort((a, b) => b.date.localeCompare(a.date)),
        [db.expenses, from, to]
    );
    const dues = useMemo(
        () =>
            db.patients
                .map((p) => ({ patient: p, ...patientBalance(db, p.id) }))
                .filter((row) => row.due !== 0)
                .sort((a, b) => b.due - a.due),
        [db]
    );

    const income = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const spent = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const totalDue = dues.reduce((sum, row) => sum + Math.max(0, row.due), 0);

    const exportPayments = () => {
        const data = [
            ['التاريخ', 'المريض', 'المبلغ', 'الطريقة', 'ملاحظات'],
            ...payments.map((p) => [formatDate(p.date), patientName(db, p.patientId), p.amount, methodLabels[p.method], p.notes])
        ];
        downloadFile(`payments-${from}_${to}.csv`, toCSV(data), 'text/csv;charset=utf-8');
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-xl font-extrabold text-slate-800">الحسابات</h2>
                    <p className="mt-1 text-sm text-slate-500">التحصيل والمصروفات والمستحقات</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button
                        variant="secondary"
                        onClick={() => {
                            setEditingExpense(null);
                            setExpenseOpen(true);
                        }}
                    >
                        + مصروف
                    </Button>
                    <Button
                        onClick={() => {
                            setEditingPayment(null);
                            setPaymentOpen(true);
                        }}
                    >
                        + دفعة
                    </Button>
                </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Card className="p-4">
                    <p className="text-xs font-semibold text-slate-500">تحصيل الفترة</p>
                    <p className="mt-2 text-xl font-extrabold text-emerald-600">{money(income, currency)}</p>
                </Card>
                <Card className="p-4">
                    <p className="text-xs font-semibold text-slate-500">مصروفات الفترة</p>
                    <p className="mt-2 text-xl font-extrabold text-amber-600">{money(spent, currency)}</p>
                </Card>
                <Card className="p-4">
                    <p className="text-xs font-semibold text-slate-500">صافي الفترة</p>
                    <p className="mt-2 text-xl font-extrabold text-slate-800">{money(income - spent, currency)}</p>
                </Card>
                <Card className="p-4">
                    <p className="text-xs font-semibold text-slate-500">إجمالي المستحقات</p>
                    <p className="mt-2 text-xl font-extrabold text-rose-600">{money(totalDue, currency)}</p>
                </Card>
            </div>

            <Card className="p-3">
                <div className="flex flex-wrap items-end gap-2">
                    <label className="block">
                        <span className="mb-1 block text-xs font-semibold text-slate-600">من</span>
                        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                    </label>
                    <label className="block">
                        <span className="mb-1 block text-xs font-semibold text-slate-600">إلى</span>
                        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                    </label>
                    <Button variant="secondary" onClick={exportPayments}>
                        تصدير المدفوعات CSV
                    </Button>
                </div>
            </Card>

            <Card>
                <div className="flex gap-1 border-b border-slate-200 px-3 pt-3">
                    {(
                        [
                            ['dues', `المستحقات (${dues.length})`],
                            ['payments', `المدفوعات (${payments.length})`],
                            ['expenses', `المصروفات (${expenses.length})`]
                        ] as const
                    ).map(([key, label]) => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => setTab(key)}
                            className={`cursor-pointer rounded-t-lg px-3 py-2 text-sm font-semibold transition ${tab === key ? 'bg-teal-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                {tab === 'dues' ? (
                    dues.length === 0 ? (
                        <EmptyState title="كل الحسابات مسددة" />
                    ) : (
                        <Table head={['المريض', 'قيمة الجلسات', 'المدفوع', 'المتبقي', '']}>
                            {dues.map((row) => (
                                <tr key={row.patient.id} className="hover:bg-slate-50">
                                    <Td>
                                        <button
                                            type="button"
                                            className="cursor-pointer font-semibold text-teal-700 hover:underline"
                                            onClick={() => onOpenPatient(row.patient.id)}
                                        >
                                            {row.patient.name}
                                        </button>
                                    </Td>
                                    <Td>{money(row.charges, currency)}</Td>
                                    <Td className="text-emerald-600">{money(row.paid, currency)}</Td>
                                    <Td className={row.due > 0 ? 'font-bold text-rose-600' : 'font-bold text-sky-600'}>
                                        {money(row.due, currency)}{' '}
                                        {row.due < 0 ? <Badge className="bg-sky-50 text-sky-700 ring-sky-200">رصيد دائن</Badge> : null}
                                    </Td>
                                    <Td className="text-left">
                                        <Button variant="subtle" className="px-2 py-1 text-xs" onClick={() => onOpenPatient(row.patient.id)}>
                                            فتح الملف
                                        </Button>
                                    </Td>
                                </tr>
                            ))}
                        </Table>
                    )
                ) : null}

                {tab === 'payments' ? (
                    payments.length === 0 ? (
                        <EmptyState title="لا توجد مدفوعات في هذه الفترة" />
                    ) : (
                        <Table head={['التاريخ', 'المريض', 'المبلغ', 'الطريقة', 'ملاحظات', '']}>
                            {payments.map((p) => (
                                <tr key={p.id} className="hover:bg-slate-50">
                                    <Td className="font-semibold text-slate-700">{formatDate(p.date)}</Td>
                                    <Td>
                                        <button
                                            type="button"
                                            className="cursor-pointer font-semibold text-teal-700 hover:underline"
                                            onClick={() => onOpenPatient(p.patientId)}
                                        >
                                            {patientName(db, p.patientId)}
                                        </button>
                                    </Td>
                                    <Td className="font-bold text-emerald-600">{money(p.amount, currency)}</Td>
                                    <Td>{methodLabels[p.method]}</Td>
                                    <Td className="text-slate-500">{p.notes || '—'}</Td>
                                    <Td className="text-left">
                                        <div className="flex justify-end gap-1">
                                            <Button
                                                variant="ghost"
                                                className="px-2 py-1 text-xs"
                                                onClick={() => {
                                                    setEditingPayment(p);
                                                    setPaymentOpen(true);
                                                }}
                                            >
                                                تعديل
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                className="px-2 py-1 text-xs text-rose-600 hover:bg-rose-50"
                                                onClick={() => window.confirm('حذف هذه الدفعة؟') && remove('payments', p.id)}
                                            >
                                                حذف
                                            </Button>
                                        </div>
                                    </Td>
                                </tr>
                            ))}
                        </Table>
                    )
                ) : null}

                {tab === 'expenses' ? (
                    expenses.length === 0 ? (
                        <EmptyState title="لا توجد مصروفات في هذه الفترة" />
                    ) : (
                        <Table head={['التاريخ', 'البيان', 'التصنيف', 'المبلغ', '']}>
                            {expenses.map((e) => (
                                <tr key={e.id} className="hover:bg-slate-50">
                                    <Td className="font-semibold text-slate-700">{formatDate(e.date)}</Td>
                                    <Td>{e.title}</Td>
                                    <Td className="text-slate-500">{e.category || '—'}</Td>
                                    <Td className="font-bold text-amber-600">{money(e.amount, currency)}</Td>
                                    <Td className="text-left">
                                        <div className="flex justify-end gap-1">
                                            <Button
                                                variant="ghost"
                                                className="px-2 py-1 text-xs"
                                                onClick={() => {
                                                    setEditingExpense(e);
                                                    setExpenseOpen(true);
                                                }}
                                            >
                                                تعديل
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                className="px-2 py-1 text-xs text-rose-600 hover:bg-rose-50"
                                                onClick={() => window.confirm('حذف هذا المصروف؟') && remove('expenses', e.id)}
                                            >
                                                حذف
                                            </Button>
                                        </div>
                                    </Td>
                                </tr>
                            ))}
                        </Table>
                    )
                ) : null}
            </Card>

            <PaymentForm open={paymentOpen} onClose={() => setPaymentOpen(false)} editing={editingPayment} />
            <ExpenseForm open={expenseOpen} onClose={() => setExpenseOpen(false)} editing={editingExpense} />
        </div>
    );
}
