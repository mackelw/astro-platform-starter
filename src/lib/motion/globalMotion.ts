import type { GlobalMotion } from './types';

/**
 * Whole-frame translation estimator.
 *
 * The Pocket 3's gimbal pans on its own — ActiveTrack keeps the subject centred
 * by rotating the camera, and any handheld walk-and-shoot adds drift. Without
 * compensation a plain frame difference lights up every edge in the scene and
 * the real subject disappears into the noise.
 *
 * The estimator matches a sparse grid of probe blocks between two frames using
 * sum-of-absolute-differences, then takes the *median* displacement. The median
 * is the important part: as long as most of the frame is background, moving
 * subjects land in the tails and never drag the estimate with them.
 *
 * The search runs coarse-to-fine over a two-level pyramid. Searching a wide
 * range directly costs the square of that range, which is why a single-level
 * search has to stay narrow — and a narrow search silently fails exactly when
 * it matters most, during the fast pan that displaces the scene furthest. Half
 * the resolution covers twice the distance for a quarter of the work, so the
 * coarse level finds the ballpark and the fine level sharpens it.
 *
 * The returned vector is the displacement of the *scene content* between the
 * two frames: content that was at (x, y) in the previous frame is at
 * (x + dx, y + dy) in the current one. A camera panning right yields a negative
 * dx, because the world slides left across the sensor.
 */

const COLS = 7;
const ROWS = 5;
const COARSE_BLOCK = 16;
const FINE_BLOCK = 24;

export class GlobalMotionEstimator {
    private dxs = new Float32Array(COLS * ROWS);
    private dys = new Float32Array(COLS * ROWS);
    private sorted = new Float32Array(COLS * ROWS);

    private prevHalf = new Uint8Array(0);
    private curHalf = new Uint8Array(0);

    /** Last accepted search offset, used to seed the next frame's coarse pass. */
    private lastDx = 0;
    private lastDy = 0;

    reset(): void {
        this.lastDx = 0;
        this.lastDy = 0;
    }

    /**
     * @param range Maximum displacement searched, in processing pixels.
     */
    estimate(prev: Uint8Array, cur: Uint8Array, w: number, h: number, range = 12): GlobalMotion {
        const fail = { dx: 0, dy: 0, confidence: 0, clipped: true };
        const halfW = w >> 1;
        const halfH = h >> 1;
        const canPyramid = halfW >= COARSE_BLOCK * 3 && halfH >= COARSE_BLOCK * 3;

        let seedX = this.lastDx;
        let seedY = this.lastDy;
        let coarseConfidence = 1;

        if (canPyramid) {
            const n = halfW * halfH;
            if (this.prevHalf.length !== n) {
                this.prevHalf = new Uint8Array(n);
                this.curHalf = new Uint8Array(n);
            }
            downsample2(prev, w, h, this.prevHalf);
            downsample2(cur, w, h, this.curHalf);

            const coarse = this.matchLevel(
                this.prevHalf,
                this.curHalf,
                halfW,
                halfH,
                COARSE_BLOCK,
                Math.round(this.lastDx / 2),
                Math.round(this.lastDy / 2),
                Math.max(4, Math.ceil(range / 2)),
                2
            );
            if (coarse) {
                seedX = coarse.dx * 2;
                seedY = coarse.dy * 2;
                coarseConfidence = coarse.confidence;
            }
        }

        // Refine around the coarse result. A tight radius is enough here: the
        // coarse pass has already located the displacement to within a pixel or
        // two at this level.
        const fine = this.matchLevel(prev, cur, w, h, FINE_BLOCK, seedX, seedY, canPyramid ? 3 : range, canPyramid ? 1 : 2);
        if (!fine) return fail;

        // Saturating the search window means the true displacement is very
        // likely outside it, so the answer is a floor value rather than a
        // measurement — even when every probe block agreed on it.
        const clipped = Math.abs(fine.dx) >= range - 1 || Math.abs(fine.dy) >= range - 1;

        const confidence = Math.min(fine.confidence, coarseConfidence);

        // A low-confidence estimate usually means the scene itself changed (a
        // cut, a hand over the lens, motion beyond the search range). Reporting
        // zero is safer than reporting a wrong shift, which would smear the
        // difference image instead of cleaning it.
        if (confidence < 0.4) {
            this.lastDx = 0;
            this.lastDy = 0;
            return { dx: 0, dy: 0, confidence, clipped };
        }

        this.lastDx = fine.dx;
        this.lastDy = fine.dy;
        return { dx: -fine.dx, dy: -fine.dy, confidence, clipped };
    }

    /**
     * Median block displacement at one pyramid level, searched in a window
     * centred on (centreX, centreY).
     */
    private matchLevel(
        prev: Uint8Array,
        cur: Uint8Array,
        w: number,
        h: number,
        block: number,
        centreX: number,
        centreY: number,
        radius: number,
        step: number
    ): { dx: number; dy: number; confidence: number } | null {
        const reach = radius + Math.max(Math.abs(centreX), Math.abs(centreY));
        const margin = Math.max(reach + 1, block);
        const spanX = w - margin * 2 - block;
        const spanY = h - margin * 2 - block;
        if (spanX <= 0 || spanY <= 0) return null;

        let n = 0;
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                const bx = margin + Math.round((spanX * c) / (COLS - 1));
                const by = margin + Math.round((spanY * r) / (ROWS - 1));
                // Flat blocks (sky, a white wall) match everywhere equally well
                // and would contribute a meaningless displacement. Skip them.
                if (blockVariance(cur, w, bx, by, block) < 24) continue;
                const m = matchBlock(prev, cur, w, h, bx, by, block, centreX, centreY, radius, step);
                this.dxs[n] = m.dx;
                this.dys[n] = m.dy;
                n++;
            }
        }
        if (n < 4) return null;

        const dx = median(this.dxs, n, this.sorted);
        const dy = median(this.dys, n, this.sorted);

        // Confidence = share of probes within one pixel of the consensus.
        let agree = 0;
        for (let i = 0; i < n; i++) {
            if (Math.abs(this.dxs[i] - dx) <= 1 && Math.abs(this.dys[i] - dy) <= 1) agree++;
        }
        return { dx, dy, confidence: agree / n };
    }
}

/** Box-average downsample by two. */
function downsample2(src: Uint8Array, w: number, h: number, dst: Uint8Array): void {
    const dw = w >> 1;
    const dh = h >> 1;
    for (let y = 0; y < dh; y++) {
        const s0 = y * 2 * w;
        const s1 = s0 + w;
        const d = y * dw;
        for (let x = 0; x < dw; x++) {
            const x2 = x * 2;
            dst[d + x] = (src[s0 + x2] + src[s0 + x2 + 1] + src[s1 + x2] + src[s1 + x2 + 1]) >> 2;
        }
    }
}

function blockVariance(img: Uint8Array, w: number, bx: number, by: number, block: number): number {
    let sum = 0;
    let sumSq = 0;
    let n = 0;
    for (let y = by; y < by + block; y += 3) {
        const row = y * w;
        for (let x = bx; x < bx + block; x += 3) {
            const v = img[row + x];
            sum += v;
            sumSq += v * v;
            n++;
        }
    }
    const mean = sum / n;
    return sumSq / n - mean * mean;
}

/**
 * Search `prev` for the block that `cur` shows at (bx, by), scanning a window
 * centred on the seed displacement, then refining by one pixel.
 */
function matchBlock(
    prev: Uint8Array,
    cur: Uint8Array,
    w: number,
    h: number,
    bx: number,
    by: number,
    block: number,
    centreX: number,
    centreY: number,
    radius: number,
    step: number
): { dx: number; dy: number } {
    let bestX = centreX;
    let bestY = centreY;
    let bestCost = Infinity;

    for (let oy = centreY - radius; oy <= centreY + radius; oy += step) {
        for (let ox = centreX - radius; ox <= centreX + radius; ox += step) {
            // Bias towards the seed so a steady pan locks on quickly and ties
            // resolve in favour of continuity.
            const bias = (Math.abs(ox - centreX) + Math.abs(oy - centreY)) * 0.5;
            const cost = sad(prev, cur, w, h, bx, by, ox, oy, block, 3, bestCost) + bias;
            if (cost < bestCost) {
                bestCost = cost;
                bestX = ox;
                bestY = oy;
            }
        }
    }

    if (step > 1) {
        bestCost = Infinity;
        let refX = bestX;
        let refY = bestY;
        for (let oy = bestY - 1; oy <= bestY + 1; oy++) {
            for (let ox = bestX - 1; ox <= bestX + 1; ox++) {
                const cost = sad(prev, cur, w, h, bx, by, ox, oy, block, 2, bestCost);
                if (cost < bestCost) {
                    bestCost = cost;
                    refX = ox;
                    refY = oy;
                }
            }
        }
        bestX = refX;
        bestY = refY;
    }

    return { dx: bestX, dy: bestY };
}

function sad(
    prev: Uint8Array,
    cur: Uint8Array,
    w: number,
    h: number,
    bx: number,
    by: number,
    ox: number,
    oy: number,
    block: number,
    sampleStep: number,
    cutoff: number
): number {
    let sum = 0;
    for (let y = by; y < by + block; y += sampleStep) {
        const py = y + oy;
        if (py < 0 || py >= h) return Infinity;
        const curRow = y * w;
        const prevRow = py * w;
        for (let x = bx; x < bx + block; x += sampleStep) {
            const px = x + ox;
            if (px < 0 || px >= w) return Infinity;
            const d = cur[curRow + x] - prev[prevRow + px];
            sum += d < 0 ? -d : d;
        }
        // Early exit once this candidate can no longer win.
        if (sum >= cutoff) return sum;
    }
    return sum;
}

function median(values: Float32Array, n: number, scratch: Float32Array): number {
    for (let i = 0; i < n; i++) scratch[i] = values[i];
    const view = scratch.subarray(0, n);
    view.sort();
    const mid = n >> 1;
    return n % 2 ? view[mid] : (view[mid - 1] + view[mid]) / 2;
}
