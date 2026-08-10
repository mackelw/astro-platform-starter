import React, { useMemo, useState } from 'react';
import { useStudio } from './store';
import { LineChart, TrajectoryPlot, type ChartSeries } from './Chart';
import { Button } from './ui';

/**
 * The analysis output: headline numbers for the object under study, then the
 * curves behind them, then the raw table.
 *
 * A speed number without its curve hides where it came from — a tracker glitch
 * and a real sprint produce the same peak — so the curves are always one scroll
 * away from the number, and the table is always one click away from the curves.
 */
export function Results(): React.ReactElement {
    const { kinematics, angleSeries, selectedTrackId, videoRef, currentTime, timeScale, tracks } = useStudio();
    const [showTable, setShowTable] = useState(false);

    const shown = useMemo(
        () => (selectedTrackId === null ? kinematics.slice(0, 8) : kinematics.filter((k) => k.trackId === selectedTrackId)),
        [kinematics, selectedTrackId]
    );

    // The headline object: the selected one, or otherwise the fastest — the one
    // an analyst almost always came to look at.
    const focus = useMemo(() => {
        if (selectedTrackId !== null) return kinematics.find((k) => k.trackId === selectedTrackId) ?? null;
        let best = null as (typeof kinematics)[number] | null;
        for (const k of kinematics) if (!best || k.maxSpeed > best.maxSpeed) best = k;
        return best;
    }, [kinematics, selectedTrackId]);

    const speedSeries: ChartSeries[] = shown.map((k) => ({
        id: k.trackId,
        label: k.label,
        color: k.color,
        points: k.samples.map((s) => ({ x: s.t, y: s.speed }))
    }));
    const accelSeries: ChartSeries[] = shown.map((k) => ({
        id: k.trackId,
        label: k.label,
        color: k.color,
        points: k.samples.map((s) => ({ x: s.t, y: s.accel }))
    }));
    const pathSeries: ChartSeries[] = shown.map((k) => ({
        id: k.trackId,
        label: k.label,
        color: k.color,
        points: k.samples.map((s) => ({ x: s.x, y: s.y }))
    }));
    const angleChartSeries: ChartSeries[] = angleSeries.map((s) => ({
        id: s.label,
        label: s.label,
        color: s.color,
        points: s.samples.map((k) => ({ x: k.t, y: k.angle }))
    }));

    const calibrated = focus?.calibrated ?? false;
    const speedUnit = calibrated ? 'م/ث' : 'بكسل/ث';
    const video = videoRef.current;
    const marker = currentTime / timeScale;

    return (
        <div className="flex flex-col gap-4">
            {focus ? (
                <div className="rounded-lg border border-white/15 bg-white/5 p-4">
                    <div className="flex items-center gap-2">
                        <span className="size-3 rounded-full" style={{ background: focus.color }} />
                        <h3 className="text-sm font-bold">
                            {focus.label}
                            {selectedTrackId === null && <span className="font-normal text-white/50"> · الأسرع في المشهد</span>}
                        </h3>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <Headline label="السرعة القصوى" value={focus.maxSpeed.toFixed(2)} unit={speedUnit} extra={calibrated ? `${(focus.maxSpeed * 3.6).toFixed(1)} كم/س` : undefined} />
                        <Headline label="متوسط السرعة" value={focus.meanSpeed.toFixed(2)} unit={speedUnit} extra={calibrated ? `${(focus.meanSpeed * 3.6).toFixed(1)} كم/س` : undefined} />
                        <Headline label="المسافة" value={focus.totalDistance.toFixed(2)} unit={calibrated ? 'م' : 'بكسل'} />
                        <Headline label="المدة الحقيقية" value={focus.duration.toFixed(2)} unit="ث" />
                    </div>
                    {!calibrated && (
                        <p className="mt-3 text-[11px] text-amber-300">
                            المشهد غير معاير — القيم بالبكسل. استخدم أداة «معايرة» وارسم خطاً بطول معلوم لتحويلها إلى أمتار.
                        </p>
                    )}
                </div>
            ) : (
                <div className="rounded-lg border border-white/15 bg-white/5 p-6 text-center text-xs text-white/50">
                    لا توجد قياسات بعد. شغّل الفيديو حتى يتكوّن مسار واحد على الأقل.
                </div>
            )}

            <div className="grid gap-4 lg:grid-cols-2">
                <LineChart
                    title={`السرعة عبر الزمن (${speedUnit})`}
                    subtitle={selectedTrackId === null ? 'كل المسارات الظاهرة' : 'المسار المحدد'}
                    series={speedSeries}
                    xLabel="الزمن الحقيقي (ث)"
                    yLabel={speedUnit}
                    marker={marker}
                />
                <LineChart
                    title={`التسارع عبر الزمن (${calibrated ? 'م/ث²' : 'بكسل/ث²'})`}
                    subtitle="القيم الموجبة تسارع، والسالبة تباطؤ"
                    series={accelSeries}
                    xLabel="الزمن الحقيقي (ث)"
                    yLabel={calibrated ? 'م/ث²' : 'بكسل/ث²'}
                    zeroLine
                    marker={marker}
                />
                <LineChart
                    title="الزاوية عبر الزمن (درجة)"
                    subtitle="من القياسات اليدوية على الإطارات"
                    series={angleChartSeries}
                    xLabel="الزمن الحقيقي (ث)"
                    yLabel="درجة"
                    marker={marker}
                    emptyMessage="لم تُسجَّل زوايا بعد. استخدم أداة «زاوية» فوق الفيديو."
                />
                <TrajectoryPlot
                    title="المسار داخل الإطار"
                    series={pathSeries}
                    videoW={video?.videoWidth ?? 1920}
                    videoH={video?.videoHeight ?? 1080}
                />
            </div>

            <div>
                <Button onClick={() => setShowTable((v) => !v)} disabled={!shown.length}>
                    {showTable ? 'إخفاء الجدول' : 'عرض الجدول الرقمي'}
                </Button>
                {showTable && shown.length > 0 && <DataTable />}
            </div>

            {tracks.length > 8 && selectedTrackId === null && (
                <p className="text-[11px] text-white/50">
                    يُعرض أول ٨ مسارات فقط في الرسوم. اضغط على مسار في القائمة لعرضه وحده.
                </p>
            )}
        </div>
    );
}

function Headline({ label, value, unit, extra }: { label: string; value: string; unit: string; extra?: string }): React.ReactElement {
    return (
        <div>
            <div className="text-[11px] text-white/55">{label}</div>
            <div className="mt-0.5 text-2xl font-bold leading-tight">
                {value}
                <span className="ms-1 text-sm font-semibold text-white/60">{unit}</span>
            </div>
            {extra && <div className="text-[11px] text-white/45">{extra}</div>}
        </div>
    );
}

/**
 * The table view. Required for accessibility — everything the charts encode with
 * colour and position is readable here as text — and genuinely faster than a
 * chart when checking one specific frame.
 */
function DataTable(): React.ReactElement {
    const { kinematics, selectedTrackId, videoRef, timeScale } = useStudio();
    const series = selectedTrackId === null ? kinematics.slice(0, 1) : kinematics.filter((k) => k.trackId === selectedTrackId);
    const rows = series.flatMap((s) => s.samples.map((k) => ({ series: s, k })));
    // Long clips produce thousands of rows; sample them down to something a
    // person can actually scan.
    const stride = Math.max(1, Math.ceil(rows.length / 300));
    const shown = rows.filter((_, i) => i % stride === 0);
    const unit = series[0]?.calibrated ? 'م' : 'بكسل';

    return (
        <div className="mt-3 max-h-96 overflow-auto rounded-lg border border-white/10">
            <table className="w-full text-[11px] tabular-nums">
                <caption className="sr-only">قيم الحركة الرقمية للمسار المحدد</caption>
                <thead className="sticky top-0 bg-[#16202b] text-white/70">
                    <tr>
                        <th className="px-3 py-2 text-start font-semibold">المسار</th>
                        <th className="px-3 py-2 text-start font-semibold">الزمن (ث)</th>
                        <th className="px-3 py-2 text-start font-semibold">السرعة ({unit}/ث)</th>
                        <th className="px-3 py-2 text-start font-semibold">التسارع ({unit}/ث²)</th>
                        <th className="px-3 py-2 text-start font-semibold">المسافة ({unit})</th>
                        <th className="px-3 py-2 text-start font-semibold">الاتجاه (°)</th>
                    </tr>
                </thead>
                <tbody>
                    {shown.map(({ series: s, k }, i) => (
                        <tr
                            key={`${s.trackId}-${k.t}-${i}`}
                            className="cursor-pointer border-t border-white/5 hover:bg-white/8"
                            onClick={() => {
                                const video = videoRef.current;
                                if (video) video.currentTime = k.t * timeScale;
                            }}
                        >
                            <td className="px-3 py-1.5">
                                <span className="inline-flex items-center gap-1.5">
                                    <span className="size-2 rounded-full" style={{ background: s.color }} />
                                    {s.label}
                                </span>
                            </td>
                            <td className="px-3 py-1.5">{k.t.toFixed(3)}</td>
                            <td className="px-3 py-1.5">{k.speed.toFixed(3)}</td>
                            <td className="px-3 py-1.5">{k.accel.toFixed(3)}</td>
                            <td className="px-3 py-1.5">{k.distance.toFixed(3)}</td>
                            <td className="px-3 py-1.5">{k.heading.toFixed(1)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            {stride > 1 && (
                <p className="border-t border-white/10 px-3 py-2 text-[11px] text-white/45">
                    يُعرض صف واحد من كل {stride} لتسهيل القراءة. التصدير إلى CSV يحتوي كل الصفوف.
                </p>
            )}
        </div>
    );
}
