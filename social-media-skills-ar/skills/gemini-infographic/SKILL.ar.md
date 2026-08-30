---
name: gemini-infographic
description: >
  Generate the hand-drawn whiteboard infographic prompt that pulled 480k impressions across 3 posts. Takes source content (a post, newsletter, blog, research note) and returns a complete Gemini image generation prompt with a structured brief. Use this skill whenever the user says "whiteboard infographic", "gemini infographic", "hand-drawn graphic", "turn this into a whiteboard", or wants an AI-generated infographic for a post. Also trigger on the Arabic equivalents: "إنفوجرافيك سبورة"، "إنفوجرافيك مرسوم يدويًا"، "حوّل هذا إلى سبورة"، "إنفوجرافيك جيميناي"، "رسم توضيحي بخط اليد".
---

# إنفوجرافيك السبورة عبر Gemini

## بالغ الأهمية: ابدأ تلقائيًا عند التحميل

عند تفعيل هذه المهارة، انتقل مباشرة إلى الخطوة 1. لا تلخّص العملية.

## الخطوة 1. احصل على المحتوى المصدر

اسأل:

> ألصق المحتوى الذي تريد تحويله إلى إنفوجرافيك. يصلح أي من التالي: منشور، أو مقطع من نشرة بريدية، أو مدونة، أو ملاحظة بحثية، أو نقاط خام.

انتظر وصول المحتوى.

## الخطوة 2. ابنِ الموجز

حلّل المحتوى وأنتج موجزًا للإنفوجرافيك بلغة واضحة. يتضمن:

- **العنوان** (6 كلمات أو أقل، قوي ومباشر)
- **العنوان الفرعي** (اختياري، سطر واحد للسياق)
- **البنية الأساسية**: اختر بين خطوات، أو إطار عمل، أو مقارنة، أو إحصاءات، أو قائمة
- **النقاط الرئيسية**: من 3 إلى 7 نقاط كحد أقصى، كل نقطة 10 كلمات أو أقل
- **مقترحات بصرية**: أسهم، ومربعات، وأرقام مميزة، وأيقونات، ولمسات لونية. كن محددًا في الموضع واللون.
- **دعوة الإجراء في التذييل**: نص بخط اليد يقول "Follow [Name] [Tagline] for more helpful content | Repost ♻️"

أخبر المستخدم:

> هذا هو الموجز. أخبرني بما تريد تغييره، أو قل "ولّد" عندما يعجبك.

انتظر الموافقة.

## الخطوة 3. أخرِج موجّه Gemini

بعد الموافقة، أخرِج الموجّه الكامل داخل كتلة برمجية، مع إدراج الموجز في مكان العنصر النائب `[INSERT YOUR INFOGRAPHIC CONTENT AND LAYOUT HERE]`.

ملاحظة: يبقى نص الموجّه بالإنجليزية لأنه حمولة تقنية تُرسل إلى نموذج توليد الصور، وترجمتها تُضعف جودة الناتج. أما المحتوى الذي تُدرجه في العنصر النائب فيمكن أن يكون بالعربية إذا أراد المستخدم نصًا عربيًا داخل الصورة.

```
Generate a single image of a physical, hand-drawn infographic on a large whiteboard or notebook page.

Crucial Style Instructions (Read First):

Medium: The image must look like a photograph of a real whiteboard or large paper notepad.

Texture: All elements must look created by hand using colored marker pens (black, blue, red, green) and highlighters (yellow/orange). Lines should be slightly imperfect, wobbly, and have the texture of ink on a surface.

No Digital Fonts: All text, headings, and bullet points must appear handwritten or hand-printed in marker pen.

Layout: Structure the 1080x1350 image as follows:

[INSERT THE BRIEF HERE — title, subtitle, core structure, key points, visual suggestions]

Use multi-colored markers for emphasis. Keep text large and legible. Make everything look hand-drawn with slight imperfections. Make it look like a photograph of an actual notebook page.

Always include the handwritten text "Follow [Name] [Tagline] for more helpful content | Repost ♻️" at the bottom of the image, in the same hand-drawn marker style.
```

أخبر المستخدم:

> ألصق هذا في محادثة Gemini جديدة مع تفعيل خيار Create Image واختيار Nano Banana. ولّد الصورة بمقاس 1080x1350.

## الخطوة 4. اعرض التعديل التكراري

بعد الموجّه، اعرض:

> إذا لم يوفّق التوليد الأول، أخبرني بما أعدّله وسأعيد كتابة الموجّه. الإصلاحات الشائعة: ألوان أقل، عنوان أكبر، اتجاه تخطيط مختلف.

## القواعد

- مقاس المخرجات 1080x1350 بكسل غير قابل للتفاوض. الصيغة العمودية تسيطر على خلاصة لينكدإن.
- دعوة الإجراء في التذييل تتضمن دائمًا رمز إعادة التدوير وكلمة "Repost".
- لا تستخدم الشرطة الطويلة (—) في أي مخرجات.
- أبقِ النقاط دون 10 كلمات. النص الأطول يفقد وضوحه على مقياس السبورة.
- انتظر دائمًا موافقة المستخدم على الموجز قبل إخراج الموجّه النهائي.
- العربية الفصحى المعاصرة ما لم يحدد ملف voice.md غير ذلك.
- إذا كان لدى المستخدم ملف brand-kit.md أو colours.md في المشروع، فأدرج ألوان علامته التجارية ضمن المقترحات البصرية.
