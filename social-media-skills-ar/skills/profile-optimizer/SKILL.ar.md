---
name: profile-optimizer
description: >
  Rebuild a LinkedIn profile for maximum conversions. Produces new headline options, about section, experience section, featured section strategy, and 4 image generation prompts (banner, profile picture, 2 featured tiles). Use this skill whenever the user says "optimize my profile", "fix my LinkedIn", "rewrite my headline", "profile review", "LinkedIn audit", "rebuild my profile", or wants help with any part of their LinkedIn profile. Also trigger on the Arabic equivalents: "حسّن ملفي الشخصي"، "أصلح لينكدإن الخاص بي"، "أعد كتابة العنوان الوظيفي"، "مراجعة الملف الشخصي"، "تدقيق لينكدإن". Also trigger when the user uploads a LinkedIn profile PDF or screenshot for review.
---

# محسّن الملف الشخصي

## بالغ الأهمية: ابدأ تلقائيًا عند التحميل

عند تفعيل هذه المهارة، انتقل مباشرة إلى الخطوة 1. لا تلخّص. لا تشرح ما ستنتجه. ابدأ جمع المدخلات فورًا.

## الخطوة 1. اجمع المدخلات

ابحث في المشروع عن about-me.md. إذا وُجد، فاملأ مسبقًا الاسم والجمهور والموضوعات ووجهة النظر منه. تجاوز تلك الأسئلة وأخبر المستخدم بما استخلصته.

استدعِ AskUserQuestion على دفعتين. تبقى حمولات JSON بالإنجليزية لأنها تُمرَّر إلى الأداة؛ اطرح الأسئلة شفهيًا بالعربية عند مخاطبة مستخدم عربي.

### الدفعة 1

```json
[
  {
    "question": "What is the primary goal of your LinkedIn presence?",
    "header": "Goal",
    "multiSelect": false,
    "options": [
      {"label": "Booked calls", "description": "Drive discovery calls or demos"},
      {"label": "Inbound leads", "description": "Attract prospects who reach out to you"},
      {"label": "Newsletter subscribers", "description": "Grow your email list from LinkedIn"},
      {"label": "Job opportunities", "description": "Get recruiters and hiring managers to reach out"}
    ]
  },
  {
    "question": "What is your main offer or service?",
    "header": "Offer",
    "multiSelect": false,
    "options": [
      {"label": "Coaching", "description": "1-on-1 or group coaching"},
      {"label": "Consulting", "description": "Advisory or strategy work"},
      {"label": "Agency services", "description": "Done-for-you services for clients"},
      {"label": "Freelance", "description": "Project-based or contract work"}
    ]
  },
  {
    "question": "Do you have brand colours (hex codes)?",
    "header": "Colours",
    "multiSelect": false,
    "options": [
      {"label": "No, suggest for me", "description": "Pick colours based on my positioning"},
      {"label": "Yes, I will paste them", "description": "I have specific hex codes to use"}
    ]
  },
  {
    "question": "Any social proof you want highlighted?",
    "header": "Proof",
    "multiSelect": false,
    "options": [
      {"label": "Years of experience", "description": "e.g. 10+ years in marketing"},
      {"label": "Client results", "description": "e.g. Helped 200+ clients"},
      {"label": "Media features", "description": "e.g. Featured in Forbes"},
      {"label": "I will type my own", "description": "Let me paste specific proof points"}
    ]
  }
]
```

بالعربية: "ما الهدف الأساسي من حضورك على لينكدإن؟" (مكالمات محجوزة، أو عملاء محتملون واردون، أو مشتركون في النشرة البريدية، أو فرص وظيفية). و"ما عرضك أو خدمتك الرئيسية؟" (تدريب، أو استشارات، أو خدمات وكالة، أو عمل حر). و"هل لديك ألوان علامة تجارية؟" (لا، اقترح لي، أو نعم، سألصقها). و"هل هناك دليل اجتماعي تريد إبرازه؟" (سنوات الخبرة، أو نتائج العملاء، أو الظهور الإعلامي، أو سأكتبه بنفسي).

### الدفعة 2

```json
[
  {
    "question": "What external links do you want in your Featured Section? (max 2)",
    "header": "Links",
    "multiSelect": false,
    "options": [
      {"label": "Booking page + newsletter", "description": "Primary link to book calls, secondary to subscribe"},
      {"label": "Portfolio + booking page", "description": "Show work first, then convert"},
      {"label": "I will paste URLs", "description": "I have specific links to use"}
    ]
  },
  {
    "question": "How should I get your current profile?",
    "header": "Current profile",
    "multiSelect": false,
    "options": [
      {"label": "I will paste it", "description": "I will copy-paste my headline, about, and experience"},
      {"label": "Start fresh", "description": "Ignore my current profile, build from scratch using my about-me.md"},
      {"label": "I will upload a screenshot", "description": "I will share a screenshot or PDF of my profile"}
    ]
  }
]
```

بالعربية: "ما الروابط الخارجية التي تريدها في القسم المميز؟ (رابطان كحد أقصى)" و"كيف أحصل على ملفك الشخصي الحالي؟".

انتظر كل المدخلات قبل المتابعة.

## الخطوة 2. العنوان الوظيفي

اكتب 3 خيارات للعنوان الوظيفي. أخرِجها داخل كتلة برمجية.

القيود:
- 50 حرفًا كحد أقصى لكل خيار
- بلا تنميق زائد في الأحرف الكبيرة (ينطبق على النص اللاتيني)
- ابدأ بالقيمة الجوهرية
- أدرج الجمهور المستهدف حيثما سمح عدد الأحرف
- بلا مسميات وظيفية (لا "مؤسس" ولا "رئيس تنفيذي" ولا "مصمم")
- بلا كلمات حشو

الصيغة: [القيمة الجوهرية] + [لأجل الجمهور المستهدف]

```
الخيار 1 (مباشر): [النتيجة + الجمهور]
الخيار 2 (مرتكز على الألم): [المشكلة + الجمهور]
الخيار 3 (عامل التمايز): [الزاوية الفريدة + الجمهور]
```

ثم استدعِ AskUserQuestion ليختار المستخدم:

```json
[
  {
    "question": "Which headline do you want to go with?",
    "header": "Headline",
    "multiSelect": false,
    "options": [
      {"label": "Option 1", "description": "[The actual headline text from above]"},
      {"label": "Option 2", "description": "[The actual headline text from above]"},
      {"label": "Option 3", "description": "[The actual headline text from above]"}
    ]
  }
]
```

## الخطوة 3. قسم "نبذة عني"

أخرِجه داخل كتلة برمجية. قواعد التنسيق:
- اكتب جملًا كاملة. لا تفرض فواصل أسطر في منتصف الجملة.
- فاصل سطر واحد بين الجمل أو العبارات القصيرة لتحسين القراءة.
- فاصل سطرين بين الأقسام (المقدمة، والقصة، والسلطة المرجعية، ودعوة الإجراء).
- لينكدإن يتولى التفاف النص على الهاتف والحاسوب. لا تلتف يدويًا عند 50 أو 60 حرفًا.
- الجمل القصيرة القوية جيدة. أما تقطيع الجمل إلى نصفين فليس كذلك.

البنية: المقدمة ← المعاناة/التعاطف ← المنهج/الفلسفة ← السلطة المرجعية ← دعوة الإجراء

النبرة: قوية، ومباشرة، وإنسانية. لا مؤسسية جافة.

مثال على التنسيق الصحيح:
```
تركت وظيفتي بدوام كامل في سبتمبر 2024.
وبعد عامين: أكثر من 200 ألف متابع، وعدة أعمال تجاوزت إيراداتها ستة أرقام، وآلاف المسوّقين المدرَّبين.

إليك ما تعلمته.
معظم الناس لا يحتاجون إلى مزيد من المحتوى. يحتاجون إلى نظام يحوّل المحتوى إلى عملاء. وهذا ما أبنيه.

✦ Linked Agency: محتوى لينكدإن جاهز للمؤسسين والتنفيذيين.
✦ Vislo: أداة تصميم بالذكاء الاصطناعي تنتج إنفوجرافيك جاهزًا للنشر في دقائق.
✦ نشرة MarTech AI: أكثر من 200 ألف قارئ يتلقون أطر عمل أسبوعية للتسويق بالذكاء الاصطناعي.
✦ The AI Creators Club: تحليلات مباشرة، وأنظمة مجرّبة، ومجتمع يساعدك على النمو في أسابيع لا شهور.

شراكات العلامات التجارية والمحاضرات: hello@influencermoso.com

اطّلع على قسمي المميز بالأسفل. أو راسلني مباشرة. سأدلّك على الاتجاه الصحيح.
```

## الخطوة 4. قسم الخبرات

أعد كتابة أعلى دورين وظيفيين. أخرِجهما داخل كتلة برمجية. نهج التنسيق نفسه المتبع في قسم "نبذة عني": جمل كاملة، وبلا فواصل أسطر مفروضة في منتصف الجملة، ولينكدإن يتولى الالتفاف.

البنية لكل دور: السياق ← التحدي ← الإجراء ← النتيجة

صيغة سرد قصصي، لا نقاط مرقّمة. من 8 إلى 15 جملة لكل دور كحد أقصى.

مثال على التنسيق الصحيح:
```
دخلت إلى فريق فقد 3 مديرين خلال عامين.
المعنويات كانت منهارة. والإيرادات كانت تتراجع.

لم أبدأ بعروض الاستراتيجية. بدأت بالإنصات.

خلال 6 أشهر أعدنا بناء الثقافة.
وخلال 12 شهرًا ارتفعت الإيرادات 40%.

علّمني ذلك كل شيء عن القيادة وسط الفوضى.
```

مثال على التنسيق الخاطئ:
- إدارة فريق من 15 مندوب مبيعات
- مسؤول عن أهداف إيرادات الربع الثالث
- تطبيق نظام إدارة علاقات عملاء جديد

## الخطوة 5. استراتيجية القسم المميز

عنصران كحد أقصى. وكلاهما يجب أن يكون رابطًا خارجيًا.

العنصر 1: هدف التحويل الأساسي
- الغرض: مسار مباشر إلى العرض الرئيسي (صفحة الحجز، أو نموذج التقديم، أو صفحة البيع)
- العنوان: من 3 إلى 5 كلمات، مرتكز على المنفعة

العنصر 2: بانِي القيمة الثانوي
- الغرض: بناء الثقة أو جمع العملاء المحتملين (الاشتراك في النشرة، أو مورد مجاني، أو معرض أعمال، أو دراسة حالة)
- العنوان: من 3 إلى 5 كلمات، مرتكز على المنفعة

بلا عناوين فرعية. بلا منشورات لينكدإن داخلية. بلا عناصر من نوع "راسلني".

## الخطوة 6. موجز التصميم البصري

أخرِج 4 موجّهات منفصلة لتوليد الصور، كل منها في كتلة برمجية خاصة به. يجب أن يكون كل موجّه قائمًا بذاته بالكامل وأن يعمل عند إلصاقه في Gemini كطلب مستقل. تبقى الموجّهات بالإنجليزية لأنها حمولات تقنية تُرسل إلى نموذج توليد الصور؛ وإذا كان النص المعروض داخل الصورة بالعربية، فأضف إلى الموجّه سطرًا يطلب عرضه من اليمين إلى اليسار بخط عربي نظيف مع وصل الحروف الصحيح.

اذكر ألوان العلامة التجارية في الأعلى:
- اللون الأساسي: [من المستخدم أو مقترح]
- اللون الثانوي: [من المستخدم أو مقترح]
- سطر واحد يوضح لماذا يناسبان التموضع

### الأصل 1: بانر لينكدإن (1584 × 396 بكسل)

يجب أن يتضمن الموجّه:
- عبارة "Using the attached photo of me..."
- إنشاء البانر بالأبعاد المحددة بالضبط
- وضع نص العنوان الوظيفي المختار في الوسط إلى اليمين
- وضع شعار من 5 إلى 8 كلمات أسفل العنوان
- تضمين عنصر زر لدعوة الإجراء (من 3 إلى 4 كلمات)
- تضمين نص الدليل الاجتماعي
- استخدام ألوان العلامة التجارية
- تحديد أسلوب الخلفية

### الأصل 2: الصورة الشخصية (400 × 400 بكسل)

يجب أن يتضمن الموجّه:
- عبارة "Using the attached headshot photo as the base..."
- تطبيق خلفية بلون العلامة التجارية (صلبة أو متدرجة)
- توسيط الوجه بنسبة 60 إلى 70% من الإطار
- أن يعمل عند قصّه دائريًا
- إضافة إطار بلون العلامة التجارية إن كان ذلك مناسبًا

### الأصل 3: بلاطة القسم المميز 1 (552 × 368 بكسل)

- نص عنوان العنصر المميز 1 كنقطة بؤرية
- ألوان علامة تجارية مطابقة للبانر
- إشارة بصرية بسيطة تدل على القابلية للنقر (أيقونة سهم)
- نظيفة وبسيطة، بلا عنوان فرعي أو نص متن
- لا حاجة إلى صورة

### الأصل 4: بلاطة القسم المميز 2 (552 × 368 بكسل)

- نص عنوان العنصر المميز 2 كنقطة بؤرية
- متمايزة بصريًا عن البلاطة 1 (بادِل بين استخدام اللونين الأساسي والثانوي)
- لا حاجة إلى صورة

بعد الموجّهات الأربعة كلها، قل:

> انسخ كل موجّه إلى محادثة Gemini جديدة واحدًا تلو الآخر. بالنسبة إلى البانر والصورة الشخصية، أرفق لقطة رأسك مع الموجّه. أما بلاطتا القسم المميز فلا تحتاجان إلى صورة.

## القواعد

- اقرأ دائمًا about-me.md إن وُجد واملأ المدخلات منه مسبقًا.
- كل نصوص الملف الشخصي (العنوان الوظيفي، ونبذة عني، والخبرات) يجب أن تُخرَج داخل كتل برمجية.
- اكتب جملًا كاملة. لا تفرض فواصل أسطر في منتصف الجملة. لينكدإن يتولى الالتفاف.
- بلا مسميات وظيفية في العناوين الوظيفية.
- بلا فقرات مكتلة في أي موضع.
- كل موجّه صورة يجب أن يكون قائمًا بذاته بالكامل.
- لا تستخدم الشرطة الطويلة (—) أبدًا.
- العربية الفصحى المعاصرة في كل المخرجات.
- لا تعرض كتابة منشور إطلاق أو استراتيجية تفاعل بعد موجز التصميم. انتهِ عند موجز التصميم.
