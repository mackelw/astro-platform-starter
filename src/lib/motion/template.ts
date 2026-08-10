import type { Rect } from './types';

/**
 * Single-object template tracker driven by zero-mean normalised cross
 * correlation (ZNCC).
 *
 * This is the "I'll pick the object myself" path: the user drags a box around a
 * ball, a heel, a car, and the tracker follows that exact patch — including
 * while it is stationary, which frame differencing fundamentally cannot do.
 *
 * ZNCC rather than plain SSD because it is invariant to brightness offset and
 * contrast scaling. That matters outdoors, where the Pocket 3's auto-exposure
 * visibly re-meters as the subject moves between sun and shade.
 */

const MAX_TEMPLATE = 28;

export interface TemplateMatch {
    x: number;
    y: number;
    /** ZNCC score in -1..1. Above ~0.5 is a solid lock. */
    score: number;
}

export class TemplateTracker {
    /** Template patch, greyscale, at processing resolution. */
    private tpl: Float32Array | null = null;
    private tplW = 0;
    private tplH = 0;
    private tplMean = 0;
    private tplNorm = 0;

    /** Last known centre in processing pixels. */
    private cx = 0;
    private cy = 0;
    private vx = 0;
    private vy = 0;

    /** Box size in processing pixels, kept so results can be reported back. */
    boxW = 0;
    boxH = 0;

    lost = false;

    /**
     * @param rect Region of interest in processing-buffer pixels.
     */
    init(gray: Uint8Array, w: number, h: number, rect: Rect): boolean {
        const x0 = Math.max(0, Math.round(rect.x));
        const y0 = Math.max(0, Math.round(rect.y));
        const x1 = Math.min(w, Math.round(rect.x + rect.w));
        const y1 = Math.min(h, Math.round(rect.y + rect.h));
        const rw = x1 - x0;
        const rh = y1 - y0;
        if (rw < 4 || rh < 4) return false;

        // Subsample large selections: correlating a 200x200 patch every frame is
        // pointlessly expensive and no more accurate than a 28x28 one.
        const step = Math.max(1, Math.ceil(Math.max(rw, rh) / MAX_TEMPLATE));
        const tw = Math.floor(rw / step);
        const th = Math.floor(rh / step);
        if (tw < 3 || th < 3) return false;

        const tpl = new Float32Array(tw * th);
        let sum = 0;
        for (let ty = 0; ty < th; ty++) {
            for (let tx = 0; tx < tw; tx++) {
                const v = gray[(y0 + ty * step) * w + (x0 + tx * step)];
                tpl[ty * tw + tx] = v;
                sum += v;
            }
        }
        const mean = sum / tpl.length;
        let norm = 0;
        for (let i = 0; i < tpl.length; i++) {
            tpl[i] -= mean;
            norm += tpl[i] * tpl[i];
        }
        norm = Math.sqrt(norm);
        // A featureless patch (blank sky, a white wall) cannot be tracked; its
        // correlation surface is flat and the match position is arbitrary.
        if (norm < 1e-3) return false;

        this.tpl = tpl;
        this.tplW = tw;
        this.tplH = th;
        this.tplMean = mean;
        this.tplNorm = norm;
        this.boxW = rw;
        this.boxH = rh;
        this.cx = x0 + rw / 2;
        this.cy = y0 + rh / 2;
        this.vx = 0;
        this.vy = 0;
        this.lost = false;
        return true;
    }

    get ready(): boolean {
        return this.tpl !== null;
    }

    clear(): void {
        this.tpl = null;
        this.lost = false;
    }

    /**
     * Search around the predicted position for the best match.
     *
     * @param searchRadius Half-size of the search window in processing pixels.
     * @param minScore     Below this the frame counts as a miss.
     * @param adapt        Template update rate, 0 = frozen template.
     */
    track(
        gray: Uint8Array,
        w: number,
        h: number,
        dt: number,
        searchRadius = 16,
        minScore = 0.4,
        adapt = 0.08
    ): TemplateMatch | null {
        const tpl = this.tpl;
        if (!tpl) return null;

        const step = Math.max(1, Math.ceil(Math.max(this.boxW, this.boxH) / MAX_TEMPLATE));
        const predX = this.cx + this.vx * dt;
        const predY = this.cy + this.vy * dt;

        // Coarse pass at stride 2, then a stride-1 refinement around the winner.
        let best = this.search(gray, w, h, predX, predY, searchRadius, 2, step);
        const refined = this.search(gray, w, h, best.x, best.y, 2, 1, step);
        if (refined.score > best.score) best = refined;
        best = this.subPixel(gray, w, h, best, step);

        if (best.score < minScore) {
            this.lost = true;
            // Coast on the last velocity: a brief occlusion should not throw the
            // lock away, and the prediction keeps the search window on target.
            this.cx = predX;
            this.cy = predY;
            return null;
        }

        if (dt > 1e-4) {
            const a = 0.5;
            this.vx = this.vx * (1 - a) + ((best.x - this.cx) / dt) * a;
            this.vy = this.vy * (1 - a) + ((best.y - this.cy) / dt) * a;
        }
        this.cx = best.x;
        this.cy = best.y;
        this.lost = false;

        if (adapt > 0 && best.score > 0.7) this.adaptTemplate(gray, w, h, step, adapt);
        return best;
    }

    /**
     * Refine an integer match to sub-pixel accuracy.
     *
     * Whole-pixel matching quantises every position, and because the analysis
     * buffer is smaller than the video, one buffer pixel can be several video
     * pixels. Differentiating a staircase produces speed spikes that look like
     * real peaks. Fitting a parabola through the correlation score at the
     * winner and its two neighbours recovers the true peak between them —
     * the standard fix, and worth its small cost on every frame.
     */
    private subPixel(gray: Uint8Array, w: number, h: number, best: TemplateMatch, step: number): TemplateMatch {
        const x0 = Math.round(best.x);
        const y0 = Math.round(best.y);
        const sx0 = this.zncc(gray, w, h, x0 - 1, y0, step);
        const sx1 = this.zncc(gray, w, h, x0 + 1, y0, step);
        const sy0 = this.zncc(gray, w, h, x0, y0 - 1, step);
        const sy1 = this.zncc(gray, w, h, x0, y0 + 1, step);
        return {
            x: x0 + parabolicPeak(sx0, best.score, sx1),
            y: y0 + parabolicPeak(sy0, best.score, sy1),
            score: best.score
        };
    }

    private search(
        gray: Uint8Array,
        w: number,
        h: number,
        centreX: number,
        centreY: number,
        radius: number,
        stride: number,
        step: number
    ): TemplateMatch {
        let bestScore = -2;
        let bestX = centreX;
        let bestY = centreY;
        const cx0 = Math.round(centreX);
        const cy0 = Math.round(centreY);

        for (let oy = -radius; oy <= radius; oy += stride) {
            for (let ox = -radius; ox <= radius; ox += stride) {
                const score = this.zncc(gray, w, h, cx0 + ox, cy0 + oy, step);
                if (score > bestScore) {
                    bestScore = score;
                    bestX = cx0 + ox;
                    bestY = cy0 + oy;
                }
            }
        }
        return { x: bestX, y: bestY, score: bestScore };
    }

    private zncc(gray: Uint8Array, w: number, h: number, cx: number, cy: number, step: number): number {
        const tpl = this.tpl!;
        const tw = this.tplW;
        const th = this.tplH;
        const x0 = Math.round(cx - (tw * step) / 2);
        const y0 = Math.round(cy - (th * step) / 2);
        if (x0 < 0 || y0 < 0 || x0 + tw * step > w || y0 + th * step > h) return -2;

        let sum = 0;
        let sumSq = 0;
        let dot = 0;
        const n = tw * th;
        for (let ty = 0; ty < th; ty++) {
            const row = (y0 + ty * step) * w + x0;
            const trow = ty * tw;
            for (let tx = 0; tx < tw; tx++) {
                const v = gray[row + tx * step];
                sum += v;
                sumSq += v * v;
                dot += v * tpl[trow + tx];
            }
        }
        const mean = sum / n;
        // dot is against the already mean-subtracted template, so the window's
        // own mean drops out of the numerator automatically.
        const varSum = sumSq - n * mean * mean;
        if (varSum < 1e-6) return -2;
        return dot / (Math.sqrt(varSum) * this.tplNorm);
    }

    private adaptTemplate(gray: Uint8Array, w: number, h: number, step: number, rate: number): void {
        const tpl = this.tpl!;
        const tw = this.tplW;
        const th = this.tplH;
        const x0 = Math.round(this.cx - (tw * step) / 2);
        const y0 = Math.round(this.cy - (th * step) / 2);
        if (x0 < 0 || y0 < 0 || x0 + tw * step > w || y0 + th * step > h) return;

        let sum = 0;
        const patch = new Float32Array(tw * th);
        for (let ty = 0; ty < th; ty++) {
            const row = (y0 + ty * step) * w + x0;
            for (let tx = 0; tx < tw; tx++) {
                const v = gray[row + tx * step];
                patch[ty * tw + tx] = v;
                sum += v;
            }
        }
        const mean = sum / patch.length;
        let norm = 0;
        for (let i = 0; i < tpl.length; i++) {
            tpl[i] = tpl[i] * (1 - rate) + (patch[i] - mean) * rate;
            norm += tpl[i] * tpl[i];
        }
        this.tplMean = this.tplMean * (1 - rate) + mean * rate;
        this.tplNorm = Math.sqrt(norm) || this.tplNorm;
    }

    /** Current box in processing pixels. */
    get box(): Rect {
        return { x: this.cx - this.boxW / 2, y: this.cy - this.boxH / 2, w: this.boxW, h: this.boxH };
    }
}

/**
 * Offset of a parabola's vertex given three equally-spaced samples with the
 * peak in the middle. Returns 0 when the samples are invalid or the fit would
 * land outside the central pixel, which is where a parabola stops being a
 * trustworthy model of the correlation surface.
 */
function parabolicPeak(left: number, centre: number, right: number): number {
    if (left <= -1.5 || right <= -1.5) return 0;
    const denom = left - 2 * centre + right;
    if (Math.abs(denom) < 1e-9) return 0;
    const offset = (0.5 * (left - right)) / denom;
    return Math.abs(offset) <= 1 ? offset : 0;
}
