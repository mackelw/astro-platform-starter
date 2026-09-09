/**
 * ترجمات الموقع العام فقط. برنامج الإدارة تحت /app يبقى بالعربية وحدها،
 * فلا يمر من هنا ولا يحتاج طبقة ترجمة.
 */
export const languages = { ar: 'العربية', en: 'English' } as const;

export type Lang = keyof typeof languages;

export const defaultLang: Lang = 'ar';

/** اتجاه الكتابة لكل لغة — يُستخدم في وسم html */
export const dirOf: Record<Lang, 'rtl' | 'ltr'> = { ar: 'rtl', en: 'ltr' };

export const ui = {
    ar: {
        'site.name': 'مركز رينج للعلاج الطبيعي والتأهيل',
        'site.tagline': 'علاج طبيعي وتأهيل حركي على يد متخصصين',
        'site.description': 'مركز رينج للعلاج الطبيعي والتأهيل — تشخيص وعلاج آلام الظهر والرقبة والمفاصل، وتأهيل ما بعد الجراحة والإصابات الرياضية.',

        'nav.home': 'الرئيسية',
        'nav.services': 'الخدمات',
        'nav.conditions': 'الحالات التي نعالجها',
        'nav.exercises': 'دليل التمارين',
        'nav.book': 'احجز موعدك',
        'nav.contact': 'تواصل معنا',
        'nav.staff': 'دخول الموظفين',
        'nav.menu': 'القائمة',

        'home.hero.title': 'استعد حركتك بلا ألم',
        'home.hero.body': 'نضع لك خطة علاجية مبنية على تقييم دقيق، ونتابع تقدمك جلسة بجلسة حتى تعود لحياتك الطبيعية.',
        'home.hero.cta': 'احجز موعدك الآن',
        'home.hero.secondary': 'تعرّف على خدماتنا',
        'home.why.title': 'لماذا مركز رينج؟',
        'home.why.1.title': 'تقييم قبل العلاج',
        'home.why.1.body': 'نبدأ بفحص إكلينيكي وقياس مدى الحركة ودرجة الألم، فتُبنى الخطة على حالتك أنت لا على بروتوكول عام.',
        'home.why.2.title': 'متابعة موثّقة',
        'home.why.2.body': 'كل جلسة تُسجَّل بالإجراءات ومقياس الألم قبل وبعد، فترى تحسنك بالأرقام لا بالانطباع.',
        'home.why.3.title': 'برنامج منزلي',
        'home.why.3.body': 'تخرج من كل جلسة بتمارين واضحة تكمّل العلاج في بيتك وتحافظ على ما وصلت إليه.',
        'home.services.title': 'خدماتنا',
        'home.services.all': 'كل الخدمات',
        'home.conditions.title': 'حالات نعالجها كثيرًا',
        'home.conditions.all': 'كل الحالات',
        'home.exercises.title': 'دليل التمارين',
        'home.exercises.body': 'تمارين تأهيل موضحة خطوة بخطوة، مرتبة حسب منطقة الجسم.',
        'home.exercises.all': 'تصفّح التمارين',

        'services.title': 'الخدمات',
        'services.intro': 'جلسات علاج طبيعي وتأهيل حركي، ومدة كل جلسة وسعرها موضحان أمامك قبل الحجز.',
        'services.duration': 'المدة',
        'services.price': 'السعر',
        'services.minutes': 'دقيقة',

        'conditions.title': 'الحالات التي نعالجها',
        'conditions.intro': 'اعرف حالتك أكثر: الأعراض الشائعة، وكيف نتعامل معها في المركز.',
        'conditions.symptoms': 'الأعراض الشائعة',
        'conditions.treatments': 'كيف نعالجها',
        'conditions.relatedServices': 'الخدمات المرتبطة',
        'conditions.relatedExercises': 'تمارين تساعدك',
        'conditions.cta': 'احجز تقييمًا لحالتك',

        'exercises.title': 'دليل التمارين',
        'exercises.intro': 'تمارين تأهيل يمكنك أداؤها في المنزل. اسأل أخصائيك قبل البدء إن كنت تحت علاج.',
        'exercises.filter': 'منطقة الجسم',
        'exercises.all': 'الكل',
        'exercises.sets': 'المجموعات',
        'exercises.reps': 'التكرارات',
        'exercises.hold': 'مدة الثبات',
        'exercises.equipment': 'الأدوات',
        'exercises.difficulty': 'المستوى',
        'exercises.cautions': 'تنبيهات',
        'exercises.none': 'لا توجد تمارين في هذه المنطقة بعد.',
        'exercises.disclaimer': 'هذا الدليل للتوعية فقط ولا يغني عن تقييم أخصائي. أوقف أي تمرين يسبب ألمًا حادًا واستشرنا.',

        'book.title': 'احجز موعدك',
        'book.intro': 'اختر اليوم والوقت المناسب، وسنؤكد الحجز بمكالمة قصيرة.',
        'book.name': 'الاسم بالكامل',
        'book.phone': 'رقم الهاتف',
        'book.email': 'البريد الإلكتروني (اختياري)',
        'book.service': 'الخدمة',
        'book.service.any': 'غير محدد — سنرشدك',
        'book.therapist': 'الأخصائي',
        'book.therapist.any': 'أي أخصائي متاح',
        'book.date': 'اليوم',
        'book.time': 'الوقت',
        'book.time.choose': 'اختر اليوم أولًا',
        'book.time.none': 'لا توجد مواعيد متاحة في هذا اليوم — جرّب يومًا آخر.',
        'book.time.loading': 'جارٍ تحميل المواعيد المتاحة…',
        'book.message': 'ما الذي تشكو منه؟ (اختياري)',
        'book.submit': 'أرسل طلب الحجز',
        'book.sending': 'جارٍ الإرسال…',
        'book.success.title': 'وصلنا طلبك',
        'book.success.body': 'سنتصل بك لتأكيد الموعد. رقم الطلب:',
        'book.success.again': 'حجز موعد آخر',
        'book.error.required': 'من فضلك أكمل الاسم والهاتف واليوم والوقت.',
        'book.error.name': 'اكتب الاسم بالكامل.',
        'book.error.phone': 'رقم الهاتف غير صحيح.',
        'book.error.generic': 'تعذر إرسال الطلب. حاول مرة أخرى أو اتصل بنا.',
        'book.note': 'الحجز طلب مبدئي ولا يُعتمد إلا بعد تأكيدنا لك.',

        'contact.title': 'تواصل معنا',
        'contact.phone': 'الهاتف',
        'contact.address': 'العنوان',
        'contact.hours': 'ساعات العمل',
        'contact.book': 'أو احجز موعدك مباشرة',

        'footer.rights': 'كل الحقوق محفوظة',
        'footer.staff': 'دخول الموظفين',
        'notFound.title': 'الصفحة غير موجودة',
        'notFound.body': 'الرابط الذي فتحته غير صحيح أو تم تغييره.',
        'notFound.home': 'العودة للرئيسية'
    },
    en: {
        'site.name': 'Range Physiotherapy & Rehabilitation Centre',
        'site.tagline': 'Specialist physiotherapy and movement rehabilitation',
        'site.description':
            'Range Physiotherapy & Rehabilitation Centre — assessment and treatment for back, neck and joint pain, post-operative rehab and sports injuries.',

        'nav.home': 'Home',
        'nav.services': 'Services',
        'nav.conditions': 'Conditions we treat',
        'nav.exercises': 'Exercise library',
        'nav.book': 'Book an appointment',
        'nav.contact': 'Contact',
        'nav.staff': 'Staff login',
        'nav.menu': 'Menu',

        'home.hero.title': 'Move well again, without pain',
        'home.hero.body': 'We build your treatment plan on a proper assessment, then track your progress session by session until you are back to normal life.',
        'home.hero.cta': 'Book an appointment',
        'home.hero.secondary': 'See our services',
        'home.why.title': 'Why Range?',
        'home.why.1.title': 'Assessment before treatment',
        'home.why.1.body': 'We start with a clinical exam, range-of-motion measurement and a pain score, so the plan fits you rather than a generic protocol.',
        'home.why.2.title': 'Progress on record',
        'home.why.2.body': 'Every session logs what was done and your pain before and after, so improvement shows up in numbers, not impressions.',
        'home.why.3.title': 'A home programme',
        'home.why.3.body': 'You leave each session with clear exercises that continue the work at home and hold on to the ground you have gained.',
        'home.services.title': 'Our services',
        'home.services.all': 'All services',
        'home.conditions.title': 'Conditions we treat often',
        'home.conditions.all': 'All conditions',
        'home.exercises.title': 'Exercise library',
        'home.exercises.body': 'Rehab exercises explained step by step, organised by body area.',
        'home.exercises.all': 'Browse exercises',

        'services.title': 'Services',
        'services.intro': 'Physiotherapy and rehabilitation sessions, with the length and price of each shown before you book.',
        'services.duration': 'Duration',
        'services.price': 'Price',
        'services.minutes': 'min',

        'conditions.title': 'Conditions we treat',
        'conditions.intro': 'Understand your condition: the common symptoms, and how we approach it here.',
        'conditions.symptoms': 'Common symptoms',
        'conditions.treatments': 'How we treat it',
        'conditions.relatedServices': 'Related services',
        'conditions.relatedExercises': 'Exercises that help',
        'conditions.cta': 'Book an assessment',

        'exercises.title': 'Exercise library',
        'exercises.intro': 'Rehab exercises you can do at home. If you are already under treatment, check with your therapist first.',
        'exercises.filter': 'Body area',
        'exercises.all': 'All',
        'exercises.sets': 'Sets',
        'exercises.reps': 'Reps',
        'exercises.hold': 'Hold',
        'exercises.equipment': 'Equipment',
        'exercises.difficulty': 'Level',
        'exercises.cautions': 'Cautions',
        'exercises.none': 'No exercises in this area yet.',
        'exercises.disclaimer':
            'This library is for general guidance and is not a substitute for assessment by a therapist. Stop any exercise that causes sharp pain and talk to us.',

        'book.title': 'Book an appointment',
        'book.intro': 'Pick a day and time that suits you, and we will confirm with a short call.',
        'book.name': 'Full name',
        'book.phone': 'Phone number',
        'book.email': 'Email (optional)',
        'book.service': 'Service',
        'book.service.any': 'Not sure — please advise',
        'book.therapist': 'Therapist',
        'book.therapist.any': 'Any available therapist',
        'book.date': 'Day',
        'book.time': 'Time',
        'book.time.choose': 'Choose a day first',
        'book.time.none': 'No times available that day — please try another.',
        'book.time.loading': 'Loading available times…',
        'book.message': 'What is troubling you? (optional)',
        'book.submit': 'Send booking request',
        'book.sending': 'Sending…',
        'book.success.title': 'We have your request',
        'book.success.body': 'We will call you to confirm. Your reference:',
        'book.success.again': 'Book another appointment',
        'book.error.required': 'Please complete your name, phone, day and time.',
        'book.error.name': 'Please enter your full name.',
        'book.error.phone': 'That phone number does not look right.',
        'book.error.generic': 'We could not send your request. Please try again or call us.',
        'book.note': 'A booking is a request and is only final once we confirm it with you.',

        'contact.title': 'Contact us',
        'contact.phone': 'Phone',
        'contact.address': 'Address',
        'contact.hours': 'Opening hours',
        'contact.book': 'Or book an appointment directly',

        'footer.rights': 'All rights reserved',
        'footer.staff': 'Staff login',
        'notFound.title': 'Page not found',
        'notFound.body': 'That link is wrong or has changed.',
        'notFound.home': 'Back to the home page'
    }
} as const;

export type UIKey = keyof (typeof ui)['ar'];

/** يستخرج اللغة من عنوان الصفحة: /en/... إنجليزية، وما عداها عربية */
export function getLangFromUrl(url: URL): Lang {
    const [, first] = url.pathname.split('/');
    return first in ui ? (first as Lang) : defaultLang;
}

/** دالة الترجمة — ترجع نص العربية إن غاب المفتاح في الإنجليزية */
export function useTranslations(lang: Lang) {
    return function t(key: UIKey): string {
        return ui[lang][key] ?? ui[defaultLang][key];
    };
}

/**
 * يبني رابطًا داخل اللغة المطلوبة. المسار يُمرَّر بلا بادئة لغة
 * (مثل 'services' أو '' للرئيسية) فتُضاف /en تلقائيًا للإنجليزية.
 */
export function localizedPath(lang: Lang, path = ''): string {
    const clean = path.replace(/^\/+|\/+$/g, '');
    const prefix = lang === defaultLang ? '' : `/${lang}`;
    return clean ? `${prefix}/${clean}` : prefix || '/';
}

/** يحوّل عنوان الصفحة الحالية إلى نظيره في اللغة الأخرى، فيبقى الزائر في مكانه */
export function switchLangPath(url: URL, to: Lang): string {
    const segments = url.pathname.split('/').filter(Boolean);
    if (segments[0] in ui) segments.shift();
    return localizedPath(to, segments.join('/'));
}
