# نظام إدارة عيادة العلاج الطبيعي

برنامج عربي كامل (RTL) لإدارة عيادة علاج طبيعي، يعمل **محليًا داخل المتصفح** بدون سيرفر أو إنترنت — كل البيانات محفوظة على جهازك في `localStorage`.

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
| **الإعدادات** | بيانات العيادة والعملة وساعات العمل، إدارة الأخصائيين، نسخة احتياطية JSON واسترجاعها |

## التشغيل

```bash
npm install
npm run dev      # ثم افتح http://localhost:4321
```

للنسخة النهائية: `npm run build` ثم `npm run preview`.

## أين تُحفظ البيانات؟

كل السجلات تُخزَّن في متصفح الجهاز تحت المفتاح `pt-clinic-db-v1`، ولا تُرسل إلى أي خادم. لذلك:

- البرنامج يعمل بالكامل بدون إنترنت بعد فتحه.
- مسح بيانات المتصفح أو استخدام جهاز آخر يعني بداية من الصفر، لذا **نزّل نسخة احتياطية دوريًا** من صفحة الإعدادات (زر «تنزيل نسخة احتياطية») واستعدها على أي جهاز بزر «استرجاع من ملف».
- عند أول تشغيل تُحمّل بيانات تجريبية لتصفح الشاشات، ويمكن مسحها كلها من الإعدادات.

## بنية الكود

```
src/clinic/
  types.ts              # نماذج البيانات
  storage.ts            # التخزين المحلي والبيانات التجريبية
  store.tsx             # حالة التطبيق (React Context) والحفظ التلقائي
  utils.ts              # التنسيق العربي والحسابات والطباعة والتصدير
  ClinicApp.tsx         # الهيكل والتنقل بين الشاشات
  components/           # عناصر الواجهة والنماذج المشتركة
  views/                # شاشات البرنامج
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
