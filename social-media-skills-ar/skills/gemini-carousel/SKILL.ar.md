---
name: gemini-carousel
description: >
  Generate a branded slide-by-slide LinkedIn carousel using Gemini. Takes source content, builds a design brief, waits for approval, then outputs per-slide image generation prompts. 1080x1350 vertical format. Use this skill whenever the user says "carousel", "build a carousel", "turn this into a carousel", "gemini carousel", or wants multi-slide LinkedIn content. Also trigger on the Arabic equivalents: "كاروسيل"، "ابنِ لي كاروسيل"، "حوّل هذا إلى شرائح"، "منشور متعدد الشرائح". Always includes an approval gate between brief and image generation.
---

# كاروسيل Gemini

## بالغ الأهمية: ابدأ تلقائيًا عند التحميل

عند تفعيل هذه المهارة، انتقل مباشرة إلى الخطوة 1. لا تلخّص.

## الخطوة 1. اجمع المدخلات

اسأل:

> ألصق المحتوى الذي تريده في الكاروسيل. يصلح منشور، أو مقطع من نشرة بريدية، أو ملاحظات بحثية، أو إطار عمل.

انتظر وصول المحتوى، ثم استدعِ AskUserQuestion:

```json
[
  {
    "question": "Brand style?",
    "header": "Style",
    "multiSelect": false,
    "options": [
      {"label": "Pull from brand-kit.md", "description": "Use the colours and typography in my project brand file"},
      {"label": "I will type brand colours", "description": "I will paste hex codes and font preferences"},
      {"label": "Suggest for me", "description": "Pick a palette and typography based on the content"}
    ]
  },
  {
    "question": "Number of slides?",
    "header": "Slides",
    "multiSelect": false,
    "options": [
      {"label": "6 slides", "description": "Concise, fast read"},
      {"label": "8 slides", "description": "Standard carousel length"},
      {"label": "10 slides", "description": "Deep-dive carousel"}
    ]
  }
]
```

ملاحظة: تبقى حمولة JSON أعلاه بالإنجليزية لأنها تُمرَّر إلى الأداة. عند مخاطبة مستخدم عربي، اطرح السؤالين بالعربية: "ما أسلوب علامتك التجارية؟" (استخرجه من brand-kit.md، أو سأكتب الألوان بنفسي، أو اقترح لي) و"كم عدد الشرائح؟" (6 شرائح: مختصر وسريع القراءة، أو 8 شرائح: الطول المعياري، أو 10 شرائح: تغطية معمّقة).

## الخطوة 2. ابنِ موجز التصميم

حلّل المحتوى وأنتج موجزًا شريحة بشريحة يتضمن:

- **الشريحة 1 (الغلاف)**: المقدمة الجذابة، نص كبير عريض، الاتجاه البصري
- **الشرائح 2 إلى N-1 (المتن)**: فكرة واحدة لكل شريحة، 15 كلمة كحد أقصى لكل شريحة، مقترح بصري
- **الشريحة N (دعوة الإجراء)**: طلب إعادة النشر، الاسم، الرابط أو العرض

لكل شريحة، أدرج:

- رقم الشريحة
- العنوان (8 كلمات كحد أقصى)
- نص المتن (15 كلمة كحد أقصى)
- مقترح بصري (أيقونة، كتلة لونية، رسم توضيحي، مخطط)

أخبر المستخدم:

> هذا هو موجز التصميم. أخبرني بما تريد تغييره، أو قل "ولّد" عندما يعجبك.

انتظر الموافقة. لا تتابع حتى يوافق المستخدم صراحةً.

## الخطوة 3. أخرِج موجّهات الشرائح

بعد الموافقة، أخرِج موجّه توليد صور واحدًا لكل شريحة، كل منها في كتلة برمجية خاصة به ومرقّم بوضوح.

يبقى نص الموجّه بالإنجليزية لأنه حمولة تقنية تُرسل إلى نموذج توليد الصور؛ أما نصوص العناوين والمتن التي تُدرج فيه فتكون بلغة المحتوى الذي اختاره المستخدم.

كل موجّه يتبع هذه البنية:

```
Act as an expert graphic designer. Create a LinkedIn carousel slide at 1080x1350 pixels (4:5 aspect ratio).

Brand style:
- Primary colour: [HEX]
- Secondary colour: [HEX]
- Accent colour: [HEX]
- Typography: [bold industrial headline font, clean geometric body font]
- Aesthetic: modern, authoritative, high contrast

Slide [N of M]: [slide purpose]

Content:
- Headline: "[headline text]"
- Body: "[body text]"
- Visual element: [specific visual suggestion]

Layout instructions:
- [Headline placement and size]
- [Body placement and size]
- [Visual placement]
- [Background treatment]

Constraints:
- Vertical 4:5 aspect ratio at exactly 1080x1350 pixels
- No watermarks, no logos unless specified above
- Maintain visual consistency with the other slides in the set
```

إذا كان محتوى الشرائح بالعربية، أضف هذا السطر إلى كل موجّه:

```
All slide text is in Arabic. Render it right-to-left with correct letter joining, using a clean Arabic typeface. Align headlines and body text to the right edge of the layout.
```

أخبر المستخدم:

> ألصق كل موجّه في محادثة Gemini جديدة مع تفعيل Create Image واختيار Nano Banana. ولّد الشرائح واحدة تلو الأخرى لأقصى قدر من التحكم في الاتساق.

## الخطوة 4. اعرض البديل بلقطة واحدة

بعد موجّهات الشرائح، اعرض:

> هل تريد موجّهًا واحدًا مدمجًا يولّد الكاروسيل كاملًا دفعة واحدة؟ أسرع لكن باتساق بصري أقل. قل "ادمج" وسأعيد الكتابة.

## القواعد

- اشترط دائمًا موافقة المستخدم على الموجز قبل إخراج موجّهات الصور.
- 1080x1350 بكسل لكل شريحة. لا نسبة أبعاد أخرى.
- 15 كلمة كحد أقصى لنص المتن في الشريحة الواحدة. القابلية للقراءة تخسر في الخلاصة.
- أبقِ أسلوب العلامة التجارية متطابقًا في كل موجّهات الشرائح كي تبدو المجموعة كاروسيلًا واحدًا.
- يجب أن تكون شريحة الغلاف (1) وشريحة دعوة الإجراء (الأخيرة) متمايزتين بصريًا عن شرائح المتن.
- لا تستخدم الشرطة الطويلة (—) أبدًا.
- العربية الفصحى المعاصرة ما لم يحدد ملف voice.md غير ذلك.
- إذا كان ملف brand-kit.md موجودًا في المشروع، فاقرأه واستخدم أكواد الألوان الست عشرية وخيارات الخطوط الواردة فيه بالضبط.
