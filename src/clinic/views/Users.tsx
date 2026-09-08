import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import { api } from '../api';
import type { PublicUser, Role } from '../types';
import { ROLE_HINTS, ROLE_LABELS } from '../permissions';
import { Button, Card, CardHeader, EmptyState, Field, Input, Modal, Select, Table, Td } from '../components/ui';
import { formatDate } from '../utils';

type Draft = { username: string; name: string; role: Role; therapistId: string; patientId: string; memberIds: string[]; password: string };

const blank = (): Draft => ({ username: '', name: '', role: 'reception', therapistId: '', patientId: '', memberIds: [], password: '' });

export default function Users() {
    const { db, user: me } = useStore();
    const [users, setUsers] = useState<PublicUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<PublicUser | null>(null);
    const [draft, setDraft] = useState<Draft>(blank);
    const [tab, setTab] = useState<'staff' | 'patients'>('staff');
    const [patientQuery, setPatientQuery] = useState('');

    // قائمة الملفات المعروضة داخل نافذة ربط حساب المريض
    const matchingPatients = useMemo(() => {
        const q = patientQuery.trim().toLowerCase();
        const rows = q ? db.patients.filter((p) => [p.name, p.code, p.phone].join(' ').toLowerCase().includes(q)) : db.patients;
        return rows.slice(0, 200);
    }, [db.patients, patientQuery]);

    const visibleUsers = useMemo(() => users.filter((row) => (tab === 'patients' ? row.role === 'patient' : row.role !== 'patient')), [users, tab]);

    const patientLabel = useCallback(
        (row: PublicUser) => {
            if (row.role !== 'patient') return '';
            const main = db.patients.find((p) => p.id === row.patientId)?.name ?? 'ملف غير موجود';
            const extra = (row.memberIds ?? []).length;
            return extra ? `${main} + ${extra} من الأسرة` : main;
        },
        [db.patients]
    );

    const load = useCallback(async () => {
        try {
            const res = await api.listUsers();
            setUsers(res.users);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'تعذر تحميل المستخدمين');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const openNew = () => {
        setEditing(null);
        setDraft({ ...blank(), role: tab === 'patients' ? 'patient' : 'reception' });
        setPatientQuery('');
        setError('');
        setOpen(true);
    };

    const openEdit = (target: PublicUser) => {
        setEditing(target);
        setDraft({
            username: target.username,
            name: target.name,
            role: target.role,
            therapistId: target.therapistId,
            patientId: target.patientId,
            memberIds: target.memberIds ?? [],
            password: ''
        });
        setPatientQuery('');
        setError('');
        setOpen(true);
    };

    const submit = async () => {
        setError('');
        try {
            const res = editing
                ? await api.updateUser({
                      id: editing.id,
                      name: draft.name,
                      role: draft.role,
                      therapistId: draft.therapistId,
                      patientId: draft.patientId,
                      memberIds: draft.memberIds,
                      ...(draft.password ? { password: draft.password } : {})
                  })
                : await api.createUser({
                      username: draft.username,
                      password: draft.password,
                      name: draft.name,
                      role: draft.role,
                      therapistId: draft.therapistId,
                      patientId: draft.patientId,
                      memberIds: draft.memberIds
                  });
            setUsers(res.users);
            setOpen(false);
            setMessage(editing ? 'تم حفظ بيانات المستخدم.' : 'تم إنشاء الحساب بنجاح.');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'تعذر الحفظ');
        }
    };

    const toggleActive = async (target: PublicUser) => {
        try {
            const res = await api.updateUser({ id: target.id, active: !target.active });
            setUsers(res.users);
        } catch (err) {
            setMessage('');
            setError(err instanceof Error ? err.message : 'تعذر التعديل');
        }
    };

    const removeUser = async (target: PublicUser) => {
        if (!window.confirm(`حذف حساب ${target.name} نهائيًا؟`)) return;
        try {
            const res = await api.deleteUser(target.id);
            setUsers(res.users);
            setMessage('تم حذف الحساب.');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'تعذر الحذف');
        }
    };

    return (
        <Card>
            <CardHeader
                title={tab === 'patients' ? 'حسابات المرضى' : 'المستخدمون والصلاحيات'}
                subtitle={
                    tab === 'patients'
                        ? 'حساب لكل مريض يفتح به تطبيقه — يرى ملفه وملفات أسرته فقط ولا يصل لبيانات أي مريض آخر'
                        : 'كل موظف بحساب مستقل — كلمة السر مشفّرة ولا يمكن لأحد قراءتها'
                }
                action={<Button onClick={openNew}>{tab === 'patients' ? '+ حساب مريض' : '+ إضافة مستخدم'}</Button>}
            />

            <div className="flex gap-1 border-b border-slate-200 px-3 pt-3">
                {(
                    [
                        ['staff', `فريق المركز (${users.filter((row) => row.role !== 'patient').length})`],
                        ['patients', `حسابات المرضى (${users.filter((row) => row.role === 'patient').length})`]
                    ] as const
                ).map(([key, label]) => (
                    <button
                        key={key}
                        type="button"
                        onClick={() => setTab(key)}
                        className={`cursor-pointer rounded-t-lg px-3 py-2 text-sm font-semibold transition ${
                            tab === key ? 'bg-teal-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                        }`}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {message ? <p className="mx-4 mt-3 rounded-lg bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-800">{message}</p> : null}
            {error && !open ? <p className="mx-4 mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</p> : null}

            {loading ? (
                <EmptyState title="جارٍ التحميل…" />
            ) : visibleUsers.length === 0 ? (
                <EmptyState
                    title={tab === 'patients' ? 'لا توجد حسابات مرضى بعد' : 'لا يوجد مستخدمون'}
                    hint={tab === 'patients' ? 'أنشئ حسابًا واربطه بملف المريض ليدخل به على التطبيق' : undefined}
                />
            ) : (
                <Table head={['المستخدم', tab === 'patients' ? 'الملف المرتبط' : 'الصلاحية', 'آخر دخول', 'الحالة', '']}>
                    {visibleUsers.map((row) => (
                        <tr key={row.id} className="hover:bg-slate-50">
                            <Td>
                                <span className="font-semibold text-slate-700">{row.name}</span>
                                <span className="mr-2 text-xs text-slate-400" dir="ltr">
                                    {row.username}
                                </span>
                                {row.id === me?.id ? <span className="mr-2 text-[11px] font-semibold text-teal-600">(أنت)</span> : null}
                            </Td>
                            <Td className="text-slate-600">{row.role === 'patient' ? patientLabel(row) : ROLE_LABELS[row.role]}</Td>
                            <Td className="text-slate-500">{row.lastLoginAt ? formatDate(row.lastLoginAt.slice(0, 10)) : 'لم يدخل بعد'}</Td>
                            <Td>{row.active ? <span className="text-emerald-600">نشط</span> : <span className="text-slate-400">موقوف</span>}</Td>
                            <Td className="text-left">
                                <div className="flex justify-end gap-1">
                                    <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => openEdit(row)}>
                                        تعديل
                                    </Button>
                                    <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => void toggleActive(row)} disabled={row.id === me?.id}>
                                        {row.active ? 'إيقاف' : 'تفعيل'}
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        className="px-2 py-1 text-xs text-rose-600 hover:bg-rose-50"
                                        onClick={() => void removeUser(row)}
                                        disabled={row.id === me?.id}
                                    >
                                        حذف
                                    </Button>
                                </div>
                            </Td>
                        </tr>
                    ))}
                </Table>
            )}

            <Modal
                open={open}
                title={editing ? `تعديل حساب: ${editing.name}` : 'إضافة مستخدم جديد'}
                onClose={() => setOpen(false)}
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setOpen(false)}>
                            إلغاء
                        </Button>
                        <Button onClick={() => void submit()}>حفظ</Button>
                    </>
                }
            >
                {error ? <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</p> : null}
                <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="الاسم">
                        <Input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
                    </Field>
                    <Field label="اسم المستخدم" hint={editing ? 'لا يمكن تغييره بعد الإنشاء' : 'حروف إنجليزية وأرقام'}>
                        <Input
                            value={draft.username}
                            onChange={(e) => setDraft((d) => ({ ...d, username: e.target.value }))}
                            disabled={Boolean(editing)}
                            dir="ltr"
                            className="text-right"
                        />
                    </Field>
                    <Field label="الصلاحية" hint={ROLE_HINTS[draft.role]} className="sm:col-span-2">
                        <Select value={draft.role} onChange={(e) => setDraft((d) => ({ ...d, role: e.target.value as Role }))}>
                            <option value="admin">{ROLE_LABELS.admin}</option>
                            <option value="reception">{ROLE_LABELS.reception}</option>
                            <option value="therapist">{ROLE_LABELS.therapist}</option>
                            <option value="patient">{ROLE_LABELS.patient}</option>
                        </Select>
                    </Field>
                    {draft.role === 'therapist' ? (
                        <Field label="مرتبط بسجل الأخصائي" hint="لربط الحساب بسجله في قائمة الأخصائيين" className="sm:col-span-2">
                            <Select value={draft.therapistId} onChange={(e) => setDraft((d) => ({ ...d, therapistId: e.target.value }))}>
                                <option value="">— غير مرتبط —</option>
                                {db.therapists.map((t) => (
                                    <option key={t.id} value={t.id}>
                                        {t.name}
                                    </option>
                                ))}
                            </Select>
                        </Field>
                    ) : null}
                    {draft.role === 'patient' ? (
                        <>
                            <Field label="بحث في ملفات المرضى" className="sm:col-span-2">
                                <Input value={patientQuery} onChange={(e) => setPatientQuery(e.target.value)} placeholder="اكتب اسم المريض أو رقم ملفه…" />
                            </Field>
                            <Field label="ملف المريض صاحب الحساب" hint="هذا هو الملف الأساسي الذي يفتحه المريض عند الدخول" className="sm:col-span-2">
                                <Select value={draft.patientId} onChange={(e) => setDraft((d) => ({ ...d, patientId: e.target.value }))}>
                                    <option value="">— اختر ملفًا —</option>
                                    {matchingPatients.map((patient) => (
                                        <option key={patient.id} value={patient.id}>
                                            {patient.code} — {patient.name}
                                        </option>
                                    ))}
                                </Select>
                            </Field>
                            <Field
                                label="حسابات فرعية لأفراد الأسرة"
                                hint="ملفات إضافية يديرها نفس الحساب — يمكن للمريض أيضًا إضافتها بنفسه من التطبيق"
                                className="sm:col-span-2"
                            >
                                <div className="max-h-44 overflow-y-auto rounded-lg border border-slate-200 p-2">
                                    {matchingPatients.filter((patient) => patient.id !== draft.patientId).length === 0 ? (
                                        <p className="px-1 py-2 text-xs text-slate-400">لا توجد ملفات مطابقة</p>
                                    ) : (
                                        matchingPatients
                                            .filter((patient) => patient.id !== draft.patientId)
                                            .map((patient) => (
                                                <label
                                                    key={patient.id}
                                                    className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-slate-50"
                                                >
                                                    <input
                                                        type="checkbox"
                                                        className="accent-teal-600"
                                                        checked={draft.memberIds.includes(patient.id)}
                                                        onChange={(e) =>
                                                            setDraft((d) => ({
                                                                ...d,
                                                                memberIds: e.target.checked
                                                                    ? [...d.memberIds, patient.id]
                                                                    : d.memberIds.filter((id) => id !== patient.id)
                                                            }))
                                                        }
                                                    />
                                                    <span className="text-slate-700">
                                                        {patient.code} — {patient.name}
                                                    </span>
                                                </label>
                                            ))
                                    )}
                                </div>
                            </Field>
                        </>
                    ) : null}
                    <Field label={editing ? 'كلمة سر جديدة (اختياري)' : 'كلمة السر'} hint="8 أحرف على الأقل" className="sm:col-span-2">
                        <Input
                            type="password"
                            value={draft.password}
                            onChange={(e) => setDraft((d) => ({ ...d, password: e.target.value }))}
                            autoComplete="new-password"
                            dir="ltr"
                            className="text-right"
                        />
                    </Field>
                </div>
                {editing ? <p className="mt-3 text-[11px] text-slate-400">تغيير كلمة السر ينهي جلسات هذا المستخدم المفتوحة على كل الأجهزة.</p> : null}
            </Modal>
        </Card>
    );
}
