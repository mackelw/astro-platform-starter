import { describe, expect, it } from 'vitest';
import { DEFAULT_DETECT_CONFIG, MotionDetector, isFrameUnstable, processingSize } from './detect';
import { BlobFinder } from './blobs';
import { DEFAULT_TRACK_CONFIG, MultiTracker } from './tracker';
import { TemplateTracker } from './template';
import { GlobalMotionEstimator } from './globalMotion';
import { DEFAULT_CALIBRATION, computeKinematics, pixelsPerMetre, realTimeScale } from './kinematics';
import { POCKET3_PRESETS, guessPreset } from './presets';
import { angleAt, segmentAngle } from './angles';
import { toGray } from './image';
import type { Calibration, Track } from './types';

/**
 * Ground-truth tests.
 *
 * Every case here renders synthetic frames whose true motion is known exactly,
 * runs them through the production code, and checks that the numbers coming out
 * match the numbers that went in. The alternative — asserting that the code does
 * what the code does — would not have caught the three defects these tests were
 * written to pin down: an inverted camera-motion vector, duplicate samples on
 * hand-selected tracks, and end-of-track flattening in the smoothing filter.
 */

const W = 640;
const H = 360;

/** RGBA frame with a textured background and a bright disc at (cx, cy). */
function renderFrame(cx: number, cy: number, r: number, bgShiftX = 0, bgShiftY = 0): ImageData {
    const data = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const i = (y * W + x) * 4;
            // Deterministic pseudo-texture: the global motion estimator needs
            // real features, and a flat field would make its answer arbitrary.
            const sx = x + bgShiftX;
            const sy = y + bgShiftY;
            const v = 60 + (Math.sin(sx * 0.11) + Math.cos(sy * 0.13) + Math.sin((sx + sy) * 0.07)) * 28;
            const inside = (x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r;
            const lum = inside ? 245 : v;
            data[i] = lum;
            data[i + 1] = lum;
            data[i + 2] = lum;
            data[i + 3] = 255;
        }
    }
    return { data, width: W, height: H, colorSpace: 'srgb' } as ImageData;
}

function grayOf(img: ImageData): Uint8Array {
    return toGray(img, new Uint8Array(W * H));
}

function emptyTrack(id: number, label: string): Track {
    return {
        id,
        label,
        color: '#000',
        source: 'auto',
        samples: [],
        missed: 0,
        hits: 0,
        vx: 0,
        vy: 0,
        active: true,
        startedAt: 0,
        updatedAt: 0
    };
}

function calibrationFor(pixelsPerMetreValue: number, captureFps: number, timelineFps = captureFps): Calibration {
    return {
        refLine: [
            { x: 0, y: 0 },
            { x: pixelsPerMetreValue, y: 0 }
        ],
        refLengthM: 1,
        captureFps,
        timelineFps
    };
}

describe('motion detection', () => {
    it('locates a moving object', () => {
        const cfg = { ...DEFAULT_DETECT_CONFIG, processingWidth: W, compensateCameraMotion: false, minAreaPct: 0.05 };
        const { w, h } = processingSize(W, H, cfg.processingWidth);
        const detector = new MotionDetector();
        detector.resize(w, h);
        const finder = new BlobFinder();

        let found: { x: number; y: number } | null = null;
        for (let f = 0; f < 6; f++) {
            const res = detector.process(renderFrame(100 + f * 20, 180, 24), cfg);
            if (f >= 2) {
                const blobs = finder.find(res.mask, detector.lastDiff, w, h, W / w, cfg);
                if (blobs.length) found = blobs[0].centroid;
            }
        }

        expect(found).not.toBeNull();
        // Differencing reports the union of "where it was" and "where it is", so
        // the centroid lands between the two positions.
        expect(found!.x).toBeGreaterThan(168);
        expect(found!.x).toBeLessThan(212);
        expect(found!.y).toBeCloseTo(180, -1);
    });

    it('cancels a whole-frame camera pan', () => {
        const cfg = { ...DEFAULT_DETECT_CONFIG, processingWidth: W, compensateCameraMotion: true, minAreaPct: 0.05 };
        const { w, h } = processingSize(W, H, cfg.processingWidth);

        const run = (compensate: boolean) => {
            const detector = new MotionDetector();
            detector.resize(w, h);
            let last = { ratio: 1, dx: 0 };
            for (let f = 0; f < 5; f++) {
                const res = detector.process(renderFrame(-999, -999, 1, f * 6, 0), { ...cfg, compensateCameraMotion: compensate });
                last = { ratio: res.motionRatio, dx: res.camera.dx };
            }
            return last;
        };

        const on = run(true);
        const off = run(false);
        // The background is sampled at x + shift, so visible content slides -6 px.
        expect(on.dx).toBeCloseTo(-6, 0);
        expect(on.ratio).toBeLessThan(0.05);
        expect(off.ratio).toBeGreaterThan(on.ratio * 4);
    });

    it('recovers a known global shift with high confidence', () => {
        const est = new GlobalMotionEstimator();
        const m = est.estimate(grayOf(renderFrame(-999, -999, 1)), grayOf(renderFrame(-999, -999, 1, 5, -3)), W, H, 12);
        expect(m.dx).toBeCloseTo(-5, 0);
        expect(m.dy).toBeCloseTo(3, 0);
        expect(m.confidence).toBeGreaterThan(0.8);
    });
});

describe('template tracker', () => {
    it('follows a moving object and holds a stationary one', () => {
        const tracker = new TemplateTracker();
        const gray = (cx: number) => grayOf(renderFrame(cx, 180, 22));

        expect(tracker.init(gray(120), W, H, { x: 96, y: 156, w: 48, h: 48 })).toBe(true);

        let last = { x: 0, y: 0, score: 0 };
        for (let f = 1; f <= 10; f++) {
            const m = tracker.track(gray(120 + f * 8), W, H, 1 / 30, 20, 0.4, 0);
            if (m) last = m;
        }
        expect(last.x).toBeCloseTo(200, 0);
        expect(last.y).toBeCloseTo(180, 0);

        // Frame differencing loses an object that stops. This must not.
        for (let f = 0; f < 5; f++) {
            const m = tracker.track(gray(200), W, H, 1 / 30, 20, 0.4, 0);
            if (m) last = m;
        }
        expect(last.x).toBeCloseTo(200, 0);
        expect(last.score).toBeGreaterThan(0.6);
    });

    it('rejects a featureless selection', () => {
        const flat = new Uint8Array(W * H).fill(128);
        expect(new TemplateTracker().init(flat, W, H, { x: 100, y: 100, w: 40, h: 40 })).toBe(false);
    });
});

describe('kinematics', () => {
    const fps = 60;
    const ppm = 100;
    const speed = 3;

    const constantSpeedTrack = () => {
        const track = emptyTrack(1, 'constant');
        for (let f = 0; f < 90; f++) {
            const t = f / fps;
            track.samples.push({ t, x: 100 + speed * ppm * t, y: 200, w: 40, h: 40, score: 1, predicted: false });
        }
        return track;
    };

    it('reproduces a known speed, distance and heading', () => {
        const cal = calibrationFor(ppm, fps);
        expect(pixelsPerMetre(cal)).toBeCloseTo(ppm, 6);

        const k = computeKinematics(constantSpeedTrack(), cal, { smoothWindow: 7, dropPredicted: false });
        const mid = k.samples[45];
        expect(mid.speed).toBeCloseTo(speed, 2);
        expect(mid.accel).toBeCloseTo(0, 1);
        expect(mid.heading).toBeCloseTo(0, 1);
        expect(k.totalDistance).toBeCloseTo((speed * 89) / fps, 1);
    });

    it('corrects slow-motion footage to real-world speed', () => {
        // 120 fps of capture written into a 30 fps file: one timeline second
        // holds a quarter of a real second, so speeds are 4x what they look.
        const slow = calibrationFor(ppm, 120, 30);
        expect(realTimeScale(slow)).toBe(4);
        const k = computeKinematics(constantSpeedTrack(), slow, { smoothWindow: 7, dropPredicted: false });
        expect(k.samples[45].speed).toBeCloseTo(speed * 4, 1);
    });

    it('measures the acceleration of a falling object', () => {
        const g = 9.81;
        const scalePpm = 50;
        const track = emptyTrack(2, 'fall');
        for (let f = 0; f < 60; f++) {
            const t = f / fps;
            track.samples.push({ t, x: 300, y: 20 + 0.5 * g * t * t * scalePpm, w: 20, h: 20, score: 1, predicted: false });
        }
        const k = computeKinematics(track, calibrationFor(scalePpm, fps), { smoothWindow: 9, dropPredicted: false });
        const mid = k.samples[30];
        expect(mid.speed).toBeCloseTo(g * (30 / fps), 1);
        expect(mid.accel).toBeCloseTo(g, 0);
    });

    it('holds up when frames are unevenly spaced', () => {
        // Live streams and variable-frame-rate files do not deliver a constant
        // interval; the maths must key off timestamps, not a nominal frame time.
        const track = emptyTrack(3, 'jittery');
        let t = 0;
        for (let f = 0; f < 80; f++) {
            t += f % 3 === 0 ? 0.05 : 0.0167;
            track.samples.push({ t, x: 100 + speed * ppm * t, y: 200, w: 30, h: 30, score: 1, predicted: false });
        }
        const k = computeKinematics(track, calibrationFor(ppm, fps), { smoothWindow: 7, dropPredicted: false });
        expect(k.samples[40].speed).toBeCloseTo(speed, 1);
    });

    it('does not flatten the ends of a track', () => {
        // Edge-clamped smoothing used to drag the first and last samples toward
        // a constant, shortening every measured path.
        const k = computeKinematics(constantSpeedTrack(), calibrationFor(ppm, fps), { smoothWindow: 11, dropPredicted: false });
        expect(k.samples[0].speed).toBeCloseTo(speed, 1);
        expect(k.samples[k.samples.length - 1].speed).toBeCloseTo(speed, 1);
    });

    it('reports pixels when the scene is not calibrated', () => {
        const cal: Calibration = { refLine: null, refLengthM: 1, captureFps: fps, timelineFps: fps };
        const k = computeKinematics(constantSpeedTrack(), cal, { smoothWindow: 7, dropPredicted: false });
        expect(k.calibrated).toBe(false);
        expect(k.samples[45].speed).toBeCloseTo(speed * ppm, 0);
    });
});

describe('multi-object tracker', () => {
    it('keeps two crossing objects apart', () => {
        const cfg = { ...DEFAULT_DETECT_CONFIG, processingWidth: W, compensateCameraMotion: false, minAreaPct: 0.05 };
        const { w, h } = processingSize(W, H, cfg.processingWidth);
        const detector = new MotionDetector();
        detector.resize(w, h);
        const finder = new BlobFinder();
        const tracker = new MultiTracker();

        for (let f = 0; f < 30; f++) {
            const data = new Uint8ClampedArray(W * H * 4);
            const ax = 80 + f * 12;
            const bx = 560 - f * 12;
            for (let y = 0; y < H; y++) {
                for (let x = 0; x < W; x++) {
                    const i = (y * W + x) * 4;
                    const inA = (x - ax) ** 2 + (y - 110) ** 2 <= 400;
                    const inB = (x - bx) ** 2 + (y - 260) ** 2 <= 400;
                    data[i] = data[i + 1] = data[i + 2] = inA || inB ? 245 : 50;
                    data[i + 3] = 255;
                }
            }
            const res = detector.process({ data, width: W, height: H, colorSpace: 'srgb' } as ImageData, cfg);
            if (f >= 2) {
                tracker.update(finder.find(res.mask, detector.lastDiff, w, h, W / w, cfg), f / 30, DEFAULT_TRACK_CONFIG);
            }
        }

        const visible = tracker.visible(DEFAULT_TRACK_CONFIG).sort((a, b) => a.samples[0].y - b.samples[0].y);
        expect(visible).toHaveLength(2);
        expect(visible[0].samples.at(-1)!.x).toBeGreaterThan(visible[0].samples[0].x);
        expect(visible[1].samples.at(-1)!.x).toBeLessThan(visible[1].samples[0].x);
        expect(visible[0].hits).toBeGreaterThan(20);
        expect(visible[1].hits).toBeGreaterThan(20);
    });

    it('leaves hand-selected tracks to their own measurement source', () => {
        // The auto tracker used to coast template-driven tracks, giving them two
        // samples per frame — one predicted, one measured, at the same instant —
        // which halved every speed computed from them.
        const tracker = new MultiTracker();
        const roi = tracker.createManual(100, 100, 40, 40, 0, 'ROI');
        tracker.update([], 0.1, DEFAULT_TRACK_CONFIG);
        tracker.update([], 0.2, DEFAULT_TRACK_CONFIG);
        expect(roi.samples).toHaveLength(1);
        expect(roi.missed).toBe(0);
    });

    it('never records two samples at one instant', () => {
        const tracker = new MultiTracker();
        const roi = tracker.createManual(100, 100, 40, 40, 1, 'ROI');
        tracker.appendPredicted(roi, 105, 100, 40, 40, 1, DEFAULT_TRACK_CONFIG);
        tracker.appendTo(roi, 110, 100, 40, 40, 1, 0.9, DEFAULT_TRACK_CONFIG);
        expect(roi.samples).toHaveLength(1);
        // The measurement wins over the coasted estimate it collided with.
        expect(roi.samples[0].predicted).toBe(false);
    });
});

describe('frame stability gate', () => {
    const cfg = { ...DEFAULT_DETECT_CONFIG, stabilityGate: true, unstableAbovePct: 32 };
    const settled = { dx: -4, dy: 0, confidence: 0.9, clipped: false };

    it('rejects a frame where most of the picture moved', () => {
        expect(isFrameUnstable(0.5, settled, cfg)).toBe(true);
    });

    it('rejects a modest-area frame whose estimate was pinned to the search edge', () => {
        // The case a threshold on area alone cannot see: a whip pan across
        // scattered objects lights up little of the frame yet is pure camera
        // motion. Saturating the search window is what betrays it.
        expect(isFrameUnstable(0.12, { dx: -80, dy: 0, confidence: 0.95, clipped: true }, cfg)).toBe(true);
    });

    it('rejects a modest-area frame whose probes disagreed', () => {
        expect(isFrameUnstable(0.12, { dx: -4, dy: 0, confidence: 0.2, clipped: false }, cfg)).toBe(true);
    });

    it('accepts a settled frame with a genuinely moving subject', () => {
        // A person crossing a static shot: real motion, trustworthy estimate.
        expect(isFrameUnstable(0.12, settled, cfg)).toBe(false);
    });

    it('accepts a settled frame with barely any motion', () => {
        expect(isFrameUnstable(0.01, settled, cfg)).toBe(false);
    });

    it('judges on area alone when compensation is switched off', () => {
        // With no compensation running there is no estimate to distrust, so the
        // confidence signal must not be read as instability.
        const off = { ...cfg, compensateCameraMotion: false };
        expect(isFrameUnstable(0.12, { dx: 0, dy: 0, confidence: 0, clipped: false }, off)).toBe(false);
        expect(isFrameUnstable(0.5, { dx: 0, dy: 0, confidence: 0, clipped: false }, off)).toBe(true);
    });

    it('never rejects anything when the gate is disabled', () => {
        const disabled = { ...cfg, stabilityGate: false };
        expect(isFrameUnstable(0.99, { dx: 0, dy: 0, confidence: 0, clipped: true }, disabled)).toBe(false);
    });
});

describe('angles', () => {
    it('measures the interior angle at the vertex', () => {
        expect(angleAt({ x: 0, y: 10 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(90, 6);
        expect(angleAt({ x: -5, y: 0 }, { x: 0, y: 0 }, { x: 5, y: 0 })).toBeCloseTo(180, 6);
        expect(angleAt({ x: 10, y: 0 }, { x: 0, y: 0 }, { x: 10, y: -10 })).toBeCloseTo(45, 6);
    });

    it('treats up-on-screen as a positive segment angle', () => {
        expect(segmentAngle({ x: 0, y: 10 }, { x: 10, y: 0 })).toBeCloseTo(45, 6);
    });
});

describe('recording-mode identification', () => {
    it('reads an ordinary clip as real time, never as slow motion', () => {
        // The defect this pins down: with no real-time preset at a given rate,
        // an ordinary clip matched a slow-motion one and every reported speed
        // came out four times too high, silently.
        for (const fps of [24, 25, 30, 48, 50, 60]) {
            for (const [w, h] of [
                [1920, 1080],
                [3840, 2160],
                [2720, 1530]
            ]) {
                const guess = guessPreset(w, h, fps);
                expect(guess, `${w}x${h} @ ${fps}`).not.toBeNull();
                expect(guess!.captureFps, `${w}x${h} @ ${fps}`).toBe(guess!.timelineFps);
                expect(realTimeScale({ ...DEFAULT_CALIBRATION, ...guess! }), `${w}x${h} @ ${fps}`).toBe(1);
            }
        }
    });

    it('offers the slow-motion modes for explicit selection', () => {
        const slowMo = POCKET3_PRESETS.filter((p) => p.captureFps !== p.timelineFps && p.id !== 'custom');
        expect(slowMo.length).toBeGreaterThan(0);
        for (const p of slowMo) expect(p.captureFps / p.timelineFps).toBe(4);
    });

    it('declines to guess when the resolution is not a Pocket 3 mode', () => {
        expect(guessPreset(1280, 720, 30)).toBeNull();
    });
});

describe('a moving camera', () => {
    /**
     * A scene of scattered objects on a plain background, slid wholesale as a
     * camera pan would slide it.
     *
     * Scattered rather than continuous on purpose. A smooth texture differences
     * into one frame-filling region that the maximum-area filter discards, so it
     * cannot reproduce the failure at all. A room full of separate objects
     * differences into dozens of small regions — one per object edge — and those
     * are what became dozens of spurious tracks.
     */
    const pannedFrame = (shift: number): ImageData => {
        const data = new Uint8ClampedArray(W * H * 4);
        // Faint wall texture: enough variance for the block matcher to lock
        // onto, but shifting it stays under the detection threshold — the way a
        // real wall behaves against a strongly-lit object.
        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                const i = (y * W + x) * 4;
                const sx = x - shift;
                const v = 70 + (Math.sin(sx * 0.21) + Math.cos(y * 0.17)) * 4.5;
                data[i] = data[i + 1] = data[i + 2] = v;
                data[i + 3] = 255;
            }
        }

        // Aperiodic object placement. A regular lattice makes the block
        // matcher lock onto a shifted copy of itself whenever the displacement
        // approaches a multiple of the spacing, which is an artefact of the
        // test scene and not something a real room does.
        let seed = 20260812;
        const rand = () => {
            seed = (seed * 1103515245 + 12345) & 0x7fffffff;
            return seed / 0x7fffffff;
        };
        for (let n = 0; n < 60; n++) {
            const size = 7 + Math.floor(rand() * 12);
            const cx = Math.floor(rand() * (W - size)) - shift;
            const cy = Math.floor(rand() * (H - size));
            const bright = 170 + Math.floor(rand() * 80);
            for (let y = cy; y < cy + size; y++) {
                if (y < 0 || y >= H) continue;
                for (let x = cx; x < cx + size; x++) {
                    if (x < 0 || x >= W) continue;
                    const i = (y * W + x) * 4;
                    data[i] = data[i + 1] = data[i + 2] = bright;
                }
            }
        }
        return { data, width: W, height: H, colorSpace: 'srgb' } as ImageData;
    };

    const pan = (perFrame: number, cfg: Partial<typeof DEFAULT_DETECT_CONFIG> = {}) => {
        const config = { ...DEFAULT_DETECT_CONFIG, processingWidth: W, minAreaPct: 0.05, ...cfg };
        const { w, h } = processingSize(W, H, config.processingWidth);
        const detector = new MotionDetector();
        detector.resize(w, h);
        const finder = new BlobFinder();
        const tracker = new MultiTracker();
        let ratio = 1;

        for (let f = 0; f < 8; f++) {
            const res = detector.process(pannedFrame(f * perFrame), config);
            ratio = res.motionRatio;
            const unstable = isFrameUnstable(res.motionRatio, res.camera, config);
            if (f >= 2 && !unstable) {
                tracker.update(finder.find(res.mask, detector.lastDiff, w, h, 1, config), f / 30, DEFAULT_TRACK_CONFIG);
            }
        }
        // `visible` applies the minimum-hits filter; `created` counts every
        // trajectory the detector started. A pan fast enough that objects never
        // overlap between frames creates many tracks that each die before being
        // shown, so counting only the visible ones would understate the mess.
        return { ratio, tracks: tracker.visible(DEFAULT_TRACK_CONFIG).length, created: tracker.all().length };
    };

    it('cancels a fast pan that a narrow search would miss', () => {
        // 30 px per frame is far beyond the search range the estimator used to
        // use, so the estimate collapsed to zero and the whole frame read as
        // motion. This is the everyday case: a hand-held or gimbal pan.
        const fast = pan(30);
        expect(fast.ratio).toBeLessThan(0.02);
        expect(fast.created).toBeLessThanOrEqual(1);
    });

    it('still cancels a slow pan', () => {
        expect(pan(4).ratio).toBeLessThan(0.02);
    });

    it('cancels a diagonal pan', () => {
        expect(pan(18).ratio).toBeLessThan(0.02);
    });

});
