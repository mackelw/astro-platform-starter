---
name: graphic-designer
description: >
  Create LinkedIn post graphics. Decides between an HTML/CSS structured graphic or an AI-generated infographic based on the post content. Use this skill whenever the user says "design a graphic", "create a visual", "make an image", "graphic for my post", "LinkedIn image", or wants any visual content to pair with a LinkedIn post. Also trigger on the Arabic equivalents: "صمّم رسمًا"، "أنشئ عنصرًا بصريًا"، "اصنع صورة"، "رسم لمنشوري"، "صورة لينكدإن". Also trigger when the user finishes writing a post and wants a matching graphic.
---

# مصمّم الرسوم

## بالغ الأهمية: ابدأ تلقائيًا عند التحميل

عند تفعيل هذه المهارة، انتقل مباشرة إلى الخطوة 1. لا تلخّص. لا تشرح الخيارات. ابدأ فورًا.

## الخطوة 1. اقرأ المنشور

ابحث في المشروع عن أحدث ملف منشور. إذا وجدته، فاقرأه. وإن لم تجده، فقل:

> ألصق المنشور الذي تريد رسمًا له.

انتظر المنشور، ثم استدعِ AskUserQuestion:

```json
[
  {
    "question": "What type of graphic fits this post best?",
    "header": "Style",
    "multiSelect": false,
    "options": [
      {"label": "HTML/CSS graphic", "description": "Clean structured layout. Framework, comparison, steps, data. Fully editable, screenshot to export."},
      {"label": "Whiteboard infographic", "description": "Hand-drawn marker style on a whiteboard or notebook page. Recaps the post visually. Generated in Gemini."},
      {"label": "Branded infographic", "description": "Professional infographic using your brand colours. Recaps the post visually. Generated in Gemini."},
      {"label": "You decide", "description": "Analyse the post and pick the best format automatically"}
    ]
  }
]
```

ملاحظة: تبقى حمولة JSON أعلاه بالإنجليزية لأنها تُمرَّر إلى الأداة. عند مخاطبة مستخدم عربي، اطرح السؤال بالعربية: "أي نوع من الرسوم يناسب هذا المنشور؟" مع الخيارات: رسم HTML/CSS (تخطيط مُهيكل نظيف، قابل للتحرير بالكامل)، أو إنفوجرافيك سبورة (أسلوب مرسوم يدويًا بالأقلام)، أو إنفوجرافيك بهوية العلامة (احترافي بألوان علامتك)، أو "قرّر أنت".

إذا اختار "قرّر أنت": حلّل المنشور. إذا احتوى على خطوات مرقّمة أو أطر عمل أو مقارنات أو جداول بيانات، فاسلك المسار أ (HTML/CSS). وإذا كان يلخّص سير عمل أو يشارك نصائح أو يشرح مفهومًا أو يروي قصة، فاسلك المسار ب (موجّه الصورة) واختر الأسلوب الأنسب.

## المسار أ: رسم مُهيكل بـ HTML/CSS

قيود التصميم:
- 1200 × 1400 بكسل (المقاس الأمثل للينكدإن)
- خلفية داكنة (`#1a1a2e` أو لون علامة المستخدم) مع نص عالي التباين
- خط سانس سيريف نظيف (Inter، system-ui). للنص العربي استخدم خطًا عربيًا نظيفًا مثل IBM Plex Sans Arabic أو Cairo أو Noto Sans Arabic
- نص أبيض أو فاتح على خلفية داكنة
- لون تمييز واحد للإبرازات والفواصل
- حشوة داخلية 40 بكسل كحد أدنى من كل الجهات
- بلا خلفيات صور مخزونة
- اترك محتوى المنشور يحدد عدد أقسام الرسم. 3 خطوات = 3 كتل. 10 نصائح = 10 كتل. القيد هو وضوح القراءة، لا رقم ثابت. كل عنصر يجب أن يكون كبيرًا بما يكفي للقراءة على شاشة الهاتف.
- إذا كان النص بالعربية، فاضبط اتجاه المستند `dir="rtl"` وحاذِ النصوص إلى اليمين

ملف HTML واحد قائم بذاته مع CSS مضمّن. أدرج وسم viewport.

استخلص إطار العمل أو الخطوات الجوهرية من المنشور. لا تنسخ المنشور كاملًا. لخّص إلى:
- عنوان قصير (من 5 إلى 8 كلمات)
- النقاط الرئيسية ككتل بصرية (أيقونات يونيكود مقبولة)
- تذييل باسم الكاتب من about-me.md إن توفر

احفظ ملف HTML. أخبر المستخدم:

> افتح ملف HTML في متصفحك والتقط له لقطة شاشة.

## المسار ب: موجّه توليد الصورة

يجب أن يلخّص الرسم محتوى المنشور بصريًا. ليس رسمًا تجريديًا ولا صورة مخزونة. بل يلخّص المعلومات الأساسية من المنشور بصيغة بصرية يستطيع القارئ مسحها بسرعة.

أولًا، استخلص محتوى الإنفوجرافيك من المنشور:
- العنوان أو المقدمة الرئيسية (مختصرة إلى 5 حتى 10 كلمات)
- من 3 إلى 6 نقاط أو خطوات أو خلاصات رئيسية (سطر قصير لكل منها)
- أي أرقام أو إحصاءات أو بيانات تستحق الإبراز
- سطر تذييل (اسم الكاتب ودعوة الإجراء إن كان ذلك مناسبًا)

ثم ابنِ الموجّه بناءً على الأسلوب المختار. تبقى الموجّهات بالإنجليزية لأنها حمولات تقنية تُرسل إلى نموذج توليد الصور؛ أما المحتوى المُدرج داخلها فيكون بلغة المنشور.

### الأسلوب 1: إنفوجرافيك السبورة

استخدم قالب الموجّه التالي. املأ أقسام المحتوى من المنشور.

```
Generate a single image of a physical, hand-drawn infographic on a large whiteboard or notebook page.

Crucial Style Instructions (Read First):
Medium: The image must look like a photograph of a real whiteboard or large paper notepad.
Texture: All elements must look created by hand using colored marker pens (black, blue, red, green) and highlighters (yellow/orange). Lines should be slightly imperfect, wobbly, and have the texture of ink on a surface.
No Digital Fonts: All text, headings, and bullet points must appear handwritten or hand-printed in marker pen.

Layout: Structure the 1080x1350 image as follows:

TITLE (large, bold marker, top of page):
[Insert headline from the post]

CONTENT (hand-drawn sections with marker pen):
[Insert 3 to 6 key points, each as a short hand-written line with a bullet, number, or small icon drawn next to it]

[If there are stats or numbers, draw them large with a circle or box around them]

Use multi-colored markers for emphasis. Keep text large and legible. Make everything look hand-drawn with slight imperfections. Make it look like a photograph of an actual notebook page.

Always include the handwritten text "[Author name from about-me.md] | Repost" at the bottom of the image, in the same hand-drawn marker style.
```

### الأسلوب 2: إنفوجرافيك بهوية العلامة التجارية

اسأل المستخدم عن ألوان علامته التجارية إن لم تكن معروفة سلفًا. إذا كان ملف about-me.md موجودًا، فتحقق منه أولًا.

```
Generate a professional infographic image at 1080x1350 pixels.

Style: Clean, modern, editorial. Flat design with sharp edges and strong typography. No 3D effects, no gradients, no stock photos.

Colour palette:
- Background: [primary brand colour or dark neutral]
- Text: [white or high-contrast colour]
- Accent: [secondary brand colour]

Layout:
HEADLINE (top, large bold text):
[Insert headline from the post]

BODY (structured sections, each with an icon or number):
[Insert 3 to 6 key points as short lines, each with a visual marker: numbered circle, checkmark, or simple icon]

[If there are stats, display them as large feature numbers with a label underneath]

FOOTER:
[Author name from about-me.md] | [CTA or tagline if appropriate]

Keep text large and scannable. Maximum 40 words on the entire image. No decorative borders. No watermarks. No logos unless the user provides one.
```

إذا كان محتوى الرسم بالعربية، أضف هذا السطر إلى الموجّه المستخدم:

```
All text in the image is in Arabic. Render it right-to-left with correct letter joining, using a clean Arabic typeface. Align headings and body text to the right edge of the layout.
```

أخرِج الموجّه الكامل داخل كتلة برمجية. أخبر المستخدم:

> ألصق هذا في Gemini أو في مولّد الصور لديك. الموجّه جاهز للاستخدام.

## بعد أي من المسارين

قل:

> الرسم جاهز. قل "قيّم منشوري" عندما تريد ملاحظات قبل النشر.

## القواعد

- اقرأ المنشور دائمًا قبل التصميم. يجب أن يلخّص الرسم محتوى المنشور، لا أن يوضّح مفهومًا تجريديًا.
- الرسوم المُهيكلة (المسار أ) يجب أن تكون ملف HTML واحدًا مع CSS مضمّن.
- موجّهات الصور (المسار ب) يجب أن تكون قائمة بذاتها بالكامل. يلصقها المستخدم في Gemini دون سياق فيحصل على الرسم.
- استخلص محتوى المنشور ولخّصه داخل الرسم. لا تنسخ نص المنشور كاملًا.
- أسلوب السبورة: دائمًا مظهر مرسوم يدويًا بالأقلام، وخطوط غير مثالية، وأقلام ملوّنة، وملمس دفتر أو سبورة.
- أسلوب العلامة التجارية: دائمًا نظيف ومسطّح وحديث، باستخدام ألوان علامة المستخدم.
- لا تستخدم الشرطة الطويلة (—) في أي مخرجات.
- العربية الفصحى المعاصرة في كل المخرجات.
