import type { Blob, DetectConfig } from './types';

/**
 * Connected-component labelling over the binary motion mask.
 *
 * Uses an explicit stack rather than recursion: a single large moving object in
 * a 480-wide buffer is easily 30k pixels, which would blow the JS call stack.
 * Neighbourhood is 8-connected so diagonal wisps of a moving limb stay part of
 * the same component.
 */

const NEIGHBOURS_X = [1, -1, 0, 0, 1, 1, -1, -1];
const NEIGHBOURS_Y = [0, 0, 1, -1, 1, -1, 1, -1];

export class BlobFinder {
    private visited = new Uint8Array(0);
    private stack = new Int32Array(0);

    /**
     * @param mask   Binary mask, 0 or 255, at processing resolution.
     * @param diff   Raw difference magnitudes, used to score blob strength.
     * @param scale  Multiplier converting processing pixels to video pixels.
     */
    find(
        mask: Uint8Array,
        diff: Uint8Array,
        w: number,
        h: number,
        scale: number,
        cfg: DetectConfig
    ): Blob[] {
        const n = w * h;
        if (this.visited.length !== n) {
            this.visited = new Uint8Array(n);
            this.stack = new Int32Array(n);
        }
        this.visited.fill(0);

        const frameArea = n;
        const minPixels = Math.max(4, Math.round((cfg.minAreaPct / 100) * frameArea));
        const maxPixels = Math.round((cfg.maxAreaPct / 100) * frameArea);
        const blobs: Blob[] = [];

        for (let start = 0; start < n; start++) {
            if (mask[start] === 0 || this.visited[start]) continue;

            let sp = 0;
            this.stack[sp++] = start;
            this.visited[start] = 1;

            let count = 0;
            let sumX = 0;
            let sumY = 0;
            let sumDiff = 0;
            let minX = w;
            let maxX = -1;
            let minY = h;
            let maxY = -1;

            while (sp > 0) {
                const idx = this.stack[--sp];
                const x = idx % w;
                const y = (idx / w) | 0;

                count++;
                sumX += x;
                sumY += y;
                sumDiff += diff[idx];
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;

                for (let k = 0; k < 8; k++) {
                    const nx = x + NEIGHBOURS_X[k];
                    const ny = y + NEIGHBOURS_Y[k];
                    if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
                    const ni = ny * w + nx;
                    if (mask[ni] === 0 || this.visited[ni]) continue;
                    this.visited[ni] = 1;
                    this.stack[sp++] = ni;
                }
            }

            if (count < minPixels || count > maxPixels) continue;

            blobs.push({
                bbox: {
                    x: minX * scale,
                    y: minY * scale,
                    w: (maxX - minX + 1) * scale,
                    h: (maxY - minY + 1) * scale
                },
                centroid: { x: (sumX / count) * scale, y: (sumY / count) * scale },
                area: count * scale * scale,
                intensity: sumDiff / count
            });
        }

        blobs.sort((a, b) => b.area - a.area);
        return blobs.length > cfg.maxBlobs ? blobs.slice(0, cfg.maxBlobs) : blobs;
    }
}
