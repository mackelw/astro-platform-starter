import type { Role } from './types';

/** المجموعات التي تُطبَّق عليها الصلاحيات (settings و users ليست مصفوفات لكنها تخضع لنفس الفحص) */
export type Resource =
    | 'patients'
    | 'therapists'
    | 'appointments'
    | 'sessions'
    | 'payments'
    | 'expenses'
    | 'settings'
    | 'users'
    // وحدة التأهيل عن بُعد
    | 'exercises'
    | 'programs'
    | 'programTemplates'
    | 'programLogs'
    | 'promResponses'
    | 'portalMessages'
    | 'patientAccess';
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
        settings: ['read', 'update'],
        users: ALL,
        exercises: ALL,
        programs: ALL,
        programTemplates: ALL,
        programLogs: ALL,
        promResponses: ALL,
        portalMessages: ALL,
        patientAccess: ALL
    },
    // الاستقبال: المرضى والمواعيد والتحصيل، بدون حذف أو إعدادات أو مستخدمين
    reception: {
        patients: ['read', 'create', 'update'],
        therapists: ['read'],
        appointments: ALL,
        sessions: ['read'],
        payments: ['read', 'create', 'update'],
        expenses: ['read', 'create'],
        settings: ['read'],
        users: [],
        exercises: ['read'],
        programs: ['read'],
        programTemplates: ['read'],
        programLogs: ['read'],
        promResponses: ['read', 'create'],
        portalMessages: ['read', 'create'],
        // الاستقبال هو من يسلّم المريض رابط البوابة ورمزه
        patientAccess: ['read', 'create', 'update']
    },
    // الأخصائي: الجانب العلاجي فقط، بلا أي بيانات مالية
    therapist: {
        patients: ['read', 'update'],
        therapists: ['read'],
        appointments: ['read', 'update'],
        sessions: ['read', 'create', 'update'],
        payments: [],
        expenses: [],
        settings: ['read'],
        users: [],
        // الأخصائي هو صاحب الجانب العلاجي: يبني المكتبة والبرامج والبروتوكولات
        exercises: ALL,
        programs: ALL,
        programTemplates: ALL,
        programLogs: ['read'], // سجل المريض لا يُعدَّل من المركز
        promResponses: ['read', 'create'],
        portalMessages: ['read', 'create'],
        patientAccess: ['read', 'create', 'update']
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
