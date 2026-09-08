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

/* --------------------------- التمارين المنزلية --------------------------- */

/** وسيلة الشرح المرفقة بالتمرين — رابط فيديو يوتيوب أو صورة */
export type MediaType = 'video' | 'image' | 'none';

/** تمرين في مكتبة المركز — يُكتب مرة واحدة ويُوصف لأي عدد من المرضى */
export interface Exercise {
    id: ID;
    name: string;
    nameEn: string;
    category: string; // مثال: العمود الفقري، الركبة، الكتف
    description: string; // طريقة الأداء بالعربية
    descriptionEn: string;
    mediaType: MediaType;
    mediaUrl: string;
    active: boolean;
    createdAt: string;
}

/** وصف تمرين بعينه لمريض بعينه، بجرعة محددة له وحده */
export interface Prescription {
    id: ID;
    patientId: ID;
    exerciseId: ID;
    sets: number; // عدد المجموعات
    reps: number; // عدد التكرارات
    holdSeconds: number; // مدة الثبات بالثانية
    perDay: number; // كم مرة في اليوم
    daysPerWeek: number;
    startDate: string; // YYYY-MM-DD
    endDate: string; // فارغ = مستمر
    notes: string;
    active: boolean;
    createdAt: string;
}

/** تعليم المريض على إنجاز تمرين في يوم معيّن */
export interface ExerciseLog {
    id: ID;
    patientId: ID;
    prescriptionId: ID;
    date: string; // YYYY-MM-DD
    done: boolean;
    painLevel: number; // 0-10 أثناء التمرين
    note: string;
    createdAt: string;
}

/* ----------------------- الخدمات وطلبات الحجز ----------------------- */

/** خدمة معروضة في التطبيق بسعرها — تظهر للمريض عند طلب الحجز */
export interface Service {
    id: ID;
    name: string;
    nameEn: string;
    description: string;
    descriptionEn: string;
    price: number;
    duration: number; // بالدقائق
    homeVisit: boolean; // متاحة كزيارة منزلية
    active: boolean;
    createdAt: string;
}

export type BookingStatus = 'new' | 'confirmed' | 'rejected' | 'cancelled' | 'done';
export type BookingPlace = 'clinic' | 'home';

/** طلب حجز يرسله المريض من التطبيق، تحوّله الإدارة إلى موعد مؤكد */
export interface Booking {
    id: ID;
    patientId: ID;
    serviceId: ID | '';
    place: BookingPlace;
    area: string; // منطقة الزيارة المنزلية (الجونة، سهل حشيش…)
    date: string; // YYYY-MM-DD المفضل
    time: string; // HH:MM المفضل
    notes: string;
    status: BookingStatus;
    appointmentId: ID | ''; // الموعد الناتج بعد التأكيد
    replyNote: string; // رد الإدارة على الطلب
    createdAt: string;
}

export interface ClinicSettings {
    name: string;
    nameEn: string;
    doctorName: string; // اسم الطبيب المسؤول - يظهر في الترويسة والتقارير المطبوعة
    phone: string;
    whatsapp: string; // رقم واتساب للتواصل السريع من التطبيق
    address: string;
    addressEn: string;
    currency: string;
    defaultSessionPrice: number;
    examPrice: number; // سعر الكشف الأول
    defaultDuration: number;
    workStart: string; // HH:MM
    workEnd: string; // HH:MM
    fridayStart: string; // مواعيد الجمعة تختلف عن باقي الأيام
    fridayEnd: string;
    homeVisitAreas: string; // مناطق الزيارات المنزلية مفصولة بفاصلة
    mapUrl: string; // رابط الموقع على الخريطة
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
    exercises: Exercise[];
    prescriptions: Prescription[];
    exerciseLogs: ExerciseLog[];
    services: Service[];
    bookings: Booking[];
}

/* ------------------------- المستخدمون والصلاحيات ------------------------- */

export type Role = 'admin' | 'reception' | 'therapist' | 'patient';

export interface PublicUser {
    id: ID;
    username: string;
    name: string;
    role: Role;
    therapistId: ID | ''; // ربط حساب الأخصائي بسجله في قائمة الأخصائيين
    patientId: ID | ''; // ربط حساب المريض بملفه الطبي
    memberIds: ID[]; // ملفات أفراد الأسرة التي يديرها هذا الحساب (الحسابات الفرعية)
    active: boolean;
    lastLoginAt: string;
    createdAt: string;
}

/** ما يعيده السيرفر للعميل بعد تسجيل الدخول */
export interface SessionInfo {
    user: PublicUser;
    db: Database;
}
