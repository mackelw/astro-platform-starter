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
    disabled
}: {
    item: PortalItem;
    exercise: PortalExercise | undefined;
    index: number;
    done: boolean;
    onToggle: () => void;
    disabled: boolean;
}) {
    const [showMedia, setShowMedia] = useState(false);
    const media = videoEmbed(exercise?.videoUrl ?? '');

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
                        <p className="text-base font-extrabold text-slate-800">{exercise?.name ?? 'تمرين'}</p>
                        <p className="mt-1 text-sm font-bold text-teal-700">{itemSummary(item)}</p>
                        {exercise?.equipment && exercise.equipment !== 'بدون' ? (
                            <p className="mt-0.5 text-xs text-slate-500">الأداة: {exercise.equipment}</p>
                        ) : null}
                    </div>
                </div>

                {exercise?.instructions ? <p className="mt-3 text-sm leading-relaxed text-slate-700">{exercise.instructions}</p> : null}

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
                                ▶ مشاهدة الفيديو
                            </a>
                        ) : media.kind !== 'none' ? (
                            showMedia ? (
                                <div className="overflow-hidden rounded-lg bg-black">
                                    {media.kind === 'file' ? (
                                        <video src={media.src} controls playsInline className="aspect-video w-full" />
                                    ) : (
                                        <iframe
                                            src={media.src}
                                            title={exercise?.name ?? 'فيديو التمرين'}
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
                                    ▶ شغّل الفيديو
                                </button>
                            )
                        ) : null}

                        {exercise?.imageUrl && !showMedia ? (
                            <img src={exercise.imageUrl} alt={exercise.name} loading="lazy" className="mt-2 w-full rounded-lg object-cover" />
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
                {done ? '✓ تم — اضغط للتراجع' : 'تم إنهاء التمرين'}
            </button>
        </li>
    );
}
