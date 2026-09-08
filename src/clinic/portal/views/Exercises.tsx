import React, { useMemo, useState } from 'react';
import { useStore } from '../../store';
import { usePortal } from '../context';
import { Card, EmptyState } from '../../components/ui';
import type { Exercise, ExerciseLog, Prescription } from '../../types';
import { addDays, embedUrl, isDirectVideo, safeUrl, todayISO } from '../../utils';

/** شريط الأسبوع: نقطة لكل يوم تتلون عند إنجاز التمرين فيه */
function WeekStrip({ logs, prescriptionId }: { logs: ExerciseLog[]; prescriptionId: string }) {
    const today = todayISO();
    const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
    const done = new Set(logs.filter((l) => l.prescriptionId === prescriptionId && l.done).map((l) => l.date));
    return (
        <div className="flex gap-1.5">
            {days.map((day) => (
                <span
                    key={day}
                    title={day}
                    className={`size-2.5 rounded-full ${done.has(day) ? 'bg-emerald-500' : 'bg-slate-200'}`}
                    aria-label={done.has(day) ? day : ''}
                />
            ))}
        </div>
    );
}

function Media({ exercise, watchLabel }: { exercise: Exercise; watchLabel: string }) {
    const url = safeUrl(exercise.mediaUrl);
    if (!url || exercise.mediaType === 'none') return null;

    if (exercise.mediaType === 'image') {
        return <img src={url} alt={exercise.name} loading="lazy" className="mt-3 max-h-72 w-full rounded-xl object-cover" />;
    }

    const embed = embedUrl(url);
    if (embed) {
        return (
            <div className="mt-3 aspect-video w-full overflow-hidden rounded-xl bg-slate-900">
                <iframe
                    src={embed}
                    title={exercise.name}
                    loading="lazy"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="size-full border-0"
                />
            </div>
        );
    }

    if (isDirectVideo(url)) {
        return <video src={url} controls preload="metadata" className="mt-3 w-full rounded-xl bg-slate-900" />;
    }

    // رابط من مصدر لا يمكن تضمينه — نفتحه في تبويب جديد بدل إطار فارغ
    return (
        <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-teal-700 hover:bg-slate-200"
        >
            ▶ {watchLabel}
        </a>
    );
}

function PrescriptionCard({ prescription, exercise }: { prescription: Prescription; exercise: Exercise }) {
    const { db, add, update } = useStore();
    const { t, lang } = usePortal();
    const today = todayISO();
    const [note, setNote] = useState('');
    const [pain, setPain] = useState(0);

    const log = db.exerciseLogs.find((l) => l.prescriptionId === prescription.id && l.date === today);
    const done = Boolean(log?.done);

    const toggle = () => {
        if (log) {
            update('exerciseLogs', log.id, { done: !log.done, painLevel: pain || log.painLevel, note: note || log.note });
            return;
        }
        add('exerciseLogs', {
            patientId: prescription.patientId,
            prescriptionId: prescription.id,
            date: today,
            done: true,
            painLevel: pain,
            note
        });
    };

    const name = lang === 'ar' ? exercise.name : exercise.nameEn || exercise.name;
    const description = lang === 'ar' ? exercise.description : exercise.descriptionEn || exercise.description;

    const dose = [
        prescription.sets > 0 && prescription.reps > 0 ? `${prescription.sets} ${t('ex.sets')} × ${prescription.reps} ${t('ex.reps')}` : '',
        prescription.holdSeconds > 0 ? `${t('ex.hold')} ${prescription.holdSeconds} ${t('ex.seconds')}` : '',
        prescription.perDay > 0 ? `${prescription.perDay} ${t('ex.perDay')}` : '',
        prescription.daysPerWeek > 0 ? `${prescription.daysPerWeek} ${t('ex.daysPerWeek')}` : ''
    ].filter(Boolean);

    return (
        <Card className={`p-4 ${done ? 'border-emerald-300 bg-emerald-50/40' : ''}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                    <h3 className="text-base font-extrabold text-slate-800">{name}</h3>
                    {exercise.category ? <p className="mt-0.5 text-[11px] text-slate-400">{exercise.category}</p> : null}
                </div>
                <WeekStrip logs={db.exerciseLogs} prescriptionId={prescription.id} />
            </div>

            {dose.length ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                    {dose.map((part) => (
                        <span key={part} className="rounded-full bg-teal-50 px-2.5 py-0.5 text-[11px] font-bold text-teal-700 ring-1 ring-teal-100">
                            {part}
                        </span>
                    ))}
                </div>
            ) : null}

            {description ? <p className="mt-2 text-sm leading-relaxed text-slate-600">{description}</p> : null}

            <Media exercise={exercise} watchLabel={t('ex.watch')} />

            {prescription.notes ? (
                <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    <span className="font-bold">{t('ex.therapistNote')}: </span>
                    {prescription.notes}
                </p>
            ) : null}

            {done ? (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-bold text-emerald-700">{t('ex.doneToday')}</span>
                    <button type="button" onClick={toggle} className="cursor-pointer text-xs font-semibold text-slate-500 underline">
                        {t('ex.undo')}
                    </button>
                </div>
            ) : (
                <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                    <label className="block">
                        <span className="mb-1 flex items-center justify-between text-[11px] font-semibold text-slate-600">
                            <span>{t('ex.pain')}</span>
                            <span className="font-extrabold text-teal-700">{pain}/10</span>
                        </span>
                        <input
                            type="range"
                            min={0}
                            max={10}
                            value={pain}
                            onChange={(e) => setPain(Number(e.target.value))}
                            className="w-full accent-teal-600"
                        />
                    </label>
                    <input
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder={t('ex.noteHint')}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500"
                    />
                    <button
                        type="button"
                        onClick={toggle}
                        className="w-full cursor-pointer rounded-lg bg-teal-600 px-3 py-2.5 text-sm font-bold text-white transition hover:bg-teal-700"
                    >
                        ✓ {t('ex.markDone')}
                    </button>
                </div>
            )}
        </Card>
    );
}

export default function PortalExercises() {
    const { db } = useStore();
    const { t, patient } = usePortal();
    const today = todayISO();

    const items = useMemo(() => {
        if (!patient) return [];
        return db.prescriptions
            .filter((r) => r.patientId === patient.id && r.active && (!r.endDate || r.endDate >= today))
            .map((r) => ({ prescription: r, exercise: db.exercises.find((x) => x.id === r.exerciseId) }))
            .filter((row): row is { prescription: Prescription; exercise: Exercise } => Boolean(row.exercise));
    }, [db.prescriptions, db.exercises, patient, today]);

    const doneCount = items.filter((row) => db.exerciseLogs.some((l) => l.prescriptionId === row.prescription.id && l.date === today && l.done)).length;

    return (
        <div className="space-y-4">
            <div>
                <h1 className="text-lg font-extrabold text-slate-800">{t('ex.title')}</h1>
                <p className="mt-0.5 text-xs text-slate-500">{t('ex.subtitle')}</p>
            </div>

            {items.length ? (
                <Card className="flex items-center justify-between gap-3 p-4">
                    <span className="text-sm font-semibold text-slate-600">{t('home.todayExercises')}</span>
                    <span className="text-lg font-extrabold text-teal-700">
                        {doneCount} / {items.length}
                    </span>
                </Card>
            ) : null}

            {items.length === 0 ? (
                <Card>
                    <EmptyState title={t('ex.empty')} hint={t('ex.emptyHint')} />
                </Card>
            ) : (
                <div className="space-y-3">
                    {items.map((row) => (
                        <PrescriptionCard key={row.prescription.id} prescription={row.prescription} exercise={row.exercise} />
                    ))}
                </div>
            )}
        </div>
    );
}
