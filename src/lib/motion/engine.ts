import { BlobFinder } from './blobs';
import { MotionDetector, processingSize } from './detect';
import { MultiTracker } from './tracker';
import { TemplateTracker } from './template';
import type { DetectConfig, FrameResult, Rect, Track, TrackConfig } from './types';

/**
 * The analysis engine: one frame in, detections and trajectories out.
 *
 * Everything stateful about an analysis session lives here rather than in React
 * state — the loop runs up to 60 times a second and pushing per-frame results
 * through a component tree would spend more time reconciling than analysing.
 * The UI reads from this object and re-renders on its own schedule.
 */
export class MotionEngine {
    readonly detector = new MotionDetector();
    readonly blobs = new BlobFinder();
    readonly tracker = new MultiTracker();
    readonly template = new TemplateTracker();

    private canvas: HTMLCanvasElement | null = null;
    private ctx: CanvasRenderingContext2D | null = null;

    private videoW = 0;
    private videoH = 0;
    private procW = 0;
    private procH = 0;
    private lastT = -1;

    /** Track being driven by the template matcher, if any. */
    templateTrack: Track | null = null;
    /** Pending ROI, in video pixels, applied on the next analysed frame. */
    private pendingRoi: Rect | null = null;

    lastResult: FrameResult | null = null;

    /** Video pixels per processing pixel. */
    get scale(): number {
        return this.procW ? this.videoW / this.procW : 1;
    }

    get processingWidth(): number {
        return this.procW;
    }

    get processingHeight(): number {
        return this.procH;
    }

    /** Drop all history: tracks, background model, template lock. */
    resetAll(): void {
        this.detector.reset();
        this.tracker.reset();
        this.template.clear();
        this.templateTrack = null;
        this.pendingRoi = null;
        this.lastT = -1;
        this.lastResult = null;
    }

    /** Drop only per-frame history — used after a seek, keeps existing tracks. */
    resetTemporal(): void {
        this.detector.reset();
        this.lastT = -1;
    }

    /** Queue a region of interest (video pixels) for the template tracker. */
    selectRoi(rect: Rect): void {
        this.pendingRoi = rect;
    }

    clearRoi(): void {
        this.template.clear();
        this.templateTrack = null;
        this.pendingRoi = null;
    }

    private ensureCanvas(videoW: number, videoH: number, cfg: DetectConfig): boolean {
        const { w, h } = processingSize(videoW, videoH, cfg.processingWidth);
        if (!w || !h) return false;
        if (!this.canvas) {
            this.canvas = document.createElement('canvas');
            // `willReadFrequently` keeps the canvas backing store on the CPU;
            // without it every getImageData round-trips the GPU and the loop
            // collapses to single-digit frames per second.
            this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
        }
        if (this.procW !== w || this.procH !== h || this.videoW !== videoW || this.videoH !== videoH) {
            this.canvas.width = w;
            this.canvas.height = h;
            this.procW = w;
            this.procH = h;
            this.videoW = videoW;
            this.videoH = videoH;
            this.detector.resize(w, h);
            this.template.clear();
            this.templateTrack = null;
        }
        return this.ctx !== null;
    }

    /**
     * Analyse one frame.
     *
     * @param t Media timeline position in seconds.
     * @param autoDetect Run blob detection and the multi-object tracker.
     */
    analyze(
        video: HTMLVideoElement,
        t: number,
        cfg: DetectConfig,
        trackCfg: TrackConfig,
        autoDetect: boolean
    ): FrameResult | null {
        const videoW = video.videoWidth;
        const videoH = video.videoHeight;
        if (!videoW || !videoH) return null;
        if (!this.ensureCanvas(videoW, videoH, cfg)) return null;

        const ctx = this.ctx!;
        const started = performance.now();
        ctx.drawImage(video, 0, 0, this.procW, this.procH);
        const frame = ctx.getImageData(0, 0, this.procW, this.procH);

        const detection = this.detector.process(frame, cfg);
        const scale = this.scale;
        // Seeking backwards makes dt negative, which would produce nonsense
        // velocities; treat it as a fresh start instead.
        const dt = this.lastT >= 0 && t > this.lastT ? t - this.lastT : 0;
        this.lastT = t;

        const blobs =
            autoDetect && this.detector.primed
                ? this.blobs.find(detection.mask, this.detector.lastDiff, this.procW, this.procH, scale, cfg)
                : [];

        if (autoDetect && this.detector.primed) {
            this.tracker.update(blobs, t, trackCfg);
        }

        this.runTemplate(detection.gray, t, dt, trackCfg);

        const result: FrameResult = {
            t,
            procW: this.procW,
            procH: this.procH,
            mask: detection.mask,
            blobs,
            motionRatio: detection.motionRatio,
            camera: detection.camera,
            costMs: performance.now() - started
        };
        this.lastResult = result;
        return result;
    }

    private runTemplate(gray: Uint8Array, t: number, dt: number, trackCfg: TrackConfig): void {
        const scale = this.scale;

        if (this.pendingRoi) {
            const roi = this.pendingRoi;
            this.pendingRoi = null;
            const procRect: Rect = {
                x: roi.x / scale,
                y: roi.y / scale,
                w: roi.w / scale,
                h: roi.h / scale
            };
            if (this.template.init(gray, this.procW, this.procH, procRect)) {
                this.templateTrack = this.tracker.createManual(
                    roi.x + roi.w / 2,
                    roi.y + roi.h / 2,
                    roi.w,
                    roi.h,
                    t,
                    'ROI'
                );
            }
            return;
        }

        if (!this.template.ready || !this.templateTrack) return;

        // Widen the search when the object was lost so a re-acquisition has a
        // chance, and keep it tight while locked to stay fast and stable.
        const radius = this.template.lost ? 28 : Math.max(10, Math.round(this.procW / 30));
        const match = this.template.track(gray, this.procW, this.procH, dt || 1 / 30, radius);
        const box = this.template.box;
        if (match) {
            this.tracker.appendTo(
                this.templateTrack,
                match.x * scale,
                match.y * scale,
                box.w * scale,
                box.h * scale,
                t,
                match.score,
                trackCfg
            );
        } else {
            this.tracker.appendPredicted(
                this.templateTrack,
                (box.x + box.w / 2) * scale,
                (box.y + box.h / 2) * scale,
                box.w * scale,
                box.h * scale,
                t,
                trackCfg
            );
        }
    }

    /** ROI box in video pixels, for drawing. */
    templateBox(): Rect | null {
        if (!this.template.ready) return null;
        const b = this.template.box;
        const s = this.scale;
        return { x: b.x * s, y: b.y * s, w: b.w * s, h: b.h * s };
    }
}
