import type { Role } from './types';

/** المجموعات التي تُطبَّق عليها الصلاحيات (settings و users ليست مصفوفات لكنها تخضع لنفس الفحص) */
export type Resource =
    | 'patients'
    | 'therapists'
    | 'appointments'
    | 'sessions'
    | 'payments'
    | 'expenses'
    | 'exercises'
    | 'prescriptions'
    | 'exerciseLogs'
    | 'services'
    | 'bookings'
    | 'settings'
    | 'users';
export type Action = 'read' | 'create' | 'update' | 'delete';

type Matrix = Record<Role, Record<Resource, Action[]>>;

const ALL: Action[] = ['read', 'create', 'update', 'delete'];

/**
 * مصدر الحقيقة الوحيد للصلاحيات — يُستخدم في الواجهة لإخفاء ما لا يُسمح به،
 * ويُفرض مرة أخرى على السيرفر قبل تنفيذ أي تعديل.
 *
 * ملاحظة مهمة: صلاحية دور المريض تعني "على ملفه وملفات حساباته الفرعية فقط"،
 * وهذا القيد يُفرض في server/api.ts لأن المصفوفة وحدها لا تعرف صاحب السجل.
 */
export const PERMISSIONS: Matrix = {
    // الطبيب / المدير: كل الصلاحيات
    admin: {
        patients: ALL,
        therapists: ALL,
        appointments: ALL,
        sessions: ALL,
        payments: ALL,
        expenses: ALL,
        exercises: ALL,
        prescriptions: ALL,
        exerciseLogs: ALL,
        services: ALL,
        bookings: ALL,
        settings: ['read', 'update'],
        users: ALL
    },
    // الاستقبال: المرضى والمواعيد والتحصيل وطلبات الحجز، بدون حذف أو إعدادات أو مستخدمين
    reception: {
        patients: ['read', 'create', 'update'],
        therapists: ['read'],
        appointments: ALL,
        sessions: ['read'],
        payments: ['read', 'create', 'update'],
        expenses: ['read', 'create'],
        exercises: ['read'],
        prescriptions: ['read'],
        exerciseLogs: ['read'],
        services: ['read'],
        bookings: ALL,
        settings: ['read'],
        users: []
    },
    // الأخصائي: الجانب العلاجي وبرامج التمارين فقط، بلا أي بيانات مالية
    therapist: {
        patients: ['read', 'update'],
        therapists: ['read'],
        appointments: ['read', 'update'],
        sessions: ['read', 'create', 'update'],
        payments: [],
        expenses: [],
        exercises: ALL,
        prescriptions: ALL,
        exerciseLogs: ['read'],
        services: ['read'],
        bookings: ['read', 'update'],
        settings: ['read'],
        users: []
    },
    // المريض: ملفه وملفات أسرته فقط — يقرأ خطته ويسجّل تمارينه ويطلب الحجز
    patient: {
        patients: ['read', 'create', 'update'], // create/update = الحسابات الفرعية لأفراد الأسرة
        therapists: ['read'],
        appointments: ['read'],
        sessions: ['read'],
        payments: ['read'], // كشف حساب نفسه فقط
        expenses: [],
        exercises: ['read'],
        prescriptions: ['read'],
        exerciseLogs: ['read', 'create', 'update'],
        services: ['read'],
        bookings: ['read', 'create', 'update'], // update = إلغاء طلبه
        settings: ['read'],
        users: []
    }
};

export function can(role: Role, resource: Resource, action: Action): boolean {
    return PERMISSIONS[role]?.[resource]?.includes(action) ?? false;
}

/** الأدوار التي تعمل داخل المركز — يقابلها دور المريض الذي يرى بوابة مختلفة تمامًا */
export const STAFF_ROLES: Role[] = ['admin', 'reception', 'therapist'];

export function isStaff(role: Role): boolean {
    return STAFF_ROLES.includes(role);
}

export const ROLE_LABELS: Record<Role, string> = {
    admin: 'مدير / طبيب',
    reception: 'استقبال',
    therapist: 'أخصائي علاج طبيعي',
    patient: 'مريض'
};

export const ROLE_HINTS: Record<Role, string> = {
    admin: 'صلاحية كاملة على كل الشاشات بما فيها الحسابات والإعدادات والمستخدمين',
    reception: 'المرضى والمواعيد وتحصيل المدفوعات وطلبات الحجز — بدون الإعدادات أو إدارة المستخدمين',
    therapist: 'المرضى والمواعيد وتسجيل الجلسات ووصف التمارين — لا يرى البيانات المالية',
    patient: 'بوابة المريض: ملفه وملف أسرته، تماريه المنزلية، مواعيده وطلبات الحجز'
};
