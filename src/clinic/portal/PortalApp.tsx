import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { ID, PromTemplateId } from '../types';
import { portalApi, PortalError, type PortalView } from './api';
import ExerciseCard from './ExerciseCard';
import PromForm from '../components/PromForm';
import { Button, Card, Field, Input, Textarea } from '../components/ui';
import { PROM_TEMPLATES, promTemplate } from '../prom';
import { addDays, formatDate, formatDateLong, formatTime, todayISO } from '../utils';

type Status = 'loading' | 'login' | 'ready';

/** اختيار المريض للغة يبقى على جهازه */
const LANG_KEY = 'clinic-portal-lang';

/* ------------------------------- شاشة الدخول ------------------------------- */

function LoginScreen({ notice, onDone }: { notice: string; onDone: (view: PortalView) => void }) {
    const [phone, setPhone] = useState('');
    const [code, setCode] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setBusy(true);
        setError('');
        try {
            const result = await portalApi.login(phone, code);
            onDone(result.view);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'تعذر الدخول');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
            <div className="mb-6 text-center">
                <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-teal-600 text-3xl text-white">✚</div>
                <h1 className="mt-3 text-xl font-extrabold text-slate-800">برنامجك المنزلي</h1>
                <p className="mt-1 text-sm text-slate-500">ادخل برقم موبايلك ورمز الدخول الذي أعطاك إياه المركز.</p>
            </div>

            {notice ? <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-center text-sm font-semibold text-amber-900">{notice}</p> : null}

            <Card className="p-5">
                <form onSubmit={submit} className="space-y-4">
                    <Field label="رقم الموبايل">
                        <Input
                            dir="ltr"
                            inputMode="tel"
                            autoComplete="tel"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            placeholder="01012345678"
                            className="py-3 text-center text-lg"
                        />
                    </Field>
                    <Field label="رمز الدخول">
                        <Input
                            dir="ltr"
                            inputMode="numeric"
                            value={code}
                            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            placeholder="——————"
                            className="py-3 text-center text-2xl tracking-[0.4em]"
                        />
                    </Field>

                    {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</p> : null}

                    <Button type="submit" className="w-full py-3 text-base" disabled={busy || !phone.trim() || code.length < 4}>
                        {busy ? 'جارٍ الدخول…' : 'دخول'}
                    </Button>
                </form>
            </Card>

            <p className="mt-5 text-center text-xs leading-relaxed text-slate-500">لا تملك رمزًا؟ اتصل بالمركز واطلب رابط برنامجك أو رمز الدخول.</p>
        </div>
    );
}

/* ------------------------------ شريط الأيام ------------------------------ */

function DayStrip({ view }: { view: PortalView }) {
    const today = todayISO();
    const days = useMemo(() => {
        const doneDates = new Set(view.logs.filter((l) => l.doneItemIds.length > 0).map((l) => l.date));
        return Array.from({ length: 14 }, (_, i) => {
            const date = addDays(today, -(13 - i));
            return { date, done: doneDates.has(date), isToday: date === today };
        });
    }, [view.logs, today]);

    return (
        <div className="flex flex-row-reverse justify-center gap-1.5">
            {days.map((day) => (
                <span
                    key={day.date}
                    title={formatDate(day.date)}
                    className={`size-5 rounded-full ${day.done ? 'bg-emerald-500' : day.isToday ? 'bg-white ring-2 ring-teal-500' : 'bg-white/40'}`}
                />
            ))}
        </div>
    );
}

/* ------------------------------ الشاشة الرئيسية ------------------------------ */

function Portal({ view, setView, onSignOut }: { view: PortalView; setView: (v: PortalView) => void; onSignOut: () => void }) {
    const today = todayISO();
    const todayLog = view.logs.find((l) => l.date === today) ?? null;

    const [draft, setDraft] = useState({ pain: 0, difficulty: 0, note: '' });
    const [syncKey, setSyncKey] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [saved, setSaved] = useState(false);
    const [promId, setPromId] = useState<PromTemplateId | null>(null);
    const [messageText, setMessageText] = useState('');
    const [english, setEnglish] = useState(() => {
        try {
            return window.localStorage.getItem(LANG_KEY) === 'en';
        } catch {
            return false;
        }
    });

    const toggleLanguage = () => {
        setEnglish((prev) => {
            const next = !prev;
            try {
                window.localStorage.setItem(LANG_KEY, next ? 'en' : 'ar');
            } catch {
                /* متصفح يمنع التخزين — الاختيار يبقى لهذه الجلسة فقط */
            }
            return next;
        });
    };

    // نعرض الإنجليزية فقط إن كان في البرنامج نص إنجليزي أصلًا
    const hasEnglish = view.exercises.some((x) => x.nameEn || x.instructionsEn);

    // نعيد تعبئة التقييم من سجل اليوم كلما تغيّر (أو تغيّر اليوم نفسه)
    const currentKey = `${today}-${todayLog ? `${todayLog.pain}-${todayLog.difficulty}-${todayLog.note}` : 'new'}`;
    if (syncKey !== currentKey) {
        setSyncKey(currentKey);
        setDraft({ pain: todayLog?.pain ?? 0, difficulty: todayLog?.difficulty ?? 0, note: todayLog?.note ?? '' });
    }

    const doneIds = useMemo(() => new Set(todayLog?.doneItemIds ?? []), [todayLog]);
    const items = view.program?.items ?? [];
    const exerciseById = useMemo(() => new Map(view.exercises.map((x) => [x.id, x])), [view.exercises]);

    const run = useCallback(
        async (task: () => Promise<{ view: PortalView }>) => {
            setBusy(true);
            setError('');
            try {
                const result = await task();
                setView(result.view);
                setSaved(true);
                window.setTimeout(() => setSaved(false), 2000);
            } catch (err) {
                if (err instanceof PortalError && err.status === 401) {
                    onSignOut();
                    return;
                }
                setError(err instanceof Error ? err.message : 'تعذر الحفظ');
            } finally {
                setBusy(false);
            }
        },
        [setView, onSignOut]
    );

    const saveLog = (doneItemIds: ID[], assessment = draft) =>
        run(() => portalApi.saveLog({ date: today, doneItemIds, pain: assessment.pain, difficulty: assessment.difficulty, note: assessment.note }));

    const toggle = (itemId: ID) => {
        const next = new Set(doneIds);
        if (next.has(itemId)) next.delete(itemId);
        else next.add(itemId);
        void saveLog([...next]);
    };

    const doneCount = items.filter((i) => doneIds.has(i.id)).length;
    const allDone = items.length > 0 && doneCount === items.length;
    const percent = items.length ? Math.round((doneCount / items.length) * 100) : 0;

    const template = promId ? (promTemplate(promId) ?? null) : null;
    const promsDue = PROM_TEMPLATES.filter((t) => view.proms.includes(t.id));

    return (
        <div className="min-h-screen bg-slate-100 pb-16">
            <header className="bg-teal-700 px-4 pb-5 pt-4 text-white">
                <div className="mx-auto max-w-2xl">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <p className="text-xs text-teal-100">{view.clinicName}</p>
                            <h1 className="mt-0.5 text-lg font-extrabold">أهلًا {view.patient.name.split(' ')[0]}</h1>
                            <p className="mt-0.5 text-xs text-teal-100">{formatDateLong(today)}</p>
                        </div>
                        <div className="flex shrink-0 gap-1.5">
                            {hasEnglish ? (
                                <button
                                    type="button"
                                    onClick={toggleLanguage}
                                    className="cursor-pointer rounded-lg bg-teal-600 px-2.5 py-1.5 text-xs font-semibold"
                                    aria-label={english ? 'التبديل إلى العربية' : 'Switch to English'}
                                >
                                    {english ? 'عربي' : 'EN'}
                                </button>
                            ) : null}
                            <button type="button" onClick={onSignOut} className="cursor-pointer rounded-lg bg-teal-600 px-2.5 py-1.5 text-xs font-semibold">
                                {english ? 'Exit' : 'خروج'}
                            </button>
                        </div>
                    </div>

                    <div className="mt-4">
                        <div className="mb-1.5 flex items-center justify-between text-xs font-semibold">
                            <span>{allDone ? 'أنهيت تمارين اليوم — أحسنت 👏' : `${doneCount} من ${items.length} تمارين اليوم`}</span>
                            <span>{percent}%</span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-teal-800">
                            <div className="h-full rounded-full bg-white transition-all" style={{ width: `${percent}%` }} />
                        </div>
                        <div className="mt-3">
                            <DayStrip view={view} />
                        </div>
                    </div>
                </div>
            </header>

            <main className="mx-auto max-w-2xl space-y-4 px-4 py-4">
                {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</p> : null}
                {saved ? <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">تم الحفظ ✓</p> : null}

                {!view.program ? (
                    <Card className="p-6 text-center">
                        <p className="text-sm font-bold text-slate-700">لا يوجد برنامج منزلي لك حاليًا</p>
                        <p className="mt-1 text-xs text-slate-500">سيظهر برنامجك هنا فور أن يجهّزه أخصائيك.</p>
                    </Card>
                ) : (
                    <>
                        <div>
                            <h2 className="mb-1 text-base font-extrabold text-slate-800">{view.program.title}</h2>
                            <p className="text-xs text-slate-500">
                                {view.program.daysPerWeek} أيام أسبوعيًا · حتى {formatDate(view.program.endDate)}
                            </p>
                        </div>

                        {view.program.notes ? (
                            <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm leading-relaxed font-semibold text-amber-900">{view.program.notes}</p>
                        ) : null}

                        <ul className="space-y-3">
                            {items.map((item, index) => (
                                <ExerciseCard
                                    key={item.id}
                                    item={item}
                                    exercise={exerciseById.get(item.exerciseId)}
                                    index={index}
                                    done={doneIds.has(item.id)}
                                    onToggle={() => toggle(item.id)}
                                    disabled={busy}
                                    english={english}
                                />
                            ))}
                        </ul>

                        <Card className="p-4">
                            <h3 className="text-sm font-extrabold text-slate-800">كيف كان يومك؟</h3>
                            <p className="mt-0.5 text-xs text-slate-500">هذه الأرقام يراها أخصائيك ويبني عليها تعديل برنامجك.</p>

                            <div className="mt-4">
                                <div className="mb-1 flex items-center justify-between text-xs font-semibold text-slate-600">
                                    <span>شدة الألم اليوم</span>
                                    <span dir="ltr" className="text-base font-extrabold text-teal-700">
                                        {draft.pain} / 10
                                    </span>
                                </div>
                                <input
                                    type="range"
                                    min={0}
                                    max={10}
                                    value={draft.pain}
                                    onChange={(e) => setDraft((p) => ({ ...p, pain: Number(e.target.value) }))}
                                    className="w-full accent-teal-600"
                                    aria-label="شدة الألم"
                                />
                                <div className="flex justify-between text-[10px] text-slate-400">
                                    <span>لا ألم</span>
                                    <span>أشد ألم</span>
                                </div>
                            </div>

                            <div className="mt-4">
                                <div className="mb-1 flex items-center justify-between text-xs font-semibold text-slate-600">
                                    <span>صعوبة التمارين</span>
                                    <span dir="ltr" className="text-base font-extrabold text-teal-700">
                                        {draft.difficulty} / 5
                                    </span>
                                </div>
                                <input
                                    type="range"
                                    min={0}
                                    max={5}
                                    value={draft.difficulty}
                                    onChange={(e) => setDraft((p) => ({ ...p, difficulty: Number(e.target.value) }))}
                                    className="w-full accent-teal-600"
                                    aria-label="صعوبة التمارين"
                                />
                                <div className="flex justify-between text-[10px] text-slate-400">
                                    <span>سهلة</span>
                                    <span>صعبة جدًا</span>
                                </div>
                            </div>

                            <Field label="ملاحظة لأخصائيك (اختياري)" className="mt-4">
                                <Textarea
                                    className="min-h-16"
                                    value={draft.note}
                                    onChange={(e) => setDraft((p) => ({ ...p, note: e.target.value }))}
                                    placeholder="شعرت بشدّ في الظهر أثناء التمرين الثالث…"
                                />
                            </Field>

                            <Button className="mt-3 w-full py-3 text-base" onClick={() => void saveLog([...doneIds])} disabled={busy}>
                                {busy ? 'جارٍ الحفظ…' : 'حفظ تقييم اليوم'}
                            </Button>
                        </Card>
                    </>
                )}

                {promsDue.length > 0 ? (
                    <Card className="p-4">
                        <h3 className="text-sm font-extrabold text-slate-800">استبيانات المتابعة</h3>
                        <p className="mt-0.5 text-xs text-slate-500">يطلب منك أخصائيك ملأها من وقت لآخر لقياس تحسنك بدقة.</p>
                        <div className="mt-3 space-y-2">
                            {promsDue.map((t) => {
                                const history = view.promHistory.filter((h) => h.templateId === t.id);
                                const last = history[history.length - 1];
                                return (
                                    <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3">
                                        <div className="min-w-0">
                                            <p className="text-sm font-bold text-slate-800">{t.name}</p>
                                            <p className="text-xs text-slate-500">
                                                {last ? (
                                                    <>
                                                        آخر مرة {formatDate(last.date)} · الدرجة{' '}
                                                        <span dir="ltr">
                                                            {last.score} {t.unit}
                                                        </span>
                                                    </>
                                                ) : (
                                                    'لم تملأه بعد'
                                                )}
                                            </p>
                                        </div>
                                        <Button variant="secondary" className="shrink-0" onClick={() => setPromId(t.id)}>
                                            {last ? 'إعادة الملء' : 'ابدأ'}
                                        </Button>
                                    </div>
                                );
                            })}
                        </div>
                    </Card>
                ) : null}

                {view.appointments.length > 0 ? (
                    <Card className="p-4">
                        <h3 className="text-sm font-extrabold text-slate-800">مواعيدك القادمة</h3>
                        <ul className="mt-2 space-y-1.5">
                            {view.appointments.map((a) => (
                                <li key={`${a.date}-${a.time}`} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                                    <span className="font-semibold text-slate-700">{formatDate(a.date)}</span>
                                    <span className="text-slate-500">{formatTime(a.time)}</span>
                                </li>
                            ))}
                        </ul>
                    </Card>
                ) : null}

                <Card className="p-4">
                    <h3 className="text-sm font-extrabold text-slate-800">تواصل مع المركز</h3>
                    <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
                        {view.messages.length === 0 ? (
                            <p className="py-4 text-center text-xs text-slate-500">لا توجد رسائل بعد.</p>
                        ) : (
                            view.messages.map((m, i) => (
                                <div key={i} className={`flex ${m.from === 'staff' ? 'justify-start' : 'justify-end'}`}>
                                    <div
                                        className={`max-w-[85%] rounded-xl px-3 py-2 ${m.from === 'staff' ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-800'}`}
                                    >
                                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.text}</p>
                                        <p className={`mt-1 text-[10px] ${m.from === 'staff' ? 'text-teal-100' : 'text-slate-500'}`}>
                                            {m.authorName} · {formatDate(m.createdAt.slice(0, 10))}
                                        </p>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                    <div className="mt-3 space-y-2">
                        <Textarea
                            className="min-h-16"
                            value={messageText}
                            onChange={(e) => setMessageText(e.target.value)}
                            placeholder="اكتب سؤالك أو ملاحظتك…"
                        />
                        <Button
                            className="w-full"
                            disabled={busy || !messageText.trim()}
                            onClick={() => {
                                const text = messageText.trim();
                                setMessageText('');
                                void run(() => portalApi.sendMessage(text));
                            }}
                        >
                            إرسال
                        </Button>
                    </div>
                    {view.clinicPhone ? (
                        <p className="mt-3 text-center text-xs text-slate-500">
                            للحالات العاجلة اتصل بالمركز:{' '}
                            <a dir="ltr" href={`tel:${view.clinicPhone}`} className="font-bold text-teal-700">
                                {view.clinicPhone}
                            </a>
                        </p>
                    ) : null}
                </Card>
            </main>

            <PromForm
                open={Boolean(template)}
                template={template}
                busy={busy}
                onClose={() => setPromId(null)}
                onSubmit={(answers) => {
                    if (!template) return;
                    setPromId(null);
                    void run(() => portalApi.saveProm(template.id, answers));
                }}
            />
        </div>
    );
}

/* --------------------------------- الجذر --------------------------------- */

export default function PortalApp() {
    const [status, setStatus] = useState<Status>('loading');
    const [view, setView] = useState<PortalView | null>(null);
    const [notice, setNotice] = useState('');

    useEffect(() => {
        document.getElementById('portal-boot')?.remove();

        const params = new URLSearchParams(window.location.search);
        const token = params.get('t') ?? undefined;

        void (async () => {
            try {
                const result = await portalApi.session(token);
                if (result.authenticated && result.view) {
                    setView(result.view);
                    setStatus('ready');
                } else {
                    setStatus('login');
                }
            } catch (err) {
                // رابط منتهٍ أو موقوف: نشرح السبب ونعرض الدخول بالرمز كبديل
                setNotice(err instanceof PortalError && err.status === 401 ? err.message : '');
                setStatus('login');
            } finally {
                if (token) {
                    // لا نترك الرمز السري في شريط العنوان ولا في سجل التصفح
                    params.delete('t');
                    const rest = params.toString();
                    window.history.replaceState({}, '', window.location.pathname + (rest ? `?${rest}` : ''));
                }
            }
        })();
    }, []);

    const signOut = useCallback(() => {
        void portalApi.logout().catch(() => undefined);
        setView(null);
        setNotice('');
        setStatus('login');
    }, []);

    if (status === 'loading') {
        return (
            <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-center">
                <div className="flex size-12 items-center justify-center rounded-xl bg-teal-600 text-2xl text-white">✚</div>
                <p className="text-sm font-bold text-slate-600">جارٍ فتح برنامجك…</p>
            </div>
        );
    }

    if (status === 'ready' && view) {
        return <Portal view={view} setView={setView} onSignOut={signOut} />;
    }

    return (
        <LoginScreen
            notice={notice}
            onDone={(next) => {
                setView(next);
                setNotice('');
                setStatus('ready');
            }}
        />
    );
}
