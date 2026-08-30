---
name: reels-scripting
description: >
  Turn a reference Instagram Reel into a script for your own Reel, tuned to your voice and repurposed from your newsletter content. Takes a Reel URL or Notion reference link, uses Apify to scrape the video, sends it to Gemini 2.5 Flash for full transcript + hook + structure analysis, then writes a new script applying the same patterns to your newsletter topic. Use this skill whenever the user says "script a reel", "reels scripting", "turn this into a reel", pastes an Instagram Reel URL, or references their Notion outlier reels database. Also trigger on the Arabic equivalents: "اكتب سكربت ريلز"، "حوّل هذا إلى ريل"، "سيناريو ريل انستغرام". Requires APIFY_API_TOKEN and GOOGLE_AI_API_KEY environment variables.
---

# كتابة سكربتات الريلز

## بالغ الأهمية: ابدأ تلقائيًا عند التحميل

عند تفعيل هذه المهارة، انتقل مباشرة إلى الخطوة 1. لا تلخّص.

## المتطلبات المسبقة

تحتاج هذه المهارة إلى:

- متغير البيئة `APIFY_API_TOKEN` (لسحب محتوى انستغرام)
- متغير البيئة `GOOGLE_AI_API_KEY` (لتحليل الفيديو عبر Gemini 2.5 Flash)
- Node.js 18 فأحدث وحزمتَي `apify-client` و`@google/generative-ai`

إذا كان أحد متغيري البيئة مفقودًا، فأخبر المستخدم بتشغيل:

```
! export APIFY_API_TOKEN=your_token
! export GOOGLE_AI_API_KEY=your_key
```

ثم توقف حتى يُضبط كلاهما.

## الخطوة 1. احصل على المرجع

اسأل:

> ألصق رابط الريل المرجعي أو رابط Notion. هذا هو الريل الاستثنائي الذي تريد استخلاص صيغته بالهندسة العكسية.

انتظر الرابط.

إذا ألصق المستخدم رابط Notion، فاتبعه عبر WebFetch، وحدّد رابط ريل انستغرام في الصفحة، واستخرجه. إذا لم يُعثر على رابط ريل في صفحة Notion، فاطلب من المستخدم إلصاق رابط الريل مباشرة.

## الخطوة 2. احصل على موضوع النشرة البريدية

اسأل:

> ما الموضوع من نشرتك البريدية الذي تريد إعادة توظيفه في هذا الريل؟ ألصق القسم ذا الصلة من النشرة، أو اكتب الفكرة الجوهرية في جملة.

انتظر الموضوع. اقرأ newsletter-voice.md وvoice.md وabout-me.md من المشروع إن وُجدت، كي يطابق السكربت صوت المستخدم.

## الخطوة 3. اسحب الريل ونزّله

أنشئ المجلد `~/Desktop/Reels/` إن لم يكن موجودًا. اكتب سكربت Node.js في `~/Desktop/Reels/analyse-reel.js` يقوم بما يلي:

1. يستخدم `apify-client` لاستدعاء `apify/instagram-reel-scraper` بالمدخلات `{ directUrls: [reelUrl], resultsLimit: 1 }`. إذا لم يُعد أي عناصر، فارجع إلى `{ urls: [reelUrl], resultsLimit: 1 }`، ثم إلى `apify/instagram-scraper` بالمدخلات `{ directUrls: [reelUrl], resultsType: 'posts', resultsLimit: 1 }`.
2. يستخرج `videoUrl` من العنصر المُعاد.
3. ينزّل الفيديو إلى `~/Desktop/Reels/downloads/{username}_{shortCode}.mp4`.
4. يحفظ بيانات السحب الخام في `~/Desktop/Reels/reel_data_{shortCode}.json`.

شغّل السكربت. تحقق من حجم الملف والبيانات الوصفية (المشاهدات، والإعجابات، والتعليقات، وأول 200 حرف من التعليق التوضيحي) قبل المتابعة.

## الخطوة 4. حلّل باستخدام Gemini 2.5 Flash

وسّع سكربت Node (أو شغّل تمريرة ثانية) بحيث:

1. يقرأ ملف `.mp4` المنزَّل بترميز base64.
2. يستدعي `genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })`.
3. يرسل الفيديو مع هذا الموجّه بالضبط. يبقى الموجّه بالإنجليزية لأنه حمولة تقنية تُرسل إلى النموذج:

```
I'm studying this Reel to write my own script in a similar style for my audience of [AUDIENCE FROM about-me.md].

## Full Transcript
- Transcribe EVERY word with timestamps

## Hook
- Exact first words spoken
- Word count of the hook
- What makes it stop the scroll?

## Language Patterns
- Average sentence length
- You/your vs I/me ratio
- Transitions between points
- Where are the 'just' minimisers?

## Structure
- Total duration
- Section breakdown with timings
- What's the before/after moment?
- What's the CTA?

## One key insight
- The single most important technique to learn from this Reel
```

إذا كان الريل المرجعي ناطقًا بالعربية، أضف هذا السطر إلى الموجّه:

```
The Reel is in Arabic. Transcribe it in Arabic script, and report the language patterns (sentence length, pronoun ratio, transitions) for the Arabic text.
```

احفظ التحليل في `~/Desktop/Reels/analysis_reference_{shortCode}.md`.

## الخطوة 5. اكتب سكربت الريل الجديد

باستخدام التحليل من الخطوة 4، وموضوع النشرة من الخطوة 2، وملفات صوت المستخدم، اكتب سكربت ريل جديدًا في `~/Desktop/Reels/reel-[slug].md`.

طبّق هذه القواعد (غير قابلة للتفاوض):

### المقدمة
- لا تفتتح أبدًا بضمير المتكلم. استخدم "هذا"، أو "أنت"، أو حقيقة، أو ذكر اسم.
- صيغ مجرّبة: "هذا غيّر... إلى الأبد" / القلب السلبي ("س عديم الفائدة إلا إذا...") / عبارة قدرة.
- المقدمة تخلق فضولًا أو تقطع النمط خلال 3 ثوانٍ.
- طابِق عدد كلمات المقدمة وبنيتها من التحليل المرجعي.

### المتن
- العربية الفصحى المعاصرة. جمل قصيرة. لا شرطات طويلة (—)، ولا فواصل منقوطة.
- استخدم ضمير المخاطب بأسلوب محادثة ("تكتفي بإدراجه هكذا...").
- لا تدمج ثلاث شذرات متقطعة أو أكثر. اجمعها في جملة واحدة منسابة.
- لا تصرّح بالخلاصة أبدًا. دع الحقائق تقوم بالعمل.
- لا تقل "الرابط في البايو". استخدم أتمتة التعليقات.

### كلمة التعليق المُحفِّزة
- كلمة واحدة بأحرف كبيرة فقط (SCRIPT، WIKI، PROMPTS، VIDEO). في المحتوى العربي يمكن استخدام كلمة عربية واحدة مفردة (سكربت، أدوات، موجّهات) بشرط بقائها كلمة واحدة.
- يجب أن ترتبط مباشرة بما يجري الوعد به.
- بلا علامات اقتباس، وبلا كلمة "بالأسفل"، وبلا علامات ترقيم لاحقة.

### دعوة الإجراء
- "علّق بكلمة [الكلمة] وسأرسل لك [الشيء المحدد]"
- قصيرة. بلا حشو من نوع "الرابط الكامل إلى".

### المدة والبنية
- استهدف من 30 إلى 45 ثانية إجمالًا.
- نقطتان رئيسيتان كحد أقصى، لا ثلاث.
- التعليق التوضيحي يعكس السكربت. حدّثهما معًا.

### بنية ملف السكربت

```
# ريل: [العنوان]

## التحليل المرجعي
- الرابط: [رابط الريل]
- المشاهدات: [عدد]
- التقنية الرئيسية: [من تحليل Gemini]

## المدة المستهدفة
30-45 ثانية

## المقدمة (0-3 ث)
[النص الحرفي]

## النقطة 1 ([البداية]-[النهاية] ث)
[النص الحرفي]

## النقطة 2 ([البداية]-[النهاية] ث)
[النص الحرفي]

## دعوة الإجراء ([البداية]-[النهاية] ث)
[النص الحرفي متضمنًا "علّق بكلمة [الكلمة]"]

---

## التعليق التوضيحي
[يعكس السكربت، منسّقًا لانستغرام]

## كلمة التعليق المُحفِّزة
[الكلمة]

## ما يُسلَّم
[ما الذي تفتحه كلمة التعليق المُحفِّزة]

---

## ملاحظات بصرية
[القطعات، وأفكار اللقطات المساندة، والنصوص المركّبة]
```

## الخطوة 6. حلقة ضبط الجودة

قيّم السكربت مقابل قواعد الخطوة 5. يجب إصلاح كل مخالفة. أعد التقييم حتى يبلغ السكربت 95 من 100. لا تعرض على المستخدم أبدًا أي شيء دون 95.

المخالفات الشائعة الواجب فحصها:
- الافتتاح بضمير المتكلم
- شذرات متقطعة ثلاث أو أكثر
- التصريح بالخلاصة
- كلمة تعليق محفِّزة متعددة الكلمات أو مزخرفة
- المدة تتجاوز 45 ثانية عند القراءة بصوت مرتفع
- 3 نقاط بدلًا من 2
- التعليق التوضيحي لا يعكس السكربت

## الخطوة 7. اعرض خط الإنتاج

بعد اعتماد السكربت، اعرض:

> مساران من هنا:
>
> 1. سجّله بنفسك.
> 2. ولّده آليًا عبر ElevenLabs (الصوت) + HeyGen (الأفاتار) + Remotion (الرسوم المتحركة). إذا كان مشروع my-video مهيّأً لديك، فشغّل `npm run pipeline:claude-routines` بإعدادات هذا السكربت.

## القواعد

- لا تتخطَّ أبدًا بوابة ضبط الجودة عند 95 من 100.
- اقرأ دائمًا voice.md وabout-me.md قبل الكتابة. مطابقة الصوت غير قابلة للتفاوض.
- لا تختلق مؤشرات من الريل المرجعي. استخدم فقط ما يعيده Apify.
- العربية الفصحى المعاصرة. لا شرطات طويلة. لا فواصل منقوطة.
- كل تسليم للسكربت يتضمن التعليق التوضيحي الحرفي وكلمة التعليق المُحفِّزة إلى جانب السكربت. لا تسلّم السكربت وحده أبدًا.
- إذا فشل سحب الريل المرجعي عبر متغيرات الفاعل الثلاثة كلها، فأبلغ عن الفشل وتوقف. لا تختلق تحليلًا.
- النموذج هو Gemini 2.5 Flash. لا تستبدله دون موافقة المستخدم.
