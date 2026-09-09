import React, { useMemo, useState } from 'react';
import { useStore } from '../store';
import { MODE } from '../api';
import type { Patient, PatientAccessSecret, Program } from '../types';
import ProgramBuilder from '../components/ProgramBuilder';
import { Badge, Button, Card, CardHeader, EmptyState, Table, Td, Textarea } from '../components/ui';
import { adherence, adherenceLevel, exerciseName, itemSummary, LEVEL_CLASSES, PROGRAM_STATUS_CLASSES, PROGRAM_STATUS_LABELS } from '../telerehab';
import { escapeHtml, formatDate, printHTML, todayISO } from '../utils';

function Stat({ label, value, tone = 'text-slate-800' }: { label: string; value: React.ReactNode; tone?: string }) {
    return (
        <div className="rounded-lg bg-slate-50 px-3 py-2">
            <p className="text-[11px] font-semibold text-slate-500">{label}</p>
            <p className={`mt-0.5 text-sm font-bold ${tone}`}>{value}</p>
        </div>
    );
}

/** نسخ نص مع بديل يعمل في المتصفحات التي تمنع الحافظة بلا HTTPS */
async function copyText(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        try {
            const field = document.createElement('textarea');
            field.value = text;
            field.style.cssText = 'position:fixed;opacity:0';
            document.body.appendChild(field);
            field.select();
            const ok = document.execCommand('copy');
            document.body.removeChild(field);
            return ok;
        } catch {
            return false;
        }
    }
}

/**
 * مفتاح دخول المريض.
 *
 * الرابط والرمز مُجزّآن في القاعدة ولا يُسترجعان، فيُعرض نصّهما الصريح مرة واحدة فقط
 * لحظة الإصدار. بعد إغلاق هذه اللوحة لا يبقى إلا إصدار مفتاح جديد.
 */
function AccessCard({ patient }: { patient: Patient }) {
    const { db, manageAccess, can } = useStore();
    const [copied, setCopied] = useState('');
    const [secret, setSecret] = useState<PatientAccessSecret | null>(null);
    const [busy, setBusy] = useState(false);
    const access = db.patientAccess.find((a) => a.patientId === patient.id);
    const canManage = can('patientAccess', 'update');

    if (MODE === 'local') {
        return (
            <Card className="p-4">
                <p className="text-sm font-bold text-slate-700">بوابة المريض غير متاحة في النسخة المحلية</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    البوابة تحتاج نسخة السيرفر حتى يصل إليها المريض من جهازه. في النسخة المحلية اطبع البرنامج وسلّمه للمريض ورقيًا.
                </p>
            </Card>
        );
    }

    const active = Boolean(access?.enabled);
    const link = secret && typeof window !== 'undefined' ? `${window.location.origin}/p?t=${secret.token}` : '';

    const copy = async (value: string, tag: string) => {
        if (await copyText(value)) {
            setCopied(tag);
            window.setTimeout(() => setCopied(''), 2000);
        }
    };

    const issue = async (action: 'issue' | 'regenerate' | 'revoke') => {
        setBusy(true);
        try {
            const result = await manageAccess(patient.id, action);
            if (result) setSecret(result);
            if (action === 'revoke') setSecret(null);
        } finally {
            setBusy(false);
        }
    };

    /** بطاقة يسلّمها الاستقبال للمريض — الفرصة الوحيدة لحفظ الرمز خارج الشاشة */
    const printCard = () => {
        if (!secret) return;
        printHTML(
            `بطاقة دخول - ${patient.name}`,
            `<div class="head">
                <div><h1>${escapeHtml(db.settings.name)}</h1><p class="muted">بطاقة دخول برنامجك المنزلي</p></div>
                <div style="text-align:left"><p class="muted">${escapeHtml(formatDate(todayISO()))}</p></div>
            </div>
            <p class="muted">المريض: <b>${escapeHtml(patient.name)}</b> (${escapeHtml(patient.code)})</p>
            <h2>الطريقة الأولى: افتح الرابط</h2>
            <p style="direction:ltr;text-align:left;word-break:break-all;font-family:monospace;font-size:12px">${escapeHtml(link)}</p>
            <h2>الطريقة الثانية: رقم موبايلك مع هذا الرمز</h2>
            <p style="font-size:30px;font-weight:700;letter-spacing:8px;direction:ltr">${escapeHtml(secret.code)}</p>
            <p class="muted">رقم الموبايل المسجل: ${escapeHtml(patient.phone || '—')}</p>
            <p class="muted" style="margin-top:14px">احتفظ بهذه البطاقة. الرمز خاص بك ولا يمكن للمركز استرجاعه — لو فقدته سيصدر لك رمز جديد${db.settings.phone ? ' بالاتصال على ' + escapeHtml(db.settings.phone) : ''}.</p>`
        );
    };

    return (
        <Card>
            <CardHeader
                title="دخول المريض للبوابة"
                subtitle="أرسل الرابط على واتساب، أو أعطِ المريض رمزه ليدخل برقم موبايله"
                action={
                    canManage ? (
                        <div className="flex flex-wrap gap-2">
                            {!access ? (
                                <Button onClick={() => void issue('issue')} disabled={busy}>
                                    إصدار رابط ورمز
                                </Button>
                            ) : (
                                <>
                                    <Button
                                        variant="secondary"
                                        disabled={busy}
                                        onClick={() => {
                                            if (window.confirm('سيتوقف الرابط والرمز الحاليان فورًا ويُصدر غيرهما، وتنتهي جلسة المريض. متابعة؟')) {
                                                void issue('regenerate');
                                            }
                                        }}
                                    >
                                        إصدار مفتاح جديد
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        disabled={busy}
                                        className={active ? 'text-rose-600 hover:bg-rose-50' : ''}
                                        onClick={() => void issue(active ? 'revoke' : 'issue')}
                                    >
                                        {active ? 'إيقاف الوصول' : 'إعادة التفعيل'}
                                    </Button>
                                </>
                            )}
                        </div>
                    ) : undefined
                }
            />

            {secret ? (
                <div className="m-4 rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
                    <p className="text-sm font-extrabold text-amber-900">انسخ هذه البيانات الآن — لن تظهر مرة أخرى</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-amber-800">
                        الرابط والرمز محفوظان مُجزّأين في قاعدة البيانات، فلا يستطيع أحد في المركز عرضهما لاحقًا. لو فقدهما المريض أصدر له مفتاحًا جديدًا.
                    </p>

                    <div className="mt-3">
                        <p className="mb-1 text-[11px] font-semibold text-amber-900">الرابط السري</p>
                        <div className="flex flex-wrap items-center gap-2">
                            <code dir="ltr" className="min-w-0 grow truncate rounded-lg bg-white px-3 py-2 text-xs text-slate-700">
                                {link}
                            </code>
                            <Button variant="secondary" className="shrink-0" onClick={() => void copy(link, 'link')}>
                                {copied === 'link' ? 'تم النسخ ✓' : 'نسخ'}
                            </Button>
                        </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-end gap-3">
                        <div>
                            <p className="mb-1 text-[11px] font-semibold text-amber-900">
                                رمز الدخول (مع رقم الموبايل <span dir="ltr">{patient.phone || '—'}</span>)
                            </p>
                            <p dir="ltr" className="rounded-lg bg-white px-4 py-2 text-2xl font-extrabold tracking-widest text-teal-800">
                                {secret.code}
                            </p>
                        </div>
                        <Button variant="secondary" onClick={() => void copy(secret.code, 'code')}>
                            {copied === 'code' ? 'تم النسخ ✓' : 'نسخ الرمز'}
                        </Button>
                        <Button variant="secondary" onClick={printCard}>
                            طباعة بطاقة الدخول
                        </Button>
                    </div>

                    <Button className="mt-4 w-full" onClick={() => setSecret(null)}>
                        سلّمتها للمريض — إخفاء
                    </Button>
                </div>
            ) : null}

            {!access ? (
                secret ? null : (
                    <EmptyState title="لم يُصدر مفتاح دخول بعد" hint="بعد الإصدار سيظهر الرابط والرمز مرة واحدة لتنسخهما أو تطبعهما للمريض." />
                )
            ) : (
                <div className="space-y-2 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                        {active ? (
                            <Badge className="bg-emerald-100 text-emerald-800 ring-emerald-200">الوصول مفعّل</Badge>
                        ) : (
                            <Badge className="bg-rose-100 text-rose-800 ring-rose-200">الوصول موقوف</Badge>
                        )}
                        <span className="text-[11px] text-slate-500">صدر في {formatDate(access.createdAt.slice(0, 10))}</span>
                        <span className="text-[11px] text-slate-500">
                            · آخر دخول: {access.lastSeenAt ? formatDate(access.lastSeenAt.slice(0, 10)) : 'لم يدخل بعد'}
                        </span>
                    </div>
                    {!secret ? (
                        <p className="text-[11px] leading-relaxed text-slate-500">
                            الرابط والرمز غير قابلين للعرض بعد إصدارهما — محفوظان مُجزّأين لحماية بيانات المريض. لو فقدهما اضغط «إصدار مفتاح جديد».
                        </p>
                    ) : null}
                </div>
            )}
        </Card>
    );
}

function MessageThread({ patient }: { patient: Patient }) {
    const { db, add, can, user } = useStore();
    const [text, setText] = useState('');

    const messages = useMemo(
        () => db.portalMessages.filter((m) => m.patientId === patient.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
        [db.portalMessages, patient.id]
    );

    const send = () => {
        const body = text.trim();
        if (!body) return;
        // السيرفر يعيد ضبط المرسل من الجلسة؛ الاسم هنا للنسخة المحلية فقط
        add('portalMessages', { patientId: patient.id, text: body, from: 'staff', authorName: user?.name ?? 'المركز', readByStaff: true });
        setText('');
    };

    return (
        <Card>
            <CardHeader title="الرسائل" subtitle="قناة نصية بين المريض والمركز بين الجلسات" />
            <div className="max-h-72 space-y-2 overflow-y-auto p-4">
                {messages.length === 0 ? (
                    <p className="py-6 text-center text-xs text-slate-500">لا توجد رسائل بعد.</p>
                ) : (
                    messages.map((m) => (
                        <div key={m.id} className={`flex ${m.from === 'staff' ? 'justify-start' : 'justify-end'}`}>
                            <div
                                className={`max-w-[80%] rounded-xl px-3 py-2 ${m.from === 'staff' ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-800'}`}
                            >
                                <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.text}</p>
                                <p className={`mt-1 text-[10px] ${m.from === 'staff' ? 'text-teal-100' : 'text-slate-500'}`}>
                                    {m.authorName || (m.from === 'staff' ? 'المركز' : patient.name)} · {formatDate(m.createdAt.slice(0, 10))}
                                </p>
                            </div>
                        </div>
                    ))
                )}
            </div>
            {can('portalMessages', 'create') && MODE !== 'local' ? (
                <div className="flex flex-wrap items-end gap-2 border-t border-slate-200 p-3">
                    <Textarea
                        className="min-h-12 grow"
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder="اكتب رسالة تظهر للمريض في بوابته…"
                    />
                    <Button onClick={send} disabled={!text.trim()}>
                        إرسال
                    </Button>
                </div>
            ) : null}
        </Card>
    );
}

export default function ProgramPanel({ patient }: { patient: Patient }) {
    const { db, can, remove } = useStore();
    const [builderOpen, setBuilderOpen] = useState(false);
    const [editing, setEditing] = useState<Program | null>(null);

    const programs = useMemo(
        () => db.programs.filter((p) => p.patientId === patient.id).sort((a, b) => b.startDate.localeCompare(a.startDate)),
        [db.programs, patient.id]
    );
    const current = programs.find((p) => p.status !== 'done') ?? programs[0] ?? null;
    const logs = useMemo(() => db.programLogs.filter((g) => g.patientId === patient.id), [db.programLogs, patient.id]);
    const stats = useMemo(() => adherence(current, logs), [current, logs]);

    const currentLogs = useMemo(
        () =>
            current
                ? logs
                      .filter((g) => g.programId === current.id)
                      .sort((a, b) => b.date.localeCompare(a.date))
                      .slice(0, 14)
                : [],
        [current, logs]
    );

    const openNew = () => {
        setEditing(null);
        setBuilderOpen(true);
    };

    const printProgram = () => {
        if (!current) return;
        const rows = current.items
            .map(
                (item, index) => `<tr>
                    <td>${index + 1}</td>
                    <td><b>${escapeHtml(exerciseName(db, item.exerciseId))}</b>${item.note ? `<br><span style="font-size:11px;color:#475569">${escapeHtml(item.note)}</span>` : ''}</td>
                    <td>${escapeHtml(itemSummary(item))}</td>
                    <td></td>
                </tr>`
            )
            .join('');

        printHTML(
            `برنامج منزلي - ${patient.name}`,
            `<div class="head">
                <div><h1>${escapeHtml(db.settings.name)}</h1><p class="muted">برنامج تمارين منزلي${db.settings.doctorName ? ' — ' + escapeHtml(db.settings.doctorName) : ''}</p></div>
                <div style="text-align:left"><p class="muted">${escapeHtml(formatDate(todayISO()))}</p></div>
            </div>
            <p class="muted">المريض: <b>${escapeHtml(patient.name)}</b> (${escapeHtml(patient.code)}) — التشخيص: ${escapeHtml(patient.diagnosis || '—')}</p>
            <h2>${escapeHtml(current.title)}</h2>
            <p class="muted">من ${escapeHtml(formatDate(current.startDate))} إلى ${escapeHtml(formatDate(current.endDate))} — ${current.daysPerWeek} أيام أسبوعيًا</p>
            ${current.notes ? `<p><b>تعليمات عامة:</b> ${escapeHtml(current.notes)}</p>` : ''}
            <table><thead><tr><th style="width:28px">#</th><th>التمرين</th><th>الجرعة</th><th style="width:120px">علامة الإنجاز</th></tr></thead><tbody>${rows}</tbody></table>
            <p class="muted" style="margin-top:14px">ضع علامة أمام كل تمرين تنهيه يوميًا. توقف عن أي تمرين يسبب ألمًا حادًا وتواصل مع المركز${db.settings.phone ? ' على ' + escapeHtml(db.settings.phone) : ''}.</p>
            <div class="sign"><span>توقيع الأخصائي: ....................</span><span>ختم العيادة</span></div>`
        );
    };

    if (!current) {
        return (
            <div className="space-y-4 p-4">
                <EmptyState
                    title="لا يوجد برنامج منزلي لهذا المريض"
                    hint="ابنِ برنامجًا من مكتبة التمارين ليصل للمريض على هاتفه ويصلك التزامه يوميًا."
                    action={can('programs', 'create') ? <Button onClick={openNew}>+ برنامج منزلي جديد</Button> : undefined}
                />
                <ProgramBuilder open={builderOpen} onClose={() => setBuilderOpen(false)} patientId={patient.id} editing={null} />
            </div>
        );
    }

    const level = adherenceLevel(stats);

    return (
        <div className="space-y-4 p-4">
            <Card className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-lg font-extrabold text-slate-800">{current.title}</h3>
                            <Badge className={PROGRAM_STATUS_CLASSES[current.status]}>{PROGRAM_STATUS_LABELS[current.status]}</Badge>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                            {formatDate(current.startDate)} ← {formatDate(current.endDate)} · {current.daysPerWeek} أيام أسبوعيًا · {current.items.length} تمرين
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button variant="secondary" onClick={printProgram}>
                            طباعة البرنامج
                        </Button>
                        {can('programs', 'update') ? (
                            <Button
                                variant="secondary"
                                onClick={() => {
                                    setEditing(current);
                                    setBuilderOpen(true);
                                }}
                            >
                                تعديل
                            </Button>
                        ) : null}
                        {can('programs', 'create') ? <Button onClick={openNew}>+ برنامج جديد</Button> : null}
                        {can('programs', 'delete') ? (
                            <Button
                                variant="ghost"
                                className="text-rose-600 hover:bg-rose-50"
                                onClick={() => window.confirm('حذف هذا البرنامج وسجل التزام المريض به؟') && remove('programs', current.id)}
                            >
                                حذف
                            </Button>
                        ) : null}
                    </div>
                </div>

                {current.notes ? <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">{current.notes}</p> : null}

                <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                    <Stat
                        label="الالتزام"
                        value={`${stats.percent}%`}
                        tone={level === 'danger' ? 'text-rose-600' : level === 'warn' ? 'text-amber-600' : 'text-emerald-600'}
                    />
                    <Stat label="أيام نُفّذت" value={`${stats.doneDays} من ${stats.expectedDays}`} />
                    <Stat label="أيام متتالية" value={stats.streak} />
                    <Stat
                        label="منذ آخر تسجيل"
                        value={stats.lastDate ? `${stats.daysSilent} يوم` : 'لم يسجّل بعد'}
                        tone={stats.daysSilent >= 3 ? 'text-rose-600' : 'text-slate-800'}
                    />
                    <Stat
                        label="متوسط الألم"
                        value={
                            stats.averagePain === null ? (
                                '—'
                            ) : (
                                <>
                                    <span dir="ltr">{stats.averagePain}/10</span>
                                    {stats.painChange !== null ? (
                                        <span className={`mr-1 text-[11px] ${stats.painChange < 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                            ({stats.painChange > 0 ? '+' : ''}
                                            {stats.painChange})
                                        </span>
                                    ) : null}
                                </>
                            )
                        }
                    />
                </div>

                <div className="mt-3">
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
                        <div
                            className={`h-full rounded-full transition-all ${
                                level === 'danger' ? 'bg-rose-500' : level === 'warn' ? 'bg-amber-500' : 'bg-emerald-500'
                            }`}
                            style={{ width: `${stats.percent}%` }}
                        />
                    </div>
                </div>
            </Card>

            <Card>
                <CardHeader title={`تمارين البرنامج (${current.items.length})`} />
                <ul className="divide-y divide-slate-100">
                    {current.items.map((item, index) => (
                        <li key={item.id} className="flex items-start gap-3 px-4 py-3">
                            <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-teal-50 text-[11px] font-bold text-teal-700">
                                {index + 1}
                            </span>
                            <div className="min-w-0">
                                <p className="text-sm font-bold text-slate-800">{exerciseName(db, item.exerciseId)}</p>
                                <p className="text-xs text-slate-500">{itemSummary(item)}</p>
                                {item.note ? <p className="mt-1 text-xs text-teal-700">{item.note}</p> : null}
                            </div>
                        </li>
                    ))}
                </ul>
            </Card>

            <Card>
                <CardHeader title="سجل المريض اليومي" subtitle="آخر أربعة عشر يومًا كما سجّلها المريض من بوابته" />
                {currentLogs.length === 0 ? (
                    <EmptyState title="لم يسجّل المريض أي يوم بعد" hint="بعد أن يفتح البوابة ويعلّم تمارينه ستظهر أيامه هنا." />
                ) : (
                    <Table head={['التاريخ', 'المنفَّذ', 'الألم', 'الصعوبة', 'ملاحظة المريض']}>
                        {currentLogs.map((g) => (
                            <tr key={g.id}>
                                <Td className="font-semibold text-slate-700">{formatDate(g.date)}</Td>
                                <Td>
                                    <Badge
                                        className={
                                            g.doneItemIds.length >= current.items.length
                                                ? LEVEL_CLASSES.ok
                                                : g.doneItemIds.length === 0
                                                  ? LEVEL_CLASSES.danger
                                                  : LEVEL_CLASSES.warn
                                        }
                                    >
                                        <span dir="ltr">
                                            {g.doneItemIds.length} / {current.items.length}
                                        </span>
                                    </Badge>
                                </Td>
                                <Td dir="ltr" className="text-right">
                                    {g.pain}/10
                                </Td>
                                <Td dir="ltr" className="text-right">
                                    {g.difficulty}/5
                                </Td>
                                <Td className="text-slate-500">{g.note || '—'}</Td>
                            </tr>
                        ))}
                    </Table>
                )}
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
                <AccessCard patient={patient} />
                <MessageThread patient={patient} />
            </div>

            {programs.length > 1 ? (
                <Card>
                    <CardHeader title="برامج سابقة" />
                    <Table head={['البرنامج', 'الفترة', 'التمارين', 'الحالة']}>
                        {programs
                            .filter((p) => p.id !== current.id)
                            .map((p) => (
                                <tr key={p.id}>
                                    <Td className="font-semibold text-slate-700">{p.title}</Td>
                                    <Td className="text-slate-500">
                                        {formatDate(p.startDate)} ← {formatDate(p.endDate)}
                                    </Td>
                                    <Td>{p.items.length}</Td>
                                    <Td>
                                        <Badge className={PROGRAM_STATUS_CLASSES[p.status]}>{PROGRAM_STATUS_LABELS[p.status]}</Badge>
                                    </Td>
                                </tr>
                            ))}
                    </Table>
                </Card>
            ) : null}

            <ProgramBuilder
                open={builderOpen}
                onClose={() => {
                    setBuilderOpen(false);
                    setEditing(null);
                }}
                patientId={patient.id}
                editing={editing}
            />
        </div>
    );
}
