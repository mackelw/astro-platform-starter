import React, { useMemo, useState } from 'react';
import { useStore } from '../store';
import type { Patient } from '../types';
import { Badge, Button, Card, CardHeader, EmptyState, Field, Input, Modal, Select, Table, Td, Textarea } from '../components/ui';
import { age, downloadFile, formatDate, genderLabels, money, nextPatientCode, patientBalance, searchPatients, toCSV, todayISO } from '../utils';

type Draft = Omit<Patient, 'id' | 'createdAt'>;

function emptyDraft(code: string, price: number): Draft {
    return {
        code,
        name: '',
        phone: '',
        gender: 'male',
        birthDate: '',
        address: '',
        job: '',
        diagnosis: '',
        referredBy: '',
        history: '',
        notes: '',
        plannedSessions: 12,
        sessionPrice: price,
        archived: false
    };
}

export function PatientForm({ open, onClose, editing }: { open: boolean; onClose: () => void; editing: Patient | null }) {
    const { db, add, update } = useStore();
    const [draft, setDraft] = useState<Draft>(() => emptyDraft(nextPatientCode(db.patients), db.settings.defaultSessionPrice));
    const [error, setError] = useState('');

    // إعادة ضبط النموذج كلما فُتح
    React.useEffect(() => {
        if (!open) return;
        setError('');
        setDraft(editing ? { ...editing } : emptyDraft(nextPatientCode(db.patients), db.settings.defaultSessionPrice));
    }, [open, editing]);

    const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((prev) => ({ ...prev, [key]: value }));

    const submit = () => {
        if (!draft.name.trim()) {
            setError('اسم المريض مطلوب');
            return;
        }
        if (editing) update('patients', editing.id, draft);
        else add('patients', draft);
        onClose();
    };

    return (
        <Modal
            open={open}
            wide
            title={editing ? `تعديل ملف: ${editing.name}` : 'ملف مريض جديد'}
            onClose={onClose}
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>
                        إلغاء
                    </Button>
                    <Button onClick={submit}>{editing ? 'حفظ التعديلات' : 'إضافة المريض'}</Button>
                </>
            }
        >
            {error ? <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</p> : null}
            <div className="grid gap-3 sm:grid-cols-2">
                <Field label="رقم الملف">
                    <Input value={draft.code} onChange={(e) => set('code', e.target.value)} />
                </Field>
                <Field label="الاسم الكامل *">
                    <Input value={draft.name} onChange={(e) => set('name', e.target.value)} placeholder="مثال: محمد عبد الله" />
                </Field>
                <Field label="رقم الهاتف">
                    <Input value={draft.phone} onChange={(e) => set('phone', e.target.value)} inputMode="tel" placeholder="01xxxxxxxxx" />
                </Field>
                <Field label="النوع">
                    <Select value={draft.gender} onChange={(e) => set('gender', e.target.value as Patient['gender'])}>
                        <option value="male">ذكر</option>
                        <option value="female">أنثى</option>
                    </Select>
                </Field>
                <Field label="تاريخ الميلاد">
                    <Input type="date" value={draft.birthDate} onChange={(e) => set('birthDate', e.target.value)} />
                </Field>
                <Field label="الوظيفة">
                    <Input value={draft.job} onChange={(e) => set('job', e.target.value)} />
                </Field>
                <Field label="العنوان" className="sm:col-span-2">
                    <Input value={draft.address} onChange={(e) => set('address', e.target.value)} />
                </Field>
                <Field label="التشخيص" className="sm:col-span-2">
                    <Input value={draft.diagnosis} onChange={(e) => set('diagnosis', e.target.value)} placeholder="مثال: انزلاق غضروفي قطني" />
                </Field>
                <Field label="الطبيب المحوِّل">
                    <Input value={draft.referredBy} onChange={(e) => set('referredBy', e.target.value)} />
                </Field>
                <Field label="عدد الجلسات المقررة">
                    <Input type="number" min={0} value={draft.plannedSessions} onChange={(e) => set('plannedSessions', Number(e.target.value))} />
                </Field>
                <Field label={`سعر الجلسة (${db.settings.currency})`}>
                    <Input type="number" min={0} value={draft.sessionPrice} onChange={(e) => set('sessionPrice', Number(e.target.value))} />
                </Field>
                <Field label="الحالة">
                    <Select value={draft.archived ? 'archived' : 'active'} onChange={(e) => set('archived', e.target.value === 'archived')}>
                        <option value="active">نشط</option>
                        <option value="archived">مؤرشف</option>
                    </Select>
                </Field>
                <Field label="التاريخ المرضي" className="sm:col-span-2">
                    <Textarea value={draft.history} onChange={(e) => set('history', e.target.value)} />
                </Field>
                <Field label="ملاحظات" className="sm:col-span-2">
                    <Textarea value={draft.notes} onChange={(e) => set('notes', e.target.value)} />
                </Field>
            </div>
        </Modal>
    );
}

export default function Patients({ onOpenPatient }: { onOpenPatient: (id: string) => void }) {
    const { db, remove } = useStore();
    const [query, setQuery] = useState('');
    const [showArchived, setShowArchived] = useState(false);
    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState<Patient | null>(null);

    const rows = useMemo(() => {
        const base = db.patients.filter((p) => (showArchived ? true : !p.archived));
        return searchPatients(base, query).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    }, [db.patients, query, showArchived]);

    const exportCSV = () => {
        const data = [
            ['رقم الملف', 'الاسم', 'الهاتف', 'النوع', 'تاريخ الميلاد', 'التشخيص', 'الجلسات', 'المستحق'],
            ...rows.map((p) => {
                const bal = patientBalance(db, p.id);
                const count = db.sessions.filter((s) => s.patientId === p.id).length;
                return [p.code, p.name, p.phone, genderLabels[p.gender], p.birthDate, p.diagnosis, count, bal.due];
            })
        ];
        downloadFile(`patients-${todayISO()}.csv`, toCSV(data), 'text/csv;charset=utf-8');
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-xl font-extrabold text-slate-800">ملفات المرضى</h2>
                    <p className="mt-1 text-sm text-slate-500">{rows.length} ملف معروض</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={exportCSV}>
                        تصدير CSV
                    </Button>
                    <Button
                        onClick={() => {
                            setEditing(null);
                            setFormOpen(true);
                        }}
                    >
                        + مريض جديد
                    </Button>
                </div>
            </div>

            <Card>
                <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-3">
                    <Input className="max-w-xs" placeholder="ابحث بالاسم أو الهاتف أو التشخيص…" value={query} onChange={(e) => setQuery(e.target.value)} />
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                        <input type="checkbox" className="size-4 accent-teal-600" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
                        إظهار المؤرشفين
                    </label>
                </div>

                {rows.length === 0 ? (
                    <EmptyState title="لا توجد ملفات مطابقة" hint="جرّب كلمة بحث أخرى أو أضف مريضًا جديدًا" />
                ) : (
                    <Table head={['رقم الملف', 'المريض', 'الهاتف', 'التشخيص', 'الجلسات', 'المستحق', '']}>
                        {rows.map((p) => {
                            const bal = patientBalance(db, p.id);
                            const done = db.sessions.filter((s) => s.patientId === p.id).length;
                            return (
                                <tr key={p.id} className="hover:bg-slate-50">
                                    <Td className="text-xs font-semibold text-slate-500">{p.code}</Td>
                                    <Td>
                                        <button
                                            type="button"
                                            className="cursor-pointer font-semibold text-teal-700 hover:underline"
                                            onClick={() => onOpenPatient(p.id)}
                                        >
                                            {p.name}
                                        </button>
                                        <span className="mr-2 text-xs text-slate-400">
                                            {genderLabels[p.gender]} · {age(p.birthDate)}
                                        </span>
                                        {p.archived ? <Badge className="mr-2 bg-slate-200 text-slate-600 ring-slate-300">مؤرشف</Badge> : null}
                                    </Td>
                                    <Td dir="ltr" className="text-right text-slate-600">
                                        {p.phone || '—'}
                                    </Td>
                                    <Td className="max-w-56 truncate text-slate-600" title={p.diagnosis}>
                                        {p.diagnosis || '—'}
                                    </Td>
                                    <Td className="text-slate-600">
                                        {done} / {p.plannedSessions || '—'}
                                    </Td>
                                    <Td className={bal.due > 0 ? 'font-bold text-rose-600' : 'text-emerald-600'}>{money(bal.due, db.settings.currency)}</Td>
                                    <Td className="text-left">
                                        <div className="flex justify-end gap-1">
                                            <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => onOpenPatient(p.id)}>
                                                فتح
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                className="px-2 py-1 text-xs"
                                                onClick={() => {
                                                    setEditing(p);
                                                    setFormOpen(true);
                                                }}
                                            >
                                                تعديل
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                className="px-2 py-1 text-xs text-rose-600 hover:bg-rose-50"
                                                onClick={() => {
                                                    if (window.confirm(`سيتم حذف ملف ${p.name} وكل مواعيده وجلساته ومدفوعاته. هل أنت متأكد؟`))
                                                        remove('patients', p.id);
                                                }}
                                            >
                                                حذف
                                            </Button>
                                        </div>
                                    </Td>
                                </tr>
                            );
                        })}
                    </Table>
                )}
            </Card>

            <p className="text-xs text-slate-400">
                آخر إضافة: {db.patients.length ? formatDate(db.patients[db.patients.length - 1].createdAt.slice(0, 10)) : '—'}
            </p>

            <PatientForm open={formOpen} onClose={() => setFormOpen(false)} editing={editing} />
        </div>
    );
}
