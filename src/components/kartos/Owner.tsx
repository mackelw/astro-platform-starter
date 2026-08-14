import { useEffect, useState } from 'react';
import { ROLE_LABELS, type Clinic, type Patient, type PublicUser, type QueueEntry, type Session } from '../../lib/models';
import type { PayrollRow } from '../../lib/payroll';
import { api, Card, Empty, money, Notice, Shell, Stat, useLang } from './ui';

const DESKS = [
    { href: '/app/reception', en: 'Reception desk', ar: 'مكتب الاستقبال', icon: '🗓️' },
    { href: '/app/doctor', en: 'Clinician dashboard', ar: 'لوحة الطبيب', icon: '🩺' },
    { href: '/app/hr', en: 'HR & payroll', ar: 'الموارد البشرية والرواتب', icon: '💰' },
    { href: '/portal', en: 'Patient portal', ar: 'بوابة المرضى', icon: '📱' }
];

export default function Owner() {
    const { lang, setLang, t } = useLang();
    const isAr = lang === 'ar';
    const [me, setMe] = useState<{ user: PublicUser | null; clinic: Clinic | null }>({ user: null, clinic: null });
    const [patients, setPatients] = useState<Patient[]>([]);
    const [sessions, setSessions] = useState<Session[]>([]);
    const [staff, setStaff] = useState<PublicUser[]>([]);
    const [queue, setQueue] = useState<{ stats: { collected: number; waiting: number } } | null>(null);
    const [payroll, setPayroll] = useState<{ rows: PayrollRow[]; total: number } | null>(null);
    const [error, setError] = useState('');

    const currency = me.clinic?.currency ?? 'ج.م';

    useEffect(() => {
        api('auth/me').then((res) => {
            if (!res.user) window.location.href = '/login';
            else setMe(res);
        });
        Promise.all([
            api<{ patients: Patient[] }>('patients'),
            api<{ sessions: Session[] }>('sessions'),
            api<{ staff: PublicUser[] }>('staff'),
            api<{ stats: { collected: number; waiting: number }; queue: QueueEntry[] }>('queue'),
            api<{ rows: PayrollRow[]; total: number }>('payroll')
        ])
            .then(([p, s, st, q, pay]) => {
                setPatients(p.patients);
                setSessions(s.sessions);
                setStaff(st.staff);
                setQueue(q);
                setPayroll(pay);
            })
            .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load the overview'));
    }, []);

    const thisMonth = new Date().toISOString().slice(0, 7);
    const sessionsThisMonth = sessions.filter((s) => s.date.startsWith(thisMonth));

    return (
        <Shell subtitle={t('owner')} lang={lang} user={me.user} onToggleLang={() => setLang(isAr ? 'en' : 'ar')}>
            <div className="space-y-6">
                {error && <Notice kind="error">{error}</Notice>}

                <div>
                    <h1 className="text-brand-500">{me.clinic?.name ?? t('overview')}</h1>
                    <p className="k-hint mt-1">{isAr ? 'نظرة شاملة على العيادة' : 'A single view across the whole clinic'}</p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <Stat label={t('totalPatients')} value={patients.length} tone="brand" />
                    <Stat
                        label={t('totalSessions')}
                        value={
                            <>
                                {sessions.length}
                                <span className="k-hint ms-2">
                                    (+{sessionsThisMonth.length} {isAr ? 'هذا الشهر' : 'this month'})
                                </span>
                            </>
                        }
                        tone="blue"
                    />
                    <Stat label={t('revenueToday')} value={money(queue?.stats.collected ?? 0, currency)} tone="green" />
                    <Stat label={t('staffCount')} value={staff.length} tone="amber" />
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {DESKS.map((desk) => (
                        <a key={desk.href} href={desk.href} className="k-card p-5 no-underline transition hover:border-brand-500">
                            <span className="text-2xl" aria-hidden="true">
                                {desk.icon}
                            </span>
                            <p className="mt-2 font-semibold text-brand-500">{isAr ? desk.ar : desk.en}</p>
                        </a>
                    ))}
                </div>

                <div className="grid gap-6 lg:grid-cols-2">
                    <Card title={t('payrollEngine')} subtitle={thisMonth}>
                        {!payroll ? (
                            <Empty text={t('loading')} />
                        ) : (
                            <>
                                <p className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-lg font-bold text-emerald-900">
                                    {isAr ? 'إجمالي المستحق' : 'Total net payable'}: {money(payroll.total, currency)}
                                </p>
                                <ul className="space-y-2">
                                    {payroll.rows.map((row) => (
                                        <li key={row.userId} className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--color-line)] p-3 text-sm">
                                            <span className="font-semibold">{row.name}</span>
                                            <span className="k-hint">
                                                {row.sessionCount} {isAr ? 'جلسة' : 'sessions'} · {row.shifts} {isAr ? 'شيفت' : 'shifts'}
                                            </span>
                                            <span className="ms-auto font-bold">{money(row.net, currency)}</span>
                                        </li>
                                    ))}
                                </ul>
                            </>
                        )}
                    </Card>

                    <Card title={isAr ? 'أحدث الجلسات' : 'Recent sessions'}>
                        {sessions.length === 0 ? (
                            <Empty text={t('none')} />
                        ) : (
                            <ul className="space-y-2">
                                {sessions.slice(0, 8).map((session) => {
                                    const patient = patients.find((p) => p.id === session.patientId);
                                    return (
                                        <li key={session.id} className="rounded-lg border border-[var(--color-line)] p-3 text-sm">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="font-semibold">{patient?.name ?? '—'}</span>
                                                <span className="k-chip bg-brand-500 text-white">#{session.number}</span>
                                                <span className="k-hint ms-auto">
                                                    {new Date(session.date).toLocaleDateString(isAr ? 'ar-EG' : 'en-GB')}
                                                </span>
                                            </div>
                                            <p className="k-hint mt-1">
                                                {session.doctorName}
                                                {session.metrics.length > 0 &&
                                                    ` · ${session.metrics.map((m) => `${m.name} ${m.value}`).join(', ')}`}
                                            </p>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </Card>
                </div>

                <Card title={t('team')}>
                    <div className="k-scroll">
                        <table className="k-table">
                            <thead>
                                <tr>
                                    <th>{isAr ? 'الاسم' : 'Name'}</th>
                                    <th>{t('role')}</th>
                                    <th>{isAr ? 'الجلسات' : 'Sessions'}</th>
                                    <th>{isAr ? 'الحالة' : 'Status'}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {staff.map((member) => (
                                    <tr key={member.id}>
                                        <td className="font-semibold">{member.name}</td>
                                        <td className="text-sm">{ROLE_LABELS[member.role][isAr ? 'ar' : 'en']}</td>
                                        <td>{sessions.filter((s) => s.doctorId === member.id).length}</td>
                                        <td>
                                            <span
                                                className={`k-chip ${member.status === 'active' ? 'bg-emerald-600 text-white' : 'bg-amber-200 text-amber-900'}`}
                                            >
                                                {member.status === 'active' ? (isAr ? 'نشط' : 'Active') : isAr ? 'مجمّد' : 'Frozen'}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            </div>
        </Shell>
    );
}
