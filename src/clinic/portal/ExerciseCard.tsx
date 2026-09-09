import React, { useState } from 'react';
import type { PortalExercise, PortalItem } from './api';
import { itemSummary, videoEmbed } from '../telerehab';

/**
 * بطاقة تمرين واحد في صفحة المريض.
 * القاعدة: مهمة واحدة وزر واحد كبير — كل ما عداه ثانوي ومطوي.
 */
export default function ExerciseCard({
    item,
    exercise,
    index,
    done,
    onToggle,
    disabled,
    english
}: {
    item: PortalItem;
    exercise: PortalExercise | undefined;
    index: number;
    done: boolean;
    onToggle: () => void;
    disabled: boolean;
    english: boolean;
}) {
    const [showMedia, setShowMedia] = useState(false);
    const media = videoEmbed(exercise?.videoUrl ?? '');

    // الإنجليزية تُعرض فقط إن كُتبت فعلًا؛ وإلا يبقى النص العربي بدل فراغ
    const pick = (ar: string | undefined, en: string | undefined) => (english && en ? en : (ar ?? ''));
    const name = pick(exercise?.name, exercise?.nameEn) || (english ? 'Exercise' : 'تمرين');
    const summary = pick(exercise?.summary, exercise?.summaryEn);
    const instructions = pick(exercise?.instructions, exercise?.instructionsEn);
    const cautions = pick(exercise?.cautions, exercise?.cautionsEn);
    const equipment = pick(exercise?.equipment, exercise?.equipmentEn);

    /* الصفحة كلها RTL، فالنص الإنجليزي يحتاج اتجاهه ومحاذاته صراحة وإلا قفزت النقطة لأول السطر */
    const dir = english ? 'ltr' : 'rtl';
    const align = english ? 'text-left' : 'text-right';

    return (
        <li className={`overflow-hidden rounded-xl border-2 transition ${done ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
            <div className="p-4">
                <div className="flex items-start gap-3">
                    <span
                        className={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-extrabold ${
                            done ? 'bg-emerald-600 text-white' : 'bg-teal-50 text-teal-700'
                        }`}
                    >
                        {done ? '✓' : index + 1}
                    </span>
                    <div className="min-w-0 grow">
                        <p dir={dir} className={`text-base font-extrabold text-slate-800 ${align}`}>
                            {name}
                        </p>
                        {summary ? (
                            <p dir={dir} className={`mt-0.5 text-xs text-slate-500 ${align}`}>
                                {summary}
                            </p>
                        ) : null}
                        <p dir={dir} className={`mt-1 text-sm font-bold text-teal-700 ${align}`}>
                            {itemSummary(item, english)}
                        </p>
                        {equipment && equipment !== 'بدون' && equipment !== 'None' ? (
                            <p dir={dir} className={`mt-0.5 text-xs text-slate-500 ${align}`}>
                                {english ? 'Equipment: ' : 'الأداة: '}
                                {equipment}
                            </p>
                        ) : null}
                    </div>
                </div>

                {instructions ? (
                    <p dir={dir} className={`mt-3 text-sm leading-relaxed whitespace-pre-line text-slate-700 ${align}`}>
                        {instructions}
                    </p>
                ) : null}

                {cautions ? (
                    <p dir={dir} className={`mt-3 flex gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-900 ${align}`}>
                        <span aria-hidden="true">⚠</span>
                        <span>{cautions}</span>
                    </p>
                ) : null}

                {item.note ? <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">{item.note}</p> : null}

                {media.kind !== 'none' || exercise?.imageUrl ? (
                    <div className="mt-3">
                        {media.kind === 'link' ? (
                            <a
                                href={media.src}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700"
                            >
                                ▶ {english ? 'Watch video' : 'مشاهدة الفيديو'}
                            </a>
                        ) : media.kind !== 'none' ? (
                            showMedia ? (
                                <div className="overflow-hidden rounded-lg bg-black">
                                    {media.kind === 'file' ? (
                                        <video src={media.src} controls playsInline className="aspect-video w-full" />
                                    ) : (
                                        <iframe
                                            src={media.src}
                                            title={name}
                                            allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                                            allowFullScreen
                                            className="aspect-video w-full border-0"
                                        />
                                    )}
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => setShowMedia(true)}
                                    className="w-full cursor-pointer rounded-lg bg-slate-900 px-3 py-6 text-sm font-bold text-white transition hover:bg-slate-800"
                                >
                                    ▶ {english ? 'Play video' : 'شغّل الفيديو'}
                                </button>
                            )
                        ) : null}

                        {exercise?.imageUrl && !showMedia ? (
                            <img src={exercise.imageUrl} alt={name} loading="lazy" className="mt-2 w-full rounded-lg object-cover" />
                        ) : null}
                    </div>
                ) : null}
            </div>

            <button
                type="button"
                onClick={onToggle}
                disabled={disabled}
                className={`w-full cursor-pointer px-4 py-3.5 text-base font-extrabold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                    done ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-teal-600 text-white hover:bg-teal-700'
                }`}
            >
                {done ? (english ? '✓ Done — tap to undo' : '✓ تم — اضغط للتراجع') : english ? 'Mark as done' : 'تم إنهاء التمرين'}
            </button>
        </li>
    );
}
