import React, { useRef } from 'react';
import { useStudio, type Tool } from './store';
import { Button, Field, Hint, NumberInput, Panel, Segmented, Select, Slider, Stat, TextInput, Toggle } from './ui';
import { POCKET3_PRESETS, SHOOTING_TIPS_AR } from '../../lib/motion/presets';
import { angleAt } from '../../lib/motion/angles';
import {
    anglesToCsv,
    buildSessionSummary,
    downloadBlob,
    downloadText,
    kinematicsToCsv,
    sessionToJson,
    timestampedName,
    tracksToCsv
} from '../../lib/motion/export';

/** Choosing and connecting the video source. */
export function SourcePanel(): React.ReactElement {
    const { source, openFile, startLive, stopSource, devices, liveError, preset } = useStudio();
    const fileRef = useRef<HTMLInputElement | null>(null);
    const deviceRef = useRef<HTMLSelectElement | null>(null);

    return (
        <Panel title="المصدر" subtitle="ملف مسجّل أو بث مباشر من الكاميرا">
            <input
                ref={fileRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) openFile(file);
                    e.target.value = '';
                }}
            />
            <div className="grid grid-cols-2 gap-2">
                <Button variant="primary" onClick={() => fileRef.current?.click()} full>
                    📁 فتح ملف فيديو
                </Button>
                <Button onClick={() => startLive(deviceRef.current?.value || undefined)} full>
                    🎥 بث مباشر
                </Button>
            </div>

            <Field label="كاميرا البث المباشر" hint="وصّل Osmo Pocket 3 بكابل USB واختر وضع «الويب كام» من شاشة الكاميرا، ثم اخترها هنا.">
                <select
                    ref={deviceRef}
                    className="w-full rounded border border-white/20 bg-black/30 px-2.5 py-2 text-xs text-white outline-none focus:border-primary"
                    defaultValue=""
                >
                    <option value="">الكاميرا الافتراضية</option>
                    {devices.map((d) => (
                        <option key={d.deviceId} value={d.deviceId}>
                            {d.label || `كاميرا ${d.deviceId.slice(0, 6)}`}
                        </option>
                    ))}
                </select>
            </Field>

            {source.kind !== 'none' && (
                <div className="flex items-center justify-between gap-2 rounded bg-black/25 px-3 py-2">
                    <div className="min-w-0">
                        <p className="truncate text-xs font-semibold">{source.name}</p>
                        <p className="text-[11px] text-white/50">{source.kind === 'live' ? 'بث مباشر' : 'ملف مسجّل'}</p>
                    </div>
                    <Button variant="danger" onClick={stopSource}>
                        إيقاف
                    </Button>
                </div>
            )}

            {liveError && (
                <p className="rounded border border-red-400/40 bg-red-500/10 px-3 py-2 text-[11px] text-red-200">
                    تعذّر فتح الكاميرا: {liveError}
                </p>
            )}

            <Field label="نمط التصوير في الكاميرا" hint={preset.noteAr}>
                <PresetSelect />
            </Field>
        </Panel>
    );
}

function PresetSelect(): React.ReactElement {
    const { presetId, applyPreset, cal, setCal } = useStudio();
    return (
        <div className="flex flex-col gap-2">
            <Select value={presetId} onChange={applyPreset}>
                {POCKET3_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                        {p.labelAr}
                    </option>
                ))}
            </Select>
            {presetId === 'custom' && (
                <div className="grid grid-cols-2 gap-2">
                    <Field label="معدل التصوير">
                        <NumberInput value={cal.captureFps} min={1} max={1000} onChange={(v) => setCal({ captureFps: v })} suffix="fps" />
                    </Field>
                    <Field label="معدل العرض">
                        <NumberInput value={cal.timelineFps} min={1} max={1000} onChange={(v) => setCal({ timelineFps: v })} suffix="fps" />
                    </Field>
                </div>
            )}
        </div>
    );
}

/** The pointer tool selector plus the ROI controls it drives. */
export function ToolsPanel(): React.ReactElement {
    const { tool, setTool, clearRoi, engine, cal, setCal, ppm } = useStudio();
    const tools: { value: Tool; label: string; title: string }[] = [
        { value: 'none', label: '🖱️ تحديد', title: 'اضغط على جسم لتحديد مساره' },
        { value: 'roi', label: '🎯 تتبّع', title: 'ارسم مستطيلاً حول الجسم' },
        { value: 'calibrate', label: '📏 معايرة', title: 'ارسم خطاً بطول معلوم' },
        { value: 'angle', label: '📐 زاوية', title: 'ثلاث نقاط لقياس زاوية مفصل' }
    ];

    return (
        <Panel title="الأدوات" subtitle="اختر أداة ثم استخدمها فوق الفيديو">
            <Segmented value={tool} options={tools} onChange={setTool} />

            {tool === 'roi' && (
                <Hint>
                    ارسم مستطيلاً حول الجسم المراد تتبّعه. التتبّع يعتمد على مطابقة القالب (ZNCC) فيستمر حتى لو توقّف الجسم عن
                    الحركة — عكس كشف الحركة الذي يرى المتحرّك فقط.
                </Hint>
            )}
            {engine.template.ready && (
                <Button variant="danger" onClick={clearRoi} full>
                    إلغاء تتبّع المنطقة المحددة
                </Button>
            )}

            {tool === 'calibrate' && (
                <Hint>
                    ارسم خطاً فوق جسم معلوم الطول موجود في نفس مستوى الحركة (مسطرة، عصا، خط ملعب)، ثم أدخل طوله بالمتر. بدون
                    المعايرة ستكون كل السرعات بوحدة البكسل/الثانية.
                </Hint>
            )}
            <Field label="طول المرجع" hint={ppm ? `المقياس الحالي: ${ppm.toFixed(1)} بكسل لكل متر` : 'لم تتم المعايرة بعد.'}>
                <NumberInput value={cal.refLengthM} min={0.01} step={0.01} onChange={(v) => setCal({ refLengthM: v })} suffix="متر" />
            </Field>
            {cal.refLine && (
                <Button variant="ghost" onClick={() => setCal({ refLine: null })} full>
                    مسح خط المعايرة
                </Button>
            )}
        </Panel>
    );
}

/** Detector and tracker tuning. */
export function DetectionPanel(): React.ReactElement {
    const { cfg, setCfg, trackCfg, setTrackCfg, autoDetect, setAutoDetect, analyzing, setAnalyzing, overlayOpts, setOverlayOpts } =
        useStudio();

    return (
        <Panel title="كشف الحركة" subtitle="ضبط حساسية الكشف والتتبّع التلقائي">
            <div className="grid grid-cols-2 gap-2">
                <Button variant={analyzing ? 'primary' : 'default'} onClick={() => setAnalyzing(!analyzing)} full>
                    {analyzing ? '⏸ إيقاف التحليل' : '▶ بدء التحليل'}
                </Button>
                <Button variant={autoDetect ? 'primary' : 'default'} onClick={() => setAutoDetect(!autoDetect)} full>
                    {autoDetect ? 'الكشف التلقائي: يعمل' : 'الكشف التلقائي: متوقف'}
                </Button>
            </div>

            <Field label="طريقة المقارنة" hint={cfg.backgroundMode === 'adjacent' ? 'مقارنة كل إطار بالذي قبله: استجابة فورية، لكن الجسم يختفي إذا توقّف.' : 'مقارنة بخلفية متعلَّمة: تُبقي الأجسام البطيئة والمتوقفة، وتحتاج ثوانٍ لتستقر.'}>
                <Segmented
                    value={cfg.backgroundMode}
                    options={[
                        { value: 'adjacent', label: 'إطار سابق' },
                        { value: 'running', label: 'خلفية متعلَّمة' }
                    ]}
                    onChange={(v) => setCfg({ backgroundMode: v })}
                />
            </Field>

            {cfg.backgroundMode === 'running' && (
                <Slider
                    label="سرعة تعلّم الخلفية"
                    value={cfg.learningRate}
                    min={0.005}
                    max={0.2}
                    step={0.005}
                    onChange={(v) => setCfg({ learningRate: v })}
                    hint="قيمة أعلى = تكيّف أسرع مع تغيّر الإضاءة، لكن الأجسام البطيئة تندمج بالخلفية."
                />
            )}

            <Slider
                label="عتبة الحساسية"
                value={cfg.threshold}
                min={5}
                max={80}
                onChange={(v) => setCfg({ threshold: v })}
                hint="أقل = كشف أدق للحركات الخفيفة، وأكثر تأثراً بضوضاء الإضاءة المنخفضة."
            />
            <Slider
                label="أصغر مساحة مقبولة"
                value={cfg.minAreaPct}
                min={0.01}
                max={5}
                step={0.01}
                unit="%"
                onChange={(v) => setCfg({ minAreaPct: v })}
                hint="نسبة من مساحة الإطار. ارفعها لتجاهل أوراق الشجر والظلال الصغيرة."
            />
            <Slider label="تنعيم الضوضاء" value={cfg.blurRadius} min={0} max={5} onChange={(v) => setCfg({ blurRadius: v })} />
            <Slider
                label="توسيع المناطق"
                value={cfg.dilate}
                min={0}
                max={8}
                onChange={(v) => setCfg({ dilate: v })}
                hint="يدمج أجزاء الجسم الواحد المتقطّعة في كتلة واحدة."
            />
            <Slider
                label="دقة المعالجة"
                value={cfg.processingWidth}
                min={240}
                max={960}
                step={40}
                unit="px"
                onChange={(v) => setCfg({ processingWidth: v })}
                hint="عرض المخزن الداخلي للتحليل. أعلى = دقة أفضل وأداء أبطأ."
            />

            <Toggle
                label="تعويض حركة الكاميرا"
                checked={cfg.compensateCameraMotion}
                onChange={(v) => setCfg({ compensateCameraMotion: v })}
                hint="ضروري عند التصوير باليد أو مع تشغيل ActiveTrack: يقدّر إزاحة المشهد كاملاً ويطرحها قبل المقارنة."
            />

            <hr className="border-white/10" />

            <Slider
                label="مدى الربط بين الإطارات"
                value={trackCfg.gateFactor}
                min={0.5}
                max={4}
                step={0.1}
                onChange={(v) => setTrackCfg({ gateFactor: v })}
                hint="أقصى مسافة يُسمح للجسم بقطعها بين إطارين، كمضاعف لحجمه."
            />
            <Slider
                label="الصبر على الاختفاء"
                value={trackCfg.maxMissed}
                min={0}
                max={60}
                onChange={(v) => setTrackCfg({ maxMissed: v })}
                unit="إطار"
                hint="عدد الإطارات التي يُكمل فيها المسار بالتنبؤ قبل إغلاقه."
            />
            <Slider
                label="أقل عدد رصدات لإظهار المسار"
                value={trackCfg.minHits}
                min={1}
                max={20}
                onChange={(v) => setTrackCfg({ minHits: v })}
                hint="يمنع ظهور مسارات وهمية من ومضة واحدة."
            />

            <hr className="border-white/10" />

            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                <Toggle label="قناع الحركة" checked={overlayOpts.showMask} onChange={(v) => setOverlayOpts({ showMask: v })} />
                <Toggle label="المستطيلات" checked={overlayOpts.showBoxes} onChange={(v) => setOverlayOpts({ showBoxes: v })} />
                <Toggle label="المسارات" checked={overlayOpts.showTrails} onChange={(v) => setOverlayOpts({ showTrails: v })} />
                <Toggle label="متجه السرعة" checked={overlayOpts.showVectors} onChange={(v) => setOverlayOpts({ showVectors: v })} />
                <Toggle label="التسميات" checked={overlayOpts.showLabels} onChange={(v) => setOverlayOpts({ showLabels: v })} />
                <Toggle label="الشبكة والمقياس" checked={overlayOpts.showGrid} onChange={(v) => setOverlayOpts({ showGrid: v })} />
            </div>
            <Slider
                label="طول ذيل المسار"
                value={overlayOpts.trailSeconds}
                min={0}
                max={20}
                step={0.5}
                unit="ث"
                onChange={(v) => setOverlayOpts({ trailSeconds: v })}
                hint="صفر = عرض المسار كاملاً."
            />
        </Panel>
    );
}

/** Live engine telemetry. */
export function StatsPanel(): React.ReactElement {
    const { stats, cal, timeScale, ppm } = useStudio();
    const load = stats.costMs;
    return (
        <Panel title="حالة المحرّك" dense>
            <div className="grid grid-cols-2 gap-2">
                <Stat label="إطارات التحليل" value={`${stats.analysisFps.toFixed(0)}/ث`} tone={stats.analysisFps >= 20 ? 'good' : 'warn'} />
                <Stat label="زمن الإطار" value={`${load.toFixed(1)} ms`} tone={load < 20 ? 'good' : 'warn'} />
                <Stat label="نسبة الحركة" value={`${(stats.motionRatio * 100).toFixed(1)}%`} />
                <Stat label="كتل مرصودة" value={String(stats.blobCount)} />
                <Stat label="مسارات نشطة" value={String(stats.activeTracks)} />
                <Stat label="إزاحة الكاميرا" value={`${stats.cameraDx.toFixed(0)}, ${stats.cameraDy.toFixed(0)}`} />
                <Stat label="معدل المصدر" value={stats.sourceFps ? `${stats.sourceFps.toFixed(0)} fps` : '—'} />
                <Stat label="معامل الزمن" value={`×${timeScale.toFixed(2)}`} tone={timeScale > 1 ? 'good' : 'default'} />
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-white/50">
                {ppm
                    ? `المشهد معاير: ${ppm.toFixed(1)} بكسل/متر. السرعات بالمتر/ث و كم/س.`
                    : 'المشهد غير معاير — السرعات بالبكسل/الثانية. استخدم أداة «معايرة».'}
                {timeScale > 1 &&
                    ` التصوير ${cal.captureFps} إطار/ث والعرض ${cal.timelineFps} إطار/ث، لذا تُضرب السرعات في ${timeScale.toFixed(2)}.`}
            </p>
        </Panel>
    );
}

/** The list of trajectories, with per-track summary numbers. */
export function TracksPanel(): React.ReactElement {
    const { tracks, kinematics, selectedTrackId, setSelectedTrackId, removeTrack, clearTracks } = useStudio();

    return (
        <Panel
            title="المسارات"
            subtitle={`${tracks.length} مسار`}
            actions={
                tracks.length > 0 ? (
                    <Button variant="danger" onClick={clearTracks}>
                        مسح الكل
                    </Button>
                ) : undefined
            }
            dense
        >
            {!tracks.length && (
                <p className="px-1 py-3 text-center text-xs text-white/45">
                    لا توجد مسارات بعد. شغّل الفيديو مع الكشف التلقائي، أو ارسم مستطيلاً حول جسم بأداة «تتبّع».
                </p>
            )}
            <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto">
                {tracks.map((track) => {
                    const k = kinematics.find((s) => s.trackId === track.id);
                    const selected = selectedTrackId === track.id;
                    const unit = k?.calibrated ? 'م/ث' : 'بكسل/ث';
                    return (
                        <li key={track.id}>
                            <div
                                role="button"
                                tabIndex={0}
                                onClick={() => setSelectedTrackId(selected ? null : track.id)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') setSelectedTrackId(selected ? null : track.id);
                                }}
                                className={`flex cursor-pointer items-center gap-2.5 rounded px-2.5 py-2 text-xs transition-colors ${
                                    selected ? 'bg-white/15' : 'hover:bg-white/8'
                                }`}
                            >
                                <span className="size-3 shrink-0 rounded-full" style={{ background: track.color }} />
                                <span className="min-w-0 grow">
                                    <span className="font-semibold">
                                        {track.label}
                                        {track.source === 'template' && ' (يدوي)'}
                                    </span>
                                    <span className="block text-[11px] text-white/50 tabular-nums">
                                        {k
                                            ? `ذروة ${k.maxSpeed.toFixed(2)} ${unit} · مسافة ${k.totalDistance.toFixed(2)} ${k.calibrated ? 'م' : 'بكسل'}`
                                            : `${track.samples.length} عيّنة`}
                                    </span>
                                </span>
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        removeTrack(track.id);
                                    }}
                                    className="shrink-0 rounded px-1.5 py-1 text-white/40 transition-colors hover:bg-red-500/20 hover:text-red-200"
                                    title="حذف المسار"
                                >
                                    ✕
                                </button>
                            </div>
                        </li>
                    );
                })}
            </ul>
        </Panel>
    );
}

/** Angle markers placed on individual frames. */
export function AnglesPanel(): React.ReactElement {
    const { markers, angleLabel, setAngleLabel, removeMarker, clearMarkers, videoRef, setTool, angleSeries } = useStudio();

    return (
        <Panel
            title="الزوايا"
            subtitle={`${markers.length} قياس`}
            actions={
                markers.length > 0 ? (
                    <Button variant="danger" onClick={clearMarkers}>
                        مسح الكل
                    </Button>
                ) : undefined
            }
        >
            <Field label="اسم المفصل / الزاوية" hint="القياسات التي تحمل نفس الاسم تُجمع في منحنى واحد عبر الزمن.">
                <TextInput value={angleLabel} onChange={setAngleLabel} placeholder="مثال: الركبة اليمنى" />
            </Field>
            <div className="flex flex-wrap gap-1.5">
                {['الركبة', 'الكوع', 'الورك', 'الكتف', 'الكاحل', 'الجذع'].map((preset) => (
                    <button
                        key={preset}
                        type="button"
                        onClick={() => setAngleLabel(preset)}
                        className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] transition-colors hover:bg-white/20"
                    >
                        {preset}
                    </button>
                ))}
            </div>
            <Button variant="primary" onClick={() => setTool('angle')} full>
                📐 بدء وضع القياس
            </Button>
            <Hint>
                أوقف الفيديو عند الإطار المطلوب (سهم يمين/يسار للتنقّل إطاراً إطاراً) ثم اضغط ثلاث نقاط: الطرف الأول، المفصل،
                الطرف الثاني.
            </Hint>

            {angleSeries.length > 0 && (
                <div className="flex flex-col gap-1.5">
                    {angleSeries.map((s) => (
                        <div key={s.label} className="flex items-center gap-2 rounded bg-black/25 px-2.5 py-2 text-[11px]">
                            <span className="size-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
                            <span className="font-semibold">{s.label}</span>
                            <span className="ms-auto text-white/60 tabular-nums">
                                {s.min.toFixed(1)}° → {s.max.toFixed(1)}° (مدى {s.range.toFixed(1)}°)
                            </span>
                        </div>
                    ))}
                </div>
            )}

            {markers.length > 0 && (
                <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto">
                    {markers.map((m) => (
                        <li key={m.id} className="flex items-center gap-2 rounded px-2 py-1.5 text-[11px] hover:bg-white/8">
                            <span className="size-2.5 shrink-0 rounded-full" style={{ background: m.color }} />
                            <button
                                type="button"
                                className="grow text-start tabular-nums"
                                onClick={() => {
                                    const video = videoRef.current;
                                    if (video) video.currentTime = m.t;
                                }}
                                title="الانتقال إلى هذا الإطار"
                            >
                                {m.label} · {angleAt(m.a, m.b, m.c).toFixed(1)}° · {m.t.toFixed(2)}ث
                            </button>
                            <button
                                type="button"
                                onClick={() => removeMarker(m.id)}
                                className="rounded px-1.5 text-white/40 transition-colors hover:bg-red-500/20 hover:text-red-200"
                            >
                                ✕
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </Panel>
    );
}

/** Data export and annotated-video capture. */
export function ExportPanel(): React.ReactElement {
    const {
        kinematics,
        angleSeries,
        tracks,
        cal,
        source,
        videoRef,
        overlayCanvasRef,
        recording,
        toggleRecording,
        smoothWindow,
        setSmoothWindow
    } = useStudio();

    const snapshot = () => {
        const video = videoRef.current;
        const overlay = overlayCanvasRef.current;
        if (!video || !overlay || !video.videoWidth) return;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        ctx.drawImage(overlay, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
            if (blob) downloadBlob(timestampedName('motion-frame', 'png'), blob);
        }, 'image/png');
    };

    const hasData = kinematics.length > 0 || angleSeries.length > 0;

    return (
        <Panel title="التصدير" subtitle="أخرج الأرقام والصور من الجلسة">
            <Slider
                label="تنعيم المنحنيات"
                value={smoothWindow}
                min={3}
                max={31}
                step={2}
                unit="عيّنة"
                onChange={setSmoothWindow}
                hint="مرشّح Savitzky–Golay: يزيل اهتزاز التتبّع دون إزاحة القمم. قيمة أعلى = منحنى أهدأ واستجابة أبطأ."
            />
            <div className="grid grid-cols-2 gap-2">
                <Button onClick={() => downloadText(timestampedName('kinematics', 'csv'), kinematicsToCsv(kinematics), 'text/csv;charset=utf-8')} disabled={!kinematics.length} full>
                    CSV السرعات
                </Button>
                <Button onClick={() => downloadText(timestampedName('angles', 'csv'), anglesToCsv(angleSeries), 'text/csv;charset=utf-8')} disabled={!angleSeries.length} full>
                    CSV الزوايا
                </Button>
                <Button onClick={() => downloadText(timestampedName('tracks', 'csv'), tracksToCsv(tracks), 'text/csv;charset=utf-8')} disabled={!tracks.length} full>
                    CSV المسارات الخام
                </Button>
                <Button
                    onClick={() => {
                        const video = videoRef.current;
                        const summary = buildSessionSummary(
                            source.name || 'unknown',
                            video?.videoWidth ?? 0,
                            video?.videoHeight ?? 0,
                            cal,
                            tracks,
                            angleSeries,
                            kinematics
                        );
                        downloadText(timestampedName('session', 'json'), sessionToJson(summary), 'application/json');
                    }}
                    disabled={!hasData}
                    full
                >
                    JSON الجلسة
                </Button>
                <Button onClick={snapshot} disabled={source.kind === 'none'} full>
                    📷 لقطة بالتحليل
                </Button>
                <Button variant={recording ? 'danger' : 'default'} onClick={toggleRecording} disabled={source.kind === 'none'} full>
                    {recording ? '⏹ إنهاء التسجيل' : '⏺ تسجيل فيديو'}
                </Button>
            </div>
            {recording && <Hint>يجري تسجيل الفيديو مع طبقة التحليل. سيُحفَظ ملف WebM تلقائياً عند الإنهاء.</Hint>}
        </Panel>
    );
}

/** Field guidance — the part that decides whether the numbers mean anything. */
export function TipsPanel(): React.ReactElement {
    return (
        <Panel title="إرشادات التصوير" subtitle="دقة النتائج تُحسم أثناء التصوير لا بعده">
            <ul className="flex flex-col gap-2">
                {SHOOTING_TIPS_AR.map((tip) => (
                    <li key={tip} className="flex gap-2 text-[11px] leading-relaxed text-white/75">
                        <span className="text-primary">◆</span>
                        <span>{tip}</span>
                    </li>
                ))}
            </ul>
        </Panel>
    );
}
