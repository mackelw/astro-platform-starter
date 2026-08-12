import { boxBlur, dilate, sampleClamped, sampleClampedF, toGray } from './image';
import { GlobalMotionEstimator } from './globalMotion';
import type { DetectConfig, GlobalMotion } from './types';

export const DEFAULT_DETECT_CONFIG: DetectConfig = {
    processingWidth: 480,
    threshold: 22,
    blurRadius: 2,
    dilate: 3,
    minAreaPct: 0.08,
    maxAreaPct: 60,
    backgroundMode: 'adjacent',
    learningRate: 0.05,
    compensateCameraMotion: true,
    maxBlobs: 24,
    stabilityGate: true,
    unstableAbovePct: 32
};

export interface DetectResult {
    mask: Uint8Array;
    gray: Uint8Array;
    w: number;
    h: number;
    motionRatio: number;
    camera: GlobalMotion;
    /** Mean absolute difference over the whole frame — a cheap "how busy is this shot" signal. */
    meanDiff: number;
}

/**
 * Frame-difference motion detector with two background strategies.
 *
 * `adjacent` differences consecutive frames: instant response, no ghosting when
 * the camera or lighting changes, but an object that stops moving disappears.
 * `running` differences against an exponentially-averaged background: it holds
 * on to slow movers and objects that pause, at the cost of needing a settling
 * period and of leaving a trail behind fast objects.
 *
 * Both paths share camera-motion compensation, which resamples the reference
 * frame by the estimated gimbal shift before subtracting.
 */
export class MotionDetector {
    private w = 0;
    private h = 0;
    private gray!: Uint8Array;
    private grayTmp!: Uint8Array;
    private prev!: Uint8Array;
    private mask!: Uint8Array;
    private maskTmp!: Uint8Array;
    private diff!: Uint8Array;
    private background!: Float32Array;
    private hasPrev = false;
    private backgroundReady = false;
    private motion = new GlobalMotionEstimator();

    /** Allocate (or reallocate) the working buffers for a given analysis size. */
    resize(w: number, h: number): void {
        if (this.w === w && this.h === h) return;
        this.w = w;
        this.h = h;
        const n = w * h;
        this.gray = new Uint8Array(n);
        this.grayTmp = new Uint8Array(n);
        this.prev = new Uint8Array(n);
        this.mask = new Uint8Array(n);
        this.maskTmp = new Uint8Array(n);
        this.diff = new Uint8Array(n);
        this.background = new Float32Array(n);
        this.hasPrev = false;
        this.backgroundReady = false;
        this.motion.reset();
    }

    /** Forget all history. Call after a seek, a source change or a config change. */
    reset(): void {
        this.hasPrev = false;
        this.backgroundReady = false;
        this.motion.reset();
    }

    get width(): number {
        return this.w;
    }

    get height(): number {
        return this.h;
    }

    /** True once there is enough history for the results to mean anything. */
    get primed(): boolean {
        return this.hasPrev;
    }

    process(frame: ImageData, cfg: DetectConfig): DetectResult {
        const { w, h } = this;
        const n = w * h;

        toGray(frame, this.gray);
        // `boxBlur` may return either buffer depending on the pass count, so use
        // whichever it hands back rather than assuming.
        const cur = boxBlur(this.gray, w, h, cfg.blurRadius, this.grayTmp);

        const camera: GlobalMotion =
            cfg.compensateCameraMotion && this.hasPrev
                ? this.motion.estimate(this.prev, cur, w, h, Math.max(12, Math.round(w / 8)))
                : { dx: 0, dy: 0, confidence: 0, clipped: false };

        const mask = this.mask;
        const diff = this.diff;
        let moving = 0;
        let diffSum = 0;

        if (!this.hasPrev) {
            mask.fill(0);
            diff.fill(0);
            this.background.set(cur);
            this.backgroundReady = true;
            this.prev.set(cur);
            this.hasPrev = true;
            return { mask, gray: cur, w, h, motionRatio: 0, camera, meanDiff: 0 };
        }

        const dx = Math.round(camera.dx);
        const dy = Math.round(camera.dy);
        const threshold = cfg.threshold;

        if (cfg.backgroundMode === 'adjacent') {
            const prev = this.prev;
            for (let y = 0; y < h; y++) {
                const row = y * w;
                const sy = y - dy;
                for (let x = 0; x < w; x++) {
                    // The camera moved the world by (dx, dy) between frames, so
                    // the pixel that is at x now was at x-dx before.
                    const ref = dx === 0 && dy === 0 ? prev[row + x] : sampleClamped(prev, w, h, x - dx, sy);
                    let d = cur[row + x] - ref;
                    if (d < 0) d = -d;
                    diff[row + x] = d;
                    diffSum += d;
                    if (d > threshold) {
                        mask[row + x] = 255;
                        moving++;
                    } else {
                        mask[row + x] = 0;
                    }
                }
            }
        } else {
            const bg = this.background;
            const alpha = cfg.learningRate;
            const inv = 1 - alpha;
            for (let y = 0; y < h; y++) {
                const row = y * w;
                const sy = y - dy;
                for (let x = 0; x < w; x++) {
                    const i = row + x;
                    const ref = dx === 0 && dy === 0 ? bg[i] : sampleClampedF(bg, w, h, x - dx, sy);
                    const v = cur[i];
                    let d = v - ref;
                    if (d < 0) d = -d;
                    diff[i] = d > 255 ? 255 : d;
                    diffSum += diff[i];
                    if (d > threshold) {
                        mask[i] = 255;
                        moving++;
                        // Adapt slowly inside moving regions so an object that
                        // lingers does not burn itself into the background.
                        bg[i] = ref * (1 - alpha * 0.15) + v * alpha * 0.15;
                    } else {
                        mask[i] = 0;
                        bg[i] = ref * inv + v * alpha;
                    }
                }
            }
        }

        if (cfg.dilate > 0) dilate(mask, w, h, cfg.dilate, this.maskTmp);

        this.prev.set(cur);
        return {
            mask,
            gray: cur,
            w,
            h,
            motionRatio: moving / n,
            camera,
            meanDiff: diffSum / n
        };
    }

    /** Difference magnitudes from the last `process` call, for blob intensity. */
    get lastDiff(): Uint8Array {
        return this.diff;
    }
}

/**
 * Whether a frame is too unsettled to detect on.
 *
 * Named and exported rather than inlined at the call site so the policy has one
 * definition. A duplicate of this rule living in a test would pass while the
 * engine did something else entirely, which is the failure mode that hides a
 * regression rather than catching it.
 *
 * Two signals, because the obvious one is not enough alone: a whip pan across a
 * room of separate objects lights up only a modest fraction of the frame, well
 * under any sane area threshold, while being pure camera motion. What gives it
 * away is the estimator failing — either the probe blocks disagreed, or they
 * agreed on a displacement pinned to the edge of the search window, which means
 * the real one lies beyond it. With compensation switched off there is no
 * estimate to judge and the area signal stands alone.
 */
export function isFrameUnstable(motionRatio: number, camera: GlobalMotion, cfg: DetectConfig): boolean {
    if (!cfg.stabilityGate) return false;
    if (motionRatio > cfg.unstableAbovePct / 100) return true;
    const compensationLost = cfg.compensateCameraMotion && (camera.confidence < 0.5 || camera.clipped);
    return compensationLost && motionRatio > 0.06;
}

/** Analysis buffer size for a given video, honouring the configured width. */
export function processingSize(videoW: number, videoH: number, targetW: number): { w: number; h: number } {
    if (!videoW || !videoH) return { w: 0, h: 0 };
    const w = Math.max(80, Math.min(targetW, videoW));
    const h = Math.max(45, Math.round((w * videoH) / videoW));
    return { w, h };
}
