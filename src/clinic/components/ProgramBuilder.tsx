import React, { useMemo, useState } from 'react';
import { useStore } from '../store';
import { uid } from '../storage';
import type { BodyRegion, Exercise, Program, ProgramItem, ProgramStatus, ProgramTemplate, PromTemplateId, Side } from '../types';
import { Badge, Button, Field, Input, Modal, Select, Textarea } from './ui';
import { PROM_TEMPLATES } from '../prom';
import { itemSummary, LEVEL_LABELS, REGION_LABELS, SIDE_LABELS } from '../telerehab';
import { addDays, todayISO } from '../utils';

const REGIONS = Object.keys(REGION_LABELS) as BodyRegion[];
const SIDES: Side[] = ['both', 'right', 'left'];
const STATUSES: ProgramStatus[] = ['active', 'paused', 'done'];
const STATUS_LABELS: Record<ProgramStatus, string> = { active: 'نشط', paused: 'موقوف مؤقتًا', done: 'منتهٍ' };

type Draft = {
    title: string;
    startDate: string;
    endDate: string;
    daysPerWeek: number;
    status: ProgramStatus;
    notes: string;
    items: ProgramItem[];
    proms: PromTemplateId[];
};

function itemFromExercise(exercise: Exercise): ProgramItem {
    return {
        id: uid('i_'),
        exerciseId: exercise.id,
        sets: exercise.defaultSets,
        reps: exercise.defaultReps,
        hold: exercise.defaultHold,
        rest: 30,
        perDay: exercise.defaultPerDay || 1,
        side: 'both',
        resistance: '',
        note: ''
    };
}

function emptyDraft(): Draft {
    return {
        title: 'برنامج منزلي',
        startDate: todayISO(),
        endDate: addDays(todayISO(), 28),
        daysPerWeek: 5,
        status: 'active',
        notes: '',
        items: [],
        proms: []
    };
}

/** صف تمرين داخل البرنامج مع كل بارامتراته */
function ItemRow({
    item,
    exercise,
    index,
    total,
    onChange,
    onMove,
    onRemove
}: {
    item: ProgramItem;
    exercise: Exercise | undefined;
    index: number;
    total: number;
    onChange: (patch: Partial<ProgramItem>) => void;
    onMove: (direction: -1 | 1) => void;
    onRemove: () => void;
}) {
    const [open, setOpen] = useState(false);
    const num = (value: string, max: number) => Math.max(0, Math.min(max, Math.round(Number(value) || 0)));

    return (
        <li className="rounded-lg border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-teal-50 text-[11px] font-bold text-teal-700">
                        {index + 1}
                    </span>
                    <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-800">{exercise?.name ?? 'تمرين محذوف من المكتبة'}</p>
                        <p className="truncate text-[11px] text-slate-500">{itemSummary(item)}</p>
                    </div>
                </div>
                <div className="flex shrink-0 gap-1">
                    <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setOpen((v) => !v)}>
                        {open ? 'إخفاء' : 'ضبط'}
                    </Button>
                    <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => onMove(-1)} disabled={index === 0} aria-label="لأعلى">
                        ↑
                    </Button>
                    <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => onMove(1)} disabled={index === total - 1} aria-label="لأسفل">
                        ↓
                    </Button>
                    <Button variant="ghost" className="px-2 py-1 text-xs text-rose-600 hover:bg-rose-50" onClick={onRemove}>
                        حذف
                    </Button>
                </div>
            </div>

            {open ? (
                <div className="grid gap-3 border-t border-slate-100 px-3 py-3 sm:grid-cols-2 lg:grid-cols-3">
                    <Field label="مجموعات">
                        <Input type="number" min={0} max={20} value={item.sets} onChange={(e) => onChange({ sets: num(e.target.value, 20) })} />
                    </Field>
                    <Field label="تكرارات">
                        <Input type="number" min={0} max={300} value={item.reps} onChange={(e) => onChange({ reps: num(e.target.value, 300) })} />
                    </Field>
                    <Field label="ثبات (ث)">
                        <Input type="number" min={0} max={600} value={item.hold} onChange={(e) => onChange({ hold: num(e.target.value, 600) })} />
                    </Field>
                    <Field label="راحة (ث)">
                        <Input type="number" min={0} max={600} value={item.rest} onChange={(e) => onChange({ rest: num(e.target.value, 600) })} />
                    </Field>
                    <Field label="مرات يوميًا">
                        <Input
                            type="number"
                            min={1}
                            max={10}
                            value={item.perDay}
                            onChange={(e) => onChange({ perDay: Math.max(1, num(e.target.value, 10)) })}
                        />
                    </Field>
                    <Field label="الجهة">
                        <Select value={item.side} onChange={(e) => onChange({ side: e.target.value as Side })}>
                            {SIDES.map((s) => (
                                <option key={s} value={s}>
                                    {SIDE_LABELS[s]}
                                </option>
                            ))}
                        </Select>
                    </Field>
                    <Field label="المقاومة" className="sm:col-span-2 lg:col-span-3">
                        <Input value={item.resistance} onChange={(e) => onChange({ resistance: e.target.value })} placeholder="حبل أحمر / 2 كجم" />
                    </Field>
                    <Field label="ملاحظة تظهر للمريض تحت هذا التمرين" className="sm:col-span-2 lg:col-span-3">
                        <Input value={item.note} onChange={(e) => onChange({ note: e.target.value })} placeholder="توقف عند أي ألم حاد" />
                    </Field>
                </div>
            ) : null}
        </li>
    );
}

export default function ProgramBuilder({
    open,
    onClose,
    patientId,
    editing
}: {
    open: boolean;
    onClose: () => void;
    patientId: string;
    editing?: Program | null;
}) {
    const { db, add, update, user, can } = useStore();
    const [draft, setDraft] = useState<Draft>(emptyDraft);
    const [key, setKey] = useState('');
    const [query, setQuery] = useState('');
    const [region, setRegion] = useState<BodyRegion | 'all'>('all');
    const [templateName, setTemplateName] = useState('');

    const currentKey = `${open}-${editing?.id ?? 'new'}`;
    if (key !== currentKey) {
        setKey(currentKey);
        setQuery('');
        setRegion('all');
        setTemplateName('');
        if (editing) {
            setDraft({
                title: editing.title,
                startDate: editing.startDate,
                endDate: editing.endDate,
                daysPerWeek: editing.daysPerWeek,
                status: editing.status,
                notes: editing.notes,
                items: editing.items.map((i) => ({ ...i })),
                proms: [...editing.proms]
            });
        } else {
            setDraft(emptyDraft());
        }
    }

    const exerciseById = useMemo(() => new Map(db.exercises.map((x) => [x.id, x])), [db.exercises]);

    const results = useMemo(() => {
        const q = query.trim().toLowerCase();
        const chosen = new Set(draft.items.map((i) => i.exerciseId));
        return db.exercises
            .filter((x) => x.active && !chosen.has(x.id))
            .filter((x) => (region === 'all' ? true : x.region === region))
            .filter((x) => (q ? [x.name, x.equipment, ...x.tags].join(' ').toLowerCase().includes(q) : true))
            .slice(0, 40);
    }, [db.exercises, draft.items, query, region]);

    const setField = <K extends keyof Draft>(field: K, value: Draft[K]) => setDraft((prev) => ({ ...prev, [field]: value }));

    const addExercise = (exercise: Exercise) => setDraft((prev) => ({ ...prev, items: [...prev.items, itemFromExercise(exercise)] }));

    const patchItem = (id: string, patch: Partial<ProgramItem>) =>
        setDraft((prev) => ({ ...prev, items: prev.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) }));

    const moveItem = (index: number, direction: -1 | 1) =>
        setDraft((prev) => {
            const next = [...prev.items];
            const target = index + direction;
            if (target < 0 || target >= next.length) return prev;
            [next[index], next[target]] = [next[target], next[index]];
            return { ...prev, items: next };
        });

    const applyTemplate = (template: ProgramTemplate) =>
        setDraft((prev) => ({
            ...prev,
            title: template.title,
            daysPerWeek: template.daysPerWeek,
            notes: template.notes,
            proms: [...template.proms],
            // معرّفات جديدة حتى لا يشترك برنامجان في نفس معرّف السطر
            items: template.items.map((i) => ({ ...i, id: uid('i_') }))
        }));

    const saveAsTemplate = () => {
        const title = templateName.trim();
        if (!title || !can('programTemplates', 'create')) return;
        add('programTemplates', {
            title,
            diagnosis: db.patients.find((p) => p.id === patientId)?.diagnosis ?? '',
            daysPerWeek: draft.daysPerWeek,
            notes: draft.notes,
            items: draft.items.map((i) => ({ ...i })),
            proms: [...draft.proms]
        });
        setTemplateName('');
    };

    const submit = () => {
        const payload = {
            patientId,
            therapistId: user?.therapistId ?? '',
            title: draft.title.trim() || 'برنامج منزلي',
            startDate: draft.startDate,
            endDate: draft.endDate,
            daysPerWeek: Math.max(1, Math.min(7, draft.daysPerWeek)),
            status: draft.status,
            notes: draft.notes,
            items: draft.items,
            proms: draft.proms
        };
        if (editing) update('programs', editing.id, payload);
        else add('programs', payload);
        onClose();
    };

    return (
        <Modal
            open={open}
            onClose={onClose}
            wide
            title={editing ? 'تعديل البرنامج المنزلي' : 'برنامج منزلي جديد'}
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>
                        إلغاء
                    </Button>
                    <Button onClick={submit} disabled={draft.items.length === 0}>
                        {draft.items.length === 0 ? 'أضف تمرينًا أولًا' : 'حفظ البرنامج'}
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                {!editing && db.programTemplates.length > 0 ? (
                    <div className="rounded-lg bg-teal-50 p-3">
                        <p className="mb-2 text-xs font-bold text-teal-800">ابدأ من بروتوكول جاهز</p>
                        <div className="flex flex-wrap gap-2">
                            {db.programTemplates.map((t) => (
                                <button
                                    key={t.id}
                                    type="button"
                                    onClick={() => applyTemplate(t)}
                                    className="cursor-pointer rounded-lg border border-teal-200 bg-white px-3 py-1.5 text-xs font-semibold text-teal-800 transition hover:bg-teal-100"
                                >
                                    {t.title} <span className="text-teal-500">({t.items.length} تمرين)</span>
                                </button>
                            ))}
                        </div>
                    </div>
                ) : null}

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Field label="عنوان البرنامج" className="sm:col-span-2">
                        <Input value={draft.title} onChange={(e) => setField('title', e.target.value)} />
                    </Field>
                    <Field label="يبدأ في">
                        <Input type="date" value={draft.startDate} onChange={(e) => setField('startDate', e.target.value)} />
                    </Field>
                    <Field label="ينتهي في">
                        <Input type="date" value={draft.endDate} onChange={(e) => setField('endDate', e.target.value)} />
                    </Field>
                    <Field label="أيام التدريب أسبوعيًا">
                        <Select value={draft.daysPerWeek} onChange={(e) => setField('daysPerWeek', Number(e.target.value))}>
                            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                                <option key={n} value={n}>
                                    {n} أيام
                                </option>
                            ))}
                        </Select>
                    </Field>
                    <Field label="الحالة">
                        <Select value={draft.status} onChange={(e) => setField('status', e.target.value as ProgramStatus)}>
                            {STATUSES.map((s) => (
                                <option key={s} value={s}>
                                    {STATUS_LABELS[s]}
                                </option>
                            ))}
                        </Select>
                    </Field>
                    <Field label="تعليمات عامة تظهر للمريض أعلى برنامجه" className="sm:col-span-2 lg:col-span-4">
                        <Textarea
                            className="min-h-16"
                            value={draft.notes}
                            onChange={(e) => setField('notes', e.target.value)}
                            placeholder="توقف عن أي تمرين يسبب ألمًا حادًا وأبلغ الأخصائي."
                        />
                    </Field>
                </div>

                <div>
                    <p className="mb-2 text-xs font-bold text-slate-600">استبيانات تُطلب من المريض خلال البرنامج</p>
                    <div className="flex flex-wrap gap-2">
                        {PROM_TEMPLATES.map((t) => {
                            const on = draft.proms.includes(t.id);
                            return (
                                <button
                                    key={t.id}
                                    type="button"
                                    onClick={() => setField('proms', on ? draft.proms.filter((p) => p !== t.id) : [...draft.proms, t.id])}
                                    className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                                        on ? 'border-teal-600 bg-teal-600 text-white' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                                    }`}
                                    title={t.name}
                                >
                                    {t.short} — {t.name}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
                    <div>
                        <p className="mb-2 text-xs font-bold text-slate-600">تمارين البرنامج ({draft.items.length})</p>
                        {draft.items.length === 0 ? (
                            <p className="rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center text-xs text-slate-500">
                                اختر تمارين من المكتبة على اليسار لتظهر هنا بالترتيب الذي ينفّذه المريض.
                            </p>
                        ) : (
                            <ul className="space-y-2">
                                {draft.items.map((item, index) => (
                                    <ItemRow
                                        key={item.id}
                                        item={item}
                                        exercise={exerciseById.get(item.exerciseId)}
                                        index={index}
                                        total={draft.items.length}
                                        onChange={(patch) => patchItem(item.id, patch)}
                                        onMove={(direction) => moveItem(index, direction)}
                                        onRemove={() =>
                                            setField(
                                                'items',
                                                draft.items.filter((i) => i.id !== item.id)
                                            )
                                        }
                                    />
                                ))}
                            </ul>
                        )}

                        {can('programTemplates', 'create') && draft.items.length > 0 ? (
                            <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg bg-slate-50 p-3">
                                <Field label="حفظ هذا البرنامج كبروتوكول جاهز" className="min-w-48 grow">
                                    <Input value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="اسم البروتوكول" />
                                </Field>
                                <Button variant="secondary" onClick={saveAsTemplate} disabled={!templateName.trim()}>
                                    حفظ كبروتوكول
                                </Button>
                            </div>
                        ) : null}
                    </div>

                    <div className="rounded-lg border border-slate-200">
                        <div className="space-y-2 border-b border-slate-200 p-3">
                            <p className="text-xs font-bold text-slate-600">المكتبة</p>
                            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث عن تمرين…" />
                            <Select value={region} onChange={(e) => setRegion(e.target.value as BodyRegion | 'all')}>
                                <option value="all">كل المناطق</option>
                                {REGIONS.map((r) => (
                                    <option key={r} value={r}>
                                        {REGION_LABELS[r]}
                                    </option>
                                ))}
                            </Select>
                        </div>
                        <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto">
                            {results.length === 0 ? (
                                <li className="px-3 py-6 text-center text-xs text-slate-500">
                                    {db.exercises.length === 0 ? 'المكتبة فارغة — أضف تمارين من شاشة التمارين أولًا.' : 'لا نتائج مطابقة.'}
                                </li>
                            ) : (
                                results.map((x) => (
                                    <li key={x.id}>
                                        <button
                                            type="button"
                                            onClick={() => addExercise(x)}
                                            className="flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2 text-right transition hover:bg-teal-50"
                                        >
                                            <span className="min-w-0">
                                                <span className="block truncate text-sm font-semibold text-slate-700">{x.name}</span>
                                                <span className="block text-[11px] text-slate-500">
                                                    {REGION_LABELS[x.region]} · {LEVEL_LABELS[x.level]}
                                                </span>
                                            </span>
                                            <Badge className="shrink-0 bg-teal-50 text-teal-700 ring-teal-200">+</Badge>
                                        </button>
                                    </li>
                                ))
                            )}
                        </ul>
                    </div>
                </div>
            </div>
        </Modal>
    );
}
