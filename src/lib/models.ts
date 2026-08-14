/** Domain types for the Kartos physiotherapy management system. */

export type Role = 'owner' | 'senior_doctor' | 'doctor' | 'secretary' | 'hr';

export const ROLES: Role[] = ['owner', 'senior_doctor', 'doctor', 'secretary', 'hr'];

export const ROLE_LABELS: Record<Role, { en: string; ar: string }> = {
    owner: { en: 'Clinic Owner', ar: 'مالك العيادة' },
    senior_doctor: { en: 'Senior Doctor', ar: 'استشاري / دكتور سينيور' },
    doctor: { en: 'Physiotherapist / General Practitioner', ar: 'أخصائي علاج طبيعي / ممارس عام' },
    secretary: { en: 'Secretary / Reception', ar: 'السكرتارية والاستقبال' },
    hr: { en: 'HR & Payroll', ar: 'الموارد البشرية والرواتب' }
};

/** Landing page each role is sent to after login. */
export const ROLE_HOME: Record<Role, string> = {
    owner: '/app/owner',
    senior_doctor: '/app/doctor',
    doctor: '/app/doctor',
    secretary: '/app/reception',
    hr: '/app/hr'
};

export interface Clinic {
    id: string;
    name: string;
    createdAt: string;
    /** Currency label shown across financial screens. */
    currency: string;
}

export interface User {
    id: string;
    clinicId: string;
    name: string;
    email: string;
    passwordHash: string;
    role: Role;
    phone?: string;
    license?: string;
    employmentType: 'full_time' | 'part_time';
    /** Monthly base salary. */
    baseSalary: number;
    /** Flat amount paid per completed shift. */
    shiftRate: number;
    /** Percentage of the fee for each session this user runs. */
    commissionPct: number;
    status: 'active' | 'frozen';
    createdAt: string;
}

export type PublicUser = Omit<User, 'passwordHash'>;

export interface Patient {
    id: string;
    clinicId: string;
    code: string;
    name: string;
    age: number | null;
    gender: 'male' | 'female' | '';
    phone: string;
    diagnosis: string;
    medicalHistory: string;
    contraindications: string;
    createdAt: string;
}

export interface ProgramItem {
    id: string;
    name: string;
    instructions: string;
    sets: string;
    reps: string;
    duration: string;
    video: string;
}

/** The in-clinic treatment program a senior prescribes for an intern to execute. */
export interface Program {
    id: string;
    clinicId: string;
    patientId: string;
    items: ProgramItem[];
    updatedAt: string;
    updatedBy: string;
}

export interface HepExercise {
    id: string;
    name: string;
    setsReps: string;
    frequency: string;
    mediaUrl: string;
    advice: string;
}

/** Home exercise program, visible to the patient through the public portal. */
export interface Hep {
    id: string;
    clinicId: string;
    patientId: string;
    exercises: HepExercise[];
    updatedAt: string;
    updatedBy: string;
}

export interface Session {
    id: string;
    clinicId: string;
    patientId: string;
    doctorId: string;
    doctorName: string;
    /** 1-based session counter per patient. */
    number: number;
    date: string;
    execution: { name: string; done: boolean }[];
    metrics: { name: string; value: string }[];
    observations: string;
    progressNotes: string;
    fee: number;
}

export type QueueStatus = 'waiting' | 'in_room' | 'done' | 'paid';

export interface QueueEntry {
    id: string;
    clinicId: string;
    patientId: string;
    patientName: string;
    patientCode: string;
    status: QueueStatus;
    /** ISO date (YYYY-MM-DD) this entry belongs to. */
    day: string;
    arrivedAt: string;
    doctorId: string;
    fee: number;
    paid: boolean;
    note: string;
}

export interface Attendance {
    id: string;
    clinicId: string;
    userId: string;
    day: string;
    checkIn: string | null;
    checkOut: string | null;
    status: 'present' | 'absent' | 'leave';
    /** Counted shifts for payroll — one per completed check-in/out pair. */
    shifts: number;
}

export interface Adjustment {
    id: string;
    clinicId: string;
    userId: string;
    /** YYYY-MM the adjustment applies to. */
    month: string;
    kind: 'bonus' | 'deduction';
    amount: number;
    reason: string;
    createdAt: string;
}

export interface SessionRecord {
    token: string;
    userId: string;
    clinicId: string;
    role: Role;
    expiresAt: number;
}

export const COLLECTIONS = {
    clinics: 'clinics',
    users: 'users',
    patients: 'patients',
    programs: 'programs',
    heps: 'heps',
    sessions: 'sessions',
    queue: 'queue',
    attendance: 'attendance',
    adjustments: 'adjustments',
    authSessions: 'auth_sessions'
} as const;
