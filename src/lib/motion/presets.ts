/**
 * DJI Osmo Pocket 3 recording modes and the analysis settings they imply.
 *
 * The camera writes slow-motion clips already slowed down: 120 fps of capture
 * lands in a 30 fps file. Nothing in the file itself says the footage was
 * retimed, so the analyst has to declare it — pick the mode here and every
 * speed the app reports is corrected for it automatically.
 */

export interface CameraPreset {
    id: string;
    label: string;
    labelAr: string;
    width: number;
    height: number;
    /** Frames per second the sensor captured at. */
    captureFps: number;
    /** Frames per second the written file plays at. */
    timelineFps: number;
    note?: string;
    noteAr?: string;
}

/** Resolutions the Pocket 3 records at. */
const RESOLUTIONS = [
    { key: '4k', label: '4K', width: 3840, height: 2160 },
    { key: '2.7k', label: '2.7K', width: 2720, height: 1530 },
    { key: '1080p', label: '1080p', width: 1920, height: 1080 }
];

/** Real-time frame rates offered at every resolution. */
const REAL_TIME_FPS = [24, 25, 30, 48, 50, 60];

/**
 * Every real-time mode, enumerated.
 *
 * Enumerated rather than sampled, because a gap here is not a missing menu
 * entry — it is a wrong measurement. A rate with no real-time preset can only
 * match a slow-motion one, and the app would then silently multiply every
 * reported speed by that preset's factor.
 */
const REAL_TIME_PRESETS: CameraPreset[] = RESOLUTIONS.flatMap((res) =>
    REAL_TIME_FPS.map((fps) => ({
        id: `${res.key}${fps}`,
        label: `${res.label} · ${fps} fps`,
        labelAr: `${res.label} · ${fps} إطار/ث`,
        width: res.width,
        height: res.height,
        captureFps: fps,
        timelineFps: fps,
        note: 'Real time: reported speeds are the speeds that happened.',
        noteAr: 'زمن حقيقي: السرعات المعروضة هي السرعات الفعلية.'
    }))
);

export const POCKET3_PRESETS: CameraPreset[] = [
    ...REAL_TIME_PRESETS,
    {
        id: '1080p120',
        label: '1080p · 120 fps (slow-mo 4x)',
        labelAr: '1080p · 120 إطار/ث (حركة بطيئة 4x)',
        width: 1920,
        height: 1080,
        captureFps: 120,
        timelineFps: 30,
        note: 'File plays 4x slow. Speeds are multiplied by 4 to report real values.',
        noteAr: 'الملف يعمل أبطأ 4 مرات. تُضرب السرعات في 4 لإظهار القيم الحقيقية.'
    },
    {
        id: '1080p100',
        label: '1080p · 100 fps (slow-mo 4x, PAL)',
        labelAr: '1080p · 100 إطار/ث (حركة بطيئة 4x، PAL)',
        width: 1920,
        height: 1080,
        captureFps: 100,
        timelineFps: 25,
        note: 'PAL slow-motion variant.',
        noteAr: 'نسخة الحركة البطيئة بنظام PAL.'
    },
    {
        id: 'custom',
        label: 'Custom / unknown',
        labelAr: 'مخصص / غير معروف',
        width: 0,
        height: 0,
        captureFps: 30,
        timelineFps: 30,
        note: 'Enter capture and playback frame rates by hand.',
        noteAr: 'أدخل معدل التصوير ومعدل العرض يدوياً.'
    }
];

export function findPreset(id: string): CameraPreset {
    return POCKET3_PRESETS.find((p) => p.id === id) ?? POCKET3_PRESETS[POCKET3_PRESETS.length - 1];
}

/**
 * Guess the preset that produced a file from its resolution and measured frame
 * rate.
 *
 * A slow-motion file is genuinely indistinguishable from a normal one here:
 * both a real-time 1080p/30 clip and a 120 fps clip retimed to 30 present as
 * 1080p at 30 fps, and nothing in the container says which. The two readings
 * are not equally safe, though — guessing slow-motion multiplies every reported
 * speed by four, while guessing real time reports what the timeline shows. So
 * ties resolve to real time, always, and the user declares slow-motion when
 * they shot it.
 */
export function guessPreset(width: number, height: number, fps: number): CameraPreset | null {
    const candidates = POCKET3_PRESETS.filter((p) => p.width === width && p.height === height && p.id !== 'custom');
    if (!candidates.length) return null;

    let best: CameraPreset | null = null;
    let bestErr = Infinity;
    for (const c of candidates) {
        const err = Math.abs(c.timelineFps - fps);
        const isRealTime = c.captureFps === c.timelineFps;
        const bestIsRealTime = best ? best.captureFps === best.timelineFps : false;
        // Strictly better error wins; an equal error only wins by being the
        // real-time reading.
        if (err < bestErr || (err === bestErr && isRealTime && !bestIsRealTime)) {
            bestErr = err;
            best = c;
        }
    }
    return bestErr <= 2 ? best : null;
}

/**
 * Practical shooting guidance. Perspective error is the single biggest source
 * of wrong speed numbers in this kind of analysis, and no amount of processing
 * fixes it after the fact.
 */
export const SHOOTING_TIPS_AR = [
    'ثبّت الكاميرا على حامل ثلاثي وأوقف تتبّع ActiveTrack أثناء القياس — الكاميرا الثابتة تعطي أدق النتائج.',
    'صوّر الحركة من زاوية عمودية على اتجاهها (الكاميرا جانبية بالنسبة للحركة) لتقليل خطأ المنظور.',
    'ضع مرجع قياس معروف الطول في نفس مستوى الحركة (مسطرة، عصا مترية، خط ملعب) — المعايرة تعتمد عليه.',
    'استخدم 120 إطار/ث للحركات السريعة (ركل، رمي، ضرب) و60 إطار/ث للمشي والجري.',
    'ارفع سرعة الغالق (Shutter) لتقليل ضبابية الحركة؛ قاعدة 1/(2×fps) تعطي حواف أوضح للتتبّع.',
    'أضئ المشهد جيداً — الضوضاء في الإضاءة المنخفضة تُنتج كشف حركة كاذباً.',
    'شغّل وضع الويب كام (USB) في الكاميرا للتحليل المباشر، أو انسخ ملفات MP4 للتحليل بدقة أعلى.'
];

export const SHOOTING_TIPS_EN = [
    'Mount the camera on a tripod and turn ActiveTrack off while measuring — a static camera gives the cleanest results.',
    'Shoot perpendicular to the direction of travel to minimise perspective error.',
    'Put a reference object of known length in the same plane as the motion; calibration depends on it.',
    'Use 120 fps for fast actions (kicks, throws, strikes) and 60 fps for walking and running.',
    'Raise the shutter speed to cut motion blur; 1/(2 x fps) keeps edges sharp for the tracker.',
    'Light the scene well — low-light noise produces false motion detections.',
    'Switch the camera to USB webcam mode for live analysis, or copy the MP4s off for higher-resolution work.'
];
