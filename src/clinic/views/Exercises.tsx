import React, { useMemo, useState } from 'react';
import { useStore } from '../store';
import { Badge, Button, Card, CardHeader, EmptyState, Field, Input, Modal, Select, Textarea } from '../components/ui';
import type { Exercise, MediaType } from '../types';
import { embedUrl, isDirectVideo, safeUrl } from '../utils';

interface Draft {
    name: string;
    nameEn: string;
    category: string;
    description: string;
    descriptionEn: string;
    mediaType: MediaType;
    mediaUrl: string;
    active: boolean;
}

const emptyDraft = (): Draft => ({
    name: '',
    nameEn: '',
    category: '',
    description: '',
    descriptionEn: '',
    mediaType: 'none',
    mediaUrl: '',
    active: true
});

const MEDIA_LABELS: Record<MediaType, string> = {
    none: 'بدون وسيلة شرح',
    video: 'فيديو (يوتيوب / فيميو / رابط مباشر)',
    image: 'صورة'
};

/** معاينة الوسيلة كما سيراها المريض تمامًا */
function Preview({ type, url }: { type: MediaType; url: string }) {
    const clean = safeUrl(url);
    if (!clean || type === 'none') return null;
    if (type === 'image') return <img src={clean} alt="" className="mt-2 max-h-56 w-full rounded-lg object-cover" />;
    const embed = embedUrl(clean);
    if (embed) {
        return (
            <div className="mt-2 aspect-video w-full overflow-hidden rounded-lg bg-slate-900">
                <iframe src={embed} title="معاينة" className="size-full border-0" allowFullScreen />
            </div>
        );
    }
    if (isDirectVideo(clean)) return <video src={clean} controls preload="metadata" className="mt-2 w-full rounded-lg bg-slate-900" />;
    return <p className="mt-2 text-[11px] text-amber-700">رابط غير قابل للتضمين — سيظهر للمريض كزر يفتح الرابط في صفحة جديدة.</p>;
}

export default function Exercises() {
    const { db, add, update, remove, can } = useStore();
    const [query, setQuery] = useState('');
    const [category, setCategory] = useState('');
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<Exercise | null>(null);
    const [draft, setDraft] = useState<Draft>(emptyDraft());

    const mayWrite = can('exercises', 'create');
    const mayDelete = can('exercises', 'delete');

    const categories = useMemo(() => [...new Set(db.exercises.map((x) => x.category).filter(Boolean))].sort(), [db.exercises]);

    const list = useMemo(() => {
        const q = query.trim().toLowerCase();
        return db.exercises.filter((exercise) => {
            if (category && exercise.category !== category) return false;
            if (!q) return true;
            return [exercise.name, exercise.nameEn, exercise.category].join(' ').toLowerCase().includes(q);
        });
    }, [db.exercises, query, category]);

    const startAdd = () => {
        setEditing(null);
        setDraft(emptyDraft());
        setOpen(true);
    };

    const startEdit = (exercise: Exercise) => {
        setEditing(exercise);
        setDraft({
            name: exercise.name,
            nameEn: exercise.nameEn,
            category: exercise.category,
            description: exercise.description,
            descriptionEn: exercise.descriptionEn,
            mediaType: exercise.mediaType,
            mediaUrl: exercise.mediaUrl,
            active: exercise.active
        });
        setOpen(true);
    };

    const save = () => {
        if (!draft.name.trim()) return;
        if (editing) update('exercises', editing.id, draft);
        else add('exercises', draft);
        setOpen(false);
    };

    const drop = (exercise: Exercise) => {
        const used = db.prescriptions.filter((r) => r.exerciseId === exercise.id).length;
        const warning = used ? `\nتنبيه: هذا التمرين موصوف لـ ${used} مريض وسيُحذف من برامجهم.` : '';
        if (window.confirm(`حذف تمرين "${exercise.name}"؟${warning}`)) remove('exercises', exercise.id);
    };

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader
                    title="مكتبة التمارين المنزلية"
                    subtitle="اكتب التمرين مرة واحدة هنا ثم صفه لأي عدد من المرضى من داخل ملف كل مريض"
                    action={mayWrite ? <Button onClick={startAdd}>+ تمرين جديد</Button> : undefined}
                />
                <div className="flex flex-wrap gap-3 px-4 py-3">
                    <Input placeholder="بحث باسم التمرين…" value={query} onChange={(e) => setQuery(e.target.value)} className="max-w-xs" />
                    <Select value={category} onChange={(e) => setCategory(e.target.value)} className="max-w-56">
                        <option value="">كل الأقسام</option>
                        {categories.map((value) => (
                            <option key={value} value={value}>
                                {value}
                            </option>
                        ))}
                    </Select>
                </div>
            </Card>

            {list.length === 0 ? (
                <Card>
                    <EmptyState
                        title="لا توجد تمارين"
                        hint="أضف تمارينك أو عدّل التمارين الجاهزة لتظهر في تطبيق المريض"
                        action={mayWrite ? <Button onClick={startAdd}>+ تمرين جديد</Button> : undefined}
                    />
                </Card>
            ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {list.map((exercise) => {
                        const used = db.prescriptions.filter((r) => r.exerciseId === exercise.id && r.active).length;
                        return (
                            <Card key={exercise.id} className="flex flex-col p-4">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <h3 className="text-sm font-extrabold text-slate-800">{exercise.name}</h3>
                                        {exercise.nameEn ? (
                                            <p className="text-[11px] text-slate-400" dir="ltr">
                                                {exercise.nameEn}
                                            </p>
                                        ) : null}
                                    </div>
                                    {exercise.active ? null : <Badge className="bg-slate-200 text-slate-600 ring-slate-300">موقوف</Badge>}
                                </div>
                                {exercise.category ? <p className="mt-1 text-[11px] font-semibold text-teal-700">{exercise.category}</p> : null}
                                <p className="mt-1.5 line-clamp-3 grow text-xs leading-relaxed text-slate-600">{exercise.description}</p>
                                <p className="mt-2 text-[11px] text-slate-400">
                                    {exercise.mediaType === 'none' ? 'بدون وسيلة شرح' : exercise.mediaType === 'video' ? '▶ فيديو' : '🖼 صورة'} · موصوف لـ{' '}
                                    {used} مريض
                                </p>
                                <div className="mt-3 flex gap-2">
                                    {mayWrite ? (
                                        <Button variant="secondary" className="grow" onClick={() => startEdit(exercise)}>
                                            تعديل
                                        </Button>
                                    ) : null}
                                    {mayDelete ? (
                                        <Button variant="ghost" className="text-rose-600" onClick={() => drop(exercise)}>
                                            حذف
                                        </Button>
                                    ) : null}
                                </div>
                            </Card>
                        );
                    })}
                </div>
            )}

            <Modal
                open={open}
                title={editing ? 'تعديل تمرين' : 'تمرين جديد'}
                onClose={() => setOpen(false)}
                wide
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setOpen(false)}>
                            إلغاء
                        </Button>
                        <Button onClick={save} disabled={!draft.name.trim()}>
                            حفظ
                        </Button>
                    </>
                }
            >
                <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="اسم التمرين بالعربية">
                        <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                    </Field>
                    <Field label="الاسم بالإنجليزية" hint="يظهر للمرضى الأجانب عند اختيارهم الإنجليزية">
                        <Input value={draft.nameEn} onChange={(e) => setDraft({ ...draft, nameEn: e.target.value })} dir="ltr" />
                    </Field>
                    <Field label="القسم" hint="مثال: العمود الفقري القطني، الركبة، الكتف" className="sm:col-span-2">
                        <Input list="exercise-categories" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} />
                        <datalist id="exercise-categories">
                            {categories.map((value) => (
                                <option key={value} value={value} />
                            ))}
                        </datalist>
                    </Field>
                    <Field label="طريقة الأداء بالعربية" className="sm:col-span-2">
                        <Textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
                    </Field>
                    <Field label="طريقة الأداء بالإنجليزية" className="sm:col-span-2">
                        <Textarea value={draft.descriptionEn} onChange={(e) => setDraft({ ...draft, descriptionEn: e.target.value })} dir="ltr" />
                    </Field>
                    <Field label="نوع وسيلة الشرح">
                        <Select value={draft.mediaType} onChange={(e) => setDraft({ ...draft, mediaType: e.target.value as MediaType })}>
                            {(Object.keys(MEDIA_LABELS) as MediaType[]).map((value) => (
                                <option key={value} value={value}>
                                    {MEDIA_LABELS[value]}
                                </option>
                            ))}
                        </Select>
                    </Field>
                    <Field label="الحالة">
                        <Select value={draft.active ? '1' : '0'} onChange={(e) => setDraft({ ...draft, active: e.target.value === '1' })}>
                            <option value="1">مفعّل</option>
                            <option value="0">موقوف</option>
                        </Select>
                    </Field>
                    {draft.mediaType !== 'none' ? (
                        <Field label="رابط الفيديو أو الصورة" hint="ألصق رابط يوتيوب أو فيميو أو رابط ملف مباشر" className="sm:col-span-2">
                            <Input value={draft.mediaUrl} onChange={(e) => setDraft({ ...draft, mediaUrl: e.target.value })} dir="ltr" placeholder="https://" />
                            <Preview type={draft.mediaType} url={draft.mediaUrl} />
                        </Field>
                    ) : null}
                </div>
            </Modal>
        </div>
    );
}
