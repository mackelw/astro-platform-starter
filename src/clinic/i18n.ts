/**
 * الترجمة العربية/الإنجليزية لبوابة المريض.
 *
 * شاشات الإدارة داخل المركز تبقى بالعربية (فريق العمل يتحدث العربية)،
 * أما ما يراه المريض فيجب أن يعمل بالإنجليزية أيضًا لخدمة المقيمين والسائحين
 * في الغردقة والجونة وسهل حشيش ومكادي وسوما باي.
 */
export type Lang = 'ar' | 'en';

export const LANG_KEY = 'range-portal-lang';

type Dict = Record<string, [ar: string, en: string]>;

const DICT: Dict = {
    /* التنقل */
    'nav.home': ['الرئيسية', 'Home'],
    'nav.exercises': ['تماريني', 'My Exercises'],
    'nav.appointments': ['المواعيد', 'Appointments'],
    'nav.record': ['ملفي الطبي', 'Medical Record'],
    'nav.services': ['الخدمات والأسعار', 'Services & Prices'],
    'nav.family': ['حسابات الأسرة', 'Family Accounts'],
    'nav.contact': ['تواصل معنا', 'Contact Us'],
    'nav.menu': ['القائمة', 'Menu'],
    'nav.signout': ['خروج', 'Sign out'],

    /* عام */
    'common.for': ['الملف الحالي', 'Active profile'],
    'common.me': ['أنا', 'Me'],
    'common.save': ['حفظ', 'Save'],
    'common.cancel': ['إلغاء', 'Cancel'],
    'common.add': ['إضافة', 'Add'],
    'common.edit': ['تعديل', 'Edit'],
    'common.send': ['إرسال', 'Send'],
    'common.close': ['إغلاق', 'Close'],
    'common.none': ['لا يوجد', 'None'],
    'common.notes': ['ملاحظات', 'Notes'],
    'common.date': ['التاريخ', 'Date'],
    'common.time': ['الوقت', 'Time'],
    'common.status': ['الحالة', 'Status'],
    'common.name': ['الاسم', 'Name'],
    'common.phone': ['رقم الهاتف', 'Phone'],
    'common.gender': ['النوع', 'Gender'],
    'common.male': ['ذكر', 'Male'],
    'common.female': ['أنثى', 'Female'],
    'common.birthDate': ['تاريخ الميلاد', 'Date of birth'],
    'common.address': ['العنوان', 'Address'],
    'common.job': ['الوظيفة', 'Occupation'],
    'common.minutes': ['دقيقة', 'min'],
    'common.today': ['اليوم', 'Today'],
    'common.optional': ['اختياري', 'optional'],

    /* الرئيسية */
    'home.hello': ['أهلًا بك', 'Welcome'],
    'home.nextVisit': ['موعدك القادم', 'Your next appointment'],
    'home.noVisit': ['لا يوجد موعد قادم محجوز', 'No upcoming appointment'],
    'home.bookNow': ['احجز موعدًا', 'Book an appointment'],
    'home.plan': ['خطتك العلاجية', 'Your treatment plan'],
    'home.sessionsDone': ['جلسة تمت', 'sessions done'],
    'home.ofPlanned': ['من أصل', 'of'],
    'home.diagnosis': ['التشخيص', 'Diagnosis'],
    'home.todayExercises': ['تمارين اليوم', "Today's exercises"],
    'home.doneToday': ['أنجزت اليوم', 'done today'],
    'home.openExercises': ['افتح برنامج التمارين', 'Open exercise programme'],
    'home.whatsapp': ['تواصل عبر واتساب', 'Chat on WhatsApp'],
    'home.call': ['اتصل بالمركز', 'Call the clinic'],
    'home.hours': ['مواعيد العمل', 'Opening hours'],
    'home.hoursDaily': ['السبت — الخميس', 'Saturday — Thursday'],
    'home.hoursFriday': ['الجمعة', 'Friday'],

    /* التمارين */
    'ex.title': ['برنامجك المنزلي', 'Your home programme'],
    'ex.subtitle': ['التمارين التي وصفها لك المركز — علّم على كل تمرين بعد إنجازه', 'Exercises prescribed for you — tick each one after you finish it'],
    'ex.empty': ['لم يُضف لك برنامج منزلي بعد', 'No home programme has been added yet'],
    'ex.emptyHint': ['سيظهر هنا فور أن يضيفه أخصائي العلاج الطبيعي', 'It will appear here once your physiotherapist adds it'],
    'ex.sets': ['مجموعات', 'sets'],
    'ex.reps': ['تكرار', 'reps'],
    'ex.hold': ['ثبات', 'hold'],
    'ex.seconds': ['ثانية', 'sec'],
    'ex.perDay': ['مرات يوميًا', 'times/day'],
    'ex.daysPerWeek': ['أيام أسبوعيًا', 'days/week'],
    'ex.markDone': ['تم الإنجاز اليوم', 'Mark as done today'],
    'ex.doneToday': ['تم إنجازه اليوم ✓', 'Done today ✓'],
    'ex.undo': ['تراجع', 'Undo'],
    'ex.pain': ['مستوى الألم أثناء التمرين', 'Pain during the exercise'],
    'ex.noteHint': ['اكتب ملاحظتك للأخصائي', 'Add a note for your therapist'],
    'ex.week': ['التزامك هذا الأسبوع', 'Your adherence this week'],
    'ex.watch': ['شاهد طريقة الأداء', 'Watch how to perform'],
    'ex.therapistNote': ['ملاحظة الأخصائي', 'Therapist note'],

    /* المواعيد والحجز */
    'appt.upcoming': ['مواعيدك القادمة', 'Upcoming appointments'],
    'appt.past': ['مواعيد سابقة', 'Past appointments'],
    'appt.none': ['لا توجد مواعيد', 'No appointments'],
    'appt.with': ['مع', 'with'],
    'book.title': ['طلب حجز جديد', 'New booking request'],
    'book.subtitle': ['اختر الخدمة والموعد المناسب وسيؤكده لك المركز', 'Choose a service and preferred time — the clinic will confirm it'],
    'book.service': ['الخدمة', 'Service'],
    'book.place': ['مكان الجلسة', 'Location'],
    'book.clinic': ['في المركز', 'At the clinic'],
    'book.home': ['زيارة منزلية', 'Home visit'],
    'book.area': ['المنطقة', 'Area'],
    'book.preferredDate': ['التاريخ المفضل', 'Preferred date'],
    'book.preferredTime': ['الوقت المفضل', 'Preferred time'],
    'book.submit': ['أرسل الطلب', 'Send request'],
    'book.sent': ['تم إرسال طلبك، سيتواصل معك المركز للتأكيد', 'Your request was sent — the clinic will contact you to confirm'],
    'book.myRequests': ['طلبات الحجز', 'Booking requests'],
    'book.noService': ['خدمة غير محددة', 'Service not specified'],
    'book.cancel': ['إلغاء الطلب', 'Cancel request'],
    'book.reply': ['رد المركز', 'Clinic reply'],
    'book.outsideHours': ['الوقت المختار خارج مواعيد العمل', 'The selected time is outside opening hours'],

    /* حالات الطلب */
    'status.new': ['قيد المراجعة', 'Pending'],
    'status.confirmed': ['مؤكد', 'Confirmed'],
    'status.rejected': ['غير متاح', 'Not available'],
    'status.cancelled': ['ملغي', 'Cancelled'],
    'status.done': ['تم', 'Completed'],
    'status.scheduled': ['محجوز', 'Scheduled'],
    'status.noshow': ['لم يحضر', 'No-show'],

    /* الملف الطبي */
    'rec.title': ['ملفك الطبي', 'Your medical record'],
    'rec.file': ['رقم الملف', 'File no.'],
    'rec.sessions': ['سجل الجلسات', 'Session history'],
    'rec.noSessions': ['لم تُسجَّل جلسات بعد', 'No sessions recorded yet'],
    'rec.treatments': ['الإجراءات', 'Treatments'],
    'rec.painBefore': ['الألم قبل', 'Pain before'],
    'rec.painAfter': ['الألم بعد', 'Pain after'],
    'rec.homeProgram': ['البرنامج المنزلي', 'Home programme'],
    'rec.account': ['كشف الحساب', 'Account statement'],
    'rec.charges': ['إجمالي الجلسات', 'Total charges'],
    'rec.paid': ['المدفوع', 'Paid'],
    'rec.due': ['المتبقي', 'Outstanding'],
    'rec.settled': ['لا توجد مستحقات', 'Nothing outstanding'],
    'rec.progress': ['تطور الألم', 'Pain progress'],

    /* الخدمات */
    'srv.title': ['خدمات المركز وأسعارها', 'Our services and prices'],
    'srv.subtitle': ['أسعار شفافة معلنة — والحجز من داخل التطبيق', 'Transparent published prices — book straight from the app'],
    'srv.homeAvailable': ['متاحة كزيارة منزلية', 'Available as a home visit'],
    'srv.book': ['احجز هذه الخدمة', 'Book this service'],
    'srv.areas': ['مناطق الزيارات المنزلية', 'Home visit areas'],

    /* الأسرة */
    'fam.title': ['حسابات أفراد الأسرة', 'Family accounts'],
    'fam.subtitle': [
        'أضف أبناءك أو والديك وتابع مواعيدهم وتمارينهم من نفس الحساب',
        'Add your children or parents and follow their appointments and exercises from the same login'
    ],
    'fam.add': ['إضافة فرد للأسرة', 'Add a family member'],
    'fam.switch': ['عرض ملفه', 'View profile'],
    'fam.active': ['الملف المعروض حاليًا', 'Currently viewing'],
    'fam.limit': ['وصلت للحد الأقصى لعدد الحسابات الفرعية', 'You have reached the maximum number of family accounts'],
    'fam.mine': ['حسابي', 'My account'],

    /* التثبيت وحالة الاتصال */
    'pwa.install': ['ثبّت التطبيق على شاشتك', 'Install the app on your phone'],
    'pwa.installHint': ['يفتح مباشرة كتطبيق، ويعمل بدون إنترنت', 'Opens like an app and works offline'],
    'pwa.installNow': ['تثبيت', 'Install'],
    'pwa.later': ['لاحقًا', 'Later'],
    'pwa.offline': ['أنت بدون إنترنت — تظهر آخر بيانات محفوظة', 'You are offline — showing your last saved data'],
    'pwa.offlineAction': ['هذا الإجراء يحتاج اتصالًا بالإنترنت', 'This action needs an internet connection'],

    /* التواصل */
    'contact.title': ['تواصل مع المركز', 'Contact the clinic'],
    'contact.emergency': ['للحالات الطارئة والاستفسارات السريعة', 'For emergencies and quick questions'],
    'contact.location': ['موقع المركز', 'Our location'],
    'contact.map': ['افتح الخريطة', 'Open in maps']
};

export function translate(lang: Lang, key: string): string {
    const entry = DICT[key];
    if (!entry) return key;
    return lang === 'ar' ? entry[0] : entry[1];
}

export function isRtl(lang: Lang): boolean {
    return lang === 'ar';
}

/** يقرأ اللغة المحفوظة، وإلا يستنتجها من لغة المتصفح */
export function initialLang(): Lang {
    if (typeof window === 'undefined') return 'ar';
    const saved = window.localStorage.getItem(LANG_KEY);
    if (saved === 'ar' || saved === 'en') return saved;
    return navigator.language?.toLowerCase().startsWith('ar') ? 'ar' : 'en';
}

const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const DAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAYS_AR = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

export function formatDateIn(lang: Lang, isoDate: string, withDay = false): string {
    if (!isoDate) return '—';
    const d = new Date(isoDate + 'T00:00:00');
    if (Number.isNaN(d.getTime())) return isoDate;
    const months = lang === 'ar' ? MONTHS_AR : MONTHS_EN;
    const days = lang === 'ar' ? DAYS_AR : DAYS_EN;
    const base = `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
    return withDay ? `${days[d.getDay()]} ${base}` : base;
}

export function formatTimeIn(lang: Lang, time: string): string {
    if (!time) return '—';
    const [hRaw, m] = time.split(':');
    const h = Number(hRaw);
    const period = lang === 'ar' ? (h < 12 ? 'ص' : 'م') : h < 12 ? 'AM' : 'PM';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${m} ${period}`;
}

export function moneyIn(lang: Lang, amount: number, currencyAr: string): string {
    const value = Number.isFinite(amount) ? amount : 0;
    const currency = lang === 'ar' ? currencyAr : 'EGP';
    return `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${currency}`;
}
