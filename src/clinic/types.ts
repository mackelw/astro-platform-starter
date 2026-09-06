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
}
