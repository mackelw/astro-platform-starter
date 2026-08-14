import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ROLE_LABELS, ROLES, type Attendance, type Clinic, type PublicUser } from '../../lib/models';
import type { PayrollRow } from '../../lib/payroll';
import { api, Empty, Field, money, Notice, Shell, Stat, Tabs, useLang } from './ui';

type TabId = 'team' | 'attendance' | 'payroll';

function currentMonth(): string {
    return new Date().toISOString().slice(0, 7);
}

export default function Hr() {
    const { lang, setLang, t } = useLang();
    const isAr = lang === 'ar';
    const [me, setMe] = useState<{ user: PublicUser | null; clinic: Clinic | null }>({ user: null, clinic: null });
    const [tab, setTab] = useState<TabId>('team');
    const [staff, setStaff] = useState<PublicUser[]>([]);
    const [attendance, setAttendance] = useState<Attendance[]>([]);
    const [payroll, setPayroll] = useState<{ rows: PayrollRow[]; total: number } | null>(null);
    const [month, setMonth] = useState(currentMonth());
    const [error, setError] = useState('');
    const [flash, setFlash] = useState('');

    const currency = me.clinic?.currency ?? 'ج.م';

    const loadStaff = useCallback(async () => {
        const res = await api<{ staff: PublicUser[] }>('staff');
        setStaff(res.staff);
    }, []);

    const loadAttendance = useCallback(async () => {
        const res = await api<{ attendance: Attendance[] }>('attendance');
        setAttendance(res.attendance);
    }, []);

    const loadPayroll = useCallback(async (target: string) => {
        setPayroll(await api(`payroll?month=${target}`));
    }, []);

    useEffect(() => {
        api('auth/me').then((res) => {
            if (!res.user) window.location.href = '/login';
            else setMe(res);
        });
        loadStaff();
        loadAttendance();
    }, [loadStaff, loadAttendance]);

    useEffect(() => {
        if (tab === 'payroll') loadPayroll(month).catch((err) => setError(err.message));
    }, [tab, month, loadPayroll]);

    async function addStaff(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError('');
        const form = event.currentTarget;
        try {
            await api('staff', { method: 'POST', body: Object.fromEntries(new FormData(form).entries()) });
            form.reset();
            setFlash(isAr ? 'تمت إضافة العضو' : 'Team member added');
            loadStaff();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not add the team member');
        }
    }

    async function record(userId: string, action: 'check_in' | 'check_out' | 'absent' | 'leave') {
        await api('attendance', { method: 'POST', body: { userId, action } });
        loadAttendance();
    }

    async function removeStaff(user: PublicUser) {
        if (!confirm(isAr ? `حذف ${user.name}؟` : `Delete ${user.name}?`)) return;
        try {
            await api(`staff?id=${user.id}`, { method: 'DELETE' });
            loadStaff();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not delete');
        }
    }

    async function adjust(userId: string, kind: 'bonus' | 'deduction') {
        const amount = Number(prompt(isAr ? 'المبلغ' : 'Amount'));
        if (!amount) return;
        const reason = prompt(isAr ? 'السبب' : 'Reason') ?? '';
        await api('adjustments', { method: 'POST', body: { userId, kind, amount, reason, month } });
        loadPayroll(month);
    }

    const todayRecord = (userId: string) => attendance.find((a) => a.userId === userId);

    return (
        <Shell subtitle={t('hrDesk')} lang={lang} user={me.user} onToggleLang={() => setLang(isAr ? 'en' : 'ar')}>
            <div className="space-y-6">
                {error && <Notice kind="error">{error}</Notice>}
                {flash && <Notice kind="success">{flash}</Notice>}

                <div className="k-card overflow-hidden">
                    <Tabs
                        tabs={[
                            { id: 'team' as const, label: t('team'), badge: staff.length },
                            { id: 'attendance' as const, label: t('attendance') },
                            { id: 'payroll' as const, label: t('payrollEngine') }
                        ]}
                        active={tab}
                        onChange={setTab}
                    />

                    <div className="p-5">
                        {tab === 'team' && (
                            <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
                                <form className="space-y-4 rounded-lg border border-[var(--color-line)] bg-[var(--color-canvas)] p-4" onSubmit={addStaff}>
                                    <h3 className="text-brand-500">{t('addStaff')}</h3>
                                    <Field label={isAr ? 'الاسم' : 'Name'}>
                                        <input name="name" className="k-input" required />
                                    </Field>
                                    <Field label={t('email')}>
                                        <input name="email" type="email" className="k-input" required dir="ltr" />
                                    </Field>
                                    <Field label={t('password')} hint={isAr ? '8 أحرف على الأقل' : 'At least 8 characters'}>
                                        <input name="password" type="password" className="k-input" required minLength={8} dir="ltr" />
                                    </Field>
                                    <div className="grid gap-4 sm:grid-cols-2">
                                        <Field label={t('role')}>
                                            <select name="role" className="k-input" defaultValue="doctor">
                                                {ROLES.map((role) => (
                                                    <option key={role} value={role}>
                                                        {ROLE_LABELS[role][isAr ? 'ar' : 'en']}
                                                    </option>
                                                ))}
                                            </select>
                                        </Field>
                                        <Field label={t('employmentType')}>
                                            <select name="employmentType" className="k-input" defaultValue="full_time">
                                                <option value="full_time">{t('fullTime')}</option>
                                                <option value="part_time">{t('partTime')}</option>
                                            </select>
                                        </Field>
                                    </div>
                                    <div className="grid gap-4 sm:grid-cols-3">
                                        <Field label={t('baseSalary')}>
                                            <input name="baseSalary" type="number" min={0} defaultValue={0} className="k-input" />
                                        </Field>
                                        <Field label={t('shiftRate')}>
                                            <input name="shiftRate" type="number" min={0} defaultValue={0} className="k-input" />
                                        </Field>
                                        <Field label={t('commissionPct')}>
                                            <input name="commissionPct" type="number" min={0} max={100} defaultValue={0} className="k-input" />
                                        </Field>
                                    </div>
                                    <Field label={t('phone')}>
                                        <input name="phone" className="k-input" dir="ltr" />
                                    </Field>
                                    <button type="submit" className="k-btn-primary w-full">
                                        + {t('addStaff')}
                                    </button>
                                </form>

                                <ul className="space-y-3">
                                    {staff.map((member) => (
                                        <li key={member.id} className="k-card p-4">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <p className="font-semibold">{member.name}</p>
                                                <span className="k-chip bg-slate-700 text-white">{ROLE_LABELS[member.role][isAr ? 'ar' : 'en']}</span>
                                                <span
                                                    className={`k-chip ms-auto ${member.status === 'active' ? 'bg-emerald-600 text-white' : 'bg-amber-200 text-amber-900'}`}
                                                >
                                                    {member.status === 'active' ? (isAr ? 'نشط' : 'Active') : isAr ? 'مجمّد' : 'Frozen'}
                                                </span>
                                            </div>
                                            <p className="k-hint mt-1" dir="ltr">
                                                {member.email} {member.phone && `· ${member.phone}`}
                                            </p>
                                            <p className="mt-2 rounded-lg bg-[var(--color-canvas)] px-3 py-2 text-sm">
                                                {t('baseSalary')}: <strong>{money(member.baseSalary, currency)}</strong> · {t('shiftRate')}:{' '}
                                                <strong>{money(member.shiftRate, currency)}</strong> · {t('commissionPct')}:{' '}
                                                <strong>{member.commissionPct}%</strong>
                                            </p>
                                            <div className="mt-3 flex flex-wrap gap-2">
                                                <button
                                                    type="button"
                                                    className="k-btn-ghost"
                                                    onClick={async () => {
                                                        await api('staff', {
                                                            method: 'PATCH',
                                                            body: { id: member.id, status: member.status === 'active' ? 'frozen' : 'active' }
                                                        });
                                                        loadStaff();
                                                    }}
                                                >
                                                    {member.status === 'active' ? (isAr ? 'تجميد الحساب' : 'Freeze account') : isAr ? 'تفعيل' : 'Activate'}
                                                </button>
                                                <button type="button" className="k-btn-danger" onClick={() => removeStaff(member)}>
                                                    🗑 {t('delete')}
                                                </button>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {tab === 'attendance' && (
                            <div className="k-scroll">
                                <table className="k-table">
                                    <thead>
                                        <tr>
                                            <th>{isAr ? 'الاسم' : 'Name'}</th>
                                            <th>{t('role')}</th>
                                            <th>{t('checkIn')}</th>
                                            <th>{t('checkOut')}</th>
                                            <th>{isAr ? 'الحالة' : 'Status'}</th>
                                            <th>{isAr ? 'التسجيل السريع' : 'Quick record'}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {staff.map((member) => {
                                            const entry = todayRecord(member.id);
                                            return (
                                                <tr key={member.id}>
                                                    <td className="font-semibold">{member.name}</td>
                                                    <td className="text-sm">{ROLE_LABELS[member.role][isAr ? 'ar' : 'en']}</td>
                                                    <td dir="ltr">{entry?.checkIn ?? '—'}</td>
                                                    <td dir="ltr">{entry?.checkOut ?? '—'}</td>
                                                    <td>
                                                        <span
                                                            className={`k-chip ${
                                                                !entry
                                                                    ? 'border border-[var(--color-line)] text-[var(--color-muted)]'
                                                                    : entry.status === 'present'
                                                                      ? 'bg-emerald-600 text-white'
                                                                      : 'bg-rose-100 text-rose-800'
                                                            }`}
                                                        >
                                                            {!entry ? t('notRecorded') : entry.status === 'present' ? t('present') : t('absent')}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <div className="flex flex-wrap gap-2">
                                                            <button type="button" className="k-btn-green" onClick={() => record(member.id, 'check_in')}>
                                                                {t('checkIn')}
                                                            </button>
                                                            <button type="button" className="k-btn-ghost" onClick={() => record(member.id, 'check_out')}>
                                                                {t('checkOut')}
                                                            </button>
                                                            <button type="button" className="k-btn-danger" onClick={() => record(member.id, 'absent')}>
                                                                {t('absent')}
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {tab === 'payroll' && (
                            <div className="space-y-4">
                                <div className="flex flex-wrap items-end gap-3">
                                    <Field label={t('month')}>
                                        <input type="month" className="k-input w-48" value={month} onChange={(e) => setMonth(e.target.value)} />
                                    </Field>
                                    <a className="k-btn-ghost no-underline" href={`/api/payroll?month=${month}&format=csv`}>
                                        ⬇ {t('exportCsv')}
                                    </a>
                                    {payroll && <Stat label={isAr ? 'إجمالي المستحق' : 'Total net payable'} value={money(payroll.total, currency)} tone="green" />}
                                </div>

                                {!payroll ? (
                                    <Empty text={t('loading')} />
                                ) : (
                                    <div className="k-scroll">
                                        <table className="k-table">
                                            <thead>
                                                <tr>
                                                    <th>{isAr ? 'الاسم' : 'Name'}</th>
                                                    <th>{t('employmentType')}</th>
                                                    <th>{t('baseSalary')}</th>
                                                    <th>{t('shifts')}</th>
                                                    <th>{isAr ? 'نسبة الجلسات' : 'Commission'}</th>
                                                    <th>{t('deduction')}</th>
                                                    <th>{t('net')}</th>
                                                    <th />
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {payroll.rows.map((row) => (
                                                    <tr key={row.userId}>
                                                        <td className="font-semibold">{row.name}</td>
                                                        <td className="text-sm">{row.employmentType === 'full_time' ? t('fullTime') : t('partTime')}</td>
                                                        <td>{money(row.baseSalary, currency)}</td>
                                                        <td className="text-purple-700">
                                                            {row.shifts} {isAr ? 'شيفت' : 'shifts'}
                                                            <span className="k-hint block">+{money(row.shiftPay, currency)}</span>
                                                        </td>
                                                        <td className="text-emerald-700">
                                                            +{money(row.commission, currency)}
                                                            <span className="k-hint block">
                                                                {row.sessionCount} {isAr ? 'جلسة' : 'sessions'} @ {row.commissionPct}%
                                                            </span>
                                                        </td>
                                                        <td className="text-rose-700">−{money(row.deductions, currency)}</td>
                                                        <td className="bg-emerald-50 font-bold">{money(row.net, currency)}</td>
                                                        <td>
                                                            <div className="flex flex-wrap gap-2">
                                                                <button type="button" className="k-btn-ghost" onClick={() => adjust(row.userId, 'bonus')}>
                                                                    + {t('bonus')}
                                                                </button>
                                                                <button type="button" className="k-btn-danger" onClick={() => adjust(row.userId, 'deduction')}>
                                                                    − {t('deduction')}
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </Shell>
    );
}
