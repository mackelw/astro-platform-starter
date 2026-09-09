import React, { useMemo, useState } from 'react';
import { useStore } from '../store';
import type { Session } from '../types';
import { PatientForm } from './Patients';
import { AppointmentForm, PaymentForm, SessionForm } from '../components/forms';
import ProgramPanel from './ProgramPanel';
import PromPanel from './PromPanel';
import { Badge, Button, Card, CardHeader, EmptyState, Table, Td } from '../components/ui';
import {
    age,
    escapeHtml,
    formatDate,
    formatTime,
    genderLabels,
    methodLabels,
    money,
    patientBalance,
    printHTML,
    sortAppointments,
    statusClasses,
    statusLabels,
    therapistName
} from '../utils';

function Info({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="rounded-lg bg-slate-50 px-3 py-2">
            <p className="text-[11px] font-semibold text-slate-500">{label}</p>
            <p className="mt-0.5 text-sm font-semibold text-slate-800">{value || '—'}</p>
        </div>
    );
}

export default function PatientProfile({ patientId, onBack }: { patientId: string; onBack: () => void }) {
    const { db, remove, can } = useStore();
    const canSeeMoney = can('payments', 'read');
    const patient = db.patients.find((p) => p.id === patientId);
    const [tab, setTab] = useState<'sessions' | 'program' | 'proms' | 'appointments' | 'payments'>('sessions');
    const [editOpen, setEditOpen] = useState(false);
    const [apptOpen, setApptOpen] = useState(false);
    const [sessionOpen, setSessionOpen] = useState(false);
    const [paymentOpen, setPaymentOpen] = useState(false);
    const [editingSession, setEditingSession] = useState<Session | null>(null);

    const data = useMemo(() => {
        if (!patient) return null;
        const sessions = db.sessions.filter((s) => s.patientId === patient.id).sort((a, b) => b.date.localeCompare(a.date));
        const appointments = sortAppointments(db.appointments.filter((a) => a.patientId === patient.id)).reverse();
        const payments = db.payments.filter((p) => p.patientId === patient.id).sort((a, b) => b.date.localeCompare(a.date));
        return { sessions, appointments, payments, balance: patientBalance(db, patient.id) };
    }, [db, patient]);

    if (!patient || !data) {
        return (
            <Card>
                <EmptyState title="لم يعد هذا الملف موجودًا" action={<Button onClick={onBack}>رجوع لقائمة المرضى</Button>} />
            </Card>
        );
    }

    const currency = db.settings.currency;
    const progress = patient.plannedSessions > 0 ? Math.min(100, Math.round((data.sessions.length / patient.plannedSessions) * 100)) : 0;

    const printStatement = () => {
        const rows = data.sessions
            .map(
                (s) =>
                    `<tr><td>${escapeHtml(formatDate(s.date))}</td><td>${escapeHtml(s.treatments.join('، ') || '—')}</td><td>${escapeHtml(
                        therapistName(db, s.therapistId)
                    )}</td><td>${escapeHtml(money(s.price, currency))}</td></tr>`
            )
            .join('');
        const payRows = data.payments
            .map(
                (p) =>
                    `<tr><td>${escapeHtml(formatDate(p.date))}</td><td>${escapeHtml(methodLabels[p.method])}</td><td>${escapeHtml(money(p.amount, currency))}</td></tr>`
            )
            .join('');
        printHTML(
            `كشف حساب - ${patient.name}`,
            `<div class="head">
                <div><h1>${escapeHtml(db.settings.name)}</h1>${db.settings.doctorName ? `<p class="muted">${escapeHtml(db.settings.doctorName)}</p>` : ''}<p class="muted">${escapeHtml(db.settings.address)} ${db.settings.phone ? '— هاتف: ' + escapeHtml(db.settings.phone) : ''}</p></div>
                <div style="text-align:left"><p class="muted">كشف حساب</p><p class="muted">${escapeHtml(formatDate(new Date().toISOString().slice(0, 10)))}</p></div>
            </div>
            <h2>بيانات المريض</h2>
            <p class="muted">الاسم: <b>${escapeHtml(patient.name)}</b> — رقم الملف: ${escapeHtml(patient.code)} — الهاتف: ${escapeHtml(patient.phone || '—')}</p>
            <p class="muted">التشخيص: ${escapeHtml(patient.diagnosis || '—')}</p>
            <h2>الجلسات (${data.sessions.length})</h2>
            <table><thead><tr><th>التاريخ</th><th>الإجراءات</th><th>الأخصائي</th><th>القيمة</th></tr></thead><tbody>${rows || '<tr><td colspan="4">لا توجد جلسات</td></tr>'}</tbody></table>
            <h2>المدفوعات (${data.payments.length})</h2>
            <table><thead><tr><th>التاريخ</th><th>الطريقة</th><th>المبلغ</th></tr></thead><tbody>${payRows || '<tr><td colspan="3">لا توجد مدفوعات</td></tr>'}</tbody></table>
            <div class="totals">
                <div><span>إجمالي قيمة الجلسات</span><span>${escapeHtml(money(data.balance.charges, currency))}</span></div>
                <div><span>إجمالي المدفوع</span><span>${escapeHtml(money(data.balance.paid, currency))}</span></div>
                <div class="due"><span>المتبقي</span><span>${escapeHtml(money(data.balance.due, currency))}</span></div>
            </div>
            <div class="sign"><span>توقيع المحاسب: ....................</span><span>ختم العيادة</span></div>`
        );
    };

    const printSession = (s: Session) => {
        printHTML(
            `تقرير جلسة - ${patient.name}`,
            `<div class="head">
                <div><h1>${escapeHtml(db.settings.name)}</h1><p class="muted">تقرير جلسة علاج طبيعي${db.settings.doctorName ? ' — ' + escapeHtml(db.settings.doctorName) : ''}</p></div>
                <div style="text-align:left"><p class="muted">${escapeHtml(formatDate(s.date))}</p></div>
            </div>
            <p class="muted">المريض: <b>${escapeHtml(patient.name)}</b> (${escapeHtml(patient.code)}) — الأخصائي: ${escapeHtml(therapistName(db, s.therapistId))}</p>
            <h2>التشخيص</h2><p>${escapeHtml(patient.diagnosis || '—')}</p>
            <h2>الإجراءات العلاجية</h2><p>${escapeHtml(s.treatments.join('، ') || '—')}</p>
            <h2>مقياس الألم</h2><p>قبل الجلسة: ${s.painBefore}/10 — بعد الجلسة: ${s.painAfter}/10</p>
            <h2>ملاحظات الأخصائي</h2><p>${escapeHtml(s.notes || '—')}</p>
            <h2>البرنامج المنزلي</h2><p>${escapeHtml(s.homeProgram || '—')}</p>
            <div class="sign"><span>توقيع الأخصائي: ....................</span><span>ختم العيادة</span></div>`
        );
    };

    return (
        <div className="space-y-4">
            <button type="button" onClick={onBack} className="cursor-pointer text-sm font-semibold text-teal-700 hover:underline">
                ← رجوع لقائمة المرضى
            </button>

            <Card className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-xl font-extrabold text-slate-800">{patient.name}</h2>
                            <Badge className="bg-slate-100 text-slate-600 ring-slate-200">{patient.code}</Badge>
                            {patient.archived ? <Badge className="bg-slate-200 text-slate-600 ring-slate-300">مؤرشف</Badge> : null}
                        </div>
                        <p className="mt-1 text-sm text-slate-500">
                            {genderLabels[patient.gender]} · {age(patient.birthDate)} {patient.job ? `· ${patient.job}` : ''}
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {can('sessions', 'create') ? <Button onClick={() => setSessionOpen(true)}>+ تسجيل جلسة</Button> : null}
                        {can('appointments', 'create') ? (
                            <Button variant="secondary" onClick={() => setApptOpen(true)}>
                                + حجز موعد
                            </Button>
                        ) : null}
                        {can('payments', 'create') ? (
                            <Button variant="secondary" onClick={() => setPaymentOpen(true)}>
                                + دفعة
                            </Button>
                        ) : null}
                        {canSeeMoney ? (
                            <Button variant="secondary" onClick={printStatement}>
                                طباعة كشف حساب
                            </Button>
                        ) : null}
                        {can('patients', 'update') ? (
                            <Button variant="secondary" onClick={() => setEditOpen(true)}>
                                تعديل الملف
                            </Button>
                        ) : null}
                        {can('patients', 'delete') ? (
                            <Button
                                variant="ghost"
                                className="text-rose-600 hover:bg-rose-50"
                                onClick={() => {
                                    if (window.confirm(`حذف ملف ${patient.name} نهائيًا مع كل سجلاته؟`)) {
                                        remove('patients', patient.id);
                                        onBack();
                                    }
                                }}
                            >
                                حذف
                            </Button>
                        ) : null}
                    </div>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    <Info label="الهاتف" value={<span dir="ltr">{patient.phone}</span>} />
                    <Info label="التشخيص" value={patient.diagnosis} />
                    <Info label="الطبيب المحوِّل" value={patient.referredBy} />
                    <Info label="العنوان" value={patient.address} />
                    <Info label="سعر الجلسة" value={money(patient.sessionPrice, currency)} />
                    <Info label="إجمالي الجلسات" value={money(data.balance.charges, currency)} />
                    <Info label="المدفوع" value={<span className="text-emerald-600">{money(data.balance.paid, currency)}</span>} />
                    <Info
                        label="المتبقي"
                        value={<span className={data.balance.due > 0 ? 'text-rose-600' : 'text-emerald-600'}>{money(data.balance.due, currency)}</span>}
                    />
                </div>

                <div className="mt-4">
                    <div className="mb-1 flex items-center justify-between text-xs font-semibold text-slate-600">
                        <span>تقدم الخطة العلاجية</span>
                        <span>
                            {data.sessions.length} من {patient.plannedSessions || '—'} جلسة
                        </span>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
                        <div className="h-full rounded-full bg-teal-600 transition-all" style={{ width: `${progress}%` }} />
                    </div>
                </div>

                {patient.history || patient.notes ? (
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                        {patient.history ? <Info label="التاريخ المرضي" value={patient.history} /> : null}
                        {patient.notes ? <Info label="ملاحظات" value={patient.notes} /> : null}
                    </div>
                ) : null}
            </Card>

            <Card>
                <div className="flex gap-1 border-b border-slate-200 px-3 pt-3">
                    {(
                        [
                            ['sessions', `الجلسات (${data.sessions.length})`],
                            ['program', 'البرنامج المنزلي'],
                            ['proms', 'مقاييس النتائج'],
                            ['appointments', `المواعيد (${data.appointments.length})`],
                            ...(canSeeMoney ? ([['payments', `المدفوعات (${data.payments.length})`]] as const) : [])
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

                {tab === 'sessions' ? (
                    data.sessions.length === 0 ? (
                        <EmptyState
                            title="لا توجد جلسات مسجلة"
                            action={can('sessions', 'create') ? <Button onClick={() => setSessionOpen(true)}>تسجيل أول جلسة</Button> : undefined}
                        />
                    ) : (
                        <ul className="divide-y divide-slate-100">
                            {data.sessions.map((s) => (
                                <li key={s.id} className="px-4 py-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="text-sm font-bold text-slate-800">{formatDate(s.date)}</span>
                                            <span className="text-xs text-slate-500">{therapistName(db, s.therapistId)}</span>
                                            {canSeeMoney ? (
                                                <Badge className="bg-slate-100 text-slate-600 ring-slate-200">{money(s.price, currency)}</Badge>
                                            ) : null}
                                            <Badge className="bg-rose-50 text-rose-700 ring-rose-200">
                                                ألم قبل {s.painBefore} · بعد {s.painAfter}
                                            </Badge>
                                        </div>
                                        <div className="flex gap-1">
                                            <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => printSession(s)}>
                                                طباعة
                                            </Button>
                                            {can('sessions', 'update') ? (
                                                <Button
                                                    variant="ghost"
                                                    className="px-2 py-1 text-xs"
                                                    onClick={() => {
                                                        setEditingSession(s);
                                                        setSessionOpen(true);
                                                    }}
                                                >
                                                    تعديل
                                                </Button>
                                            ) : null}
                                            {can('sessions', 'delete') ? (
                                                <Button
                                                    variant="ghost"
                                                    className="px-2 py-1 text-xs text-rose-600 hover:bg-rose-50"
                                                    onClick={() => window.confirm('حذف هذه الجلسة؟') && remove('sessions', s.id)}
                                                >
                                                    حذف
                                                </Button>
                                            ) : null}
                                        </div>
                                    </div>
                                    {s.treatments.length ? <p className="mt-1.5 text-xs text-slate-600">الإجراءات: {s.treatments.join('، ')}</p> : null}
                                    {s.notes ? <p className="mt-1 text-sm text-slate-700">{s.notes}</p> : null}
                                    {s.homeProgram ? <p className="mt-1 text-xs text-teal-700">برنامج منزلي: {s.homeProgram}</p> : null}
                                </li>
                            ))}
                        </ul>
                    )
                ) : null}

                {tab === 'program' ? <ProgramPanel patient={patient} /> : null}

                {tab === 'proms' ? <PromPanel patient={patient} /> : null}

                {tab === 'appointments' ? (
                    data.appointments.length === 0 ? (
                        <EmptyState
                            title="لا توجد مواعيد"
                            action={can('appointments', 'create') ? <Button onClick={() => setApptOpen(true)}>حجز موعد</Button> : undefined}
                        />
                    ) : (
                        <Table head={['التاريخ', 'الوقت', 'الأخصائي', 'الحالة', 'ملاحظات']}>
                            {data.appointments.map((a) => (
                                <tr key={a.id}>
                                    <Td className="font-semibold text-slate-700">{formatDate(a.date)}</Td>
                                    <Td>{formatTime(a.time)}</Td>
                                    <Td className="text-slate-500">{therapistName(db, a.therapistId)}</Td>
                                    <Td>
                                        <Badge className={statusClasses[a.status]}>{statusLabels[a.status]}</Badge>
                                    </Td>
                                    <Td className="text-slate-500">{a.notes || '—'}</Td>
                                </tr>
                            ))}
                        </Table>
                    )
                ) : null}

                {tab === 'payments' ? (
                    data.payments.length === 0 ? (
                        <EmptyState
                            title="لا توجد مدفوعات"
                            action={can('payments', 'create') ? <Button onClick={() => setPaymentOpen(true)}>تسجيل دفعة</Button> : undefined}
                        />
                    ) : (
                        <Table head={['التاريخ', 'المبلغ', 'الطريقة', 'ملاحظات', '']}>
                            {data.payments.map((p) => (
                                <tr key={p.id}>
                                    <Td className="font-semibold text-slate-700">{formatDate(p.date)}</Td>
                                    <Td className="font-bold text-emerald-600">{money(p.amount, currency)}</Td>
                                    <Td>{methodLabels[p.method]}</Td>
                                    <Td className="text-slate-500">{p.notes || '—'}</Td>
                                    <Td className="text-left">
                                        {can('payments', 'delete') ? (
                                            <Button
                                                variant="ghost"
                                                className="px-2 py-1 text-xs text-rose-600 hover:bg-rose-50"
                                                onClick={() => window.confirm('حذف هذه الدفعة؟') && remove('payments', p.id)}
                                            >
                                                حذف
                                            </Button>
                                        ) : null}
                                    </Td>
                                </tr>
                            ))}
                        </Table>
                    )
                ) : null}
            </Card>

            <PatientForm open={editOpen} onClose={() => setEditOpen(false)} editing={patient} />
            <AppointmentForm open={apptOpen} onClose={() => setApptOpen(false)} presetPatientId={patient.id} />
            <SessionForm
                open={sessionOpen}
                onClose={() => {
                    setSessionOpen(false);
                    setEditingSession(null);
                }}
                editing={editingSession}
                presetPatientId={patient.id}
            />
            <PaymentForm open={paymentOpen} onClose={() => setPaymentOpen(false)} presetPatientId={patient.id} />
        </div>
    );
}
