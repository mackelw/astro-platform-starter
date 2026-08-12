/**
 * Low-level image buffer helpers. Everything here works on single-channel
 * 8-bit greyscale planes and allocates nothing per call when given scratch
 * buffers — the analysis loop runs 30-60 times a second, so per-frame
 * allocation would keep the GC busy enough to drop frames.
 */

/**
 * Convert RGBA `ImageData` to a greyscale plane using ITU-R BT.601 luma
 * weights, matching what the camera's own exposure metering sees.
 */
export function toGray(src: ImageData, out: Uint8Array): Uint8Array {
    const data = src.data;
    for (let i = 0, p = 0; p < out.length; i += 4, p++) {
        out[p] = (data[i] * 77 + data[i + 1] * 151 + data[i + 2] * 28) >> 8;
    }
    return out;
}

/**
 * Separable box blur, run `passes` times. Three passes of a box blur is a very
 * close approximation of a Gaussian at a fraction of the cost, which is the
 * standard trick for real-time denoising before frame differencing.
 */
export function boxBlur(src: Uint8Array, w: number, h: number, radius: number, tmp: Uint8Array, passes = 2): Uint8Array {
    if (radius < 1) return src;
    let a = src;
    let b = tmp;
    for (let p = 0; p < passes; p++) {
        blurH(a, b, w, h, radius);
        blurV(b, a, w, h, radius);
    }
    return a;
}

function blurH(src: Uint8Array, dst: Uint8Array, w: number, h: number, r: number): void {
    const win = r * 2 + 1;
    for (let y = 0; y < h; y++) {
        const row = y * w;
        let sum = src[row] * (r + 1);
        for (let x = 1; x <= r; x++) sum += src[row + Math.min(x, w - 1)];
        for (let x = 0; x < w; x++) {
            dst[row + x] = (sum / win) | 0;
            sum += src[row + Math.min(x + r + 1, w - 1)] - src[row + Math.max(x - r, 0)];
        }
    }
}

function blurV(src: Uint8Array, dst: Uint8Array, w: number, h: number, r: number): void {
    const win = r * 2 + 1;
    for (let x = 0; x < w; x++) {
        let sum = src[x] * (r + 1);
        for (let y = 1; y <= r; y++) sum += src[Math.min(y, h - 1) * w + x];
        for (let y = 0; y < h; y++) {
            dst[y * w + x] = (sum / win) | 0;
            sum += src[Math.min(y + r + 1, h - 1) * w + x] - src[Math.max(y - r, 0) * w + x];
        }
    }
}

/**
 * Binary dilation with a square structuring element, done separably. Bridges
 * the gaps that frame differencing leaves inside uniformly-coloured moving
 * objects (a plain shirt only shows motion at its edges).
 */
export function dilate(mask: Uint8Array, w: number, h: number, radius: number, tmp: Uint8Array): Uint8Array {
    if (radius < 1) return mask;
    for (let y = 0; y < h; y++) {
        const row = y * w;
        for (let x = 0; x < w; x++) {
            let max = 0;
            const from = Math.max(0, x - radius);
            const to = Math.min(w - 1, x + radius);
            for (let i = from; i <= to && max === 0; i++) max = mask[row + i];
            tmp[row + x] = max;
        }
    }
    for (let x = 0; x < w; x++) {
        for (let y = 0; y < h; y++) {
            let max = 0;
            const from = Math.max(0, y - radius);
            const to = Math.min(h - 1, y + radius);
            for (let i = from; i <= to && max === 0; i++) max = tmp[i * w + x];
            mask[y * w + x] = max;
        }
    }
    return mask;
}

/** Nearest-neighbour sample with edge clamping. */
export function sampleClamped(src: Uint8Array, w: number, h: number, x: number, y: number): number {
    const cx = x < 0 ? 0 : x >= w ? w - 1 : x;
    const cy = y < 0 ? 0 : y >= h ? h - 1 : y;
    return src[cy * w + cx];
}

/** Same as `sampleClamped` but for the Float32 background model. */
export function sampleClampedF(src: Float32Array, w: number, h: number, x: number, y: number): number {
    const cx = x < 0 ? 0 : x >= w ? w - 1 : x;
    const cy = y < 0 ? 0 : y >= h ? h - 1 : y;
    return src[cy * w + cx];
}
