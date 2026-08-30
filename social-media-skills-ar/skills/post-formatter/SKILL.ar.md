---
name: post-formatter
description: >
  Turn a topic into a ready-to-publish LinkedIn post using PAS, AIDA, BAB, STAR, or SLAY frameworks. 200 to 250 words, 20 lines max, mobile-formatted with blank lines between sentences. Use this skill whenever the user says "format this as a post", "turn this into a LinkedIn post", "write it as PAS" or any named framework, or wants a properly structured post from a topic. Also trigger on the Arabic equivalents: "نسّق هذا كمنشور"، "حوّل هذا إلى منشور لينكدإن"، "اكتبه بصيغة PAS"، "منشور بإطار عمل". Different from post-writer: post-formatter applies a strict framework. post-writer drafts in the user's voice without framework constraints.
---

# منسّق المنشورات

## بالغ الأهمية: ابدأ تلقائيًا عند التحميل

عند تفعيل هذه المهارة، انتقل مباشرة إلى الخطوة 1. لا تلخّص. ابدأ جمع المدخلات فورًا.

## الخطوة 1. اجمع المدخلات

استدعِ AskUserQuestion:

```json
[
  {
    "question": "What topic do you want to post about?",
    "header": "Topic",
    "multiSelect": false,
    "options": [
      {"label": "I will type the topic", "description": "Single sentence describing the subject"},
      {"label": "Paste a context dump", "description": "Notes, stats, transcripts to turn into a post"}
    ]
  },
  {
    "question": "Which framework?",
    "header": "Framework",
    "multiSelect": false,
    "options": [
      {"label": "PAS", "description": "Problem, Agitation, Solution"},
      {"label": "AIDA", "description": "Attention, Interest, Desire, Action"},
      {"label": "BAB", "description": "Before, After, Bridge"},
      {"label": "STAR", "description": "Situation, Task, Action, Result"},
      {"label": "SLAY", "description": "Story, Lesson, Actionable advice, You"},
      {"label": "Pick for me", "description": "Recommend the best framework based on the topic"}
    ]
  }
]
```

ملاحظة: تبقى حمولة JSON أعلاه بالإنجليزية لأنها تُمرَّر إلى الأداة. عند مخاطبة مستخدم عربي، اطرح السؤالين بالعربية: "ما الموضوع الذي تريد النشر عنه؟" و"أي إطار عمل تريد؟" مع أسماء الأطر كما هي (فهي اختصارات اصطلاحية) وشرحها بالعربية:

- **PAS**: المشكلة، التأزيم، الحل
- **AIDA**: الانتباه، الاهتمام، الرغبة، الفعل
- **BAB**: قبل، بعد، الجسر
- **STAR**: الموقف، المهمة، الإجراء، النتيجة
- **SLAY**: القصة، الدرس، النصيحة القابلة للتنفيذ، أنت

اطرح سؤال متابعة واحدًا:

> هل هناك شيء آخر ينبغي أن أعرفه؟ حقائق، أو إحصاءات، أو ملاحظات عن النبرة، أو لمن هذا المنشور موجّه.

انتظر الرد.

## الخطوة 2. اكتب المنشور

طبّق هذه القواعد العامة على كل مخرجات:

- 20 سطرًا كحد أقصى، ومن 200 إلى 250 كلمة إجمالًا (نحو 1200 حرف)
- سطر فارغ بعد كل سطر
- معظم الأسطر: جملة واحدة، 55 حرفًا أو أقل
- يُسمح بحد أقصى 4 أسطر كفقرات مصغّرة (من جملتين إلى 3 جمل، 110 أحرف أو أقل)
- مفردات في مستوى الصف السادس. صفر ظروف، وصفر مصطلحات تقنية، وصفر حشو
- لا شرطات طويلة (—)
- لا أسئلة إلا إذا كانت المقدمة نفسها سؤالًا
- لا رموز تعبيرية عدا علامات الصح للقوائم المرقّمة (1. 2. 3.) ورمز إعادة التدوير في دعوة الإجراء
- قاعدة الثلاثة: استخدم ثلاثيتين كحد أقصى في المنشور الواحد
- نوّع بدايات الجمل. لا تُفرط في استخدام ضمير المتكلم

## الخطوة 3. البنية

- **السطر 1 (المقدمة)**: عريض. 50 حرفًا أو أقل.
- **السطر 2 (المفارقة / التباين)**: 50 حرفًا أو أقل. يعارض المقدمة أو يفاجئ القارئ.
- **الأسطر 3 إلى 18 (الصلب)**: إطار العمل المختار، موزّعًا على 3 إلى 5 أسطر لكل مرحلة. أي قائمة داخل مرحلة يجب أن تحتوي على ثلاثة عناصر بالضبط (1. 2. 3.). استخدم الأسهم لإظهار التسلسل حيثما كان مفيدًا.

خرائط أطر العمل:

- **PAS**: المشكلة ← التأزيم ← الحل
- **AIDA**: الانتباه ← الاهتمام ← الرغبة ← الفعل
- **BAB**: قبل ← بعد ← الجسر
- **STAR**: الموقف ← المهمة ← الإجراء ← النتيجة
- **SLAY**: القصة ← الدرس ← النصيحة القابلة للتنفيذ ← أنت

- **السطران 19 و20 (الخاتمة ودعوة الإجراء)**: من سطرين إلى 3 أسطر تثبّت الدرس. اختم بإحدى هذه العبارات متبوعة برمز إعادة التدوير: "أعد النشر إذا"، أو "أعد نشر هذا"، أو "إذا أفادك هذا، أعد نشره".

## الخطوة 4. المخرجات

أخرِج المنشور النهائي داخل كتلة برمجية. بلا مقدمات، وبلا ملاحظات ختامية.

## الخطوة 5. اعرض الخطوة التالية

بعد المنشور، اسأل:

> هل تريد رسمًا مصاحبًا (مهارة graphic-designer) أم تريدني أن أقيّمه مقابل سجل منشوراتك (مهارة post-scorer)؟

## القواعد

- أعد المنشور النهائي فقط. بلا تعليق وصفي.
- التزم بحدود طول السطر وعدد الكلمات وعدد الأسطر. عُدَّها فعليًا.
- لا تستخدم الشرطة الطويلة (—) أبدًا.
- العربية الفصحى المعاصرة ما لم يحدد ملف voice.md غير ذلك.
- إذا كان لدى المستخدم ملف voice.md في المشروع، فاضبط النبرة والإيقاع ليطابقاه.
- إذا استُخدمت ثلاثية، فيجب أن تحتوي على ثلاثة عناصر بالضبط. لا اثنين، ولا أربعة.
