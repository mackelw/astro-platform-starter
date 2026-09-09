import type { Database, Exercise, Program, ProgramItem, ProgramTemplate } from './types';

export const DB_KEY = 'pt-clinic-db-v1';
export const DB_VERSION = 2;

export function emptyDatabase(): Database {
    return {
        version: DB_VERSION,
        settings: {
            name: 'مركز رينج للعلاج الطبيعي والتأهيل',
            doctorName: 'د. مايكل مجدي',
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
        expenses: [],
        exercises: [],
        programs: [],
        programTemplates: [],
        programLogs: [],
        promResponses: [],
        portalMessages: [],
        patientAccess: []
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

/**
 * مكتبة تمارين أولية بالعربية يبدأ بها المركز، بلا وسائط —
 * يرفع المركز فيديوهاته الخاصة لاحقًا من شاشة التمارين.
 */
export function starterExercises(): Exercise[] {
    const base = (
        name: string,
        region: Exercise['region'],
        equipment: string,
        level: Exercise['level'],
        instructions: string,
        sets: number,
        reps: number,
        hold: number,
        tags: string[]
    ): Exercise => ({
        id: uid('x_'),
        name,
        region,
        equipment,
        level,
        instructions,
        videoUrl: '',
        imageUrl: '',
        defaultSets: sets,
        defaultReps: reps,
        defaultHold: hold,
        defaultPerDay: 1,
        tags,
        active: true,
        createdAt: new Date().toISOString()
    });

    return [
        base('إمالة الحوض الخلفية', 'back', 'بدون', 'easy', 'استلقِ على ظهرك وثنِ ركبتيك. اضغط أسفل ظهرك تجاه الأرض بشدّ عضلات البطن، ثم استرخِ.', 3, 10, 5, [
            'أسفل الظهر',
            'تنشيط'
        ]),
        base('تمرين القطة والجمل', 'back', 'بدون', 'easy', 'من وضع الزحف، قوّس ظهرك لأعلى ببطء ثم اخفضه لأسفل. تنفّس مع الحركة ولا تصل لحد الألم.', 2, 10, 3, [
            'مدى حركة',
            'أسفل الظهر'
        ]),
        base(
            'الجسر (رفع الحوض)',
            'core',
            'بدون',
            'easy',
            'مستلقيًا وركبتاك مثنيتان، ارفع حوضك حتى يستقيم الجسم من الركبة للكتف، اثبت ثم انزل ببطء.',
            3,
            12,
            5,
            ['تقوية', 'ألوية']
        ),
        base('تمرين البلانك على الكوعين', 'core', 'بدون', 'medium', 'استند على كوعيك وأطراف قدميك مع استقامة الجسم. شدّ البطن ولا تدع الحوض يهبط.', 3, 1, 20, [
            'ثبات',
            'جذع'
        ]),
        base(
            'رفع الساق المستقيمة',
            'knee',
            'بدون',
            'easy',
            'مستلقيًا، ثنِ الركبة السليمة وأبقِ المصابة مستقيمة، ارفعها 30 سم واثبت ثم أنزلها ببطء.',
            3,
            15,
            5,
            ['رباط صليبي', 'الفخذ الأمامية']
        ),
        base(
            'شدّ العضلة الرباعية',
            'knee',
            'بدون',
            'easy',
            'اجلس والساق ممدودة، اضغط بمؤخرة الركبة تجاه الأرض وشدّ عضلة الفخذ الأمامية، ثم استرخِ.',
            3,
            10,
            6,
            ['تنشيط', 'ركبة']
        ),
        base('ثني الركبة على الكرسي', 'knee', 'كرسي', 'easy', 'اجلس وحرّك القدم للخلف تحت الكرسي حتى تشعر بشدّ، اثبت ثم عد. لا تتجاوز حد الألم.', 3, 10, 8, [
            'مدى حركة',
            'ما بعد الجراحة'
        ]),
        base('نصف قرفصاء بالاستناد للحائط', 'knee', 'حائط', 'medium', 'قف مستندًا بظهرك للحائط، انزل حتى تصل الركبة لزاوية مريحة، اثبت ثم ارتفع.', 3, 10, 10, [
            'تقوية',
            'وظيفي'
        ]),
        base(
            'تسلّق الأصابع على الحائط',
            'shoulder',
            'حائط',
            'easy',
            'قف مواجهًا الحائط وحرّك أصابعك صعودًا كالسلّم لأقصى ارتفاع محتمل، ثم انزل ببطء.',
            3,
            10,
            3,
            ['كتف متجمد', 'مدى حركة']
        ),
        base(
            'البندول (تمرين كودمان)',
            'shoulder',
            'بدون',
            'easy',
            'انحنِ للأمام مستندًا بيدك السليمة، ودع الذراع المصابة تتدلى وتتأرجح في دوائر صغيرة.',
            2,
            15,
            0,
            ['كتف', 'استرخاء']
        ),
        base(
            'الدوران الخارجي بحبل المقاومة',
            'shoulder',
            'حبل مقاومة',
            'medium',
            'الكوع ملتصق بالجنب بزاوية قائمة، اسحب الحبل للخارج مع ثبات الكوع، ثم عد ببطء.',
            3,
            12,
            2,
            ['كفة مدورة', 'تقوية']
        ),
        base(
            'شدّ عضلات الرقبة الجانبية',
            'neck',
            'بدون',
            'easy',
            'أمِل رأسك تجاه الكتف حتى تشعر بشدّ على الجانب الآخر، اثبت دون ألم، ثم بدّل الجهة.',
            2,
            3,
            20,
            ['إطالة', 'رقبة']
        ),
        base('سحب الذقن للخلف', 'neck', 'بدون', 'easy', 'اسحب ذقنك للخلف كأنك تصنع ذقنًا مزدوجًا دون رفع الرأس، اثبت ثم استرخِ.', 3, 10, 5, ['وضعية', 'رقبة']),
        base('شدّ أوتار الركبة الخلفية', 'hip', 'بدون', 'easy', 'مستلقيًا، ارفع الساق مستقيمة بمساعدة منشفة حول القدم حتى تشعر بشدّ خلف الفخذ.', 2, 3, 30, [
            'إطالة',
            'مرونة'
        ]),
        base('الوقوف على قدم واحدة', 'balance', 'بدون', 'medium', 'قف على قدم واحدة بجوار حائط أو كرسي للأمان، حافظ على توازنك ثم بدّل القدم.', 3, 1, 30, [
            'توازن',
            'كبار السن'
        ]),
        base('رفع الكعبين', 'ankle', 'بدون', 'easy', 'قف مستندًا بيديك، ارفع كعبيك عن الأرض واثبت ثم انزل ببطء.', 3, 15, 3, ['كاحل', 'ربلة الساق'])
    ];
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

    /* ------------------ وحدة التأهيل عن بُعد ------------------ */

    db.exercises = starterExercises();

    const pick = (name: string): Exercise => db.exercises.find((x) => x.name === name) ?? db.exercises[0];
    const item = (exercise: Exercise, patch: Partial<ProgramItem> = {}): ProgramItem => ({
        id: uid('i_'),
        exerciseId: exercise.id,
        sets: exercise.defaultSets,
        reps: exercise.defaultReps,
        hold: exercise.defaultHold,
        rest: 30,
        perDay: exercise.defaultPerDay,
        side: 'both',
        resistance: '',
        note: '',
        ...patch
    });

    const backItems = [
        item(pick('إمالة الحوض الخلفية')),
        item(pick('تمرين القطة والجمل')),
        item(pick('الجسر (رفع الحوض)')),
        item(pick('شدّ أوتار الركبة الخلفية'))
    ];

    const template: ProgramTemplate = {
        id: uid('tpl_'),
        title: 'بروتوكول أسفل الظهر — المرحلة الأولى',
        diagnosis: 'انزلاق غضروفي قطني',
        daysPerWeek: 5,
        notes: 'توقف عن أي تمرين يسبب ألمًا حادًا أو تنميلًا في الساق وأبلغ الأخصائي.',
        items: backItems,
        proms: ['nprs', 'odi'],
        createdAt: new Date().toISOString()
    };
    db.programTemplates = [template];

    const program: Program = {
        id: uid('pr_'),
        patientId: p1.id,
        therapistId: t1.id,
        title: 'برنامج منزلي — أسفل الظهر',
        startDate: iso(-7),
        endDate: iso(21),
        daysPerWeek: 5,
        status: 'active',
        notes: template.notes,
        items: backItems.map((row) => ({ ...row, id: uid('i_') })),
        proms: ['nprs', 'odi'],
        createdAt: new Date().toISOString()
    };
    db.programs = [program];

    // سجل التزام لأيام مضت حتى تظهر لوحة المتابعة بأرقام حقيقية
    db.programLogs = [
        { day: -5, done: 4, pain: 7 },
        { day: -4, done: 4, pain: 6 },
        { day: -3, done: 3, pain: 6 },
        { day: -1, done: 4, pain: 5 },
        { day: 0, done: 2, pain: 5 }
    ].map(({ day, done, pain }) => ({
        id: uid('g_'),
        programId: program.id,
        patientId: p1.id,
        date: iso(day),
        doneItemIds: program.items.slice(0, done).map((row) => row.id),
        pain,
        difficulty: 2,
        note: '',
        createdAt: new Date().toISOString()
    }));

    db.patientAccess = [{ patientId: p1.id, token: uid('') + uid(''), code: '481207', enabled: true, createdAt: new Date().toISOString(), lastSeenAt: '' }];

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
        programs: Array.isArray(db.programs) ? db.programs : [],
        programTemplates: Array.isArray(db.programTemplates) ? db.programTemplates : [],
        programLogs: Array.isArray(db.programLogs) ? db.programLogs : [],
        promResponses: Array.isArray(db.promResponses) ? db.promResponses : [],
        portalMessages: Array.isArray(db.portalMessages) ? db.portalMessages : [],
        patientAccess: Array.isArray(db.patientAccess) ? db.patientAccess : []
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
