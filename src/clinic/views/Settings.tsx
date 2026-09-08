import React, { useRef, useState } from 'react';
import { useStore } from '../store';
import type { Service, Therapist } from '../types';
import { Badge, Button, Card, CardHeader, EmptyState, Field, Input, Modal, Select, Table, Td, Textarea } from '../components/ui';
import { downloadFile, money, todayISO } from '../utils';
import { MODE } from '../api';
import Users from './Users';

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

interface ServiceDraft {
    name: string;
    nameEn: string;
    description: string;
    descriptionEn: string;
    price: number;
    duration: number;
    homeVisit: boolean;
    active: boolean;
}

const emptyService = (duration: number, price: number): ServiceDraft => ({
    name: '',
    nameEn: '',
    description: '',
    descriptionEn: '',
    price,
    duration,
    homeVisit: false,
    active: true
});

/** الخدمات المعلنة في تطبيق المريض بأسعارها — منها يختار عند طلب الحجز */
function ServicesCard() {
    const { db, add, update, remove, can } = useStore();
    const mayWrite = can('services', 'create');
    const mayDelete = can('services', 'delete');
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<Service | null>(null);
    const [draft, setDraft] = useState<ServiceDraft>(() => emptyService(45, 0));

    const startAdd = () => {
        setEditing(null);
        setDraft(emptyService(db.settings.defaultDuration, db.settings.defaultSessionPrice));
        setOpen(true);
    };

    const startEdit = (service: Service) => {
        setEditing(service);
        setDraft({
            name: service.name,
            nameEn: service.nameEn,
            description: service.description,
            descriptionEn: service.descriptionEn,
            price: service.price,
            duration: service.duration,
            homeVisit: service.homeVisit,
            active: service.active
        });
        setOpen(true);
    };

    const save = () => {
        if (!draft.name.trim()) return;
        if (editing) update('services', editing.id, draft);
        else add('services', draft);
        setOpen(false);
    };

    return (
        <Card>
            <CardHeader
                title="الخدمات والأسعار"
                subtitle="تظهر للمريض في التطبيق بأسعارها، ويختار منها عند طلب الحجز"
                action={mayWrite ? <Button onClick={startAdd}>+ خدمة جديدة</Button> : undefined}
            />
            {db.services.length === 0 ? (
                <EmptyState title="لا توجد خدمات مضافة" hint="أضف خدمات المركز وأسعارها لتظهر في تطبيق المريض" />
            ) : (
                <Table head={['الخدمة', 'السعر', 'المدة', 'زيارة منزلية', 'الحالة', '']}>
                    {db.services.map((service) => (
                        <tr key={service.id} className="hover:bg-slate-50">
                            <Td>
                                <span className="font-semibold text-slate-700">{service.name}</span>
                                {service.nameEn ? (
                                    <span className="block text-[11px] text-slate-400" dir="ltr">
                                        {service.nameEn}
                                    </span>
                                ) : null}
                            </Td>
                            <Td className="text-slate-600">{money(service.price, db.settings.currency)}</Td>
                            <Td className="text-slate-600">{service.duration} د</Td>
                            <Td>{service.homeVisit ? <span className="text-emerald-600">متاحة</span> : <span className="text-slate-400">لا</span>}</Td>
                            <Td>
                                {service.active ? (
                                    <span className="text-emerald-600">معروضة</span>
                                ) : (
                                    <Badge className="bg-slate-200 text-slate-600 ring-slate-300">مخفية</Badge>
                                )}
                            </Td>
                            <Td className="text-left">
                                <div className="flex justify-end gap-1">
                                    {mayWrite ? (
                                        <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => startEdit(service)}>
                                            تعديل
                                        </Button>
                                    ) : null}
                                    {mayDelete ? (
                                        <Button
                                            variant="ghost"
                                            className="px-2 py-1 text-xs text-rose-600 hover:bg-rose-50"
                                            onClick={() => {
                                                if (window.confirm(`حذف خدمة "${service.name}"؟`)) remove('services', service.id);
                                            }}
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

            <Modal
                open={open}
                title={editing ? 'تعديل خدمة' : 'خدمة جديدة'}
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
                    <Field label="اسم الخدمة بالعربية">
                        <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                    </Field>
                    <Field label="الاسم بالإنجليزية">
                        <Input value={draft.nameEn} onChange={(e) => setDraft({ ...draft, nameEn: e.target.value })} dir="ltr" />
                    </Field>
                    <Field label="الوصف بالعربية" className="sm:col-span-2">
                        <Textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
                    </Field>
                    <Field label="الوصف بالإنجليزية" className="sm:col-span-2">
                        <Textarea value={draft.descriptionEn} onChange={(e) => setDraft({ ...draft, descriptionEn: e.target.value })} dir="ltr" />
                    </Field>
                    <Field label="السعر">
                        <Input type="number" min={0} value={draft.price} onChange={(e) => setDraft({ ...draft, price: Number(e.target.value) })} />
                    </Field>
                    <Field label="المدة (دقيقة)">
                        <Input
                            type="number"
                            min={5}
                            step={5}
                            value={draft.duration}
                            onChange={(e) => setDraft({ ...draft, duration: Number(e.target.value) })}
                        />
                    </Field>
                    <Field label="متاحة كزيارة منزلية">
                        <Select value={draft.homeVisit ? '1' : '0'} onChange={(e) => setDraft({ ...draft, homeVisit: e.target.value === '1' })}>
                            <option value="0">لا</option>
                            <option value="1">نعم</option>
                        </Select>
                    </Field>
                    <Field label="الحالة">
                        <Select value={draft.active ? '1' : '0'} onChange={(e) => setDraft({ ...draft, active: e.target.value === '1' })}>
                            <option value="1">معروضة في التطبيق</option>
                            <option value="0">مخفية</option>
                        </Select>
                    </Field>
                </div>
            </Modal>
        </Card>
    );
}

export default function Settings() {
    const { db, user, updateSettings, remove, replaceAll, resetToSeed, clearAll, can } = useStore();
    const isLocal = MODE === 'local';
    const canEditSettings = can('settings', 'update');
    const canManageTherapists = can('therapists', 'create');
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<Therapist | null>(null);
    const [message, setMessage] = useState('');
    const fileRef = useRef<HTMLInputElement>(null);

    const backup = () => {
        void downloadFile(`clinic-backup-${todayISO()}.json`, JSON.stringify(db, null, 2));
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
                <p className="mt-1 text-sm text-slate-500">
                    {isLocal ? 'بيانات المركز وفريق العمل والنسخ الاحتياطي' : 'بيانات المركز وفريق العمل والمستخدمون والنسخ الاحتياطي'}
                </p>
            </div>

            {message ? <p className="rounded-lg bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-800">{message}</p> : null}

            <Card>
                <CardHeader title="بيانات العيادة" subtitle="تظهر في التقارير المطبوعة" />
                <div className="grid gap-3 px-4 py-4 sm:grid-cols-2">
                    <Field label="اسم المركز بالعربية">
                        <Input disabled={!canEditSettings} value={db.settings.name} onChange={(e) => updateSettings({ name: e.target.value })} />
                    </Field>
                    <Field label="اسم المركز بالإنجليزية" hint="يظهر للمرضى الأجانب في التطبيق">
                        <Input disabled={!canEditSettings} value={db.settings.nameEn} onChange={(e) => updateSettings({ nameEn: e.target.value })} dir="ltr" />
                    </Field>
                    <Field label="اسم الطبيب المسؤول">
                        <Input
                            value={db.settings.doctorName}
                            onChange={(e) => updateSettings({ doctorName: e.target.value })}
                            placeholder="مثال: د. مايكل مجدي"
                        />
                    </Field>
                    <Field label="الهاتف">
                        <Input disabled={!canEditSettings} value={db.settings.phone} onChange={(e) => updateSettings({ phone: e.target.value })} dir="ltr" />
                    </Field>
                    <Field label="رقم الواتساب" hint="زر التواصل في تطبيق المريض يفتح محادثة على هذا الرقم">
                        <Input
                            disabled={!canEditSettings}
                            value={db.settings.whatsapp}
                            onChange={(e) => updateSettings({ whatsapp: e.target.value })}
                            dir="ltr"
                        />
                    </Field>
                    <Field label="العنوان بالعربية" className="sm:col-span-2">
                        <Input disabled={!canEditSettings} value={db.settings.address} onChange={(e) => updateSettings({ address: e.target.value })} />
                    </Field>
                    <Field label="العنوان بالإنجليزية" className="sm:col-span-2">
                        <Input
                            disabled={!canEditSettings}
                            value={db.settings.addressEn}
                            onChange={(e) => updateSettings({ addressEn: e.target.value })}
                            dir="ltr"
                        />
                    </Field>
                    <Field label="رابط الموقع على الخريطة" hint="يظهر للمريض كزر «افتح الخريطة»" className="sm:col-span-2">
                        <Input
                            disabled={!canEditSettings}
                            value={db.settings.mapUrl}
                            onChange={(e) => updateSettings({ mapUrl: e.target.value })}
                            dir="ltr"
                            placeholder="https://maps.google.com/…"
                        />
                    </Field>
                    <Field label="العملة">
                        <Input disabled={!canEditSettings} value={db.settings.currency} onChange={(e) => updateSettings({ currency: e.target.value })} />
                    </Field>
                    <Field label="سعر الجلسة الافتراضي">
                        <Input
                            type="number"
                            min={0}
                            value={db.settings.defaultSessionPrice}
                            onChange={(e) => updateSettings({ defaultSessionPrice: Number(e.target.value) })}
                        />
                    </Field>
                    <Field label="سعر الكشف">
                        <Input
                            disabled={!canEditSettings}
                            type="number"
                            min={0}
                            value={db.settings.examPrice}
                            onChange={(e) => updateSettings({ examPrice: Number(e.target.value) })}
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
                            <Input
                                disabled={!canEditSettings}
                                type="time"
                                value={db.settings.workStart}
                                onChange={(e) => updateSettings({ workStart: e.target.value })}
                            />
                        </Field>
                        <Field label="نهاية العمل">
                            <Input
                                disabled={!canEditSettings}
                                type="time"
                                value={db.settings.workEnd}
                                onChange={(e) => updateSettings({ workEnd: e.target.value })}
                            />
                        </Field>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="بداية العمل الجمعة">
                            <Input
                                disabled={!canEditSettings}
                                type="time"
                                value={db.settings.fridayStart}
                                onChange={(e) => updateSettings({ fridayStart: e.target.value })}
                            />
                        </Field>
                        <Field label="نهاية العمل الجمعة">
                            <Input
                                disabled={!canEditSettings}
                                type="time"
                                value={db.settings.fridayEnd}
                                onChange={(e) => updateSettings({ fridayEnd: e.target.value })}
                            />
                        </Field>
                    </div>
                    <Field label="مناطق الزيارات المنزلية" hint="افصل بين المناطق بفاصلة — تظهر للمريض عند طلب زيارة منزلية" className="sm:col-span-2">
                        <Input
                            disabled={!canEditSettings}
                            value={db.settings.homeVisitAreas}
                            onChange={(e) => updateSettings({ homeVisitAreas: e.target.value })}
                            placeholder="الغردقة, الجونة, سهل حشيش, مكادي باي, سوما باي"
                        />
                    </Field>
                </div>
            </Card>

            <ServicesCard />

            <Card>
                <CardHeader
                    title="الأخصائيون"
                    subtitle={`${db.therapists.length} أخصائي مسجل`}
                    action={
                        canManageTherapists ? (
                            <Button
                                onClick={() => {
                                    setEditing(null);
                                    setOpen(true);
                                }}
                            >
                                + إضافة أخصائي
                            </Button>
                        ) : undefined
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
                                        {can('therapists', 'update') ? (
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
                                        ) : null}
                                        {can('therapists', 'delete') ? (
                                            <Button
                                                variant="ghost"
                                                className="px-2 py-1 text-xs text-rose-600 hover:bg-rose-50"
                                                onClick={() => window.confirm(`حذف ${t.name}؟`) && remove('therapists', t.id)}
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

            <Card>
                <CardHeader
                    title="النسخ الاحتياطي والبيانات"
                    subtitle={isLocal ? 'كل البيانات محفوظة على هذا الجهاز فقط داخل المتصفح' : 'البيانات محفوظة على سيرفر المركز ومشتركة بين الأجهزة'}
                />
                <div className="flex flex-wrap gap-2 px-4 py-4">
                    <Button onClick={backup}>تنزيل نسخة احتياطية (JSON)</Button>
                    {isLocal ? (
                        <Button variant="secondary" onClick={() => fileRef.current?.click()}>
                            استرجاع من ملف
                        </Button>
                    ) : null}
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
                    {isLocal ? (
                        <>
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
                        </>
                    ) : null}
                </div>
                <p className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
                    {isLocal
                        ? 'نصيحة: نزّل نسخة احتياطية بشكل دوري واحتفظ بها خارج الجهاز، لأن مسح بيانات المتصفح يؤدي إلى فقدان السجلات.'
                        : 'نصيحة: نزّل نسخة احتياطية بشكل دوري واحتفظ بها خارج السيرفر تحسبًا لأي عطل في الجهاز.'}
                </p>
            </Card>

            {!isLocal && user?.role === 'admin' ? <Users /> : null}

            <TherapistForm open={open} onClose={() => setOpen(false)} editing={editing} />
        </div>
    );
}
