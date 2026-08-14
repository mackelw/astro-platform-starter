/** Bilingual UI strings. English is the fallback for any missing key. */

export type Lang = 'en' | 'ar';

export const STRINGS = {
    // shell
    brand: { en: 'Kartos', ar: 'كارتوس' },
    tagline: {
        en: 'Physiotherapy Management System',
        ar: 'نظام إدارة العلاج الطبيعي'
    },
    subtitle: {
        en: 'One platform linking reception, clinicians, HR and patients.',
        ar: 'منصة واحدة تربط السكرتارية والأطباء والموارد البشرية والمرضى.'
    },
    langToggle: { en: 'عربي', ar: 'English' },
    logout: { en: 'Log out', ar: 'خروج' },
    refresh: { en: 'Refresh', ar: 'تحديث' },
    save: { en: 'Save', ar: 'حفظ' },
    cancel: { en: 'Cancel', ar: 'إلغاء' },
    add: { en: 'Add', ar: 'إضافة' },
    edit: { en: 'Edit', ar: 'تعديل' },
    delete: { en: 'Delete', ar: 'حذف' },
    search: { en: 'Search', ar: 'بحث' },
    loading: { en: 'Loading…', ar: 'جارٍ التحميل…' },
    none: { en: 'Nothing here yet.', ar: 'لا يوجد شيء بعد.' },
    optional: { en: 'Optional', ar: 'اختياري' },
    back: { en: 'Back', ar: 'رجوع' },

    // auth
    login: { en: 'Log in', ar: 'تسجيل الدخول' },
    registerClinic: { en: 'Register a new clinic', ar: 'تسجيل عيادة جديدة' },
    email: { en: 'Email', ar: 'البريد الإلكتروني' },
    password: { en: 'Password', ar: 'كلمة المرور' },
    clinicName: { en: 'Clinic name', ar: 'اسم العيادة' },
    ownerName: { en: 'Owner name', ar: 'اسم المالك' },
    enterSystem: { en: 'Enter the system', ar: 'دخول النظام' },
    patientPortal: { en: 'Patient portal', ar: 'بوابة المرضى' },

    // roles / nav
    owner: { en: 'Clinic Owner', ar: 'مالك العيادة' },
    reception: { en: 'Reception & Secretary Desk', ar: 'مكتب الاستقبال والسكرتارية' },
    clinicianDesk: { en: 'Clinician Dashboard', ar: 'لوحة الطبيب' },
    hrDesk: { en: 'HR & Payroll', ar: 'الموارد البشرية والرواتب' },

    // reception
    registerPatient: { en: 'Register new patient', ar: 'تسجيل مريض جديد' },
    liveQueue: { en: 'Live waiting queue', ar: 'قائمة الانتظار اللحظية' },
    waiting: { en: 'Waiting', ar: 'في الانتظار' },
    inRoom: { en: 'With the doctor', ar: 'داخل للدكتور' },
    doneSessions: { en: 'Session completed', ar: 'تم الكشف بالجلسة' },
    collected: { en: 'Cash collected', ar: 'تحصيل الخزينة' },
    sendToDoctor: { en: 'Send to doctor', ar: 'إرسال للدكتور' },
    markPaid: { en: 'Mark paid', ar: 'تحصيل' },
    whatsappReminder: { en: 'WhatsApp reminder', ar: 'تذكير واتساب' },
    fee: { en: 'Fee', ar: 'قيمة الكشف' },
    phone: { en: 'Phone', ar: 'الهاتف' },
    age: { en: 'Age', ar: 'السن' },
    gender: { en: 'Gender', ar: 'النوع' },
    male: { en: 'Male', ar: 'ذكر' },
    female: { en: 'Female', ar: 'أنثى' },
    patientName: { en: 'Patient name', ar: 'اسم المريض' },
    addToQueue: { en: 'Add to today’s queue', ar: 'إضافة لقائمة اليوم' },

    // clinical
    searchPatients: { en: 'Search patients', ar: 'بحث عن المرضى' },
    startSession: { en: 'Open file / start session', ar: 'بدء الجلسة / فتح الملف' },
    diagnosis: { en: 'Diagnosis', ar: 'التشخيص' },
    medicalHistory: { en: 'Medical history', ar: 'التاريخ المرضي' },
    contraindications: { en: 'Contraindications & precautions', ar: 'موانع وتحذيرات' },
    programBuilder: { en: 'Treatment program builder', ar: 'بناء البرنامج العلاجي' },
    hepBuilder: { en: 'Home exercise program (HEP)', ar: 'البرنامج المنزلي' },
    sessionNotes: { en: 'Session & examination notes', ar: 'ملاحظات الجلسة والكشف' },
    clinicalObservations: { en: 'Clinical observations', ar: 'الملاحظات الإكلينيكية' },
    progressNotes: { en: 'Progress notes', ar: 'ملاحظات التقدم' },
    assessmentMetrics: { en: 'Assessment metrics (VAS, ROM, MMT)', ar: 'مقاييس التقييم (VAS, ROM, MMT)' },
    metricName: { en: 'Metric', ar: 'المقياس' },
    metricValue: { en: 'Value', ar: 'القيمة' },
    completeSession: { en: 'Complete & save session', ar: 'إنهاء وحفظ الجلسة' },
    history: { en: 'History & session log', ar: 'السجل والجلسات السابقة' },
    programExecution: { en: 'Program execution', ar: 'تنفيذ البرنامج' },
    exerciseName: { en: 'Exercise / task name', ar: 'اسم التمرين' },
    instructions: { en: 'Instructions', ar: 'التعليمات' },
    sets: { en: 'Sets', ar: 'المجموعات' },
    reps: { en: 'Reps', ar: 'التكرارات' },
    hold: { en: 'Hold / duration', ar: 'مدة التثبيت' },
    videoLink: { en: 'Video / image link', ar: 'رابط فيديو أو صورة' },
    frequency: { en: 'Daily frequency', ar: 'التكرار اليومي' },
    advice: { en: 'Doctor advice', ar: 'نصائح الطبيب' },

    // research
    researchCenter: { en: 'Research Center', ar: 'مركز الأبحاث' },
    researchHub: { en: 'Research Integration Hub', ar: 'مركز دمج الأبحاث' },
    findPapers: { en: 'Find papers', ar: 'بحث عن أبحاث' },
    papers: { en: 'Research papers', ar: 'الأبحاث' },
    suggestedExercises: { en: 'Suggested exercises', ar: 'التمارين المقترحة' },
    addToProgram: { en: 'Add to program', ar: 'أضف للبرنامج' },
    addToHep: { en: 'Add to home program', ar: 'أضف للبرنامج المنزلي' },
    aiGenerated: { en: 'AI', ar: 'ذكاء اصطناعي' },
    fromLibrary: { en: 'Protocol library', ar: 'مكتبة البروتوكولات' },

    // HR
    team: { en: 'Team & clinicians', ar: 'فريق العمل والأطباء' },
    attendance: { en: 'Attendance & shifts', ar: 'الحضور والشيفتات' },
    payrollEngine: { en: 'Payroll & commissions', ar: 'محرك الرواتب والنسب' },
    addStaff: { en: 'Add staff member', ar: 'إضافة موظف / طبيب' },
    role: { en: 'Role', ar: 'الوظيفة' },
    baseSalary: { en: 'Base salary', ar: 'الراتب الأساسي' },
    shiftRate: { en: 'Per-shift rate', ar: 'قيمة الشيفت' },
    commissionPct: { en: 'Commission %', ar: 'نسبة الكشوفات %' },
    employmentType: { en: 'Employment', ar: 'نوع التعاقد' },
    fullTime: { en: 'Full time', ar: 'دوام كامل' },
    partTime: { en: 'Part time', ar: 'دوام جزئي' },
    checkIn: { en: 'Check in', ar: 'حضور' },
    checkOut: { en: 'Check out', ar: 'انصراف' },
    absent: { en: 'Absent', ar: 'غائب' },
    present: { en: 'Present', ar: 'حاضر' },
    notRecorded: { en: 'Not recorded', ar: 'لم يسجل' },
    shifts: { en: 'Shifts', ar: 'الشيفتات' },
    net: { en: 'Net pay', ar: 'صافي المستحق' },
    gross: { en: 'Gross', ar: 'الإجمالي' },
    bonus: { en: 'Bonus', ar: 'مكافأة' },
    deduction: { en: 'Deduction', ar: 'خصم' },
    exportCsv: { en: 'Export CSV', ar: 'تصدير CSV' },
    readyToPay: { en: 'Ready to pay', ar: 'جاهز للصرف' },
    month: { en: 'Month', ar: 'الشهر' },
    reason: { en: 'Reason', ar: 'السبب' },
    amount: { en: 'Amount', ar: 'المبلغ' },

    // owner
    overview: { en: 'Clinic overview', ar: 'نظرة عامة على العيادة' },
    totalPatients: { en: 'Patients', ar: 'المرضى' },
    totalSessions: { en: 'Sessions', ar: 'الجلسات' },
    revenueToday: { en: 'Collected today', ar: 'تحصيل اليوم' },
    staffCount: { en: 'Team members', ar: 'أعضاء الفريق' },

    // portal
    portalTitle: { en: 'Patient Home Program Portal', ar: 'بوابة البرنامج المنزلي للمريض' },
    portalHint: {
        en: 'Enter your patient code (e.g. PAT-8597) or your registered phone number.',
        ar: 'أدخل كود المريض (مثال PAT-8597) أو رقم الهاتف المسجل.'
    },
    viewExercises: { en: 'View my home exercises', ar: 'عرض تماريني المنزلية' },
    yourProgram: { en: 'Your assigned home exercise program', ar: 'برنامجك المنزلي' }
} as const;

export type StringKey = keyof typeof STRINGS;

export function translate(lang: Lang, key: StringKey): string {
    const entry = STRINGS[key];
    return (entry?.[lang] ?? entry?.en ?? key) as string;
}
