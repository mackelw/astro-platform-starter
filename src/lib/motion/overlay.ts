import type { AngleMarker, Calibration, FrameResult, Point, Rect, Track } from './types';
import { angleAt } from './angles';
import { pixelsPerMetre } from './kinematics';

/**
 * Draws the analysis layer over the video.
 *
 * All geometry arrives in video pixels and is scaled here, so the overlay stays
 * correct whether the video is shown at 320 px wide on a phone or full width on
 * a desktop, and whether the source is 1080p or 4K.
 */

export interface OverlayOptions {
    showMask: boolean;
    showBoxes: boolean;
    showTrails: boolean;
    showVectors: boolean;
    showLabels: boolean;
    showGrid: boolean;
    /** Seconds of trajectory history drawn behind each object. 0 = the whole track. */
    trailSeconds: number;
}

export const DEFAULT_OVERLAY_OPTIONS: OverlayOptions = {
    showMask: true,
    showBoxes: true,
    showTrails: true,
    showVectors: true,
    showLabels: true,
    showGrid: false,
    trailSeconds: 2
};

export interface OverlayState {
    videoW: number;
    videoH: number;
    result: FrameResult | null;
    tracks: Track[];
    selectedTrackId: number | null;
    templateBox: Rect | null;
    templateLost: boolean;
    calibration: Calibration;
    markers: AngleMarker[];
    /** Marker points placed so far for an in-progress angle. */
    pendingAngle: Point[];
    /** Rectangle being dragged right now, video pixels. */
    dragRect: Rect | null;
    /** Calibration line being dragged right now, video pixels. */
    dragLine: [Point, Point] | null;
    currentTime: number;
    options: OverlayOptions;
}

export class OverlayRenderer {
    private maskCanvas: HTMLCanvasElement | null = null;
    private maskCtx: CanvasRenderingContext2D | null = null;
    private maskImage: ImageData | null = null;

    render(ctx: CanvasRenderingContext2D, state: OverlayState): void {
        const { videoW, videoH } = state;
        const canvas = ctx.canvas;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (!videoW || !videoH) return;

        const scale = canvas.width / videoW;
        // Line widths are chosen in video pixels below, so undo the scale for
        // strokes to keep them a constant thickness on screen.
        const px = 1 / scale;
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        if (state.options.showMask && state.result) this.drawMask(ctx, state);
        if (state.options.showGrid) this.drawGrid(ctx, state, px);
        this.drawTracks(ctx, state, px);
        if (state.templateBox) this.drawTemplateBox(ctx, state, px);
        this.drawCalibration(ctx, state, px);
        this.drawMarkers(ctx, state, px);
        if (state.dragRect) this.drawDragRect(ctx, state.dragRect, px);
        if (state.dragLine) this.drawDragLine(ctx, state.dragLine, px);

        ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    private drawMask(ctx: CanvasRenderingContext2D, state: OverlayState): void {
        const result = state.result!;
        const { procW, procH, mask } = result;
        if (!this.maskCanvas) {
            this.maskCanvas = document.createElement('canvas');
            this.maskCtx = this.maskCanvas.getContext('2d');
        }
        if (this.maskCanvas.width !== procW || this.maskCanvas.height !== procH) {
            this.maskCanvas.width = procW;
            this.maskCanvas.height = procH;
            this.maskImage = this.maskCtx!.createImageData(procW, procH);
        }
        const img = this.maskImage!;
        const data = img.data;
        for (let i = 0, p = 0; p < mask.length; i += 4, p++) {
            if (mask[p]) {
                data[i] = 246;
                data[i + 1] = 114;
                data[i + 2] = 128;
                data[i + 3] = 110;
            } else {
                data[i + 3] = 0;
            }
        }
        this.maskCtx!.putImageData(img, 0, 0);
        // Nearest-neighbour keeps the mask honest: smoothing it would suggest
        // sub-pixel precision the detector does not have.
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(this.maskCanvas, 0, 0, state.videoW, state.videoH);
        ctx.imageSmoothingEnabled = true;
    }

    private drawGrid(ctx: CanvasRenderingContext2D, state: OverlayState, px: number): void {
        const { videoW, videoH } = state;
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.22)';
        ctx.lineWidth = px;
        for (let i = 1; i < 3; i++) {
            const x = (videoW * i) / 3;
            const y = (videoH * i) / 3;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, videoH);
            ctx.moveTo(0, y);
            ctx.lineTo(videoW, y);
            ctx.stroke();
        }

        // When calibrated, add a one-metre scale bar so distances are readable
        // straight off the frame.
        const ppm = pixelsPerMetre(state.calibration);
        if (ppm) {
            const barW = Math.min(ppm, videoW * 0.4);
            const y = videoH - videoH * 0.06;
            const x = videoW * 0.04;
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 3 * px;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + barW, y);
            ctx.moveTo(x, y - 6 * px);
            ctx.lineTo(x, y + 6 * px);
            ctx.moveTo(x + barW, y - 6 * px);
            ctx.lineTo(x + barW, y + 6 * px);
            ctx.stroke();
            this.label(ctx, `${(barW / ppm).toFixed(2)} m`, x, y - 10 * px, '#ffffff', px);
        }
        ctx.restore();
    }

    private drawTracks(ctx: CanvasRenderingContext2D, state: OverlayState, px: number): void {
        const { options, currentTime } = state;
        for (const track of state.tracks) {
            const selected = state.selectedTrackId === track.id;
            const alpha = state.selectedTrackId === null || selected ? 1 : 0.45;
            const samples = track.samples;
            if (!samples.length) continue;

            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = track.color;
            ctx.fillStyle = track.color;

            if (options.showTrails && samples.length > 1) {
                const cutoff = options.trailSeconds > 0 ? currentTime - options.trailSeconds : -Infinity;
                // Seek to the first sample inside the window instead of scanning
                // the whole history: this runs for every track on every animation
                // frame, and a long session's tracks hold thousands of samples.
                const from = options.trailSeconds > 0 ? lowerBound(samples, cutoff) : 0;
                ctx.lineWidth = (selected ? 3 : 2) * px;
                ctx.beginPath();
                let started = false;
                for (let i = from; i < samples.length; i++) {
                    const s = samples[i];
                    if (s.t > currentTime + 1e-6) break;
                    if (!started) {
                        ctx.moveTo(s.x, s.y);
                        started = true;
                    } else {
                        ctx.lineTo(s.x, s.y);
                    }
                }
                if (started) ctx.stroke();
            }

            // Draw the state at the current time, not the newest sample: when
            // the video is paused or scrubbed the overlay must match the frame
            // on screen.
            const cur = sampleAt(track, currentTime);
            if (cur) {
                if (options.showBoxes) {
                    ctx.lineWidth = (selected ? 3 : 2) * px;
                    ctx.setLineDash(cur.predicted ? [6 * px, 5 * px] : []);
                    ctx.strokeRect(cur.x - cur.w / 2, cur.y - cur.h / 2, cur.w, cur.h);
                    ctx.setLineDash([]);
                }
                ctx.beginPath();
                ctx.arc(cur.x, cur.y, 3.5 * px, 0, Math.PI * 2);
                ctx.fill();

                if (options.showVectors) {
                    const len = Math.hypot(track.vx, track.vy);
                    if (len > 4) {
                        // Scale the arrow to a quarter-second of travel: long
                        // enough to read direction, short enough not to cover
                        // the subject.
                        arrow(ctx, cur.x, cur.y, cur.x + track.vx * 0.25, cur.y + track.vy * 0.25, px, track.color);
                    }
                }
                if (options.showLabels) {
                    this.label(ctx, track.label, cur.x - cur.w / 2, cur.y - cur.h / 2 - 6 * px, track.color, px);
                }
            }
            ctx.restore();
        }
    }

    private drawTemplateBox(ctx: CanvasRenderingContext2D, state: OverlayState, px: number): void {
        const box = state.templateBox!;
        ctx.save();
        ctx.strokeStyle = state.templateLost ? '#fbbf24' : '#38bdf8';
        ctx.lineWidth = 2 * px;
        ctx.setLineDash(state.templateLost ? [8 * px, 6 * px] : []);
        ctx.strokeRect(box.x, box.y, box.w, box.h);
        ctx.setLineDash([]);
        // Corner ticks read as a "lock" indicator at a glance.
        const c = Math.min(box.w, box.h) * 0.22;
        ctx.lineWidth = 3 * px;
        const corners: [number, number, number, number][] = [
            [box.x, box.y + c, box.x, box.y],
            [box.x, box.y, box.x + c, box.y],
            [box.x + box.w - c, box.y, box.x + box.w, box.y],
            [box.x + box.w, box.y, box.x + box.w, box.y + c],
            [box.x + box.w, box.y + box.h - c, box.x + box.w, box.y + box.h],
            [box.x + box.w, box.y + box.h, box.x + box.w - c, box.y + box.h],
            [box.x + c, box.y + box.h, box.x, box.y + box.h],
            [box.x, box.y + box.h, box.x, box.y + box.h - c]
        ];
        ctx.beginPath();
        for (const [x1, y1, x2, y2] of corners) {
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
        }
        ctx.stroke();
        ctx.restore();
    }

    private drawCalibration(ctx: CanvasRenderingContext2D, state: OverlayState, px: number): void {
        const line = state.calibration.refLine;
        if (!line) return;
        const [a, b] = line;
        ctx.save();
        ctx.strokeStyle = '#4ade80';
        ctx.fillStyle = '#4ade80';
        ctx.lineWidth = 3 * px;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        for (const p of [a, b]) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 5 * px, 0, Math.PI * 2);
            ctx.fill();
        }
        this.label(
            ctx,
            `${state.calibration.refLengthM} m`,
            (a.x + b.x) / 2,
            (a.y + b.y) / 2 - 8 * px,
            '#4ade80',
            px
        );
        ctx.restore();
    }

    private drawMarkers(ctx: CanvasRenderingContext2D, state: OverlayState, px: number): void {
        // Angle markers belong to a specific frame; show the ones near the
        // current time so scrubbing reveals them in sequence.
        const tolerance = 0.06;
        for (const m of state.markers) {
            const near = Math.abs(m.t - state.currentTime) <= tolerance;
            ctx.save();
            ctx.globalAlpha = near ? 1 : 0.25;
            ctx.strokeStyle = m.color;
            ctx.fillStyle = m.color;
            ctx.lineWidth = 2.5 * px;
            ctx.beginPath();
            ctx.moveTo(m.a.x, m.a.y);
            ctx.lineTo(m.b.x, m.b.y);
            ctx.lineTo(m.c.x, m.c.y);
            ctx.stroke();

            const deg = angleAt(m.a, m.b, m.c);
            const r = Math.min(40, Math.hypot(m.a.x - m.b.x, m.a.y - m.b.y) * 0.45);
            const a1 = Math.atan2(m.a.y - m.b.y, m.a.x - m.b.x);
            const a2 = Math.atan2(m.c.y - m.b.y, m.c.x - m.b.x);
            ctx.beginPath();
            ctx.arc(m.b.x, m.b.y, r, a1, a2, angleSweepCounterClockwise(a1, a2));
            ctx.stroke();

            for (const p of [m.a, m.b, m.c]) {
                ctx.beginPath();
                ctx.arc(p.x, p.y, 4 * px, 0, Math.PI * 2);
                ctx.fill();
            }
            if (near) this.label(ctx, `${m.label} ${deg.toFixed(1)}°`, m.b.x + 10 * px, m.b.y - 10 * px, m.color, px);
            ctx.restore();
        }

        for (const p of state.pendingAngle) {
            ctx.save();
            ctx.fillStyle = '#fbbf24';
            ctx.beginPath();
            ctx.arc(p.x, p.y, 5 * px, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    private drawDragRect(ctx: CanvasRenderingContext2D, rect: Rect, px: number): void {
        ctx.save();
        ctx.strokeStyle = '#38bdf8';
        ctx.fillStyle = 'rgba(56,189,248,0.15)';
        ctx.lineWidth = 2 * px;
        ctx.setLineDash([6 * px, 4 * px]);
        ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
        ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
        ctx.restore();
    }

    private drawDragLine(ctx: CanvasRenderingContext2D, line: [Point, Point], px: number): void {
        ctx.save();
        ctx.strokeStyle = '#4ade80';
        ctx.lineWidth = 3 * px;
        ctx.setLineDash([8 * px, 5 * px]);
        ctx.beginPath();
        ctx.moveTo(line[0].x, line[0].y);
        ctx.lineTo(line[1].x, line[1].y);
        ctx.stroke();
        ctx.restore();
    }

    private label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, px: number): void {
        const size = 15 * px;
        ctx.save();
        ctx.font = `600 ${size}px ui-sans-serif, system-ui, sans-serif`;
        ctx.textBaseline = 'bottom';
        const w = ctx.measureText(text).width;
        ctx.fillStyle = 'rgba(16,24,40,0.72)';
        ctx.fillRect(x - 3 * px, y - size, w + 6 * px, size + 4 * px);
        ctx.fillStyle = color;
        ctx.fillText(text, x, y + 2 * px);
        ctx.restore();
    }
}

/** Index of the first sample at or after `t`. Samples are time-ordered. */
function lowerBound(samples: { t: number }[], t: number): number {
    let lo = 0;
    let hi = samples.length;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (samples[mid].t < t) lo = mid + 1;
        else hi = mid;
    }
    return lo;
}

/** The track's state at a given media time, interpolated between samples. */
export function sampleAt(track: Track, t: number): { x: number; y: number; w: number; h: number; predicted: boolean } | null {
    const s = track.samples;
    if (!s.length) return null;
    if (t <= s[0].t) return s[0];
    const last = s[s.length - 1];
    // Beyond the end of the track there is nothing to show — except for live
    // sources, where the newest sample is always "now".
    if (t >= last.t) return t - last.t < 0.5 ? last : null;

    let lo = 0;
    let hi = s.length - 1;
    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (s[mid].t <= t) lo = mid;
        else hi = mid;
    }
    const a = s[lo];
    const b = s[hi];
    const span = b.t - a.t;
    const f = span > 1e-6 ? (t - a.t) / span : 0;
    return {
        x: a.x + (b.x - a.x) * f,
        y: a.y + (b.y - a.y) * f,
        w: a.w + (b.w - a.w) * f,
        h: a.h + (b.h - a.h) * f,
        predicted: a.predicted || b.predicted
    };
}

function arrow(
    ctx: CanvasRenderingContext2D,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    px: number,
    color: string
): void {
    const head = 9 * px;
    const angle = Math.atan2(y2 - y1, x2 - x1);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2.5 * px;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - head * Math.cos(angle - 0.4), y2 - head * Math.sin(angle - 0.4));
    ctx.lineTo(x2 - head * Math.cos(angle + 0.4), y2 - head * Math.sin(angle + 0.4));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

/** Pick the arc direction that spans the interior (smaller) angle. */
function angleSweepCounterClockwise(a1: number, a2: number): boolean {
    let diff = a2 - a1;
    while (diff <= -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
    return diff < 0;
}
