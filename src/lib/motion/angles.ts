import type { AngleMarker, Calibration, Point } from './types';
import { realTimeScale } from './kinematics';

/**
 * Joint-angle measurement.
 *
 * Three points make an angle: two segment ends and the vertex between them.
 * For gait or lifting work the vertex is the joint (knee, elbow, hip) and the
 * other two are the neighbouring landmarks.
 */

/** Interior angle at vertex `b`, in degrees, 0..180. */
export function angleAt(a: Point, b: Point, c: Point): number {
    const abx = a.x - b.x;
    const aby = a.y - b.y;
    const cbx = c.x - b.x;
    const cby = c.y - b.y;
    const dot = abx * cbx + aby * cby;
    const magA = Math.hypot(abx, aby);
    const magC = Math.hypot(cbx, cby);
    if (magA < 1e-6 || magC < 1e-6) return 0;
    const cos = Math.min(1, Math.max(-1, dot / (magA * magC)));
    return (Math.acos(cos) * 180) / Math.PI;
}

/**
 * Angle of segment a→b against the horizontal, in degrees.
 *
 * Useful on its own for trunk lean, shin angle or board tilt, where there is no
 * natural third landmark.
 */
export function segmentAngle(a: Point, b: Point): number {
    return (Math.atan2(-(b.y - a.y), b.x - a.x) * 180) / Math.PI;
}

export interface AngleSample {
    /** Real-world time, seconds, relative to the first marker. */
    t: number;
    /** Timeline position the marker was placed on. */
    mediaT: number;
    angle: number;
    /** Rate of change, degrees per real-world second. */
    angularVelocity: number;
}

export interface AngleSeries {
    label: string;
    color: string;
    samples: AngleSample[];
    min: number;
    max: number;
    /** Total travel of the joint, degrees. */
    range: number;
}

/**
 * Build a time series from every marker sharing a label, sorted by time.
 *
 * Markers are placed by hand on individual frames, so the series is usually
 * sparse — a dozen key frames through a lift rather than one per frame. Angular
 * velocity therefore uses the actual interval between neighbouring markers, not
 * a nominal frame time.
 */
export function buildAngleSeries(markers: AngleMarker[], label: string, cal: Calibration): AngleSeries | null {
    const group = markers.filter((m) => m.label === label).sort((a, b) => a.t - b.t);
    if (!group.length) return null;

    const timeScale = realTimeScale(cal);
    // Absolute real-world time so angle curves and speed curves share an axis.
    const raw = group.map((m) => ({
        mediaT: m.t,
        t: m.t / timeScale,
        angle: angleAt(m.a, m.b, m.c)
    }));

    const samples: AngleSample[] = raw.map((s, i) => {
        const prev = raw[Math.max(0, i - 1)];
        const next = raw[Math.min(raw.length - 1, i + 1)];
        const dt = next.t - prev.t;
        return {
            t: s.t,
            mediaT: s.mediaT,
            angle: s.angle,
            angularVelocity: dt > 1e-6 ? (next.angle - prev.angle) / dt : 0
        };
    });

    let min = Infinity;
    let max = -Infinity;
    for (const s of samples) {
        if (s.angle < min) min = s.angle;
        if (s.angle > max) max = s.angle;
    }

    return {
        label,
        color: group[0].color,
        samples,
        min,
        max,
        range: max - min
    };
}

/** Distinct labels present in the marker set, in insertion order. */
export function angleLabels(markers: AngleMarker[]): string[] {
    const seen: string[] = [];
    for (const m of markers) if (!seen.includes(m.label)) seen.push(m.label);
    return seen;
}
