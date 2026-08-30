---
name: youtube-thumbnail
description: >
  Generate a branded YouTube thumbnail from a video title. Uses a reference photo of the creator, high-CTR thumbnail principles, and brand colours to produce a ready-to-generate image prompt for Gemini. Use this skill whenever the user says "thumbnail", "youtube thumbnail", "build me a thumbnail", or wants a video cover image before writing the script. Also trigger on the Arabic equivalents: "صورة مصغرة"، "ثامبنيل"، "صورة غلاف فيديو"، "اصنع لي مصغّرة يوتيوب". The thumbnail-first workflow mirrors the graphic-first approach for LinkedIn: sells the video before anyone hears a word of the script.
---

# مصغّرة يوتيوب

## بالغ الأهمية: ابدأ تلقائيًا عند التحميل

عند تفعيل هذه المهارة، انتقل مباشرة إلى الخطوة 1.

## الخطوة 1. اجمع المدخلات

ابحث في المشروع عن إعدادات الصورة المرجعية. ابحث بهذا الترتيب:

1. `thumbnail-config.md` في جذر المشروع
2. `brand-kit.md` — ابحث عن مسار صورة مرجعية وألوان العلامة التجارية
3. `about-me.md` — لاسم صانع المحتوى وتموضعه

إذا كان مسار الصورة المرجعية مخزّنًا، فاملأه مسبقًا. وإلا فاسأل:

> ارفع أو زوّدني بمسار صورتك المرجعية التي تريد استخدامها في المصغّرة. يُفضَّل لقطة رأس واضحة بإضاءة وتعبير مميزين تنوي إعادة استخدامهما عبر الفيديوهات لتحقيق اتساق العلامة التجارية.

ثم استدعِ AskUserQuestion:

```json
[
  {
    "question": "What is the video title?",
    "header": "Title",
    "multiSelect": false,
    "options": [
      {"label": "I will type the title", "description": "Type the full working title"},
      {"label": "Suggest one", "description": "Given the topic, propose 3 click-worthy titles first"}
    ]
  },
  {
    "question": "Emotional tone?",
    "header": "Tone",
    "multiSelect": false,
    "options": [
      {"label": "Shock / surprise", "description": "Wide eyes, open mouth, bold reaction"},
      {"label": "Curious / thinking", "description": "Slight smirk, raised eyebrow, gaze off-frame"},
      {"label": "Confident / direct", "description": "Eye contact, calm, assertive"},
      {"label": "Frustrated / strong take", "description": "Intense gaze, hand gesture, tension"}
    ]
  }
]
```

ملاحظة: تبقى حمولة JSON أعلاه بالإنجليزية لأنها تُمرَّر إلى الأداة. عند مخاطبة مستخدم عربي، اطرح السؤالين بالعربية: "ما عنوان الفيديو؟" (سأكتب العنوان، أو اقترح لي 3 عناوين جاذبة للنقر) و"ما النبرة العاطفية؟" (صدمة أو مفاجأة، أو فضول وتأمل، أو ثقة ومباشرة، أو انزعاج ورأي حاد).

## الخطوة 2. طبّق أفضل ممارسات المصغّرات

يجب أن تتبع كل مصغّرة هذه القواعد:

- **الوجه يملأ من 30 إلى 50 بالمئة** من الإطار. مقروء بالأحجام الصغيرة.
- **من 3 إلى 5 كلمات كحد أقصى** من النص الكبير. 6 عند الضرورة القصوى.
- **لونان مهيمنان**. اللون الأساسي للعلامة + لون تمييز عالي التباين (الأصفر والأحمر والسماوي تعمل جيدًا).
- **عنصر بؤري واضح واحد** إلى جانب الوجه. شعار أداة، أو رقم بارز، أو سهم، أو غرض مادي.
- **تباين عالٍ** بين الوجه والنص والخلفية. اختبره بتضييق عينيك.
- **النص ليس جملة**. بل عبارة خطّافة. أمثلة: "طردت فريقي"، "Claude صار يستطيع...", "لا تفعل هذا".
- **لا نص صغير، ولا شعارات في أسفل اليمين** (تجلس هناك أيقونة مدة المشاهدة).

## الخطوة 3. ابنِ موجز المصغّرة

أخرِج موجزًا مختصرًا يمكن للمستخدم مراجعته:

```
موجز المصغّرة: [عنوان الفيديو]

التركيب: [موضع الوجه، نسبته من الإطار، اتجاه النظرة]
النص: "[العبارة الخطّافة، من 3 إلى 5 كلمات]"
موضع النص: [يسار، يمين، أعلى، يلتف حول الوجه]
لوحة الألوان: [اللون الأساسي]، [لون التمييز]، [لون الخلفية]
العنصر المساند: [شعار / غرض / سهم / رقم]
النبرة العاطفية: [النبرة من الخطوة 1]
```

ثم اسأل:

> هذا هو الموجز. قل "ولّد" لإخراج موجّه الصورة أو أخبرني بما أغيّره.

## الخطوة 4. أخرِج موجّه Gemini

بعد الموافقة، أخرِج موجّه توليد الصورة داخل كتلة برمجية. يبقى الموجّه بالإنجليزية لأنه حمولة تقنية تُرسل إلى نموذج توليد الصور؛ أما العبارة الخطّافة فتُدرج بلغتها كما اختارها المستخدم.

```
Using the attached reference photo of me, generate a YouTube thumbnail at 1280 x 720 pixels (16:9).

Composition:
- Place me [left / right / centre] filling [30-50]% of the frame
- My expression: [tone details — e.g., shocked with wide eyes and open mouth]
- My gaze: [direction — e.g., looking directly at camera / looking off-frame toward the text]

Text:
- Display "[hook phrase]" in large bold sans-serif typography
- Text colour: [hex]
- Text outline: [colour, thickness for readability]
- Text placement: [specific area]

Colour palette:
- Primary: [hex]
- Accent: [hex]
- Background: [hex] — [describe treatment: flat, gradient, blurred scene, etc.]

Supporting element: [specific description of the supporting visual]

Constraints:
- Face must be clear and sharp
- Text must be readable at 320px wide (YouTube mobile size)
- No watermarks, no YouTube UI elements, no bottom-right corner text
- High contrast between face, text, and background
```

إذا كانت العبارة الخطّافة بالعربية، أضف هذا السطر إلى الموجّه:

```
The thumbnail text is in Arabic. Render it right-to-left with correct letter joining, using a heavy Arabic display typeface with a contrasting outline for readability at small sizes.
```

أخبر المستخدم:

> ألصق هذا في محادثة Gemini جديدة، وأرفق صورتك المرجعية، وفعّل Create Image، واختر Nano Banana. ولّد بمقاس 1280x720.

## الخطوة 5. اعرض الخطوة التالية

> هل تريدني أن أضع مخطط الفيديو تاليًا؟ المقدمة، والوسط، ودعوة الإجراء انطلاقًا من المصغّرة. أو استدعِ مهارة الإنشاء إن كانت لديك.

## القواعد

- 1280x720 بكسل (16:9). المقاس الأصلي لمصغّرات يوتيوب.
- لا تضمّن مسار الصورة المرجعية داخل الموجّه نفسه أبدًا، فالمستخدم يرفق الصورة بشكل منفصل.
- لا تسمح أبدًا بأكثر من 6 كلمات نصية، و5 هو المثالي، و3 هو الأفضل.
- يجب أن يبقى الوجه نقطة بؤرية ظاهرة دائمًا. لا تركيبات يختفي فيها الوجه.
- لا تستخدم الشرطة الطويلة (—) أبدًا.
- العربية الفصحى المعاصرة ما لم يحدد ملف voice.md غير ذلك.
- إذا كان ملف brand-kit.md موجودًا في المشروع، فاقرأه واستخدم ألوان العلامة التجارية بالضبط.
- انصح المستخدم بالحفاظ على أسلوب مصغّرات متسق عبر الفيديوهات لترسيخ التعرف على القناة.
