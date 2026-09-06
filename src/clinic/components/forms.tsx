import React, { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import type { Appointment, ID, Payment, Session } from '../types';
import { Button, Field, Input, Modal, Select, Textarea } from './ui';
import { todayISO } from '../utils';

export const COMMON_TREATMENTS = [
    'علاج يدوي',
    'تمارين إطالة',
    'تمارين تقوية',
    'موجات تداخلية',
    'موجات فوق صوتية',
    'ليزر علاجي',
    'تنبيه كهربائي (TENS)',
    'جلسة حرارة',
    'كمادات ثلج',
    'تدليك علاجي',
    'سحب فقرات (Traction)',
    'تمارين توازن',
    'المشي على الجهاز',
    'تصحيح قوام'
];

function PatientSelect({ value, onChange, disabled }: { value: ID; onChange: (v: ID) => void; disabled?: boolean }) {
    const { db } = useStore();
    const options = useMemo(() => [...db.patients].sort((a, b) => a.name.localeCompare(b.name, 'ar')), [db.patients]);
    return (
        <Select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
            <option value="">— اختر المريض —</option>
            {options.map((p) => (
                <option key={p.id} value={p.id}>
                    {p.name} ({p.code})
                </option>
            ))}
        </Select>
    );
}

function TherapistSelect({ value, onChange }: { value: ID | ''; onChange: (v: ID | '') => void }) {
    const { db } = useStore();
    return (
        <Select value={value} onChange={(e) => onChange(e.target.value)}>
            <option value="">— غير محدد —</option>
            {db.therapists
                .filter((t) => t.active)
                .map((t) => (
                    <option key={t.id} value={t.id}>
                        {t.name}
                    </option>
                ))}
        </Select>
    );
}

/* ---------------------------------- مواعيد --------------------------------- */

export function AppointmentForm({
    open,
    onClose,
    editing,
    presetPatientId = '',
    presetDate = ''
}: {
    open: boolean;
    onClose: () => void;
    editing?: Appointment | null;
    presetPatientId?: ID;
    presetDate?: string;
}) {
    const { db, add, update } = useStore();
    const blank = () => ({
        patientId: presetPatientId,
        therapistId: '' as ID | '',
        date: presetDate || todayISO(),
        time: db.settings.workStart || '10:00',
        duration: db.settings.defaultDuration || 45,
        status: 'scheduled' as Appointment['status'],
        notes: ''
    });
    const [draft, setDraft] = useState(blank);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!open) return;
        setError('');
        setDraft(editing ? { ...editing } : blank());
    }, [open, editing, presetPatientId, presetDate]);

    const conflict = useMemo(() => {
        if (!draft.date || !draft.time) return null;
        return db.appointments.find(
            (a) =>
                a.id !== editing?.id &&
                a.date === draft.date &&
                a.time === draft.time &&
                a.status !== 'cancelled' &&
                a.therapistId &&
                a.therapistId === draft.therapistId
        );
    }, [db.appointments, draft, editing]);

    const submit = () => {
        if (!draft.patientId) {
            setError('اختر المريض أولًا');
            return;
        }
        if (editing) update('appointments', editing.id, draft);
        else add('appointments', draft);
        onClose();
    };

    return (
        <Modal
            open={open}
            title={editing ? 'تعديل الموعد' : 'حجز موعد جديد'}
            onClose={onClose}
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>
                        إلغاء
                    </Button>
                    <Button onClick={submit}>{editing ? 'حفظ' : 'حجز الموعد'}</Button>
                </>
            }
        >
            {error ? <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</p> : null}
            {conflict ? (
                <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">تنبيه: الأخصائي لديه موعد آخر في نفس التوقيت.</p>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
                <Field label="المريض *" className="sm:col-span-2">
                    <PatientSelect
                        value={draft.patientId}
                        onChange={(v) => setDraft((d) => ({ ...d, patientId: v }))}
                        disabled={Boolean(presetPatientId) && !editing}
                    />
                </Field>
                <Field label="الأخصائي">
                    <TherapistSelect value={draft.therapistId} onChange={(v) => setDraft((d) => ({ ...d, therapistId: v }))} />
                </Field>
                <Field label="الحالة">
                    <Select value={draft.status} onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value as Appointment['status'] }))}>
                        <option value="scheduled">محجوز</option>
                        <option value="done">تم الحضور</option>
                        <option value="cancelled">ملغي</option>
                        <option value="noshow">لم يحضر</option>
                    </Select>
                </Field>
                <Field label="التاريخ">
                    <Input type="date" value={draft.date} onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))} />
                </Field>
                <Field label="الوقت">
                    <Input type="time" value={draft.time} onChange={(e) => setDraft((d) => ({ ...d, time: e.target.value }))} />
                </Field>
                <Field label="المدة (دقيقة)">
                    <Input
                        type="number"
                        min={5}
                        step={5}
                        value={draft.duration}
                        onChange={(e) => setDraft((d) => ({ ...d, duration: Number(e.target.value) }))}
                    />
                </Field>
                <Field label="ملاحظات" className="sm:col-span-2">
                    <Textarea value={draft.notes} onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))} />
                </Field>
            </div>
        </Modal>
    );
}

/* ---------------------------------- جلسات ---------------------------------- */

export function SessionForm({
    open,
    onClose,
    editing,
    presetPatientId = '',
    fromAppointment
}: {
    open: boolean;
    onClose: () => void;
    editing?: Session | null;
    presetPatientId?: ID;
    fromAppointment?: Appointment | null;
}) {
    const { db, add, update } = useStore();
    const blank = () => ({
        patientId: fromAppointment?.patientId || presetPatientId,
        therapistId: (fromAppointment?.therapistId || '') as ID | '',
        appointmentId: (fromAppointment?.id || '') as ID | '',
        date: fromAppointment?.date || todayISO(),
        treatments: [] as string[],
        painBefore: 5,
        painAfter: 3,
        notes: '',
        homeProgram: '',
        price: db.settings.defaultSessionPrice
    });
    const [draft, setDraft] = useState(blank);
    const [custom, setCustom] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        if (!open) return;
        setError('');
        setCustom('');
        if (editing) {
            setDraft({ ...editing });
            return;
        }
        const start = blank();
        const patient = db.patients.find((p) => p.id === start.patientId);
        setDraft({ ...start, price: patient?.sessionPrice ?? start.price });
    }, [open, editing, presetPatientId, fromAppointment]);

    // عند تغيير المريض يُقترح سعر الجلسة المسجّل في ملفه
    const changePatient = (id: ID) => {
        const patient = db.patients.find((p) => p.id === id);
        setDraft((d) => ({ ...d, patientId: id, price: patient?.sessionPrice ?? d.price }));
    };

    const toggle = (name: string) =>
        setDraft((d) => ({ ...d, treatments: d.treatments.includes(name) ? d.treatments.filter((t) => t !== name) : [...d.treatments, name] }));

    const submit = () => {
        if (!draft.patientId) {
            setError('اختر المريض أولًا');
            return;
        }
        if (editing) {
            update('sessions', editing.id, draft);
        } else {
            add('sessions', draft);
            if (draft.appointmentId) update('appointments', draft.appointmentId, { status: 'done' });
        }
        onClose();
    };

    return (
        <Modal
            open={open}
            wide
            title={editing ? 'تعديل الجلسة' : 'تسجيل جلسة علاجية'}
            onClose={onClose}
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>
                        إلغاء
                    </Button>
                    <Button onClick={submit}>{editing ? 'حفظ' : 'حفظ الجلسة'}</Button>
                </>
            }
        >
            {error ? <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</p> : null}
            <div className="grid gap-3 sm:grid-cols-2">
                <Field label="المريض *">
                    <PatientSelect value={draft.patientId} onChange={changePatient} disabled={Boolean(presetPatientId || fromAppointment) && !editing} />
                </Field>
                <Field label="الأخصائي">
                    <TherapistSelect value={draft.therapistId} onChange={(v) => setDraft((d) => ({ ...d, therapistId: v }))} />
                </Field>
                <Field label="تاريخ الجلسة">
                    <Input type="date" value={draft.date} onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))} />
                </Field>
                <Field label={`قيمة الجلسة (${db.settings.currency})`}>
                    <Input type="number" min={0} value={draft.price} onChange={(e) => setDraft((d) => ({ ...d, price: Number(e.target.value) }))} />
                </Field>

                <div className="sm:col-span-2">
                    <span className="mb-1 block text-xs font-semibold text-slate-600">الإجراءات العلاجية</span>
                    <div className="flex flex-wrap gap-1.5">
                        {[...COMMON_TREATMENTS, ...draft.treatments.filter((t) => !COMMON_TREATMENTS.includes(t))].map((name) => {
                            const active = draft.treatments.includes(name);
                            return (
                                <button
                                    key={name}
                                    type="button"
                                    onClick={() => toggle(name)}
                                    className={`cursor-pointer rounded-full px-3 py-1 text-xs font-semibold ring-1 transition ${
                                        active ? 'bg-teal-600 text-white ring-teal-600' : 'bg-white text-slate-600 ring-slate-300 hover:bg-slate-50'
                                    }`}
                                >
                                    {name}
                                </button>
                            );
                        })}
                    </div>
                    <div className="mt-2 flex gap-2">
                        <Input
                            placeholder="إجراء آخر…"
                            value={custom}
                            onChange={(e) => setCustom(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key !== 'Enter') return;
                                e.preventDefault();
                                const name = custom.trim();
                                if (name && !draft.treatments.includes(name)) setDraft((d) => ({ ...d, treatments: [...d.treatments, name] }));
                                setCustom('');
                            }}
                        />
                        <Button
                            variant="secondary"
                            onClick={() => {
                                const name = custom.trim();
                                if (name && !draft.treatments.includes(name)) setDraft((d) => ({ ...d, treatments: [...d.treatments, name] }));
                                setCustom('');
                            }}
                        >
                            إضافة
                        </Button>
                    </div>
                </div>

                <Field label={`مقياس الألم قبل الجلسة: ${draft.painBefore}/10`}>
                    <input
                        type="range"
                        min={0}
                        max={10}
                        value={draft.painBefore}
                        onChange={(e) => setDraft((d) => ({ ...d, painBefore: Number(e.target.value) }))}
                        className="w-full accent-rose-500"
                    />
                </Field>
                <Field label={`مقياس الألم بعد الجلسة: ${draft.painAfter}/10`}>
                    <input
                        type="range"
                        min={0}
                        max={10}
                        value={draft.painAfter}
                        onChange={(e) => setDraft((d) => ({ ...d, painAfter: Number(e.target.value) }))}
                        className="w-full accent-emerald-500"
                    />
                </Field>
                <Field label="ملاحظات الأخصائي" className="sm:col-span-2">
                    <Textarea
                        value={draft.notes}
                        onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                        placeholder="ما تم في الجلسة والاستجابة…"
                    />
                </Field>
                <Field label="البرنامج المنزلي" className="sm:col-span-2">
                    <Textarea
                        value={draft.homeProgram}
                        onChange={(e) => setDraft((d) => ({ ...d, homeProgram: e.target.value }))}
                        placeholder="تمارين يؤديها المريض في المنزل…"
                    />
                </Field>
            </div>
        </Modal>
    );
}

/* --------------------------------- مدفوعات --------------------------------- */

export function PaymentForm({
    open,
    onClose,
    editing,
    presetPatientId = ''
}: {
    open: boolean;
    onClose: () => void;
    editing?: Payment | null;
    presetPatientId?: ID;
}) {
    const { db, add, update } = useStore();
    const blank = () => ({ patientId: presetPatientId, date: todayISO(), amount: 0, method: 'cash' as Payment['method'], notes: '' });
    const [draft, setDraft] = useState(blank);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!open) return;
        setError('');
        setDraft(editing ? { ...editing } : blank());
    }, [open, editing, presetPatientId]);

    const submit = () => {
        if (!draft.patientId) {
            setError('اختر المريض أولًا');
            return;
        }
        if (!draft.amount || draft.amount <= 0) {
            setError('أدخل مبلغًا صحيحًا');
            return;
        }
        if (editing) update('payments', editing.id, draft);
        else add('payments', draft);
        onClose();
    };

    return (
        <Modal
            open={open}
            title={editing ? 'تعديل الدفعة' : 'تسجيل دفعة'}
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
            {error ? <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</p> : null}
            <div className="grid gap-3 sm:grid-cols-2">
                <Field label="المريض *" className="sm:col-span-2">
                    <PatientSelect
                        value={draft.patientId}
                        onChange={(v) => setDraft((d) => ({ ...d, patientId: v }))}
                        disabled={Boolean(presetPatientId) && !editing}
                    />
                </Field>
                <Field label="التاريخ">
                    <Input type="date" value={draft.date} onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))} />
                </Field>
                <Field label={`المبلغ (${db.settings.currency})`}>
                    <Input type="number" min={0} value={draft.amount} onChange={(e) => setDraft((d) => ({ ...d, amount: Number(e.target.value) }))} />
                </Field>
                <Field label="طريقة الدفع">
                    <Select value={draft.method} onChange={(e) => setDraft((d) => ({ ...d, method: e.target.value as Payment['method'] }))}>
                        <option value="cash">نقدي</option>
                        <option value="card">بطاقة</option>
                        <option value="transfer">تحويل</option>
                        <option value="insurance">تأمين</option>
                    </Select>
                </Field>
                <Field label="ملاحظات">
                    <Input value={draft.notes} onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))} />
                </Field>
            </div>
        </Modal>
    );
}
