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
 * The returned vector is the displacement of the *scene content* between the
 * two frames: content that was at (x, y) in the previous frame is at
 * (x + dx, y + dy) in the current one. A camera panning right yields a negative
 * dx, because the world slides left across the sensor.
 */

const BLOCK = 24;
const COLS = 7;
const ROWS = 5;

export class GlobalMotionEstimator {
    private dxs = new Float32Array(COLS * ROWS);
    private dys = new Float32Array(COLS * ROWS);
    private sorted = new Float32Array(COLS * ROWS);

    /** Last accepted estimate, used to seed the next search. */
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
        if (w < BLOCK * 2 || h < BLOCK * 2) return { dx: 0, dy: 0, confidence: 0 };

        const marginX = Math.max(range + 1, BLOCK);
        const marginY = Math.max(range + 1, BLOCK);
        const spanX = w - marginX * 2 - BLOCK;
        const spanY = h - marginY * 2 - BLOCK;
        if (spanX <= 0 || spanY <= 0) return { dx: 0, dy: 0, confidence: 0 };

        let n = 0;
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                const bx = marginX + Math.round((spanX * c) / (COLS - 1));
                const by = marginY + Math.round((spanY * r) / (ROWS - 1));
                // Flat blocks (sky, a white wall) match everywhere equally well
                // and would contribute a meaningless displacement. Skip them.
                if (blockVariance(cur, w, bx, by) < 24) continue;
                const m = matchBlock(prev, cur, w, h, bx, by, range, this.lastDx, this.lastDy);
                this.dxs[n] = m.dx;
                this.dys[n] = m.dy;
                n++;
            }
        }
        if (n < 4) return { dx: 0, dy: 0, confidence: 0 };

        const dx = median(this.dxs, n, this.sorted);
        const dy = median(this.dys, n, this.sorted);

        // Confidence = share of probes within one pixel of the consensus.
        let agree = 0;
        for (let i = 0; i < n; i++) {
            if (Math.abs(this.dxs[i] - dx) <= 1 && Math.abs(this.dys[i] - dy) <= 1) agree++;
        }
        const confidence = agree / n;

        // A low-confidence estimate usually means the scene itself changed (a
        // cut, a hand over the lens). Reporting zero is safer than reporting a
        // wrong shift, which would smear the difference image.
        if (confidence < 0.4) {
            this.lastDx = 0;
            this.lastDy = 0;
            return { dx: 0, dy: 0, confidence };
        }

        // `dx`/`dy` so far are *search offsets*: where in the previous frame the
        // current block was found, so cur(x) === prev(x + dx). The scene
        // displacement callers want is the opposite of that, so negate on the
        // way out and keep the raw offset for seeding the next search.
        this.lastDx = dx;
        this.lastDy = dy;
        return { dx: -dx, dy: -dy, confidence };
    }
}

function blockVariance(img: Uint8Array, w: number, bx: number, by: number): number {
    let sum = 0;
    let sumSq = 0;
    let n = 0;
    for (let y = by; y < by + BLOCK; y += 3) {
        const row = y * w;
        for (let x = bx; x < bx + BLOCK; x += 3) {
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
 * Search `prev` for the block that `cur` shows at (bx, by). Runs a coarse pass
 * at step 2 seeded from the previous frame's displacement, then refines by one
 * pixel — roughly a quarter of the cost of an exhaustive search at the same
 * accuracy.
 */
function matchBlock(
    prev: Uint8Array,
    cur: Uint8Array,
    w: number,
    h: number,
    bx: number,
    by: number,
    range: number,
    seedX: number,
    seedY: number
): { dx: number; dy: number } {
    let bestX = 0;
    let bestY = 0;
    let bestCost = Infinity;

    const seedCx = Math.max(-range, Math.min(range, Math.round(seedX)));
    const seedCy = Math.max(-range, Math.min(range, Math.round(seedY)));

    for (let oy = -range; oy <= range; oy += 2) {
        for (let ox = -range; ox <= range; ox += 2) {
            // Bias towards the previous displacement so a constant pan locks on
            // quickly and ties resolve in favour of continuity.
            const bias = (Math.abs(ox - seedCx) + Math.abs(oy - seedCy)) * 0.5;
            const cost = sad(prev, cur, w, h, bx, by, ox, oy, 3, bestCost) + bias;
            if (cost < bestCost) {
                bestCost = cost;
                bestX = ox;
                bestY = oy;
            }
        }
    }

    bestCost = Infinity;
    let refX = bestX;
    let refY = bestY;
    for (let oy = bestY - 1; oy <= bestY + 1; oy++) {
        for (let ox = bestX - 1; ox <= bestX + 1; ox++) {
            if (ox < -range || ox > range || oy < -range || oy > range) continue;
            const cost = sad(prev, cur, w, h, bx, by, ox, oy, 2, bestCost);
            if (cost < bestCost) {
                bestCost = cost;
                refX = ox;
                refY = oy;
            }
        }
    }
    return { dx: refX, dy: refY };
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
    step: number,
    cutoff: number
): number {
    let sum = 0;
    for (let y = by; y < by + BLOCK; y += step) {
        const py = y + oy;
        if (py < 0 || py >= h) return Infinity;
        const curRow = y * w;
        const prevRow = py * w;
        for (let x = bx; x < bx + BLOCK; x += step) {
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
