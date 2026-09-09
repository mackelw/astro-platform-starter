/**
 * يتحقق من أن نسخة أقدم من البرنامج لا تمحو بيانات كتبتها نسخة أحدث.
 *
 * لماذا هذا مهم: المركز يشغّل نسختين على **نفس قاعدة البيانات** — الأساسية على فرع
 * main والاحتياطية على فرع stable المتجمد. لو أضاف main جدولًا جديدًا ولم تعرفه
 * النسخة الاحتياطية، فأول حفظ منها يمحو الجدول بالكامل. كارثة صامتة، لأن كل شيء
 * يبدو سليمًا حتى يكتشف أحدهم أن البيانات اختفت.
 *
 * التشغيل: npm run check:compat
 */
import { normalize } from '../src/clinic/storage';

const fails: string[] = [];
const check = (label: string, ok: boolean, extra?: unknown) => {
    console.log((ok ? '  ok  ' : ' FAIL ') + label + (!ok && extra !== undefined ? '  → ' + JSON.stringify(extra) : ''));
    if (!ok) fails.push(label);
};

// قاعدة كتبتها نسخة أحدث: جدولان ومفتاح لا تعرفها هذه النسخة
const newer = {
    version: 99,
    settings: { name: 'مركز رينج', currency: 'ج.م' },
    patients: [{ id: 'p_1', name: 'محمد', phone: '0100' }],
    programs: [{ id: 'pr_1', patientId: 'p_1', items: [] }],
    invoices: [{ id: 'inv_1', patientId: 'p_1', total: 500 }],
    insuranceClaims: [{ id: 'ic_1', status: 'pending' }],
    users: [{ id: 'u_1', passwordHash: 'سر' }],
    authSessions: [{ tokenHash: 'سر' }]
};

/** التطبيع يعيد نوع Database؛ نقرأه كسجل مفاتيح لنفحص ما ليس في النوع أصلًا */
const asRecord = (value: unknown) => value as Record<string, unknown>;

const out = asRecord(normalize(newer));

check('جدول لا تعرفه هذه النسخة لم يُحذف', Array.isArray(out.invoices) && (out.invoices as unknown[]).length === 1, out.invoices);
check('جدول آخر غير معروف بقي أيضًا', Array.isArray(out.insuranceClaims), out.insuranceClaims);
check('البيانات المعروفة سليمة', (out.patients as unknown[]).length === 1 && (out.programs as unknown[]).length === 1);
check('الجداول الناقصة تُملأ فارغة لا محذوفة', Array.isArray(out.sessions) && (out.sessions as unknown[]).length === 0);
check('رقم إصدار أحدث لا يُنزَّل', out.version === 99, out.version);
check('الإعدادات تُدمج مع الافتراضي', (out.settings as Record<string, unknown>).workStart === '09:00');
check('أسرار السيرفر لا تمر عبر التطبيع العام', out.users === undefined && out.authSessions === undefined, {
    users: out.users,
    authSessions: out.authSessions
});

// والاتجاه المعاكس: قاعدة قديمة تُرقَّى بلا فقد
const older = asRecord(normalize({ version: 1, settings: { name: 'قديم' }, patients: [] }));
check('قاعدة قديمة تُرقّى بجداول فارغة', Array.isArray(older.programs) && Array.isArray(older.exercises));
check('اسم المركز المحفوظ لم يُستبدل', (older.settings as Record<string, unknown>).name === 'قديم');
check('مدخل غير صالح يعطي قاعدة فارغة صالحة', Array.isArray(asRecord(normalize(null)).patients));

console.log();
if (fails.length) {
    console.error(`فشل ${fails.length} فحص — لا تنشر قبل إصلاحها.`);
    process.exit(1);
}
console.log('كل الفحوص نجحت ✓');
