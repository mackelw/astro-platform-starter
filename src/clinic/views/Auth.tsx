import React, { useEffect, useState } from 'react';
import { useStore } from '../store';
import { Button, Field, Input } from '../components/ui';
import { initialLang, isRtl, LANG_KEY, type Lang } from '../i18n';

/**
 * نصوص شاشة الدخول باللغتين — بوابة المريض تعمل بالإنجليزية،
 * فلا معنى لأن يكون بابها بالعربية وحدها أمام المقيمين والسائحين.
 */
const LOGIN_TEXT = {
    ar: {
        subtitle: 'سجّل الدخول للمتابعة',
        username: 'اسم المستخدم',
        password: 'كلمة السر',
        submit: 'دخول',
        busy: 'جارٍ الدخول…',
        failed: 'تعذر تسجيل الدخول',
        hint: 'لو نسيت كلمة السر، اطلب من المركز إعادة تعيينها.'
    },
    en: {
        subtitle: 'Sign in to continue',
        username: 'Username',
        password: 'Password',
        submit: 'Sign in',
        busy: 'Signing in…',
        failed: 'Could not sign in',
        hint: 'Forgot your password? Ask the clinic to reset it for you.'
    }
} as const;

function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
    return (
        <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
            <div className="w-full max-w-md">
                <div className="mb-5 flex flex-col items-center gap-2 text-center">
                    <div className="flex size-12 items-center justify-center rounded-xl bg-teal-600 text-2xl text-white">✚</div>
                    <h1 className="text-lg font-extrabold text-slate-800">{title}</h1>
                    <p className="text-sm text-slate-500">{subtitle}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">{children}</div>
            </div>
        </div>
    );
}

export function LoginScreen() {
    const { db, signIn } = useStore();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [lang, setLang] = useState<Lang>('ar');
    const text = LOGIN_TEXT[lang];

    // اللغة تُقرأ بعد الإقلاع حتى لا يختلف ما يرسمه السيرفر عما يرسمه المتصفح
    useEffect(() => setLang(initialLang()), []);

    useEffect(() => {
        document.documentElement.setAttribute('dir', isRtl(lang) ? 'rtl' : 'ltr');
        document.documentElement.setAttribute('lang', lang);
    }, [lang]);

    const switchLang = () => {
        const next: Lang = lang === 'ar' ? 'en' : 'ar';
        setLang(next);
        try {
            window.localStorage.setItem(LANG_KEY, next);
        } catch {
            /* المتصفح يمنع التخزين — اللغة تعمل لهذه الجلسة فقط */
        }
    };

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setBusy(true);
        setError('');
        try {
            await signIn(username, password);
        } catch (err) {
            setError(err instanceof Error ? err.message : text.failed);
        } finally {
            setBusy(false);
        }
    };

    return (
        <AuthShell title={lang === 'ar' ? db.settings.name : db.settings.nameEn || db.settings.name} subtitle={text.subtitle}>
            <div className="mb-3 flex justify-end">
                <button
                    type="button"
                    onClick={switchLang}
                    className="cursor-pointer rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
                >
                    {lang === 'ar' ? 'English' : 'العربية'}
                </button>
            </div>
            <form onSubmit={submit} className="space-y-3">
                {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</p> : null}
                <Field label={text.username}>
                    <Input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus dir="ltr" className="text-right" />
                </Field>
                <Field label={text.password}>
                    <Input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="current-password"
                        dir="ltr"
                        className="text-right"
                    />
                </Field>
                <Button type="submit" className="w-full" disabled={busy || !username || !password}>
                    {busy ? text.busy : text.submit}
                </Button>
            </form>
            <p className="mt-4 text-center text-[11px] text-slate-400">{text.hint}</p>
        </AuthShell>
    );
}

export function SetupScreen() {
    const { setupAdmin } = useStore();
    const [form, setForm] = useState({ clinicName: 'مركز رينج للعلاج الطبيعي والتأهيل', name: 'د. مايكل مجدي', username: '', password: '', confirm: '' });
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const set = (key: keyof typeof form, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (form.password.length < 8) {
            setError('كلمة السر يجب ألا تقل عن 8 أحرف');
            return;
        }
        if (form.password !== form.confirm) {
            setError('كلمتا السر غير متطابقتين');
            return;
        }
        setBusy(true);
        setError('');
        try {
            await setupAdmin({ username: form.username, password: form.password, name: form.name, clinicName: form.clinicName });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'تعذر إنشاء الحساب');
        } finally {
            setBusy(false);
        }
    };

    return (
        <AuthShell title="الإعداد الأول للنظام" subtitle="أنشئ حساب المدير — يُعرض هذا مرة واحدة فقط">
            <form onSubmit={submit} className="space-y-3">
                {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</p> : null}
                <Field label="اسم المركز">
                    <Input value={form.clinicName} onChange={(e) => set('clinicName', e.target.value)} />
                </Field>
                <Field label="اسمك">
                    <Input value={form.name} onChange={(e) => set('name', e.target.value)} />
                </Field>
                <Field label="اسم المستخدم للدخول" hint="حروف إنجليزية وأرقام، 3 أحرف على الأقل">
                    <Input value={form.username} onChange={(e) => set('username', e.target.value)} autoComplete="username" dir="ltr" className="text-right" />
                </Field>
                <Field label="كلمة السر" hint="8 أحرف على الأقل — احتفظ بها في مكان آمن">
                    <Input
                        type="password"
                        value={form.password}
                        onChange={(e) => set('password', e.target.value)}
                        autoComplete="new-password"
                        dir="ltr"
                        className="text-right"
                    />
                </Field>
                <Field label="تأكيد كلمة السر">
                    <Input
                        type="password"
                        value={form.confirm}
                        onChange={(e) => set('confirm', e.target.value)}
                        autoComplete="new-password"
                        dir="ltr"
                        className="text-right"
                    />
                </Field>
                <Button type="submit" className="w-full" disabled={busy || !form.username || !form.password}>
                    {busy ? 'جارٍ الإنشاء…' : 'إنشاء الحساب والدخول'}
                </Button>
            </form>
        </AuthShell>
    );
}

export function ErrorScreen() {
    const { error, refresh } = useStore();
    const [busy, setBusy] = useState(false);

    const retry = async () => {
        setBusy(true);
        await refresh();
        setBusy(false);
    };

    return (
        <AuthShell title="تعذر الاتصال بالسيرفر" subtitle="البرنامج لم يستطع الوصول إلى بيانات المركز">
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error || 'تعذر الوصول إلى السيرفر'}</p>
            <ul className="mt-3 space-y-1.5 text-xs leading-relaxed text-slate-600">
                <li>• تأكد من اتصال الجهاز بالشبكة أو الإنترنت.</li>
                <li>• لو البرنامج يعمل على جهاز داخل المركز، تأكد أن نافذة التشغيل ما زالت مفتوحة.</li>
                <li>• إن استمرت المشكلة بعد إعادة المحاولة، أبلغ المسؤول التقني بالرسالة الظاهرة أعلاه.</li>
            </ul>
            <Button className="mt-4 w-full" onClick={() => void retry()} disabled={busy}>
                {busy ? 'جارٍ المحاولة…' : 'إعادة المحاولة'}
            </Button>
        </AuthShell>
    );
}

export function LoadingScreen() {
    return (
        <div className="flex min-h-screen items-center justify-center bg-slate-100">
            <p className="text-sm font-semibold text-slate-500">جارٍ التحميل…</p>
        </div>
    );
}
