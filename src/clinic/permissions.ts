import type { Role } from './types';

/** المجموعات التي تُطبَّق عليها الصلاحيات (settings و users ليست مصفوفات لكنها تخضع لنفس الفحص) */
export type Resource = 'patients' | 'therapists' | 'appointments' | 'sessions' | 'payments' | 'expenses' | 'bookings' | 'settings' | 'users';
export type Action = 'read' | 'create' | 'update' | 'delete';

type Matrix = Record<Role, Record<Resource, Action[]>>;

const ALL: Action[] = ['read', 'create', 'update', 'delete'];

/**
 * مصدر الحقيقة الوحيد للصلاحيات — يُستخدم في الواجهة لإخفاء ما لا يُسمح به،
 * ويُفرض مرة أخرى على السيرفر قبل تنفيذ أي تعديل.
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
        bookings: ALL,
        settings: ['read', 'update'],
        users: ALL
    },
    // الاستقبال: المرضى والمواعيد والتحصيل، بدون حذف أو إعدادات أو مستخدمين
    reception: {
        patients: ['read', 'create', 'update'],
        therapists: ['read'],
        appointments: ALL,
        sessions: ['read'],
        payments: ['read', 'create', 'update'],
        expenses: ['read', 'create'],
        bookings: ALL,
        settings: ['read'],
        users: []
    },
    // الأخصائي: الجانب العلاجي فقط، بلا أي بيانات مالية
    therapist: {
        patients: ['read', 'update'],
        therapists: ['read'],
        appointments: ['read', 'update'],
        sessions: ['read', 'create', 'update'],
        payments: [],
        expenses: [],
        // طلبات الحجز تحمل بيانات تواصل لأشخاص ليسوا مرضى بعد، فلا يراها الأخصائي
        bookings: [],
        settings: ['read'],
        users: []
    }
};

export function can(role: Role, resource: Resource, action: Action): boolean {
    return PERMISSIONS[role]?.[resource]?.includes(action) ?? false;
}

export const ROLE_LABELS: Record<Role, string> = {
    admin: 'مدير / طبيب',
    reception: 'استقبال',
    therapist: 'أخصائي علاج طبيعي'
};

export const ROLE_HINTS: Record<Role, string> = {
    admin: 'صلاحية كاملة على كل الشاشات بما فيها الحسابات والإعدادات والمستخدمين',
    reception: 'المرضى والمواعيد وتحصيل المدفوعات — بدون الإعدادات أو إدارة المستخدمين',
    therapist: 'المرضى والمواعيد وتسجيل الجلسات — لا يرى البيانات المالية'
};
