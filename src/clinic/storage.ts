import type { Database, Exercise, Service } from './types';

export const DB_KEY = 'pt-clinic-db-v1';
export const DB_VERSION = 1;

export function emptyDatabase(): Database {
    return {
        version: DB_VERSION,
        settings: {
            name: 'مركز رينج للعلاج الطبيعي والتأهيل',
            nameEn: 'Range Physiotherapy & Rehabilitation Center',
            doctorName: 'د. مايكل مجدي',
            phone: '+201284185228',
            whatsapp: '+201284185228',
            address: 'الكوثر - الغردقة، أعلى جيم Pro Active',
            addressEn: 'El Kawther, Hurghada — above Pro Active Gym',
            currency: 'ج.م',
            defaultSessionPrice: 500,
            examPrice: 600,
            defaultDuration: 45,
            workStart: '10:00',
            workEnd: '22:00',
            fridayStart: '16:00',
            fridayEnd: '22:00',
            homeVisitAreas: 'الغردقة, الجونة, سهل حشيش, مكادي باي, سوما باي',
            mapUrl: ''
        },
        patients: [],
        therapists: [],
        appointments: [],
        sessions: [],
        payments: [],
        expenses: [],
        exercises: [],
        prescriptions: [],
        exerciseLogs: [],
        services: [],
        bookings: []
    };
}

/**
 * الخدمات التي يبدأ بها المركز — تُنشأ مرة واحدة عند أول إعداد للنظام
 * حتى تظهر للمريض قائمة أسعار حقيقية من أول تشغيل.
 */
export function defaultServices(): Omit<Service, 'id' | 'createdAt'>[] {
    return [
        {
            name: 'كشف وتقييم أولي',
            nameEn: 'Initial Assessment',
            description: 'فحص إكلينيكي شامل وتحديد خطة العلاج الطبيعي المناسبة للحالة.',
            descriptionEn: 'Full clinical assessment and a tailored physiotherapy plan.',
            price: 600,
            duration: 45,
            homeVisit: true,
            active: true
        },
        {
            name: 'جلسة علاج طبيعي',
            nameEn: 'Physiotherapy Session',
            description: 'جلسة علاج طبيعي وتأهيل حسب الخطة العلاجية المحددة بعد الكشف.',
            descriptionEn: 'Physiotherapy and rehabilitation session following your treatment plan.',
            price: 500,
            duration: 45,
            homeVisit: true,
            active: true
        },
        {
            name: 'الموجات التصادمية (Shockwave)',
            nameEn: 'Shockwave Therapy',
            description: 'لعلاج الالتهابات المزمنة مثل الشوكة العظمية والتهاب أوتار الكتف والمرفق.',
            descriptionEn: 'For chronic tendon conditions such as heel spur, shoulder and elbow tendinopathy.',
            price: 500,
            duration: 30,
            homeVisit: false,
            active: true
        },
        {
            name: 'تقنية تيكار (TECAR)',
            nameEn: 'TECAR Therapy',
            description: 'علاج بالطاقة الحرارية العميقة يسرّع التئام الأنسجة ويخفف الألم.',
            descriptionEn: 'Deep thermal energy therapy that speeds tissue healing and relieves pain.',
            price: 500,
            duration: 30,
            homeVisit: false,
            active: true
        },
        {
            name: 'الشد الفقري (Spinal Traction)',
            nameEn: 'Spinal Traction',
            description: 'شد آلي للفقرات لعلاج الانزلاق الغضروفي وعرق النسا وضغط الأعصاب.',
            descriptionEn: 'Mechanical spinal decompression for disc herniation, sciatica and nerve compression.',
            price: 500,
            duration: 30,
            homeVisit: false,
            active: true
        },
        {
            name: 'الإبر الجافة (Dry Needling)',
            nameEn: 'Dry Needling',
            description: 'علاج النقاط الزنادية والتشنجات العضلية المزمنة بالإبر الجافة.',
            descriptionEn: 'Trigger point and chronic muscle spasm treatment with dry needling.',
            price: 500,
            duration: 30,
            homeVisit: false,
            active: true
        },
        {
            name: 'تقويم العمود الفقري (Chiropractic)',
            nameEn: 'Chiropractic',
            description: 'تعديل يدوي للفقرات والمفاصل لتحسين الحركة وتخفيف الألم.',
            descriptionEn: 'Manual adjustment of joints and spine to restore motion and relieve pain.',
            price: 600,
            duration: 30,
            homeVisit: false,
            active: true
        },
        {
            name: 'التأهيل الرياضي',
            nameEn: 'Sports Rehabilitation',
            description: 'برنامج تأهيل للإصابات الرياضية والعودة الآمنة للملعب.',
            descriptionEn: 'Rehabilitation programme for sports injuries and a safe return to play.',
            price: 500,
            duration: 60,
            homeVisit: false,
            active: true
        },
        {
            name: 'زيارة منزلية',
            nameEn: 'Home Visit',
            description: 'جلسة علاج طبيعي في المنزل أو الفندق داخل الغردقة والجونة وسهل حشيش ومكادي وسوما باي.',
            descriptionEn: 'Physiotherapy at your home or hotel across Hurghada, El Gouna, Sahl Hasheesh, Makadi and Soma Bay.',
            price: 800,
            duration: 60,
            homeVisit: true,
            active: true
        }
    ];
}

/** تمارين منزلية جاهزة تُملأ بها المكتبة عند أول إعداد، ويعدّلها المركز كما يشاء */
export function defaultExercises(): Omit<Exercise, 'id' | 'createdAt'>[] {
    return [
        {
            name: 'إمالة الحوض الخلفية',
            nameEn: 'Posterior Pelvic Tilt',
            category: 'العمود الفقري القطني',
            description: 'استلقِ على ظهرك مع ثني الركبتين، اضغط أسفل ظهرك تجاه الأرض واثبت 5 ثوانٍ ثم استرخِ.',
            descriptionEn: 'Lie on your back with knees bent, flatten your lower back against the floor, hold 5 seconds and release.',
            mediaType: 'none',
            mediaUrl: '',
            active: true
        },
        {
            name: 'تمرين القطة والبعير',
            nameEn: 'Cat–Camel',
            category: 'العمود الفقري القطني',
            description: 'من وضع الزحف، قوّس ظهرك لأعلى ببطء ثم اخفضه لأسفل، مع تنفس منتظم وبدون ألم.',
            descriptionEn: 'On all fours, slowly arch your back up then let it sag down, breathing steadily and staying pain-free.',
            mediaType: 'none',
            mediaUrl: '',
            active: true
        },
        {
            name: 'رفع الساق المستقيمة',
            nameEn: 'Straight Leg Raise',
            category: 'الركبة',
            description: 'استلقِ على ظهرك، شدّ عضلة الفخذ وارفع الساق المفرودة 30 سم واثبت ثانيتين ثم أنزلها ببطء.',
            descriptionEn: 'Lying on your back, tighten your thigh and lift the straight leg 30 cm, hold 2 seconds, lower slowly.',
            mediaType: 'none',
            mediaUrl: '',
            active: true
        },
        {
            name: 'تمرين البندول للكتف',
            nameEn: 'Pendulum Exercise',
            category: 'الكتف',
            description: 'انحنِ للأمام مستندًا بيد سليمة، ودع الذراع المصابة تتأرجح بحركة دائرية مسترخية.',
            descriptionEn: 'Lean forward supported by the healthy arm and let the affected arm swing in relaxed circles.',
            mediaType: 'none',
            mediaUrl: '',
            active: true
        },
        {
            name: 'تسلق الحائط بالأصابع',
            nameEn: 'Wall Finger Walk',
            category: 'الكتف',
            description: 'قف مواجهًا الحائط وامشِ بأصابعك لأعلى إلى أقصى مدى بلا ألم، ثم انزل ببطء.',
            descriptionEn: 'Face the wall and walk your fingers upward to your pain-free limit, then come down slowly.',
            mediaType: 'none',
            mediaUrl: '',
            active: true
        },
        {
            name: 'إطالة عضلة السمانة',
            nameEn: 'Calf Stretch',
            category: 'الكاحل والقدم',
            description: 'ادفع الحائط بقدم خلفية مفرودة وكعب ملامس للأرض، واثبت على الشد 30 ثانية.',
            descriptionEn: 'Push against the wall with the back leg straight and heel down, holding the stretch for 30 seconds.',
            mediaType: 'none',
            mediaUrl: '',
            active: true
        },
        {
            name: 'شدّ الرقبة للخلف (Chin Tuck)',
            nameEn: 'Chin Tuck',
            category: 'الرقبة',
            description: 'اسحب ذقنك للخلف كأنك تصنع ذقنًا مزدوجة بدون إمالة الرأس، واثبت 5 ثوانٍ.',
            descriptionEn: 'Draw your chin straight back to make a double chin without tilting the head, hold 5 seconds.',
            mediaType: 'none',
            mediaUrl: '',
            active: true
        },
        {
            name: 'تمرين الجسر',
            nameEn: 'Bridging',
            category: 'العمود الفقري القطني',
            description: 'استلقِ مع ثني الركبتين، ارفع الحوض حتى يستقيم الجسم مع الفخذين واثبت 5 ثوانٍ.',
            descriptionEn: 'Lying with knees bent, lift your hips until body and thighs are in line, hold 5 seconds.',
            mediaType: 'none',
            mediaUrl: '',
            active: true
        }
    ];
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
    const t1 = { id: uid('t_'), name: 'د. مايكل مجدي', phone: '', specialty: 'علاج طبيعي وتأهيل', active: true };
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

    db.services = defaultServices().map((service) => ({ ...service, id: uid('v_'), createdAt: new Date().toISOString() }));
    db.exercises = defaultExercises().map((exercise) => ({ ...exercise, id: uid('x_'), createdAt: new Date().toISOString() }));

    // برنامج منزلي جاهز للمريض الأول حتى تظهر الشاشة بمحتوى حقيقي
    db.prescriptions = db.exercises.slice(0, 3).map((exercise) => ({
        id: uid('r_'),
        patientId: p1.id,
        exerciseId: exercise.id,
        sets: 3,
        reps: 10,
        holdSeconds: 5,
        perDay: 2,
        daysPerWeek: 6,
        startDate: iso(-2),
        endDate: '',
        notes: '',
        active: true,
        createdAt: new Date().toISOString()
    }));

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
        expenses: Array.isArray(db.expenses) ? db.expenses : [],
        exercises: Array.isArray(db.exercises) ? db.exercises : [],
        prescriptions: Array.isArray(db.prescriptions) ? db.prescriptions : [],
        exerciseLogs: Array.isArray(db.exerciseLogs) ? db.exerciseLogs : [],
        services: Array.isArray(db.services) ? db.services : [],
        bookings: Array.isArray(db.bookings) ? db.bookings : []
    };
}

const LEGACY_NAMES = ['عيادة العلاج الطبيعي', 'مركز الشفاء للعلاج الطبيعي'];

/** أي نسخة محفوظة باسم افتراضي قديم تُحدَّث لاسم المركز الحالي */
function migrate(db: Database): Database {
    if (LEGACY_NAMES.includes(db.settings.name)) {
        db.settings.name = emptyDatabase().settings.name;
    }
    return db;
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
        return migrate(normalize(JSON.parse(raw)));
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
