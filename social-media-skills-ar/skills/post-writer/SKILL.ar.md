---
name: post-writer
description: >
  Write LinkedIn posts that match the user's voice system (about-me.md and voice.md). Use this skill whenever the user says "write a post", "draft a post", "LinkedIn post", "post about [topic]", "content idea", or wants help writing any LinkedIn content. Also trigger on the Arabic equivalents: "اكتب منشورًا"، "سوّد لي منشورًا"، "منشور لينكدإن"، "انشر عن [موضوع]"، "فكرة محتوى". Also trigger when the user pastes a context dump (notes, transcripts, bullet points) and wants it turned into a post. Always references the voice files in the project before writing. Always outputs the final post in a code block.
---

# كاتب المنشورات

## بالغ الأهمية: ابدأ تلقائيًا عند التحميل

في اللحظة التي تُفعَّل فيها هذه المهارة، انتقل مباشرة إلى الخطوة 1. لا تلخّص المهارة. لا تشرح ما تفعله. لا تسرد الملفات التي تشير إليها. انتقل إلى جمع المدخلات فورًا.

## الخطوة 1. اجمع المدخلات

ابحث في المشروع عن ملفي about-me.md وvoice.md. اقرأ كليهما. إذا كان أحدهما مفقودًا، فأخبر المستخدم بتشغيل مهارة Voice Builder أولًا (بقول "ابنِ صوتي")، ثم توقف.

إذا كان الملفان موجودين، فاستدعِ AskUserQuestion بهذه الحمولة بالضبط:

```json
[
  {
    "question": "What topic do you want to post about?",
    "header": "Topic",
    "multiSelect": false,
    "options": [
      {"label": "Paste a context dump", "description": "I have notes, transcripts, or raw ideas to turn into a post"},
      {"label": "I have a topic in mind", "description": "I will type the topic after this"},
      {"label": "Suggest topics for me", "description": "Based on my voice system, suggest 5 topics I should post about"}
    ]
  },
  {
    "question": "Do you have any reference posts you want me to use as structural inspiration?",
    "header": "References",
    "multiSelect": false,
    "options": [
      {"label": "No references", "description": "Write from scratch using my voice files only"},
      {"label": "I will paste examples", "description": "I have posts from other creators I want you to study first"},
      {"label": "Use my training posts", "description": "Reference the posts I used in the Voice Builder"}
    ]
  }
]
```

ملاحظة: تبقى حمولة JSON أعلاه بالإنجليزية لأنها تُمرَّر إلى الأداة. عند مخاطبة مستخدم عربي، اطرح السؤالين بالعربية: "ما الموضوع الذي تريد النشر عنه؟" (ألصق سياقًا خامًا، أو لديّ موضوع محدد، أو اقترح لي موضوعات) و"هل لديك منشورات مرجعية تريدني أن أستلهم بنيتها؟" (بلا مراجع، أو سألصق أمثلة، أو استخدم منشورات التدريب).

بناءً على الإجابات:
- "ألصق سياقًا خامًا": انتظر إلصاق المستخدم، واستخلص الفكرة الجوهرية، ثم انتقل إلى الخطوة 2
- "لديّ موضوع محدد": انتظر كتابة المستخدم له، ثم انتقل إلى الخطوة 2
- "اقترح لي موضوعات": اقرأ محاور الموضوعات في about-me.md وvoice.md، واقترح 5 موضوعات محددة مع زاوية من سطر واحد لكل منها، ثم استخدم AskUserQuestion ليختار المستخدم واحدًا
- "سألصق أمثلة": انتظر المنشورات المرجعية، ودوّن الأنماط البنيوية، ثم تابع
- "استخدم منشورات التدريب": استند إلى المنشورات الموجودة أصلًا في المشروع

## الخطوة 2. ابحث وخطّط

قبل الكتابة، ابحث في الموضوع. ابحث عن:
- بيانات أو إحصاءات تدعم الزاوية
- آراء معاكِسة للسائد أو حقائق مفاجئة
- أمثلة واقعية أو دراسات حالة
- مفاهيم خاطئة شائعة يمكن تحديها

ثم اعرض خطة المنشور. استدعِ AskUserQuestion:

```json
[
  {
    "question": "Which angle works best for this post?",
    "header": "Angle",
    "multiSelect": false,
    "options": [
      {"label": "[Angle 1 name]", "description": "[One sentence describing the angle and hook]"},
      {"label": "[Angle 2 name]", "description": "[One sentence describing the angle and hook]"},
      {"label": "[Angle 3 name]", "description": "[One sentence describing the angle and hook]"}
    ]
  },
  {
    "question": "Which framework do you want?",
    "header": "Framework",
    "multiSelect": false,
    "options": [
      {"label": "PAS", "description": "Problem, Agitate, Solution"},
      {"label": "How-to list", "description": "Numbered steps or tips"},
      {"label": "Story to lesson", "description": "Personal story with a takeaway"},
      {"label": "Contrarian take", "description": "Challenge a common belief"}
    ]
  }
]
```

املأ خيارات الزوايا الفعلية بناءً على بحث الموضوع. لا تستخدم نصًا نائبًا في أوصاف الزوايا. أطر العمل بالعربية: PAS (المشكلة، التأزيم، الحل)، وقائمة إرشادية (خطوات أو نصائح مرقّمة)، ومن قصة إلى درس (قصة شخصية بخلاصة)، ورأي معاكِس للسائد (تحدّي اعتقاد شائع).

## الخطوة 3. اكتب المسوّدة

اكتب المنشور متبعًا هذه القواعد:
- اقرأ voice.md لمعرفة النبرة، والإيقاع، وأسلوب المقدمة، وأسلوب دعوة الإجراء، وقسم أنماط الغياب (ما الذي لا يفعله هذا الصوت أبدًا)
- اقرأ about-me.md لمعرفة الجمهور وسياق الموضوعات
- طابِق طول الجمل وإيقاع الفقرات المحددين في voice.md
- تجنّب كل كلمة وبنية ونمط محظور مذكور في قسم الغياب في voice.md
- استخدم نمط المقدمة الذي يناسب الزاوية المختارة
- اختم بأسلوب دعوة الإجراء المحدد في voice.md

أخرِج المنشور داخل كتلة برمجية عادية:

```
[المنشور الكامل هنا بكل فواصل الأسطر والتنسيق تمامًا كما ينبغي أن يظهر على لينكدإن]
```

بعد الكتلة البرمجية، أضف من جملتين إلى 3 جمل توضح سبب اختيارك لهذه المقدمة وهذه البنية، مع الإشارة إلى أنماط محددة من voice.md.

## الخطوة 4. كرّر التحسين

اسأل المستخدم:

> ما رأيك في هذا؟ أخبرني بما تريد تغييره، أو قل "اعتمده" وسأحفظ النسخة النهائية.

إذا أعطى المستخدم ملاحظات، فراجع وأخرِج كتلة برمجية جديدة. 3 جولات مراجعة كحد أقصى.

إذا قال المستخدم "اعتمده" أو ما يعادلها، فاحفظ المنشور النهائي كملف ماركداون في المشروع.

ثم قل:

> حُفِظ المنشور. قل "صمّم رسمًا" لإنشاء عنصر بصري، أو "قيّم منشوري" للحصول على ملاحظات قبل النشر.

## القواعد

- اقرأ دائمًا about-me.md وvoice.md قبل الكتابة.
- أخرِج المنشورات دائمًا داخل كتلة برمجية عادية.
- لا تستخدم الشرطة الطويلة (—) في أي منشور.
- العربية الفصحى المعاصرة ما لم يحدد ملف voice.md غير ذلك.
- لا تضف وسومًا (هاشتاجات) ما لم يستخدمها voice.md صراحةً.
- لا تضف دعوات إجراء طُعمية لاستجرار التفاعل ما لم ترد في voice.md.
- أبقِ المنشورات بين 150 و300 كلمة ما لم يطلب المستخدم غير ذلك.
- خطّط قبل الكتابة. لا تتخطَّ الخطوة 2 أبدًا.
