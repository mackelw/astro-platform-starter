import React, { useCallback, useEffect, useState } from 'react';
import { useStore } from '../store';
import { api } from '../api';
import type { PublicUser, Role } from '../types';
import { ROLE_HINTS, ROLE_LABELS } from '../permissions';
import { Button, Card, CardHeader, EmptyState, Field, Input, Modal, Select, Table, Td } from '../components/ui';
import { formatDate } from '../utils';

type Draft = { username: string; name: string; role: Role; therapistId: string; password: string };

const blank = (): Draft => ({ username: '', name: '', role: 'reception', therapistId: '', password: '' });

export default function Users() {
    const { db, user: me } = useStore();
    const [users, setUsers] = useState<PublicUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<PublicUser | null>(null);
    const [draft, setDraft] = useState<Draft>(blank);

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
        setDraft(blank());
        setError('');
        setOpen(true);
    };

    const openEdit = (target: PublicUser) => {
        setEditing(target);
        setDraft({ username: target.username, name: target.name, role: target.role, therapistId: target.therapistId, password: '' });
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
                      ...(draft.password ? { password: draft.password } : {})
                  })
                : await api.createUser({
                      username: draft.username,
                      password: draft.password,
                      name: draft.name,
                      role: draft.role,
                      therapistId: draft.therapistId
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
                title="المستخدمون والصلاحيات"
                subtitle="كل موظف بحساب مستقل — كلمة السر مشفّرة ولا يمكن لأحد قراءتها"
                action={<Button onClick={openNew}>+ إضافة مستخدم</Button>}
            />

            {message ? <p className="mx-4 mt-3 rounded-lg bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-800">{message}</p> : null}
            {error && !open ? <p className="mx-4 mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</p> : null}

            {loading ? (
                <EmptyState title="جارٍ التحميل…" />
            ) : users.length === 0 ? (
                <EmptyState title="لا يوجد مستخدمون" />
            ) : (
                <Table head={['المستخدم', 'الصلاحية', 'آخر دخول', 'الحالة', '']}>
                    {users.map((row) => (
                        <tr key={row.id} className="hover:bg-slate-50">
                            <Td>
                                <span className="font-semibold text-slate-700">{row.name}</span>
                                <span className="mr-2 text-xs text-slate-400" dir="ltr">
                                    {row.username}
                                </span>
                                {row.id === me?.id ? <span className="mr-2 text-[11px] font-semibold text-teal-600">(أنت)</span> : null}
                            </Td>
                            <Td className="text-slate-600">{ROLE_LABELS[row.role]}</Td>
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
