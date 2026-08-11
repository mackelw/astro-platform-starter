# 🦷 نظام AI Automation لإدارة عيادة أسنان

نظام أتمتة كامل بيدير رحلة المريض من أول رسالة لحد جمع رأيه بعد الزيارة —
مبني على **n8n + AI Agent + Supabase + Google Calendar + Gmail**.

```
Booking  →  Patient Data  →  Follow-up  →  Feedback
```

---

## إيه اللي بيعمله

| القدرة                     | فين بتتنفّذ                                                      |
| -------------------------- | ---------------------------------------------------------------- |
| يختار الدكتور والخدمة      | `list_doctors_services` (أداة على الـ agent)                     |
| يتحقق من المواعيد المتاحة  | `available_slots` — بتحسب الفاضي من الداتابيز مش من دماغ الموديل |
| يحجز الموعد تلقائيًا       | `book_appointment`                                               |
| **يمنع تعارض الحجوزات**    | قيد `exclude using gist` في Postgres                             |
| يعدّل أو يلغي الموعد       | `reschedule_appointment` / `cancel_appointment`                  |
| يحفظ بيانات المريض وتاريخه | جداول `patients` / `appointments` + `patient_history`            |
| يستقبل الشكاوى والطلبات    | `log_complaint` → إيميل فوري للإدارة                             |
| يتابع المريض بعد الزيارة   | workflow 03 كل يوم خميس                                          |
| يجمع الآراء ويصنّفها       | workflow 04 (تقييم + انطباع + محاور + شكوى؟)                     |

---

## بنية النظام

```
                         ┌──────────────────────────────┐
   رسالة المريض ────────►│ 01 AI Receptionist           │
                         │  Claude + Postgres memory    │
                         │  7 أدوات على Supabase RPC     │
                         └──────────────┬───────────────┘
                                        │ RPC فقط
                                        ▼
                         ┌──────────────────────────────┐
                         │  Supabase (مصدر الحقيقة)      │
                         │  patients · appointments      │
                         │  complaints · feedback        │
                         └───┬──────────────────────┬────┘
                 DB webhook  │                      │  DB webhook
                             ▼                      ▼
              ┌────────────────────────┐   ┌──────────────────────┐
              │ 02 Calendar Sync       │   │ 05 Complaint Alerts  │
              │  → Google Calendar     │   │  → Gmail للإدارة      │
              └────────────────────────┘   └──────────────────────┘

   كل خميس 6 م  ──►  03 Weekly Feedback ──►  رسالة متابعة (Gmail / شات)
                                                    │
                          رد المريض ────────────────►│
                                                     ▼
                                          ┌──────────────────────┐
                                          │ 04 Feedback Intake   │
                                          │  تصنيف + تخزين        │
                                          │  + تصعيد الشكاوى      │
                                          └──────────────────────┘
```

تفاصيل قرارات التصميم في [`docs/architecture.md`](docs/architecture.md).

---

## المحتويات

```
automation/dental-clinic/
├── supabase/
│   ├── schema.sql       # الجداول + الـ RPCs + قيد منع التعارض + RLS
│   ├── seed.sql         # أطباء وخدمات للتجربة
│   └── test_flow.sql    # 14 اختبار بيعدّوا على رحلة المريض كاملة
├── workflows/
│   ├── 01-ai-receptionist.json
│   ├── 02-calendar-sync.json
│   ├── 03-weekly-feedback.json
│   ├── 04-feedback-intake.json
│   └── 05-complaint-alerts.json
├── prompts/
│   └── receptionist-system-prompt.md
└── docs/
    └── architecture.md
```

---

## التركيب

### 1. Supabase

نفّذ الملفين في SQL Editor بالترتيب:

```sql
-- schema.sql  ثم  seed.sql
```

بعدها عدّل جدول `doctors`: حط أسماء الأطباء الحقيقيين، مواعيد عملهم، و**Calendar ID**
بتاع كل دكتور من Google Calendar (Settings → Integrate calendar → Calendar ID).

للتأكد إن كل حاجة شغالة، شغّل الاختبارات على نسخة تجريبية:

```bash
psql "$DATABASE_URL" -f supabase/schema.sql
psql "$DATABASE_URL" -f supabase/seed.sql
psql "$DATABASE_URL" -f supabase/test_flow.sql
```

> ⚠️ `test_flow.sql` بيكتب بيانات وهمية. متشغّلهوش على قاعدة فيها مرضى حقيقيين.

### 2. بيانات الاعتماد في n8n

اعمل الـ credentials دي الأول:

| النوع                  | الاسم المقترح              | بيتستخدم في                                        |
| ---------------------- | -------------------------- | -------------------------------------------------- |
| Supabase API           | `Supabase — clinic`        | كل استدعاءات الـ RPC (استخدم **service_role key**) |
| Postgres               | `Supabase Postgres`        | ذاكرة المحادثة                                     |
| Anthropic              | `Anthropic account`        | الموديل                                            |
| Google Calendar OAuth2 | `Google Calendar — clinic` | مزامنة المواعيد                                    |
| Gmail OAuth2           | `Gmail — clinic`           | الشكاوى والمتابعات                                 |

### 3. استبدال العناوين قبل الاستيراد

في ملفات `workflows/*.json` بدّل القيم دي:

| القيمة الموجودة                                    | تبدّلها بـ                  |
| -------------------------------------------------- | --------------------------- |
| `https://YOUR-PROJECT.supabase.co`                 | رابط مشروعك على Supabase    |
| `https://YOUR-MESSAGING-PROVIDER.example.com/send` | endpoint إرسال الرسايل عندك |
| `clinic-manager@your-clinic.com`                   | إيميل إدارة العيادة         |
| `REPLACE_SUPABASE_CRED_ID` وأخواتها                | ID الـ credential من n8n    |

الـ credential IDs موحّدة في كل الملفات، فـ find & replace مرة واحدة بتربط كل العقد:

```bash
cd workflows
sed -i 's|https://YOUR-PROJECT.supabase.co|https://xxxx.supabase.co|g' *.json
sed -i 's|REPLACE_SUPABASE_CRED_ID|<id>|g' *.json
```

> تقدر كمان تستوردهم زي ما هم وتختار الـ credential من الواجهة في كل عقدة.

### 4. استيراد الـ workflows

n8n → **Import from File** لكل ملف بالترتيب من 01 لـ 05، وبعدها فعّل كل واحد.

### 5. ربط الـ webhooks

من كل workflow خد الـ **Production URL** واربطه:

| الـ workflow                      | الربط                                                                  |
| --------------------------------- | ---------------------------------------------------------------------- |
| 01 — `clinic/inbound`             | قناة الشات (WhatsApp Cloud API أو أي provider)                         |
| 02 — `clinic/appointment-changed` | Supabase → Database → Webhooks → جدول `appointments` → INSERT + UPDATE |
| 04 — `clinic/feedback-reply`      | ردود المرضى على رسايل المتابعة                                         |
| 05 — `clinic/complaint-created`   | Supabase → Database → Webhooks → جدول `complaints` → INSERT            |

### 6. تجربة سريعة

```bash
curl -X POST https://<n8n>/webhook/clinic/inbound \
  -H 'Content-Type: application/json' \
  -d '{"phone":"01001234567","name":"محمد","message":"مساء الخير، عايز أحجز كشف"}'
```

المفروض يرجع:

```json
{ "phone": "201001234567", "reply": "أهلاً يا محمد 🦷 ..." }
```

---

## حاجات مهمة قبل التشغيل الحقيقي

- **الـ agent مش بيدّي نصايح طبية.** ده مكتوب صراحة في الـ system prompt، وسيبه كده.
- **service_role key** بيتخطّى الـ RLS، فخلّيه في n8n بس ومتحطّهوش في أي كود بيوصل للمتصفح.
- رقم تليفون المريض بيتحقن في الأدوات من عقدة `Normalize Message` **مش من الموديل** —
  ده اللي بيمنع إن مريض يقرا سجل مريض تاني بإنه يدّي رقم غيره. متغيّرش ده.
- كود الدولة موجود في مكانين لازم يفضلوا متطابقين: `normalize_phone()` في
  `schema.sql`، و `COUNTRY_CODE` في عقدة `Normalize Message`.
- اضبط timezone الـ workflows على توقيت العيادة (متظبّط دلوقتي على `Africa/Cairo`).
