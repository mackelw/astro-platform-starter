import type { Calibration, KinematicSample, KinematicSeries, Point, Track } from './types';

export const DEFAULT_CALIBRATION: Calibration = {
    refLine: null,
    refLengthM: 1,
    captureFps: 60,
    timelineFps: 60
};

/** Video pixels per metre, or `null` when the scene has not been calibrated. */
export function pixelsPerMetre(cal: Calibration): number | null {
    if (!cal.refLine || !(cal.refLengthM > 0)) return null;
    const [a, b] = cal.refLine;
    const px = Math.hypot(b.x - a.x, b.y - a.y);
    if (px < 1) return null;
    return px / cal.refLengthM;
}

/**
 * How much faster the real world moved than the timeline suggests.
 *
 * A Pocket 3 slow-motion clip is captured at 120 fps and written into a 30 fps
 * container, so one timeline second contains a quarter of a real second and
 * every measured speed must be multiplied by 4. Normal clips capture and play
 * at the same rate, giving a factor of 1.
 */
export function realTimeScale(cal: Calibration): number {
    if (!(cal.captureFps > 0) || !(cal.timelineFps > 0)) return 1;
    return cal.captureFps / cal.timelineFps;
}

/**
 * Savitzky-Golay smoothing coefficients for a quadratic fit.
 *
 * A plain moving average would flatten the peaks that matter most — the top of
 * a sprint, the impact of a strike. A quadratic SG filter removes tracker
 * jitter while leaving those extrema where they are.
 */
function sgSmoothCoeffs(m: number): Float64Array {
    const c = new Float64Array(2 * m + 1);
    const norm = (2 * m + 3) * (2 * m + 1) * (2 * m - 1);
    for (let i = -m; i <= m; i++) {
        c[i + m] = (3 * (3 * m * m + 3 * m - 1 - 5 * i * i)) / norm;
    }
    return c;
}

/**
 * Savitzky-Golay smoothing with a window that shrinks near the ends.
 *
 * Clamping to the edge value — the usual shortcut — flattens the first and last
 * few samples towards a constant, which visibly shortens the measured path of
 * every track and drags its start and end speeds towards zero. Narrowing the
 * window symmetrically instead keeps the filter centred and unbiased; the ends
 * simply get less smoothing, which is the honest trade.
 */
function convolve(values: number[], coeffs: Float64Array): number[] {
    const m = (coeffs.length - 1) / 2;
    const n = values.length;
    const out = new Array<number>(n);
    const cache = new Map<number, Float64Array>([[m, coeffs]]);

    for (let i = 0; i < n; i++) {
        const half = Math.min(m, i, n - 1 - i);
        if (half < 1) {
            out[i] = values[i];
            continue;
        }
        let c = cache.get(half);
        if (!c) {
            c = sgSmoothCoeffs(half);
            cache.set(half, c);
        }
        let acc = 0;
        for (let k = -half; k <= half; k++) acc += values[i + k] * c[k + half];
        out[i] = acc;
    }
    return out;
}

/** Odd window size clamped to what the sample count can support. */
export function resolveWindow(requested: number, sampleCount: number): number {
    let w = Math.max(3, Math.round(requested) | 1);
    const maxW = Math.max(3, (Math.floor((sampleCount - 1) / 2) * 2 + 1) | 1);
    if (w > maxW) w = maxW;
    return w;
}

export interface KinematicsOptions {
    /** Smoothing window in samples. Larger = calmer curves, more lag on peaks. */
    smoothWindow: number;
    /** Drop predicted (coasted) samples before analysing. */
    dropPredicted: boolean;
}

export const DEFAULT_KINEMATICS_OPTIONS: KinematicsOptions = {
    smoothWindow: 7,
    dropPredicted: false
};

/**
 * Turn a raw trajectory into smoothed position, velocity, acceleration and
 * distance, in metres when the scene is calibrated and in video pixels when it
 * is not.
 */
export function computeKinematics(
    track: Track,
    cal: Calibration,
    opts: KinematicsOptions = DEFAULT_KINEMATICS_OPTIONS
): KinematicSeries {
    const raw = opts.dropPredicted ? track.samples.filter((s) => !s.predicted) : track.samples;
    const ppm = pixelsPerMetre(cal);
    const scale = ppm ? 1 / ppm : 1;
    const timeScale = realTimeScale(cal);

    const empty: KinematicSeries = {
        trackId: track.id,
        label: track.label,
        color: track.color,
        samples: [],
        calibrated: ppm !== null,
        maxSpeed: 0,
        meanSpeed: 0,
        totalDistance: 0,
        duration: 0
    };
    if (raw.length < 2) return empty;

    const xs = raw.map((s) => s.x);
    const ys = raw.map((s) => s.y);
    const ts = raw.map((s) => s.t);

    const m = (resolveWindow(opts.smoothWindow, raw.length) - 1) / 2;
    const smoothCoeffs = m >= 1 ? sgSmoothCoeffs(m) : null;
    const smoothX = smoothCoeffs ? convolve(xs, smoothCoeffs) : xs;
    const smoothY = smoothCoeffs ? convolve(ys, smoothCoeffs) : ys;

    // Real-world timestamps. Differentiating against these actual times — rather
    // than a nominal frame interval — is what keeps the numbers honest when
    // frames are unevenly spaced, which happens with dropped frames, variable
    // frame rate recordings and live webcam streams alike.
    const realT = ts.map((t) => t / timeScale);

    // Differentiate first, smooth second — and differentiate the *raw* track,
    // not the smoothed one. The smoothing filter works over sample indices, so
    // it only commutes with differentiation when frames are evenly spaced; doing
    // it the other way round biases every velocity on a variable-rate source.
    // On evenly spaced footage the two orders are identical, so nothing is lost.
    const rawVx = derivative(xs, realT).map((v) => v * scale);
    const rawVy = derivative(ys, realT).map((v) => v * scale);
    const vxs = smoothCoeffs ? convolve(rawVx, smoothCoeffs) : rawVx;
    const vys = smoothCoeffs ? convolve(rawVy, smoothCoeffs) : rawVy;

    const speeds = vxs.map((vx, i) => Math.hypot(vx, vys[i]));
    const rawAccel = derivative(speeds, realT);
    const accels = smoothCoeffs ? convolve(rawAccel, smoothCoeffs) : rawAccel;

    const samples: KinematicSample[] = [];
    let distance = 0;
    let maxSpeed = 0;
    let speedSum = 0;

    for (let i = 0; i < raw.length; i++) {
        if (i > 0) {
            distance += Math.hypot(smoothX[i] - smoothX[i - 1], smoothY[i] - smoothY[i - 1]) * scale;
        }
        const vx = vxs[i];
        const vy = vys[i];
        const speed = speeds[i];
        maxSpeed = Math.max(maxSpeed, speed);
        speedSum += speed;
        samples.push({
            // Absolute real-world time, not time-since-track-start, so several
            // tracks that began at different moments share one x axis.
            t: ts[i] / timeScale,
            x: smoothX[i],
            y: smoothY[i],
            vx,
            vy,
            speed,
            accel: accels[i],
            distance,
            // Screen y grows downward; negate so "up on screen" reads as a
            // positive angle the way a physics diagram would.
            heading: (Math.atan2(-vy, vx) * 180) / Math.PI
        });
    }

    return {
        trackId: track.id,
        label: track.label,
        color: track.color,
        samples,
        calibrated: ppm !== null,
        maxSpeed,
        meanSpeed: speedSum / raw.length,
        totalDistance: distance,
        duration: (ts[ts.length - 1] - ts[0]) / timeScale
    };
}

/**
 * Central-difference derivative against explicit timestamps.
 *
 * The ends fall back to a one-sided difference, and any zero-length interval
 * yields zero rather than infinity — duplicate timestamps should degrade a
 * single sample, never poison the series.
 */
function derivative(values: number[], times: number[]): number[] {
    const n = values.length;
    const out = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i++) {
        const lo = Math.max(0, i - 1);
        const hi = Math.min(n - 1, i + 1);
        const dt = times[hi] - times[lo];
        out[i] = dt > 1e-9 ? (values[hi] - values[lo]) / dt : 0;
    }
    return out;
}

/** Straight-line distance between two points, in metres when calibrated. */
export function measureDistance(a: Point, b: Point, cal: Calibration): { value: number; unit: 'm' | 'px' } {
    const px = Math.hypot(b.x - a.x, b.y - a.y);
    const ppm = pixelsPerMetre(cal);
    return ppm ? { value: px / ppm, unit: 'm' } : { value: px, unit: 'px' };
}

export function formatSpeed(mps: number, calibrated: boolean): string {
    if (!calibrated) return `${mps.toFixed(1)} px/s`;
    return `${mps.toFixed(2)} m/s · ${(mps * 3.6).toFixed(1)} km/h`;
}
