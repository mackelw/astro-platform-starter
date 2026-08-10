import React, { useMemo, useRef, useState } from 'react';

/**
 * Inline SVG time-series chart.
 *
 * Deliberately hand-rolled: the studio needs three small, identical-looking
 * charts on a dark surface, and a plotting library would cost more bytes than
 * the whole analysis engine.
 *
 * Conventions held throughout: one y-axis per chart (never a second scale),
 * 2px lines, hairline recessive grid, a legend whenever there are two or more
 * series, and a crosshair tooltip so exact values never need a printed label on
 * every point.
 */

export const CHART_SURFACE = '#16202b';
const TEXT_PRIMARY = '#e8edf2';
const TEXT_SECONDARY = '#9fb0c0';
const GRID = '#2a3846';

export interface ChartPoint {
    x: number;
    y: number;
}

export interface ChartSeries {
    id: string | number;
    label: string;
    color: string;
    points: ChartPoint[];
}

interface LineChartProps {
    title: string;
    subtitle?: string;
    series: ChartSeries[];
    xLabel: string;
    yLabel: string;
    height?: number;
    formatY?: (v: number) => string;
    formatX?: (v: number) => string;
    /** Draw a horizontal rule at this y value, e.g. zero for acceleration. */
    zeroLine?: boolean;
    /** Media time (in chart x units) of the frame on screen. */
    marker?: number | null;
    emptyMessage?: string;
}

export function LineChart({
    title,
    subtitle,
    series,
    xLabel,
    yLabel,
    height = 190,
    formatY = (v) => formatNumber(v),
    formatX = (v) => `${v.toFixed(1)}`,
    zeroLine = false,
    marker = null,
    emptyMessage = 'لا توجد بيانات بعد.'
}: LineChartProps): React.ReactElement {
    const svgRef = useRef<SVGSVGElement | null>(null);
    const [hoverX, setHoverX] = useState<number | null>(null);

    const W = 640;
    const H = height;
    const pad = { top: 12, right: 16, bottom: 30, left: 52 };

    const withData = series.filter((s) => s.points.length > 1);

    const domain = useMemo(() => {
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        for (const s of withData) {
            for (const p of s.points) {
                if (p.x < minX) minX = p.x;
                if (p.x > maxX) maxX = p.x;
                if (p.y < minY) minY = p.y;
                if (p.y > maxY) maxY = p.y;
            }
        }
        if (!Number.isFinite(minX)) return null;
        if (maxX - minX < 1e-9) maxX = minX + 1;
        if (zeroLine) {
            minY = Math.min(minY, 0);
            maxY = Math.max(maxY, 0);
        }
        if (maxY - minY < 1e-9) {
            maxY = minY + 1;
            minY -= 1;
        }
        // A touch of headroom keeps peaks off the frame edge.
        const padY = (maxY - minY) * 0.08;
        return { minX, maxX, minY: minY - padY, maxY: maxY + padY };
    }, [withData, zeroLine]);

    if (!domain || !withData.length) {
        return (
            <figure className="rounded-lg border border-white/10 p-4" style={{ background: CHART_SURFACE }}>
                <ChartHeading title={title} subtitle={subtitle} />
                <div className="flex h-28 items-center justify-center text-xs text-white/40">{emptyMessage}</div>
            </figure>
        );
    }

    const sx = (x: number) => pad.left + ((x - domain.minX) / (domain.maxX - domain.minX)) * (W - pad.left - pad.right);
    const sy = (y: number) => H - pad.bottom - ((y - domain.minY) / (domain.maxY - domain.minY)) * (H - pad.top - pad.bottom);

    const yTicks = niceTicks(domain.minY, domain.maxY, 4);
    const xTicks = niceTicks(domain.minX, domain.maxX, 5);

    const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
        const svg = svgRef.current;
        if (!svg) return;
        const rect = svg.getBoundingClientRect();
        const px = ((e.clientX - rect.left) / rect.width) * W;
        if (px < pad.left || px > W - pad.right) {
            setHoverX(null);
            return;
        }
        setHoverX(domain.minX + ((px - pad.left) / (W - pad.left - pad.right)) * (domain.maxX - domain.minX));
    };

    const hoverPoints =
        hoverX === null
            ? []
            : withData
                  .map((s) => ({ series: s, point: nearestPoint(s.points, hoverX) }))
                  .filter((h): h is { series: ChartSeries; point: ChartPoint } => h.point !== null);

    const tooltipLeft = hoverX !== null ? (sx(hoverX) / W) * 100 : 0;
    const flip = tooltipLeft > 60;

    return (
        <figure className="relative rounded-lg border border-white/10 p-4" style={{ background: CHART_SURFACE }}>
            <ChartHeading title={title} subtitle={subtitle} />

            {withData.length > 1 && (
                <ul className="mb-2 flex flex-wrap gap-x-3 gap-y-1">
                    {withData.map((s) => (
                        <li key={s.id} className="flex items-center gap-1.5 text-[11px]" style={{ color: TEXT_SECONDARY }}>
                            <span className="inline-block h-0.5 w-4 rounded-full" style={{ background: s.color }} />
                            {s.label}
                        </li>
                    ))}
                </ul>
            )}

            <svg
                ref={svgRef}
                viewBox={`0 0 ${W} ${H}`}
                className="w-full touch-none"
                style={{ height }}
                onPointerMove={onMove}
                onPointerLeave={() => setHoverX(null)}
                role="img"
                aria-label={`${title}. ${xLabel} مقابل ${yLabel}`}
            >
                {yTicks.map((t) => (
                    <g key={`y${t}`}>
                        <line x1={pad.left} x2={W - pad.right} y1={sy(t)} y2={sy(t)} stroke={GRID} strokeWidth={1} />
                        <text
                            x={pad.left - 8}
                            y={sy(t)}
                            textAnchor="end"
                            dominantBaseline="middle"
                            fontSize={10}
                            fill={TEXT_SECONDARY}
                            style={{ fontVariantNumeric: 'tabular-nums' }}
                        >
                            {formatY(t)}
                        </text>
                    </g>
                ))}
                {xTicks.map((t) => (
                    <text
                        key={`x${t}`}
                        x={sx(t)}
                        y={H - pad.bottom + 14}
                        textAnchor="middle"
                        fontSize={10}
                        fill={TEXT_SECONDARY}
                        style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                        {formatX(t)}
                    </text>
                ))}

                {zeroLine && domain.minY < 0 && domain.maxY > 0 && (
                    <line x1={pad.left} x2={W - pad.right} y1={sy(0)} y2={sy(0)} stroke={TEXT_SECONDARY} strokeWidth={1} />
                )}

                {marker !== null && marker >= domain.minX && marker <= domain.maxX && (
                    <line
                        x1={sx(marker)}
                        x2={sx(marker)}
                        y1={pad.top}
                        y2={H - pad.bottom}
                        stroke={TEXT_PRIMARY}
                        strokeWidth={1}
                        strokeOpacity={0.45}
                    />
                )}

                {withData.map((s) => (
                    <path
                        key={s.id}
                        d={buildPath(s.points, sx, sy)}
                        fill="none"
                        stroke={s.color}
                        strokeWidth={2}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                    />
                ))}

                {hoverX !== null && (
                    <line
                        x1={sx(hoverX)}
                        x2={sx(hoverX)}
                        y1={pad.top}
                        y2={H - pad.bottom}
                        stroke={TEXT_PRIMARY}
                        strokeWidth={1}
                        strokeOpacity={0.7}
                    />
                )}
                {hoverPoints.map((h) => (
                    <circle
                        key={h.series.id}
                        cx={sx(h.point.x)}
                        cy={sy(h.point.y)}
                        r={4}
                        fill={h.series.color}
                        stroke={CHART_SURFACE}
                        strokeWidth={2}
                    />
                ))}

                <text x={W - pad.right} y={H - 4} textAnchor="end" fontSize={10} fill={TEXT_SECONDARY}>
                    {xLabel}
                </text>
                <text x={pad.left - 44} y={pad.top + 2} fontSize={10} fill={TEXT_SECONDARY} dominantBaseline="hanging">
                    {yLabel}
                </text>
            </svg>

            {hoverPoints.length > 0 && (
                <div
                    className="pointer-events-none absolute top-14 z-10 min-w-32 rounded border border-white/15 px-2.5 py-2 text-[11px] shadow-lg"
                    style={{
                        background: '#0e1720',
                        color: TEXT_PRIMARY,
                        insetInlineStart: flip ? undefined : `calc(${tooltipLeft}% + 8px)`,
                        insetInlineEnd: flip ? `calc(${100 - tooltipLeft}% + 8px)` : undefined
                    }}
                >
                    <div style={{ color: TEXT_SECONDARY }}>
                        {xLabel}: <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatX(hoverPoints[0].point.x)}</span>
                    </div>
                    {hoverPoints.map((h) => (
                        <div key={h.series.id} className="mt-1 flex items-center gap-1.5">
                            <span className="inline-block size-2 shrink-0 rounded-full" style={{ background: h.series.color }} />
                            <span style={{ color: TEXT_SECONDARY }}>{h.series.label}</span>
                            <span className="ms-auto font-semibold" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                {formatY(h.point.y)}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </figure>
    );
}

function ChartHeading({ title, subtitle }: { title: string; subtitle?: string }): React.ReactElement {
    return (
        <figcaption className="mb-2">
            <h4 className="text-xs font-bold" style={{ color: TEXT_PRIMARY }}>
                {title}
            </h4>
            {subtitle && (
                <p className="text-[11px]" style={{ color: TEXT_SECONDARY }}>
                    {subtitle}
                </p>
            )}
        </figcaption>
    );
}

/**
 * Spatial view of a trajectory — the path the object took through the frame,
 * not a time series. Drawn in image coordinates so it lines up with what the
 * video showed, with the y axis flipped the way the image is.
 */
export function TrajectoryPlot({
    series,
    videoW,
    videoH,
    title
}: {
    series: ChartSeries[];
    videoW: number;
    videoH: number;
    title: string;
}): React.ReactElement {
    const withData = series.filter((s) => s.points.length > 1);
    if (!videoW || !videoH || !withData.length) {
        return (
            <figure className="rounded-lg border border-white/10 p-4" style={{ background: CHART_SURFACE }}>
                <ChartHeading title={title} />
                <div className="flex h-28 items-center justify-center text-xs text-white/40">لا توجد مسارات بعد.</div>
            </figure>
        );
    }
    return (
        <figure className="rounded-lg border border-white/10 p-4" style={{ background: CHART_SURFACE }}>
            <ChartHeading title={title} subtitle="مسار الجسم داخل إطار الصورة" />
            <svg viewBox={`0 0 ${videoW} ${videoH}`} className="w-full rounded border border-white/10 bg-black/40">
                {withData.map((s) => {
                    const first = s.points[0];
                    const last = s.points[s.points.length - 1];
                    const r = Math.max(4, videoW / 160);
                    return (
                        <g key={s.id}>
                            <path
                                d={buildPath(s.points, (x) => x, (y) => y)}
                                fill="none"
                                stroke={s.color}
                                strokeWidth={Math.max(2, videoW / 400)}
                                strokeLinejoin="round"
                                strokeLinecap="round"
                            />
                            <circle cx={first.x} cy={first.y} r={r} fill={CHART_SURFACE} stroke={s.color} strokeWidth={r / 2} />
                            <circle cx={last.x} cy={last.y} r={r} fill={s.color} stroke={CHART_SURFACE} strokeWidth={r / 2} />
                        </g>
                    );
                })}
            </svg>
            <p className="mt-2 text-[11px]" style={{ color: TEXT_SECONDARY }}>
                الدائرة المفرغة = البداية، الممتلئة = النهاية.
            </p>
        </figure>
    );
}

function buildPath(points: ChartPoint[], sx: (v: number) => number, sy: (v: number) => number): string {
    let d = '';
    for (let i = 0; i < points.length; i++) {
        d += `${i === 0 ? 'M' : 'L'}${sx(points[i].x).toFixed(2)} ${sy(points[i].y).toFixed(2)}`;
    }
    return d;
}

function nearestPoint(points: ChartPoint[], x: number): ChartPoint | null {
    if (!points.length) return null;
    let lo = 0;
    let hi = points.length - 1;
    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (points[mid].x <= x) lo = mid;
        else hi = mid;
    }
    return Math.abs(points[lo].x - x) <= Math.abs(points[hi].x - x) ? points[lo] : points[hi];
}

/** Axis ticks on round numbers rather than wherever the data happens to end. */
function niceTicks(min: number, max: number, count: number): number[] {
    const span = max - min;
    if (span <= 0) return [min];
    const raw = span / count;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
    const ticks: number[] = [];
    for (let t = Math.ceil(min / step) * step; t <= max + 1e-9; t += step) ticks.push(Number(t.toFixed(10)));
    return ticks;
}

export function formatNumber(v: number): string {
    const abs = Math.abs(v);
    if (abs >= 1000) return v.toFixed(0);
    if (abs >= 100) return v.toFixed(1);
    if (abs >= 1) return v.toFixed(2);
    return v.toFixed(3);
}
