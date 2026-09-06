import React, { useRef, useState } from 'react';
import { useStore } from '../store';
import type { Therapist } from '../types';
import { Button, Card, CardHeader, EmptyState, Field, Input, Modal, Table, Td } from '../components/ui';
import { downloadFile, todayISO } from '../utils';

function TherapistForm({ open, onClose, editing }: { open: boolean; onClose: () => void; editing: Therapist | null }) {
    const { add, update } = useStore();
    const [draft, setDraft] = useState({ name: '', phone: '', specialty: '', active: true });

    React.useEffect(() => {
        if (!open) return;
        setDraft(editing ? { ...editing } : { name: '', phone: '', specialty: '', active: true });
    }, [open, editing]);

    const submit = () => {
        if (!draft.name.trim()) return;
        if (editing) update('therapists', editing.id, draft);
        else add('therapists', draft);
        onClose();
    };

    return (
        <Modal
            open={open}
            title={editing ? 'تعديل بيانات الأخصائي' : 'إضافة أخصائي'}
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
                <Field label="الاسم *" className="sm:col-span-2">
                    <Input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
                </Field>
                <Field label="الهاتف">
                    <Input value={draft.phone} onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))} inputMode="tel" />
                </Field>
                <Field label="التخصص">
                    <Input value={draft.specialty} onChange={(e) => setDraft((d) => ({ ...d, specialty: e.target.value }))} />
                </Field>
                <label className="flex items-center gap-2 text-sm text-slate-600 sm:col-span-2">
                    <input
                        type="checkbox"
                        className="size-4 accent-teal-600"
                        checked={draft.active}
                        onChange={(e) => setDraft((d) => ({ ...d, active: e.target.checked }))}
                    />
                    على رأس العمل
                </label>
            </div>
        </Modal>
    );
}

export default function Settings() {
    const { db, updateSettings, remove, replaceAll, resetToSeed, clearAll } = useStore();
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<Therapist | null>(null);
    const [message, setMessage] = useState('');
    const fileRef = useRef<HTMLInputElement>(null);

    const backup = () => {
        downloadFile(`clinic-backup-${todayISO()}.json`, JSON.stringify(db, null, 2));
        setMessage('تم تنزيل نسخة احتياطية من كل البيانات.');
    };

    const restore = (file: File) => {
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const parsed = JSON.parse(String(reader.result));
                if (!parsed || typeof parsed !== 'object') throw new Error('bad');
                replaceAll(parsed);
                setMessage('تم استرجاع البيانات من النسخة الاحتياطية بنجاح.');
            } catch {
                setMessage('تعذر قراءة الملف — تأكد أنه ملف نسخة احتياطية صالح.');
            }
        };
        reader.readAsText(file);
    };

    return (
        <div className="space-y-5">
            <div>
                <h2 className="text-xl font-extrabold text-slate-800">الإعدادات</h2>
                <p className="mt-1 text-sm text-slate-500">بيانات العيادة وفريق العمل والنسخ الاحتياطي</p>
            </div>

            {message ? <p className="rounded-lg bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-800">{message}</p> : null}

            <Card>
                <CardHeader title="بيانات العيادة" subtitle="تظهر في التقارير المطبوعة" />
                <div className="grid gap-3 px-4 py-4 sm:grid-cols-2">
                    <Field label="اسم العيادة">
                        <Input value={db.settings.name} onChange={(e) => updateSettings({ name: e.target.value })} />
                    </Field>
                    <Field label="الهاتف">
                        <Input value={db.settings.phone} onChange={(e) => updateSettings({ phone: e.target.value })} />
                    </Field>
                    <Field label="العنوان" className="sm:col-span-2">
                        <Input value={db.settings.address} onChange={(e) => updateSettings({ address: e.target.value })} />
                    </Field>
                    <Field label="العملة">
                        <Input value={db.settings.currency} onChange={(e) => updateSettings({ currency: e.target.value })} />
                    </Field>
                    <Field label="سعر الجلسة الافتراضي">
                        <Input
                            type="number"
                            min={0}
                            value={db.settings.defaultSessionPrice}
                            onChange={(e) => updateSettings({ defaultSessionPrice: Number(e.target.value) })}
                        />
                    </Field>
                    <Field label="مدة الجلسة الافتراضية (دقيقة)">
                        <Input
                            type="number"
                            min={5}
                            step={5}
                            value={db.settings.defaultDuration}
                            onChange={(e) => updateSettings({ defaultDuration: Number(e.target.value) })}
                        />
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="بداية العمل">
                            <Input type="time" value={db.settings.workStart} onChange={(e) => updateSettings({ workStart: e.target.value })} />
                        </Field>
                        <Field label="نهاية العمل">
                            <Input type="time" value={db.settings.workEnd} onChange={(e) => updateSettings({ workEnd: e.target.value })} />
                        </Field>
                    </div>
                </div>
            </Card>

            <Card>
                <CardHeader
                    title="الأخصائيون"
                    subtitle={`${db.therapists.length} أخصائي مسجل`}
                    action={
                        <Button
                            onClick={() => {
                                setEditing(null);
                                setOpen(true);
                            }}
                        >
                            + إضافة أخصائي
                        </Button>
                    }
                />
                {db.therapists.length === 0 ? (
                    <EmptyState title="لا يوجد أخصائيون" hint="أضف فريق العمل لتتمكن من إسناد المواعيد والجلسات" />
                ) : (
                    <Table head={['الاسم', 'التخصص', 'الهاتف', 'الحالة', '']}>
                        {db.therapists.map((t) => (
                            <tr key={t.id}>
                                <Td className="font-semibold text-slate-700">{t.name}</Td>
                                <Td className="text-slate-500">{t.specialty || '—'}</Td>
                                <Td dir="ltr" className="text-right text-slate-500">
                                    {t.phone || '—'}
                                </Td>
                                <Td>{t.active ? <span className="text-emerald-600">على رأس العمل</span> : <span className="text-slate-400">غير نشط</span>}</Td>
                                <Td className="text-left">
                                    <div className="flex justify-end gap-1">
                                        <Button
                                            variant="ghost"
                                            className="px-2 py-1 text-xs"
                                            onClick={() => {
                                                setEditing(t);
                                                setOpen(true);
                                            }}
                                        >
                                            تعديل
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            className="px-2 py-1 text-xs text-rose-600 hover:bg-rose-50"
                                            onClick={() => window.confirm(`حذف ${t.name}؟`) && remove('therapists', t.id)}
                                        >
                                            حذف
                                        </Button>
                                    </div>
                                </Td>
                            </tr>
                        ))}
                    </Table>
                )}
            </Card>

            <Card>
                <CardHeader title="النسخ الاحتياطي والبيانات" subtitle="كل البيانات محفوظة على هذا الجهاز فقط داخل المتصفح" />
                <div className="flex flex-wrap gap-2 px-4 py-4">
                    <Button onClick={backup}>تنزيل نسخة احتياطية (JSON)</Button>
                    <Button variant="secondary" onClick={() => fileRef.current?.click()}>
                        استرجاع من ملف
                    </Button>
                    <input
                        ref={fileRef}
                        type="file"
                        accept="application/json,.json"
                        className="hidden"
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) restore(file);
                            e.target.value = '';
                        }}
                    />
                    <Button
                        variant="secondary"
                        onClick={() => {
                            if (window.confirm('سيتم استبدال البيانات الحالية ببيانات تجريبية. متأكد؟')) {
                                resetToSeed();
                                setMessage('تمت إعادة تحميل البيانات التجريبية.');
                            }
                        }}
                    >
                        إعادة البيانات التجريبية
                    </Button>
                    <Button
                        variant="danger"
                        onClick={() => {
                            if (window.confirm('سيتم حذف كل المرضى والمواعيد والجلسات والحسابات نهائيًا. متأكد؟')) {
                                clearAll();
                                setMessage('تم مسح كل البيانات. يمكنك البدء من جديد.');
                            }
                        }}
                    >
                        مسح كل البيانات
                    </Button>
                </div>
                <p className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
                    نصيحة: نزّل نسخة احتياطية بشكل دوري واحتفظ بها خارج الجهاز، لأن مسح بيانات المتصفح يؤدي إلى فقدان السجلات.
                </p>
            </Card>

            <TherapistForm open={open} onClose={() => setOpen(false)} editing={editing} />
        </div>
    );
}
