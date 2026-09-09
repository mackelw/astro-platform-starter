// نماذج البيانات لبرنامج إدارة عيادة العلاج الطبيعي
export type ID = string;

export type Gender = 'male' | 'female';

export interface Patient {
    id: ID;
    code: string; // رقم الملف
    name: string;
    phone: string;
    gender: Gender;
    birthDate: string; // YYYY-MM-DD
    address: string;
    job: string;
    diagnosis: string; // التشخيص
    referredBy: string; // الطبيب المحوِّل
    history: string; // التاريخ المرضي
    notes: string;
    plannedSessions: number; // عدد الجلسات المقررة بالخطة العلاجية
    sessionPrice: number; // سعر الجلسة الافتراضي
    archived: boolean;
    createdAt: string; // ISO
}

export interface Therapist {
    id: ID;
    name: string;
    phone: string;
    specialty: string;
    active: boolean;
}

export type AppointmentStatus = 'scheduled' | 'done' | 'cancelled' | 'noshow';

export interface Appointment {
    id: ID;
    patientId: ID;
    therapistId: ID | '';
    date: string; // YYYY-MM-DD
    time: string; // HH:MM
    duration: number; // بالدقائق
    status: AppointmentStatus;
    notes: string;
    createdAt: string;
}

export interface Session {
    id: ID;
    patientId: ID;
    therapistId: ID | '';
    appointmentId: ID | '';
    date: string; // YYYY-MM-DD
    treatments: string[]; // الإجراءات العلاجية
    painBefore: number; // 0-10
    painAfter: number; // 0-10
    notes: string;
    homeProgram: string; // البرنامج المنزلي
    price: number;
    createdAt: string;
}

export type PaymentMethod = 'cash' | 'card' | 'transfer' | 'insurance';

export interface Payment {
    id: ID;
    patientId: ID;
    date: string; // YYYY-MM-DD
    amount: number;
    method: PaymentMethod;
    notes: string;
    createdAt: string;
}

export interface Expense {
    id: ID;
    date: string;
    title: string;
    category: string;
    amount: number;
    notes: string;
    createdAt: string;
}

export interface ClinicSettings {
    name: string;
    doctorName: string; // اسم الطبيب المسؤول - يظهر في الترويسة والتقارير المطبوعة
    phone: string;
    address: string;
    currency: string;
    defaultSessionPrice: number;
    defaultDuration: number;
    workStart: string; // HH:MM
    workEnd: string; // HH:MM
}

export interface Database {
    version: number;
    settings: ClinicSettings;
    patients: Patient[];
    therapists: Therapist[];
    appointments: Appointment[];
    sessions: Session[];
    payments: Payment[];
    expenses: Expense[];
    // وحدة التأهيل عن بُعد — أنواعها معرَّفة في آخر هذا الملف
    exercises: Exercise[];
    programs: Program[];
    programTemplates: ProgramTemplate[];
    programLogs: ProgramLog[];
    promResponses: PromResponse[];
    portalMessages: PortalMessage[];
    patientAccess: PatientAccessInfo[];
}

/* ------------------------- المستخدمون والصلاحيات ------------------------- */

export type Role = 'admin' | 'reception' | 'therapist';

export interface PublicUser {
    id: ID;
    username: string;
    name: string;
    role: Role;
    therapistId: ID | ''; // ربط حساب الأخصائي بسجله في قائمة الأخصائيين
    active: boolean;
    lastLoginAt: string;
    createdAt: string;
}

/** ما يعيده السيرفر للعميل بعد تسجيل الدخول */
export interface SessionInfo {
    user: PublicUser;
    db: Database;
}

/* ---------------------- التأهيل عن بُعد والبرنامج المنزلي ---------------------- */

/** المنطقة التشريحية التي يخدمها التمرين — أساس الفلترة في المكتبة */
export type BodyRegion = 'neck' | 'shoulder' | 'elbow' | 'wrist' | 'back' | 'hip' | 'knee' | 'ankle' | 'core' | 'balance' | 'general';

export type ExerciseLevel = 'easy' | 'medium' | 'hard';

/** تمرين في مكتبة المركز. الوسائط روابط يملك المركز حق استخدامها (تصوير خاص أو مكتبة مرخّصة). */
export interface Exercise {
    id: ID;
    name: string;
    region: BodyRegion;
    equipment: string; // الأداة المطلوبة: بدون، حبل مقاومة، كرة، دمبل…
    level: ExerciseLevel;
    instructions: string; // خطوات التنفيذ كما تُقرأ للمريض
    videoUrl: string;
    imageUrl: string;
    // قيم افتراضية تُنسخ في البرنامج عند إضافة التمرين، ويعدّلها الأخصائي عند الحاجة
    defaultSets: number;
    defaultReps: number;
    defaultHold: number; // ثواني الثبات
    defaultPerDay: number; // مرات التنفيذ في اليوم
    tags: string[];
    active: boolean;
    createdAt: string;
}

export type Side = 'both' | 'right' | 'left';

/** سطر داخل البرنامج: تمرين ببارامتراته لهذا المريض تحديدًا */
export interface ProgramItem {
    id: ID;
    exerciseId: ID;
    sets: number;
    reps: number;
    hold: number; // ثواني
    rest: number; // ثواني الراحة بين المجموعات
    perDay: number;
    side: Side;
    resistance: string; // وزن أو لون حبل المقاومة
    note: string; // ملاحظة الأخصائي لهذا التمرين
}

export type ProgramStatus = 'active' | 'paused' | 'done';

/** مقاييس النتائج المدمجة — تعريفها في prom.ts وليس في قاعدة البيانات */
export type PromTemplateId = 'nprs' | 'odi' | 'quickdash' | 'lefs';

/** البرنامج المنزلي: ما يكتبه الأخصائي مرة واحدة */
export interface Program {
    id: ID;
    patientId: ID;
    therapistId: ID | '';
    title: string;
    startDate: string; // YYYY-MM-DD
    endDate: string; // YYYY-MM-DD
    daysPerWeek: number;
    status: ProgramStatus;
    notes: string; // تعليمات عامة تظهر للمريض أعلى برنامجه
    items: ProgramItem[];
    proms: PromTemplateId[]; // الاستبيانات المطلوبة من هذا المريض
    createdAt: string;
}

/** بروتوكول جاهز حسب التشخيص يُطبَّق بنقرة ثم يُعدَّل */
export interface ProgramTemplate {
    id: ID;
    title: string;
    diagnosis: string;
    daysPerWeek: number;
    notes: string;
    items: ProgramItem[];
    proms: PromTemplateId[];
    createdAt: string;
}

/** ما يسجّله المريض في يوم واحد — مصدر كل أرقام الالتزام */
export interface ProgramLog {
    id: ID;
    programId: ID;
    patientId: ID;
    date: string; // YYYY-MM-DD
    doneItemIds: ID[]; // أي تمارين أنهاها فعلًا
    pain: number; // 0-10
    difficulty: number; // 0-5
    note: string;
    createdAt: string;
}

/** إجابة مريض على استبيان، بدرجتها المحسوبة وقت الحفظ */
export interface PromResponse {
    id: ID;
    patientId: ID;
    templateId: PromTemplateId;
    date: string;
    answers: number[];
    score: number;
    filledBy: 'patient' | 'staff';
    createdAt: string;
}

/** رسالة نصية بين المريض والمركز عبر البوابة */
export interface PortalMessage {
    id: ID;
    patientId: ID;
    from: 'patient' | 'staff';
    authorName: string;
    text: string;
    readByStaff: boolean;
    createdAt: string;
}

/**
 * حالة مفتاح دخول المريض كما تراها شاشات المركز.
 *
 * لا يحتوي على الرابط السري ولا رمز الدخول: كلاهما مُجزّأ في قاعدة البيانات ولا يُسترجع أبدًا،
 * ويُعرض نصًا صريحًا مرة واحدة فقط لحظة إصداره. من فقد رمزه يُصدَر له مفتاح جديد.
 */
export interface PatientAccessInfo {
    patientId: ID;
    enabled: boolean;
    createdAt: string;
    lastSeenAt: string;
}

/** ما يُعرض مرة واحدة بعد الإصدار — لا يُحفظ في أي مكان */
export interface PatientAccessSecret {
    token: string;
    code: string;
}
