import type { Database } from './types';

export const DB_KEY = 'pt-clinic-db-v1';
export const DB_VERSION = 1;

export function emptyDatabase(): Database {
    return {
        version: DB_VERSION,
        settings: {
            name: 'عيادة العلاج الطبيعي',
            phone: '',
            address: '',
            currency: 'ج.م',
            defaultSessionPrice: 150,
            defaultDuration: 45,
            workStart: '09:00',
            workEnd: '21:00'
        },
        patients: [],
        therapists: [],
        appointments: [],
        sessions: [],
        payments: [],
        expenses: []
    };
}

export function uid(prefix = ''): string {
    return prefix + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function iso(daysFromToday: number): string {
    const d = new Date();
    d.setDate(d.getDate() + daysFromToday);
    return d.toISOString().slice(0, 10);
}

/** بيانات تجريبية تظهر عند أول تشغيل حتى لا تكون الشاشات فارغة */
export function seedDatabase(): Database {
    const db = emptyDatabase();
    db.settings.name = 'مركز الشفاء للعلاج الطبيعي';
    db.settings.phone = '0100 000 0000';
    db.settings.address = 'شارع الجمهورية - الدور الثاني';

    const t1 = { id: uid('t_'), name: 'د. أحمد سمير', phone: '0111111111', specialty: 'إصابات ملاعب', active: true };
    const t2 = { id: uid('t_'), name: 'د. منى خالد', phone: '0122222222', specialty: 'علاج طبيعي للعمود الفقري', active: true };
    db.therapists = [t1, t2];

    const p1 = {
        id: uid('p_'),
        code: 'P-1001',
        name: 'محمد عبد الله',
        phone: '0101234567',
        gender: 'male' as const,
        birthDate: '1988-04-12',
        address: 'المعادي',
        job: 'محاسب',
        diagnosis: 'انزلاق غضروفي قطني L4-L5',
        referredBy: 'د. سامي حسن - عظام',
        history: 'ألم أسفل الظهر منذ 6 أشهر يزداد مع الجلوس الطويل',
        notes: '',
        plannedSessions: 12,
        sessionPrice: 150,
        archived: false,
        createdAt: new Date().toISOString()
    };
    const p2 = {
        id: uid('p_'),
        code: 'P-1002',
        name: 'سارة إبراهيم',
        phone: '0119876543',
        gender: 'female' as const,
        birthDate: '1995-09-30',
        address: 'مدينة نصر',
        job: 'مدرّسة',
        diagnosis: 'التهاب الكتف المتجمد (Frozen Shoulder)',
        referredBy: '',
        history: 'تحدد في حركة الكتف الأيمن بعد إصابة',
        notes: 'تفضل المواعيد الصباحية',
        plannedSessions: 10,
        sessionPrice: 180,
        archived: false,
        createdAt: new Date().toISOString()
    };
    const p3 = {
        id: uid('p_'),
        code: 'P-1003',
        name: 'خالد منصور',
        phone: '0155555555',
        gender: 'male' as const,
        birthDate: '1975-01-20',
        address: 'حلوان',
        job: 'مهندس',
        diagnosis: 'إعادة تأهيل بعد رباط صليبي أمامي',
        referredBy: 'د. ياسر فؤاد - جراحة',
        history: 'عملية منذ 8 أسابيع',
        notes: '',
        plannedSessions: 20,
        sessionPrice: 200,
        archived: false,
        createdAt: new Date().toISOString()
    };
    db.patients = [p1, p2, p3];

    db.appointments = [
        {
            id: uid('a_'),
            patientId: p1.id,
            therapistId: t1.id,
            date: iso(0),
            time: '10:00',
            duration: 45,
            status: 'scheduled',
            notes: '',
            createdAt: new Date().toISOString()
        },
        {
            id: uid('a_'),
            patientId: p2.id,
            therapistId: t2.id,
            date: iso(0),
            time: '11:30',
            duration: 45,
            status: 'scheduled',
            notes: '',
            createdAt: new Date().toISOString()
        },
        {
            id: uid('a_'),
            patientId: p3.id,
            therapistId: t1.id,
            date: iso(1),
            time: '09:30',
            duration: 60,
            status: 'scheduled',
            notes: 'تمارين تقوية',
            createdAt: new Date().toISOString()
        },
        {
            id: uid('a_'),
            patientId: p1.id,
            therapistId: t1.id,
            date: iso(-2),
            time: '10:00',
            duration: 45,
            status: 'done',
            notes: '',
            createdAt: new Date().toISOString()
        }
    ];

    db.sessions = [
        {
            id: uid('s_'),
            patientId: p1.id,
            therapistId: t1.id,
            appointmentId: '',
            date: iso(-2),
            treatments: ['موجات تداخلية', 'تمارين إطالة', 'علاج يدوي'],
            painBefore: 8,
            painAfter: 5,
            notes: 'استجابة جيدة، تحسن في مدى الحركة',
            homeProgram: 'تمارين تقوية عضلات البطن 10 دقائق يوميًا',
            price: 150,
            createdAt: new Date().toISOString()
        },
        {
            id: uid('s_'),
            patientId: p3.id,
            therapistId: t1.id,
            appointmentId: '',
            date: iso(-5),
            treatments: ['كمادات ثلج', 'تمارين مدى حركة', 'دراجة ثابتة'],
            painBefore: 6,
            painAfter: 4,
            notes: 'زيادة زاوية ثني الركبة إلى 105 درجة',
            homeProgram: 'رفع الساق المستقيمة 3 مجموعات × 15',
            price: 200,
            createdAt: new Date().toISOString()
        }
    ];

    db.payments = [
        { id: uid('m_'), patientId: p1.id, date: iso(-2), amount: 150, method: 'cash', notes: '', createdAt: new Date().toISOString() },
        { id: uid('m_'), patientId: p3.id, date: iso(-5), amount: 100, method: 'cash', notes: 'دفعة تحت الحساب', createdAt: new Date().toISOString() }
    ];

    db.expenses = [{ id: uid('e_'), date: iso(-3), title: 'مستلزمات طبية', category: 'مستلزمات', amount: 450, notes: '', createdAt: new Date().toISOString() }];

    return db;
}

/** دمج قاعدة بيانات محفوظة مع الشكل الحالي حتى لا تنكسر عند إضافة حقول جديدة */
export function normalize(raw: unknown): Database {
    const base = emptyDatabase();
    if (!raw || typeof raw !== 'object') return base;
    const db = raw as Partial<Database>;
    return {
        version: DB_VERSION,
        settings: { ...base.settings, ...(db.settings || {}) },
        patients: Array.isArray(db.patients) ? db.patients : [],
        therapists: Array.isArray(db.therapists) ? db.therapists : [],
        appointments: Array.isArray(db.appointments) ? db.appointments : [],
        sessions: Array.isArray(db.sessions) ? db.sessions : [],
        payments: Array.isArray(db.payments) ? db.payments : [],
        expenses: Array.isArray(db.expenses) ? db.expenses : []
    };
}

export function loadDatabase(): Database {
    if (typeof window === 'undefined') return emptyDatabase();
    try {
        const raw = window.localStorage.getItem(DB_KEY);
        if (!raw) {
            const seeded = seedDatabase();
            saveDatabase(seeded);
            return seeded;
        }
        return normalize(JSON.parse(raw));
    } catch {
        return emptyDatabase();
    }
}

export function saveDatabase(db: Database): void {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(DB_KEY, JSON.stringify(db));
    } catch (err) {
        console.error('تعذر حفظ البيانات محليًا', err);
    }
}
