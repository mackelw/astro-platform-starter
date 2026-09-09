import React, { useMemo, useState } from 'react';
import { useStore } from '../store';
import { starterExercises } from '../storage';
import type { BodyRegion, Exercise, ExerciseLevel } from '../types';
import { Badge, Button, Card, CardHeader, EmptyState, Field, Input, Modal, Select, Textarea } from '../components/ui';
import { LEVEL_LABELS, REGION_LABELS, videoEmbed } from '../telerehab';

const REGIONS = Object.keys(REGION_LABELS) as BodyRegion[];
const LEVELS: ExerciseLevel[] = ['easy', 'medium', 'hard'];

type Draft = Omit<Exercise, 'id' | 'createdAt'>;

function emptyDraft(): Draft {
    return {
        name: '',
        nameEn: '',
        summary: '',
        summaryEn: '',
        instructionsEn: '',
        cautions: '',
        cautionsEn: '',
        region: 'general',
        equipment: 'بدون',
        equipmentEn: 'None',
        level: 'easy',
        instructions: '',
        videoUrl: '',
        imageUrl: '',
        defaultSets: 3,
        defaultReps: 10,
        defaultHold: 0,
        defaultPerDay: 1,
        tags: [],
        active: true
    };
}

export function ExerciseForm({ open, onClose, editing }: { open: boolean; onClose: () => void; editing?: Exercise | null }) {
    const { add, update } = useStore();
    const [draft, setDraft] = useState<Draft>(emptyDraft);
    const [tagText, setTagText] = useState('');
    const [key, setKey] = useState('');
    const [showEnglish, setShowEnglish] = useState(false);

    // إعادة تعبئة النموذج عند تغيّر التمرين المفتوح دون useEffect
    const currentKey = `${open}-${editing?.id ?? 'new'}`;
    if (key !== currentKey) {
        setKey(currentKey);
        const source = editing ? { ...editing } : emptyDraft();
        setDraft(source);
        setTagText((editing?.tags ?? []).join('، '));
    }

    const set = <K extends keyof Draft>(field: K, value: Draft[K]) => setDraft((prev) => ({ ...prev, [field]: value }));

    const submit = () => {
        const name = draft.name.trim();
        if (!name) return;
        const payload: Draft = {
            ...draft,
            name,
            tags: tagText
                .split(/[،,]/)
                .map((t) => t.trim())
                .filter(Boolean)
                .slice(0, 12)
        };
        if (editing) update('exercises', editing.id, payload);
        else add('exercises', payload);
        onClose();
    };

    const hasEnglish = Boolean(draft.nameEn || draft.instructionsEn);
    const preview = videoEmbed(draft.videoUrl);

    return (
        <Modal
            open={open}
            onClose={onClose}
            title={editing ? 'تعديل تمرين' : 'تمرين جديد'}
            wide
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>
                        إلغاء
                    </Button>
                    <Button onClick={submit} disabled={!draft.name.trim()}>
                        حفظ
                    </Button>
                </>
            }
        >
            <div className="grid gap-3 sm:grid-cols-2">
                <Field label="اسم التمرين" className="sm:col-span-2">
                    <Input value={draft.name} onChange={(e) => set('name', e.target.value)} placeholder="مثال: جسر الأرداف" />
                </Field>
                <Field label="ملخص الفائدة" hint="سطر واحد يظهر في البطاقات وفي البرنامج المطبوع" className="sm:col-span-2">
                    <Input value={draft.summary} onChange={(e) => set('summary', e.target.value)} placeholder="يقوي عضلات الأرداف التي تحمي أسفل الظهر." />
                </Field>
                <Field label="المنطقة">
                    <Select value={draft.region} onChange={(e) => set('region', e.target.value as BodyRegion)}>
                        {REGIONS.map((r) => (
                            <option key={r} value={r}>
                                {REGION_LABELS[r]}
                            </option>
                        ))}
                    </Select>
                </Field>
                <Field label="الأداة">
                    <Input value={draft.equipment} onChange={(e) => set('equipment', e.target.value)} placeholder="بدون / حبل مقاومة / كرة" />
                </Field>
                <Field label="المستوى">
                    <Select value={draft.level} onChange={(e) => set('level', e.target.value as ExerciseLevel)}>
                        {LEVELS.map((l) => (
                            <option key={l} value={l}>
                                {LEVEL_LABELS[l]}
                            </option>
                        ))}
                    </Select>
                </Field>
                <Field label="كلمات دلالية" hint="افصل بينها بفاصلة — تساعد في البحث">
                    <Input value={tagText} onChange={(e) => setTagText(e.target.value)} placeholder="تقوية، ما بعد الجراحة" />
                </Field>

                <Field label="تعليمات التنفيذ كما تُقرأ للمريض" className="sm:col-span-2">
                    <Textarea value={draft.instructions} onChange={(e) => set('instructions', e.target.value)} />
                </Field>

                <Field label="تحذير السلامة" hint="يظهر للمريض بارزًا: متى يتوقف، وما الخطأ الشائع" className="sm:col-span-2">
                    <Input value={draft.cautions} onChange={(e) => set('cautions', e.target.value)} placeholder="توقف إن سبب دوخة أو تنميلًا في الذراع." />
                </Field>

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 sm:col-span-2">
                    <button
                        type="button"
                        onClick={() => setShowEnglish((v) => !v)}
                        className="flex w-full cursor-pointer items-center justify-between text-xs font-bold text-slate-700"
                    >
                        <span>النص الإنجليزي {hasEnglish ? '✓' : '(اختياري)'}</span>
                        <span aria-hidden="true">{showEnglish ? '▲' : '▼'}</span>
                    </button>
                    <p className="mt-1 text-[11px] text-slate-500">يظهر للمريض الذي يختار الإنجليزية في بوابته. لو تُرك فارغًا يرى النص العربي.</p>
                    {showEnglish ? (
                        <div className="mt-3 grid gap-3" dir="ltr">
                            <Field label="Name">
                                <Input value={draft.nameEn} onChange={(e) => set('nameEn', e.target.value)} placeholder="Glute bridge" />
                            </Field>
                            <Field label="Equipment">
                                <Input value={draft.equipmentEn} onChange={(e) => set('equipmentEn', e.target.value)} placeholder="Mat" />
                            </Field>
                            <Field label="Summary">
                                <Input value={draft.summaryEn} onChange={(e) => set('summaryEn', e.target.value)} />
                            </Field>
                            <Field label="Instructions">
                                <Textarea value={draft.instructionsEn} onChange={(e) => set('instructionsEn', e.target.value)} />
                            </Field>
                            <Field label="Caution">
                                <Input value={draft.cautionsEn} onChange={(e) => set('cautionsEn', e.target.value)} />
                            </Field>
                        </div>
                    ) : null}
                </div>

                <Field label="رابط الفيديو" hint="فيديو المركز على يوتيوب أو فيميو أو ملف mp4 مباشر" className="sm:col-span-2">
                    <Input dir="ltr" value={draft.videoUrl} onChange={(e) => set('videoUrl', e.target.value)} placeholder="https://…" />
                </Field>
                {draft.videoUrl ? (
                    <p className="sm:col-span-2 -mt-2 text-[11px] font-semibold text-slate-500">
                        {preview.kind === 'none'
                            ? 'الرابط غير صالح — يجب أن يبدأ بـ https://'
                            : preview.kind === 'link'
                              ? 'سيظهر للمريض كزر يفتح الرابط في تبويب جديد'
                              : 'سيُعرض الفيديو داخل صفحة المريض مباشرة'}
                    </p>
                ) : null}

                <Field label="رابط صورة توضيحية" className="sm:col-span-2">
                    <Input dir="ltr" value={draft.imageUrl} onChange={(e) => set('imageUrl', e.target.value)} placeholder="https://…" />
                </Field>

                <div className="sm:col-span-2">
                    <p className="mb-2 text-xs font-bold text-slate-600">القيم الافتراضية عند إضافة التمرين لبرنامج</p>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <Field label="مجموعات">
                            <Input type="number" min={0} max={20} value={draft.defaultSets} onChange={(e) => set('defaultSets', Number(e.target.value))} />
                        </Field>
                        <Field label="تكرارات">
                            <Input type="number" min={0} max={300} value={draft.defaultReps} onChange={(e) => set('defaultReps', Number(e.target.value))} />
                        </Field>
                        <Field label="ثبات (ثانية)">
                            <Input type="number" min={0} max={600} value={draft.defaultHold} onChange={(e) => set('defaultHold', Number(e.target.value))} />
                        </Field>
                        <Field label="مرات يوميًا">
                            <Input type="number" min={1} max={10} value={draft.defaultPerDay} onChange={(e) => set('defaultPerDay', Number(e.target.value))} />
                        </Field>
                    </div>
                </div>

                <label className="flex cursor-pointer items-center gap-2 sm:col-span-2">
                    <input type="checkbox" checked={draft.active} onChange={(e) => set('active', e.target.checked)} className="size-4 accent-teal-600" />
                    <span className="text-sm font-semibold text-slate-700">متاح للاستخدام في البرامج</span>
                </label>
            </div>
        </Modal>
    );
}

export default function Exercises() {
    const { db, can, remove, addMany } = useStore();
    const [query, setQuery] = useState('');
    const [region, setRegion] = useState<BodyRegion | 'all'>('all');
    const [showInactive, setShowInactive] = useState(false);
    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState<Exercise | null>(null);
    const [importing, setImporting] = useState(false);

    const canEdit = can('exercises', 'update');

    const list = useMemo(() => {
        const q = query.trim().toLowerCase();
        return db.exercises
            .filter((x) => (showInactive ? true : x.active))
            .filter((x) => (region === 'all' ? true : x.region === region))
            .filter((x) => (q ? [x.name, x.nameEn, x.summary, x.equipment, x.instructions, ...x.tags].join(' ').toLowerCase().includes(q) : true))
            .sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    }, [db.exercises, query, region, showInactive]);

    const counts = useMemo(() => {
        const map = new Map<BodyRegion, number>();
        for (const x of db.exercises) if (x.active) map.set(x.region, (map.get(x.region) ?? 0) + 1);
        return map;
    }, [db.exercises]);

    const importStarter = async () => {
        setImporting(true);
        try {
            const rows = starterExercises().map(({ id, createdAt, ...rest }) => {
                void id;
                void createdAt;
                return rest;
            });
            await addMany('exercises', rows);
        } finally {
            setImporting(false);
        }
    };

    const openNew = () => {
        setEditing(null);
        setFormOpen(true);
    };

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader
                    title="مكتبة التمارين"
                    subtitle={`${db.exercises.filter((x) => x.active).length} تمرين متاح — منها تُبنى البرامج المنزلية`}
                    action={
                        can('exercises', 'create') ? (
                            <div className="flex flex-wrap gap-2">
                                {db.exercises.length === 0 ? (
                                    <Button variant="secondary" onClick={() => void importStarter()} disabled={importing}>
                                        {importing ? 'جارٍ الاستيراد…' : 'استيراد مكتبة أولية'}
                                    </Button>
                                ) : null}
                                <Button onClick={openNew}>+ تمرين جديد</Button>
                            </div>
                        ) : undefined
                    }
                />

                <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 px-4 py-3">
                    <Field label="بحث" className="min-w-48 grow">
                        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="اسم التمرين أو الأداة أو كلمة دلالية" />
                    </Field>
                    <Field label="المنطقة" className="min-w-40">
                        <Select value={region} onChange={(e) => setRegion(e.target.value as BodyRegion | 'all')}>
                            <option value="all">كل المناطق</option>
                            {REGIONS.map((r) => (
                                <option key={r} value={r}>
                                    {REGION_LABELS[r]} {counts.get(r) ? `(${counts.get(r)})` : ''}
                                </option>
                            ))}
                        </Select>
                    </Field>
                    <label className="flex cursor-pointer items-center gap-2 pb-2">
                        <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="size-4 accent-teal-600" />
                        <span className="text-xs font-semibold text-slate-600">إظهار غير المتاح</span>
                    </label>
                </div>

                {list.length === 0 ? (
                    <EmptyState
                        title={db.exercises.length === 0 ? 'المكتبة فارغة' : 'لا نتائج مطابقة'}
                        hint={
                            db.exercises.length === 0
                                ? 'ابدأ بمكتبة أولية جاهزة بالعربية ثم أضف فيديوهات المركز عليها، أو أنشئ تمارينك من الصفر.'
                                : 'جرّب كلمة أخرى أو أزل الفلتر.'
                        }
                        action={
                            can('exercises', 'create') && db.exercises.length === 0 ? (
                                <Button onClick={() => void importStarter()} disabled={importing}>
                                    استيراد مكتبة أولية
                                </Button>
                            ) : undefined
                        }
                    />
                ) : (
                    <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
                        {list.map((x) => (
                            <div key={x.id} className={`rounded-lg border p-3 ${x.active ? 'border-slate-200' : 'border-dashed border-slate-300 bg-slate-50'}`}>
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-bold text-slate-800">{x.name}</p>
                                        <p className="mt-0.5 text-[11px] text-slate-500">
                                            {REGION_LABELS[x.region]} · {LEVEL_LABELS[x.level]} · {x.equipment || 'بدون أداة'}
                                        </p>
                                    </div>
                                    <div className="flex shrink-0 gap-1">
                                        {x.nameEn ? <Badge className="bg-slate-100 text-slate-600 ring-slate-200">EN</Badge> : null}
                                        {x.videoUrl ? <Badge className="bg-teal-50 text-teal-700 ring-teal-200">فيديو</Badge> : null}
                                    </div>
                                </div>

                                {x.summary ? <p className="mt-2 text-xs leading-relaxed text-slate-600">{x.summary}</p> : null}
                                {!x.summary && x.instructions ? (
                                    <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-slate-600">{x.instructions}</p>
                                ) : null}
                                {x.cautions ? <p className="mt-1.5 text-[11px] leading-relaxed text-rose-700">⚠ {x.cautions}</p> : null}

                                <p className="mt-2 text-[11px] font-semibold text-slate-500">
                                    افتراضي: {x.defaultSets} × {x.defaultReps}
                                    {x.defaultHold ? ` — ثبات ${x.defaultHold} ث` : ''}
                                </p>

                                {x.tags.length ? (
                                    <div className="mt-2 flex flex-wrap gap-1">
                                        {x.tags.map((tag) => (
                                            <span key={tag} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                                                {tag}
                                            </span>
                                        ))}
                                    </div>
                                ) : null}

                                {canEdit ? (
                                    <div className="mt-3 flex gap-1 border-t border-slate-100 pt-2">
                                        <Button
                                            variant="ghost"
                                            className="px-2 py-1 text-xs"
                                            onClick={() => {
                                                setEditing(x);
                                                setFormOpen(true);
                                            }}
                                        >
                                            تعديل
                                        </Button>
                                        {can('exercises', 'delete') ? (
                                            <Button
                                                variant="ghost"
                                                className="px-2 py-1 text-xs text-rose-600 hover:bg-rose-50"
                                                onClick={() => {
                                                    const used = db.programs.some((p) => p.items.some((i) => i.exerciseId === x.id));
                                                    const message = used
                                                        ? `«${x.name}» مستخدم في برامج قائمة وسيظهر فيها كتمرين محذوف. حذفه نهائيًا؟`
                                                        : `حذف «${x.name}» من المكتبة؟`;
                                                    if (window.confirm(message)) remove('exercises', x.id);
                                                }}
                                            >
                                                حذف
                                            </Button>
                                        ) : null}
                                    </div>
                                ) : null}
                            </div>
                        ))}
                    </div>
                )}
            </Card>

            <ExerciseForm
                open={formOpen}
                editing={editing}
                onClose={() => {
                    setFormOpen(false);
                    setEditing(null);
                }}
            />
        </div>
    );
}
