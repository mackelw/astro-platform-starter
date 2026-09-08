import React, { useMemo, useState } from 'react';
import { useStore } from '../store';
import { Badge, Button, Card, EmptyState, Field, Input, Modal, Select, Textarea } from './ui';
import type { ID, Prescription } from '../types';
import { addDays, todayISO } from '../utils';

interface Draft {
    exerciseId: string;
    sets: number;
    reps: number;
    holdSeconds: number;
    perDay: number;
    daysPerWeek: number;
    startDate: string;
    endDate: string;
    notes: string;
    active: boolean;
}

const emptyDraft = (): Draft => ({
    exerciseId: '',
    sets: 3,
    reps: 10,
    holdSeconds: 0,
    perDay: 2,
    daysPerWeek: 6,
    startDate: todayISO(),
    endDate: '',
    notes: '',
    active: true
});

/** التزام المريض خلال آخر 14 يومًا: نسبة الأيام التي علّم فيها على الإنجاز */
function useAdherence(patientId: ID) {
    const { db } = useStore();
    return useMemo(() => {
        const today = todayISO();
        const days = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13));
        const active = db.prescriptions.filter((r) => r.patientId === patientId && r.active);
        if (active.length === 0) return { percent: 0, days: [] as { date: string; done: number; total: number }[] };

        const rows = days.map((date) => {
            const total = active.filter((r) => r.startDate <= date && (!r.endDate || r.endDate >= date)).length;
            const done = db.exerciseLogs.filter((l) => l.patientId === patientId && l.date === date && l.done).length;
            return { date, done: Math.min(done, total), total };
        });
        const expected = rows.reduce((sum, row) => sum + row.total, 0);
        const achieved = rows.reduce((sum, row) => sum + row.done, 0);
        return { percent: expected ? Math.round((achieved / expected) * 100) : 0, days: rows };
    }, [db.prescriptions, db.exerciseLogs, patientId]);
}

export default function PatientExercises({ patientId }: { patientId: ID }) {
    const { db, add, update, remove, can } = useStore();
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<Prescription | null>(null);
    const [draft, setDraft] = useState<Draft>(emptyDraft());

    const mayWrite = can('prescriptions', 'create');
    const mayDelete = can('prescriptions', 'delete');
    const adherence = useAdherence(patientId);

    const list = useMemo(
        () => db.prescriptions.filter((r) => r.patientId === patientId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        [db.prescriptions, patientId]
    );

    const library = db.exercises.filter((exercise) => exercise.active);
    const exerciseName = (id: string) => db.exercises.find((x) => x.id === id)?.name ?? 'تمرين محذوف';

    const startAdd = () => {
        setEditing(null);
        setDraft({ ...emptyDraft(), exerciseId: library[0]?.id ?? '' });
        setOpen(true);
    };

    const startEdit = (prescription: Prescription) => {
        setEditing(prescription);
        setDraft({
            exerciseId: prescription.exerciseId,
            sets: prescription.sets,
            reps: prescription.reps,
            holdSeconds: prescription.holdSeconds,
            perDay: prescription.perDay,
            daysPerWeek: prescription.daysPerWeek,
            startDate: prescription.startDate,
            endDate: prescription.endDate,
            notes: prescription.notes,
            active: prescription.active
        });
        setOpen(true);
    };

    const save = () => {
        if (!draft.exerciseId) return;
        if (editing) update('prescriptions', editing.id, draft);
        else add('prescriptions', { ...draft, patientId });
        setOpen(false);
    };

    return (
        <div className="space-y-4 px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <p className="text-sm font-bold text-slate-700">البرنامج المنزلي</p>
                    <p className="text-[11px] text-slate-500">ما تضيفه هنا يظهر فورًا في تطبيق المريض مع الفيديو وطريقة الأداء</p>
                </div>
                {mayWrite ? <Button onClick={startAdd}>+ إضافة تمرين للمريض</Button> : null}
            </div>

            {list.length > 0 ? (
                <Card className="p-4">
                    <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-bold text-slate-500">التزام المريض (آخر 14 يومًا)</p>
                        <p className="text-lg font-extrabold text-teal-700">{adherence.percent}%</p>
                    </div>
                    <div className="mt-2 flex gap-1">
                        {adherence.days.map((day) => {
                            const ratio = day.total ? day.done / day.total : 0;
                            const tone = ratio >= 1 ? 'bg-emerald-500' : ratio > 0 ? 'bg-amber-400' : 'bg-slate-200';
                            return <span key={day.date} title={`${day.date}: ${day.done}/${day.total}`} className={`h-6 grow rounded ${tone}`} />;
                        })}
                    </div>
                </Card>
            ) : null}

            {list.length === 0 ? (
                <EmptyState
                    title="لا يوجد برنامج منزلي لهذا المريض"
                    hint={library.length ? 'اختر تمرينًا من المكتبة وحدد الجرعة المناسبة له' : 'أضف تمارين للمكتبة أولًا من شاشة مكتبة التمارين'}
                    action={mayWrite && library.length ? <Button onClick={startAdd}>+ إضافة تمرين</Button> : undefined}
                />
            ) : (
                <div className="space-y-2">
                    {list.map((prescription) => {
                        const doneCount = db.exerciseLogs.filter((l) => l.prescriptionId === prescription.id && l.done).length;
                        const lastLog = db.exerciseLogs
                            .filter((l) => l.prescriptionId === prescription.id && l.done)
                            .sort((a, b) => b.date.localeCompare(a.date))[0];
                        return (
                            <Card key={prescription.id} className="p-3">
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="text-sm font-bold text-slate-800">
                                            {exerciseName(prescription.exerciseId)}{' '}
                                            {prescription.active ? null : <Badge className="bg-slate-200 text-slate-600 ring-slate-300">موقوف</Badge>}
                                        </p>
                                        <p className="mt-0.5 text-[11px] text-slate-500">
                                            {prescription.sets} مجموعات × {prescription.reps} تكرار
                                            {prescription.holdSeconds ? ` · ثبات ${prescription.holdSeconds} ث` : ''} · {prescription.perDay} مرات يوميًا ·{' '}
                                            {prescription.daysPerWeek} أيام أسبوعيًا
                                        </p>
                                        <p className="mt-0.5 text-[11px] text-slate-400">
                                            أنجزه {doneCount} مرة{lastLog ? ` — آخر مرة ${lastLog.date}` : ''}
                                        </p>
                                        {prescription.notes ? <p className="mt-1 text-xs text-amber-800">{prescription.notes}</p> : null}
                                    </div>
                                    <div className="flex gap-1.5">
                                        {mayWrite ? (
                                            <Button variant="secondary" onClick={() => startEdit(prescription)}>
                                                تعديل
                                            </Button>
                                        ) : null}
                                        {mayDelete ? (
                                            <Button
                                                variant="ghost"
                                                className="text-rose-600"
                                                onClick={() => {
                                                    if (window.confirm('حذف هذا التمرين من برنامج المريض؟')) remove('prescriptions', prescription.id);
                                                }}
                                            >
                                                حذف
                                            </Button>
                                        ) : null}
                                    </div>
                                </div>
                            </Card>
                        );
                    })}
                </div>
            )}

            <Modal
                open={open}
                title={editing ? 'تعديل تمرين في البرنامج' : 'إضافة تمرين للبرنامج المنزلي'}
                onClose={() => setOpen(false)}
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setOpen(false)}>
                            إلغاء
                        </Button>
                        <Button onClick={save} disabled={!draft.exerciseId}>
                            حفظ
                        </Button>
                    </>
                }
            >
                <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="التمرين" className="sm:col-span-2">
                        <Select value={draft.exerciseId} onChange={(e) => setDraft({ ...draft, exerciseId: e.target.value })}>
                            <option value="">اختر من المكتبة…</option>
                            {library.map((exercise) => (
                                <option key={exercise.id} value={exercise.id}>
                                    {exercise.category ? `${exercise.category} — ` : ''}
                                    {exercise.name}
                                </option>
                            ))}
                        </Select>
                    </Field>
                    <Field label="عدد المجموعات">
                        <Input type="number" min={0} value={draft.sets} onChange={(e) => setDraft({ ...draft, sets: Number(e.target.value) })} />
                    </Field>
                    <Field label="عدد التكرارات">
                        <Input type="number" min={0} value={draft.reps} onChange={(e) => setDraft({ ...draft, reps: Number(e.target.value) })} />
                    </Field>
                    <Field label="مدة الثبات (ثانية)">
                        <Input type="number" min={0} value={draft.holdSeconds} onChange={(e) => setDraft({ ...draft, holdSeconds: Number(e.target.value) })} />
                    </Field>
                    <Field label="مرات في اليوم">
                        <Input type="number" min={0} value={draft.perDay} onChange={(e) => setDraft({ ...draft, perDay: Number(e.target.value) })} />
                    </Field>
                    <Field label="أيام في الأسبوع">
                        <Input
                            type="number"
                            min={0}
                            max={7}
                            value={draft.daysPerWeek}
                            onChange={(e) => setDraft({ ...draft, daysPerWeek: Number(e.target.value) })}
                        />
                    </Field>
                    <Field label="الحالة">
                        <Select value={draft.active ? '1' : '0'} onChange={(e) => setDraft({ ...draft, active: e.target.value === '1' })}>
                            <option value="1">مفعّل</option>
                            <option value="0">موقوف</option>
                        </Select>
                    </Field>
                    <Field label="يبدأ من">
                        <Input type="date" value={draft.startDate} onChange={(e) => setDraft({ ...draft, startDate: e.target.value })} />
                    </Field>
                    <Field label="ينتهي في" hint="اتركه فارغًا ليستمر بلا نهاية">
                        <Input type="date" value={draft.endDate} onChange={(e) => setDraft({ ...draft, endDate: e.target.value })} />
                    </Field>
                    <Field label="ملاحظة تظهر للمريض" className="sm:col-span-2">
                        <Textarea
                            value={draft.notes}
                            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                            placeholder="مثال: توقف فورًا لو زاد الألم عن 4/10."
                        />
                    </Field>
                </div>
            </Modal>
        </div>
    );
}
