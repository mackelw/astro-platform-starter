# مركز رينج للعلاج الطبيعي والتأهيل — د. مايكل مجدي

برنامج عربي كامل (RTL) لإدارة مركز العلاج الطبيعي والتأهيل، يعمل **محليًا داخل المتصفح** بدون سيرفر أو إنترنت — كل البيانات محفوظة على جهازك في `localStorage`.

## المميزات

| الشاشة | ماذا تفعل |
| :--- | :--- |
| **لوحة التحكم** | مؤشرات اليوم: عدد المرضى، مواعيد اليوم مع تسجيل الحضور بضغطة، تحصيل الشهر، أعلى المستحقات، المواعيد القادمة |
| **المواعيد** | تقويم أسبوعي وحجز/تعديل/إلغاء المواعيد، تنبيه عند تعارض موعد أخصائي، تحويل الموعد إلى جلسة مباشرة |
| **المرضى** | ملفات كاملة (بيانات، تشخيص، تاريخ مرضي، طبيب محوِّل، خطة علاجية وسعر جلسة)، بحث فوري، أرشفة، تصدير CSV |
| **ملف المريض** | شريط تقدم الخطة العلاجية، سجل الجلسات والمواعيد والمدفوعات، طباعة كشف حساب وتقرير جلسة |
| **الجلسات** | سجل الجلسات بالإجراءات العلاجية ومقياس الألم قبل/بعد والبرنامج المنزلي، مع فلاتر بالتاريخ والأخصائي وتصدير CSV |
| **الحسابات** | المستحقات لكل مريض، المدفوعات (نقدي/بطاقة/تحويل/تأمين)، المصروفات، وصافي الفترة |
| **التقارير** | تحصيل ومصروفات آخر 6 أشهر، أداء الأخصائيين، أكثر التشخيصات، نسب الحضور، متوسط تحسن الألم |
| **الإعدادات** | اسم المركز والطبيب المسؤول والعملة وساعات العمل، إدارة الأخصائيين، نسخة احتياطية JSON واسترجاعها |

## نسختان من البرنامج

| | نسخة محلية (ملف واحد) | نسخة السيرفر (مشتركة) |
| :--- | :--- | :--- |
| التشغيل | نقر مزدوج على ملف HTML | سيرفر على جهاز في المركز أو على الإنترنت |
| تسجيل الدخول | لا يوجد — جهاز واحد لشخص واحد | اسم مستخدم وكلمة سر لكل موظف |
| البيانات | داخل متصفح الجهاز | قاعدة واحدة يراها كل الأجهزة لحظيًا |
| الأمر | `npm run build:offline` | `npm run build:server` ثم `npm run start:server` |

## المستخدمون والصلاحيات (نسخة السيرفر)

عند أول فتح يطلب البرنامج إنشاء **حساب المدير** (مرة واحدة فقط)، وبعدها يضيف المدير باقي الموظفين من: الإعدادات ← المستخدمون والصلاحيات.

| الصلاحية | ما يستطيع الوصول إليه |
| :--- | :--- |
| **مدير / طبيب** | كل الشاشات: المرضى، المواعيد، الجلسات، الحسابات، التقارير، الإعدادات، وإدارة المستخدمين |
| **استقبال** | المرضى والمواعيد وتحصيل المدفوعات — بدون حذف المرضى وبدون الإعدادات أو المستخدمين |
| **أخصائي علاج طبيعي** | المرضى والمواعيد وتسجيل الجلسات — **لا يرى أي بيانات مالية** (لا أسعار ولا مدفوعات ولا تقارير) |

الصلاحيات مطبَّقة على السيرفر وليس في الواجهة فقط: أي طلب تعديل خارج صلاحية الدور يُرفَض حتى لو جاء من خارج البرنامج، والبيانات المالية لا تُرسل أصلًا لمن لا يملك صلاحيتها.

**الأمان:** كلمات السر تُحفظ مُجزّأة بـ PBKDF2-SHA256 (210 آلاف دورة بملح عشوائي) ولا تُخزَّن كنص صريح أبدًا. رمز الجلسة يُحفظ مُجزّأً في كوكي `httpOnly` صالح 12 ساعة، وتُقفل المحاولات مؤقتًا بعد تكرار كلمة سر خاطئة، وتغيير كلمة سر مستخدم ينهي جلساته على كل الأجهزة.

## تشغيل نسخة السيرفر داخل المركز (شبكة محلية)

على جهاز واحد يظل مفتوحًا (جهاز الاستقبال مثلًا)، بعد تثبيت [Node.js](https://nodejs.org):

- **ويندوز:** انقر نقرًا مزدوجًا على `تشغيل-البرنامج.bat`
- **ماك / لينكس:** انقر نقرًا مزدوجًا على `تشغيل-البرنامج.command`

يتكفّل الملف بالتثبيت والبناء والتشغيل، ويطبع العنوان الذي تفتحه بقية الأجهزة. أو يدويًا:

```bash
npm install
npm run build:server
HOST=0.0.0.0 npm run start:server    # يعمل على المنفذ 4321
```

ثم من أي جهاز على نفس الشبكة (موبايل أو تابلت) افتح `http://<عنوان-IP-للجهاز>:4321`.

> `HOST=0.0.0.0` ضروري ليقبل السيرفر اتصالات بقية الأجهزة؛ بدونه يعمل على نفس الجهاز فقط. وقد تحتاج السماح للمنفذ في جدار حماية ويندوز أول مرة.

- البيانات تُحفظ في ملف `.data/clinic-db.json` داخل مجلد المشروع — **خذ منه نسخة احتياطية دورية**، وهو مستبعد من git لأنه يحتوي بيانات مرضى.
- لتغيير المنفذ أو مكان الملف: `PORT=8080 CLINIC_DATA_FILE=/path/clinic.json npm run start:server`.
- على شبكة محلية بدون HTTPS تبقى الكوكي بلا خاصية `secure`؛ إن نشرت النظام على الإنترنت استخدم HTTPS دائمًا لأن البيانات صحية وحسّاسة.

## النشر على الإنترنت (للوصول من أي مكان)

يختار البرنامج طبقة التخزين تلقائيًا حسب مكان التشغيل، فلا حاجة لتعديل الكود:

| الاستضافة | التخزين | ما تحتاجه |
| :--- | :--- | :--- |
| **Vercel** | Upstash Redis | متغيرا البيئة `UPSTASH_REDIS_REST_URL` و `UPSTASH_REDIS_REST_TOKEN` |
| **Netlify** | Netlify Blobs | لا شيء — يعمل تلقائيًا (`netlify.toml` جاهز) |
| **جهاز في المركز** | ملف `.data/clinic-db.json` | لا شيء |

### خطوات النشر على Vercel

1. أنشئ قاعدة بيانات مجانية على [upstash.com](https://upstash.com) (Redis) وانسخ من صفحتها قيمتَي **UPSTASH_REDIS_REST_URL** و **UPSTASH_REDIS_REST_TOKEN**.
2. على [vercel.com](https://vercel.com): **Add New → Project** ← اختر المستودع.
3. في **Environment Variables** أضف المتغيرين السابقين.
4. في إعدادات المشروع اجعل **Production Branch** هو الفرع الذي يحمل البرنامج.
5. **Deploy** — ثم افتح الرابط وأنشئ حساب المدير.

بدون ضبط المتغيرين سيعرض البرنامج رسالة صريحة تطلب إضافتهما بدل خطأ غامض.

## التشغيل للتطوير

```bash
npm install
npm run dev      # ثم افتح http://localhost:4321
```

## أين تُحفظ البيانات؟

في **نسخة السيرفر**: في ملف `.data/clinic-db.json` على جهاز السيرفر (أو Netlify Blobs عند النشر على Netlify).

في **النسخة المحلية**: داخل متصفح الجهاز تحت المفتاح `pt-clinic-db-v1` بلا أي اتصال بخادم، وعندها:

- البرنامج يعمل بالكامل بدون إنترنت بعد فتحه.
- مسح بيانات المتصفح أو استخدام جهاز آخر يعني بداية من الصفر، لذا **نزّل نسخة احتياطية دوريًا** من صفحة الإعدادات (زر «تنزيل نسخة احتياطية») واستعدها على أي جهاز بزر «استرجاع من ملف».
- عند أول تشغيل تُحمّل بيانات تجريبية لتصفح الشاشات، ويمكن مسحها كلها من الإعدادات.

## بنية الكود

```
src/clinic/
  types.ts              # نماذج البيانات
  permissions.ts        # مصفوفة الصلاحيات (تُستخدم في الواجهة وتُفرض على السيرفر)
  storage.ts            # التخزين المحلي والبيانات التجريبية
  api.ts                # الاتصال بالسيرفر وتحديد وضع التشغيل
  store.tsx             # حالة التطبيق والحفظ (محلي أو عبر السيرفر)
  utils.ts              # التنسيق العربي والحسابات والطباعة والتصدير
  ClinicApp.tsx         # الهيكل والتنقل وبوابة تسجيل الدخول
  components/           # عناصر الواجهة والنماذج المشتركة
  views/                # شاشات البرنامج (منها Auth.tsx و Users.tsx)
src/server/
  db.ts                 # التخزين على السيرفر (ملف JSON أو Netlify Blobs)
  auth.ts               # تجزئة كلمات السر والجلسات
  api.ts                # تنقية المدخلات وفرض الصلاحيات
src/pages/api/clinic/   # نقاط النهاية: session / setup / login / logout / mutate / users
src/layouts/ClinicLayout.astro   # قالب HTML بالاتجاه RTL
src/pages/index.astro            # صفحة البرنامج
```

الواجهة مبنية على Astro + React + Tailwind، والصفحة تُحمَّل كتطبيق عميل (`client:only`) لأن البيانات محلية بالكامل.

---

# Astro on Netlify Platform Starter (القالب الأصلي)

[Live Demo](https://astro-platform-starter.netlify.app/)

A modern starter based on Astro.js, Tailwind, and [Netlify Core Primitives](https://docs.netlify.com/core/overview/#develop) (Edge Functions, Image CDN, Blob Store).

## Astro Commands

All commands are run from the root of the project, from a terminal:

| Command                   | Action                                           |
| :------------------------ | :----------------------------------------------- |
| `npm install`             | Installs dependencies                            |
| `npm run dev`             | Starts local dev server at `localhost:4321`      |
| `npm run build`           | Build your production site to `./dist/`          |
| `npm run preview`         | Preview your build locally, before deploying     |
| `npm run astro ...`       | Run CLI commands like `astro add`, `astro check` |
| `npm run astro -- --help` | Get help using the Astro CLI                     |

## Deploying to Netlify

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/netlify-templates/astro-platform-starter)

## Developing Locally

| Prerequisites                                                                |
| :--------------------------------------------------------------------------- |
| [Node.js](https://nodejs.org/) v18.14+.                                      |
| (optional) [nvm](https://github.com/nvm-sh/nvm) for Node version management. |

1. Clone this repository, then run `npm install` in its root directory.

2. For the starter to have full functionality locally (e.g. edge functions, blob store), please ensure you have an up-to-date version of Netlify CLI. Run:

```
npm install netlify-cli@latest -g
```

3. Link your local repository to the deployed Netlify site. This will ensure you're using the same runtime version for both local development and your deployed site.

```
netlify link
```

4. Then, run the Astro.js development server via Netlify CLI:

```
netlify dev
```

If your browser doesn't navigate to the site automatically, visit [localhost:8888](http://localhost:8888).
