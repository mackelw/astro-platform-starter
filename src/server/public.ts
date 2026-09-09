/**
 * منطق النقاط العامة (بلا تسجيل دخول) التي يستدعيها الموقع.
 *
 * قاعدة الأمان هنا: لا يخرج من هذه الطبقة أي بيان عن مريض أو موعد.
 * أقصى ما تكشفه هو المواعيد الشاغرة وأسماء الأخصائيين وبيانات المركز
 * المعلنة أصلًا على الموقع.
 */
import type { ServerDatabase } from './db';

/** أبعد يوم يُقبل الحجز فيه — نفس الحد مطبَّق في الواجهة */
export const MAX_DAYS_AHEAD = 60;

/**
 * أقل زمن معقول لملء النموذج بيد بشرية. منخفض عمدًا: زائر يستخدم الإكمال
 * التلقائي قد يكون سريعًا جدًا، وخسارة حجز حقيقي أسوأ كثيرًا من مرور رسالة دعائية.
 */
const MIN_FILL_MS = 1500;

/** حد أقصى لعدد الطلبات المعلّقة، يمنع إغراق الصندوق */
const MAX_PENDING_BOOKINGS = 300;

export function todayISO(): string {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
}

function nowHM(): string {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(11, 16);
}

const toMinutes = (hm: string): number => {
    const [h, m] = hm.split(':').map(Number);
    return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
};

const toHM = (minutes: number): string => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** التاريخ صالح شكلًا وواقع داخل نافذة الحجز المسموحة */
export function isBookableDate(date: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
    const today = todayISO();
    if (date < today) return false;
    const limit = new Date();
    limit.setDate(limit.getDate() + MAX_DAYS_AHEAD);
    limit.setMinutes(limit.getMinutes() - limit.getTimezoneOffset());
    return date <= limit.toISOString().slice(0, 10);
}

/**
 * المواعيد الشاغرة في يوم واحد.
 *
 * تُبنى الشبكة من ساعات عمل المركز ومدة الجلسة الافتراضية، ثم تُطرح منها
 * المواعيد المحجوزة وطلبات الحجز المعلّقة. الناتج أوقات فارغة فقط —
 * لا عدد المحجوز ولا هوية أحد.
 */
export function availableSlots(db: ServerDatabase, date: string, therapistId = ''): string[] {
    const { workStart, workEnd, defaultDuration } = db.settings;
    const step = Math.max(15, Number(defaultDuration) || 45);
    const start = toMinutes(workStart || '09:00');
    const end = toMinutes(workEnd || '21:00');
    if (!(end > start)) return [];

    // الأخصائيون النشطون فقط؛ عددهم يحدد كم موعدًا يمكن أن يتسع له نفس التوقيت
    const activeTherapists = db.therapists.filter((th) => th.active);
    const capacity = therapistId ? 1 : Math.max(1, activeTherapists.length);

    const takenAt = new Map<string, number>();
    const bump = (time: string) => takenAt.set(time, (takenAt.get(time) ?? 0) + 1);

    for (const appointment of db.appointments) {
        if (appointment.date !== date || appointment.status === 'cancelled') continue;
        if (therapistId && appointment.therapistId !== therapistId) continue;
        bump(appointment.time);
    }
    // الطلبات المعلّقة تحجز المكان مؤقتًا حتى لا يُعرض نفس التوقيت مرتين
    for (const booking of db.bookings) {
        if (booking.date !== date || (booking.status !== 'new' && booking.status !== 'confirmed')) continue;
        if (therapistId && booking.therapistId !== therapistId) continue;
        bump(booking.time);
    }

    const isToday = date === todayISO();
    const cutoff = nowHM();

    const slots: string[] = [];
    for (let minute = start; minute + step <= end; minute += step) {
        const time = toHM(minute);
        if (isToday && time <= cutoff) continue; // لا تُعرض ساعات مضت
        if ((takenAt.get(time) ?? 0) >= capacity) continue;
        slots.push(time);
    }
    return slots;
}

export interface BookingInput {
    name: string;
    phone: string;
    email: string;
    serviceSlug: string;
    therapistId: string;
    date: string;
    time: string;
    message: string;
    lang: string;
}

/** يتحقق من مدخلات الزائر ويعيد إما رسالة خطأ أو الحقول بعد التنظيف */
export function validateBooking(db: ServerDatabase, raw: unknown): { error: string } | { value: BookingInput } {
    const body = (raw ?? {}) as Record<string, unknown>;
    const text = (key: string, max: number) =>
        String(body[key] ?? '')
            .trim()
            .slice(0, max);

    const name = text('name', 80);
    const phone = text('phone', 20);
    const email = text('email', 120);
    const date = text('date', 10);
    const time = text('time', 5);

    if (name.length < 2) return { error: 'الاسم غير مكتمل' };
    if (!/^[0-9+\-\s()]{7,20}$/.test(phone)) return { error: 'رقم الهاتف غير صحيح' };
    if (email && !/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email)) return { error: 'البريد الإلكتروني غير صحيح' };
    if (!isBookableDate(date)) return { error: 'التاريخ خارج المدة المتاحة للحجز' };
    if (!/^\d{2}:\d{2}$/.test(time)) return { error: 'الوقت غير صحيح' };

    // الأخصائي إما فارغ أو موجود ونشط فعلًا
    const therapistId = text('therapistId', 40);
    if (therapistId && !db.therapists.some((th) => th.id === therapistId && th.active)) {
        return { error: 'الأخصائي المطلوب غير متاح' };
    }

    const lang = text('lang', 2) === 'en' ? 'en' : 'ar';

    return {
        value: {
            name,
            phone,
            email,
            serviceSlug: text('serviceSlug', 60),
            therapistId,
            date,
            time,
            message: text('message', 1000),
            lang
        }
    };
}

/**
 * حقل الفخ: مخفي عن البشر تمامًا، فمن يملؤه روبوت بلا شك.
 * هذه إشارة قاطعة، لذا نتجاهل الطلب بصمت.
 */
export function isHoneypotTrapped(raw: unknown): boolean {
    const body = (raw ?? {}) as Record<string, unknown>;
    return Boolean(String(body.website ?? '').trim());
}

/**
 * إرسال أسرع مما يستطيعه إنسان. إشارة ظنية لا قاطعة، لذا لا نتجاهل الطلب
 * بصمت أبدًا: نرد بخطأ صريح يعيد المحاولة، فيمر الإنسان في المرة الثانية
 * ولا يذهب حجز حقيقي إلى اللاشيء بينما يظن صاحبه أنه حجز.
 */
export function submittedTooFast(raw: unknown): boolean {
    const body = (raw ?? {}) as Record<string, unknown>;
    const elapsed = Number(body.elapsed);
    return Number.isFinite(elapsed) && elapsed >= 0 && elapsed < MIN_FILL_MS;
}

export function tooManyPending(db: ServerDatabase): boolean {
    return db.bookings.filter((b) => b.status === 'new').length >= MAX_PENDING_BOOKINGS;
}

/* --------------------------- تحديد معدل الطلبات --------------------------- */

const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 3;

/**
 * عدّاد في ذاكرة العملية — يكفي تمامًا على سيرفر المركز، لكنه على Netlify
 * أو Vercel يُصفَّر مع كل نسخة جديدة من الدالة، فهو حماية تقريبية لا قاطعة.
 * هذا نفس أسلوب قفل محاولات الدخول في server/auth.ts.
 */
const hits = new Map<string, number[]>();

export function rateLimited(key: string): boolean {
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((at) => now - at < WINDOW_MS);
    if (recent.length >= MAX_PER_WINDOW) {
        hits.set(key, recent);
        return true;
    }
    recent.push(now);
    hits.set(key, recent);

    // تنظيف دوري حتى لا تكبر الخريطة بلا حد
    if (hits.size > 5000) {
        for (const [k, times] of hits) {
            if (times.every((at) => now - at >= WINDOW_MS)) hits.delete(k);
        }
    }
    return false;
}

/** عنوان الزائر من ترويسات الوسيط، مع اسم مستعار عند غيابه */
export function clientKey(request: Request, phone: string): string {
    const forwarded = request.headers.get('x-forwarded-for') ?? '';
    const ip = forwarded.split(',')[0].trim() || request.headers.get('x-nf-client-connection-ip') || 'unknown';
    return `${ip}|${phone}`;
}
