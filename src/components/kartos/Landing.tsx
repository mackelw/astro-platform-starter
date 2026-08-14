import { Logo, useLang } from './ui';

const FEATURES = [
    {
        icon: '🗂️',
        en: {
            title: 'Role-based dashboards',
            body: 'Owner, senior clinician, physiotherapist, reception and HR each get a screen built around what they actually do — nothing more to wade through.'
        },
        ar: {
            title: 'لوحات مخصصة لكل دور',
            body: 'المالك، الاستشاري، الأخصائي، السكرتارية والموارد البشرية — كل واحد له شاشة مبنية على شغله فعلياً.'
        }
    },
    {
        icon: '⏱️',
        en: {
            title: 'Live waiting queue',
            body: 'Reception registers a patient and the clinician sees them appear. Entries clear themselves once the session is saved or the fee is collected.'
        },
        ar: {
            title: 'قائمة انتظار لحظية',
            body: 'السكرتارية تسجل المريض فيظهر فوراً عند الطبيب، ويختفي تلقائياً بعد إنهاء الجلسة أو التحصيل.'
        }
    },
    {
        icon: '📋',
        en: {
            title: 'Programs and session logs',
            body: 'Build a treatment program once; every session records which items were executed, plus VAS, ROM and MMT readings on a timeline.'
        },
        ar: {
            title: 'البرامج وسجل الجلسات',
            body: 'ابنِ البرنامج العلاجي مرة واحدة، وكل جلسة تسجل ما تم تنفيذه مع قياسات VAS وROM وMMT على خط زمني.'
        }
    },
    {
        icon: '🏠',
        en: {
            title: 'Home program + patient portal',
            body: 'Assign exercises with video demos. Patients open them from a phone using a patient code — no account, no app install.'
        },
        ar: {
            title: 'البرنامج المنزلي وبوابة المريض',
            body: 'تمارين مع فيديو توضيحي، يفتحها المريض من موبايله بكود المريض فقط — بدون حساب أو تطبيق.'
        }
    },
    {
        icon: '💰',
        en: {
            title: 'Payroll engine',
            body: 'Base salary, per-shift pay, consultant commission on sessions run, bonuses and deductions — computed per month and exportable as CSV.'
        },
        ar: {
            title: 'محرك الرواتب',
            body: 'الأساسي + الشيفتات + نسبة الاستشاري من الكشوفات + المكافآت − الخصومات، محسوبة شهرياً وقابلة للتصدير CSV.'
        }
    },
    {
        icon: '🔬',
        en: {
            title: 'Research center',
            body: 'Search Semantic Scholar and PubMed by diagnosis, then turn the evidence into a draft exercise program you can edit before prescribing.'
        },
        ar: {
            title: 'مركز الأبحاث',
            body: 'ابحث في Semantic Scholar وPubMed حسب التشخيص، وحوّل النتائج إلى مسودة برنامج تمارين تعدّلها قبل الوصف.'
        }
    }
];

const ROLES = [
    { href: '/login', en: 'Log in to your clinic', ar: 'تسجيل الدخول للعيادة', primary: true },
    { href: '/register', en: 'Register a new clinic', ar: 'تسجيل عيادة جديدة', primary: false },
    { href: '/portal', en: 'Patient portal', ar: 'بوابة المرضى', primary: false }
];

export default function Landing() {
    const { lang, setLang, t } = useLang();
    const isAr = lang === 'ar';

    return (
        <div className="min-h-screen bg-[var(--color-canvas)]">
            <header className="border-b border-[var(--color-line)] bg-white">
                <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4 sm:px-6">
                    <Logo />
                    <span className="text-lg font-extrabold text-brand-500">{t('brand')}</span>
                    <div className="ms-auto flex gap-2">
                        <button type="button" className="k-btn-ghost" onClick={() => setLang(isAr ? 'en' : 'ar')}>
                            🌐 {t('langToggle')}
                        </button>
                        <a href="/login" className="k-btn-primary no-underline">
                            {t('login')}
                        </a>
                    </div>
                </div>
            </header>

            <section className="bg-gradient-to-b from-brand-700 to-brand-900 px-4 py-16 text-white sm:px-6">
                <div className="mx-auto max-w-3xl text-center">
                    <div className="mb-6 flex justify-center">
                        <Logo size={72} />
                    </div>
                    <h1 className="text-white">
                        {isAr ? 'نظام كارتوس لإدارة العلاج الطبيعي' : 'Kartos Physiotherapy Management System'}
                    </h1>
                    <p className="mx-auto mt-4 max-w-2xl text-lg text-brand-100">
                        {isAr
                            ? 'منصة متكاملة تربط السكرتارية والأطباء والموارد البشرية والمرضى في مكان واحد.'
                            : 'One integrated platform linking reception, clinicians, HR and patients.'}
                    </p>
                    <div className="mt-8 flex flex-wrap justify-center gap-3">
                        {ROLES.map((r) => (
                            <a
                                key={r.href}
                                href={r.href}
                                className={`no-underline ${r.primary ? 'k-btn-gold' : 'k-btn border border-white/40 bg-white/10 text-white hover:bg-white/20'}`}
                            >
                                {isAr ? r.ar : r.en}
                            </a>
                        ))}
                    </div>
                </div>
            </section>

            <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
                <h2 className="text-center text-brand-500">{isAr ? 'ما الذي يقدمه النظام' : 'What the system covers'}</h2>
                <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    {FEATURES.map((f) => {
                        const copy = isAr ? f.ar : f.en;
                        return (
                            <article key={f.en.title} className="k-card p-5">
                                <span className="text-2xl" aria-hidden="true">
                                    {f.icon}
                                </span>
                                <h3 className="mt-3 text-brand-500">{copy.title}</h3>
                                <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted)]">{copy.body}</p>
                            </article>
                        );
                    })}
                </div>
            </section>

            <section className="border-t border-[var(--color-line)] bg-white px-4 py-12 sm:px-6">
                <div className="mx-auto max-w-3xl text-center">
                    <h2 className="text-brand-500">{isAr ? 'ابدأ في دقيقة' : 'Set up in a minute'}</h2>
                    <p className="mt-3 text-[var(--color-muted)]">
                        {isAr
                            ? 'سجّل عيادتك، أنشئ حساباً لكل دور من لوحة الموارد البشرية، ثم جرّب النظام من كل زاوية.'
                            : 'Register your clinic, create an account for each role from the HR screen, then explore the system from every angle.'}
                    </p>
                    <a href="/register" className="k-btn-primary mt-6 no-underline">
                        {t('registerClinic')}
                    </a>
                </div>
            </section>

            <footer className="border-t border-[var(--color-line)] px-4 py-6 text-center text-xs text-[var(--color-muted)] sm:px-6">
                Kartos — {isAr ? 'نظام إدارة العلاج الطبيعي' : 'Physiotherapy Management System'}
            </footer>
        </div>
    );
}
