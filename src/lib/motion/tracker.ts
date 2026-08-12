import type { Blob, Track, TrackConfig, TrackSample } from './types';

/** Upper bound on retained trajectories, so a long live session stays bounded. */
const MAX_TRACKS = 240;

export const DEFAULT_TRACK_CONFIG: TrackConfig = {
    gateFactor: 1.6,
    maxMissed: 12,
    minHits: 3,
    maxSamples: 6000
};

/**
 * Categorical palette, in fixed slot order.
 *
 * Validated for the dark chart surface used by the studio: every adjacent pair
 * clears the colour-vision-deficiency separation threshold (worst pair ΔE 8.4
 * under protanopia) and every slot clears 3:1 contrast against the surface. The
 * *order* is the safety mechanism — assign slots in sequence and never cycle a
 * ninth series into a made-up hue.
 *
 * The same colours identify a track everywhere it appears: its box on the
 * video, its line in the charts, its row in the table.
 */
export const TRACK_COLORS = [
    '#3987e5', // blue
    '#d95926', // orange
    '#199e70', // aqua
    '#c98500', // yellow
    '#d55181', // magenta
    '#008300', // green
    '#9085e9', // violet
    '#e66767' // red
];

/**
 * Multi-object tracker: turns per-frame blobs into persistent, identified
 * trajectories.
 *
 * Association is greedy nearest-neighbour on a cost built from predicted
 * position and box overlap, gated by object size. Greedy rather than Hungarian
 * because with the handful of blobs a real clip produces the two agree almost
 * always, and greedy costs nothing.
 *
 * Between measurements each track coasts on a constant-velocity prediction, so
 * an object that passes behind a pole keeps its identity when it re-emerges.
 */
export class MultiTracker {
    private tracks: Track[] = [];
    private nextId = 1;

    reset(): void {
        this.tracks = [];
        this.nextId = 1;
    }

    /** Every track, including closed ones — the trajectory history is the point. */
    all(): Track[] {
        return this.tracks;
    }

    /** Tracks that are worth drawing right now. */
    visible(cfg: TrackConfig): Track[] {
        return this.tracks.filter((t) => t.hits >= cfg.minHits);
    }

    remove(id: number): void {
        this.tracks = this.tracks.filter((t) => t.id !== id);
    }

    update(blobs: Blob[], t: number, cfg: TrackConfig): void {
        // Template-driven tracks have their own measurement source and must be
        // left alone here. Including them would let this loop append a coasted
        // sample at the same instant the template tracker appends a measured
        // one, giving the track two samples per frame and halving every speed
        // computed from it.
        const active = this.tracks.filter((tr) => tr.active && tr.source !== 'template');

        // Predict where each active track should be at time `t`.
        const predictions = active.map((tr) => {
            const last = tr.samples[tr.samples.length - 1];
            const dt = Math.max(0, t - last.t);
            return {
                track: tr,
                x: last.x + tr.vx * dt,
                y: last.y + tr.vy * dt,
                w: last.w,
                h: last.h
            };
        });

        type Pair = { pi: number; bi: number; cost: number };
        const pairs: Pair[] = [];
        for (let pi = 0; pi < predictions.length; pi++) {
            const p = predictions[pi];
            const gate = cfg.gateFactor * Math.max(24, Math.hypot(p.w, p.h));
            for (let bi = 0; bi < blobs.length; bi++) {
                const b = blobs[bi];
                const dist = Math.hypot(b.centroid.x - p.x, b.centroid.y - p.y);
                if (dist > gate) continue;
                const overlap = iou({ x: p.x - p.w / 2, y: p.y - p.h / 2, w: p.w, h: p.h }, b.bbox);
                const sizeRatio = Math.min(b.bbox.w * b.bbox.h, p.w * p.h) / Math.max(1, Math.max(b.bbox.w * b.bbox.h, p.w * p.h));
                // Distance dominates; overlap and size agreement break ties and
                // stop a track from jumping onto a much larger neighbour.
                const cost = dist / gate + (1 - overlap) * 0.5 + (1 - sizeRatio) * 0.3;
                pairs.push({ pi, bi, cost });
            }
        }
        pairs.sort((a, b) => a.cost - b.cost);

        const usedTracks = new Set<number>();
        const usedBlobs = new Set<number>();
        for (const pair of pairs) {
            if (usedTracks.has(pair.pi) || usedBlobs.has(pair.bi)) continue;
            usedTracks.add(pair.pi);
            usedBlobs.add(pair.bi);
            this.appendMeasurement(predictions[pair.pi].track, blobs[pair.bi], t, cfg);
        }

        // Tracks with no measurement this frame: coast, then close.
        for (let pi = 0; pi < predictions.length; pi++) {
            if (usedTracks.has(pi)) continue;
            const tr = predictions[pi].track;
            tr.missed++;
            if (tr.missed > cfg.maxMissed) {
                tr.active = false;
                continue;
            }
            const last = tr.samples[tr.samples.length - 1];
            this.push(tr, { t, x: predictions[pi].x, y: predictions[pi].y, w: last.w, h: last.h, score: 0, predicted: true }, cfg);
        }

        // Leftover blobs start new tracks.
        for (let bi = 0; bi < blobs.length; bi++) {
            if (usedBlobs.has(bi)) continue;
            this.spawn(blobs[bi], t, cfg);
        }

        this.prune();
    }

    /**
     * Cap retained history.
     *
     * A live stream left running produces a new track for every passing object
     * forever. Closed tracks are dropped oldest-first once there are too many,
     * and short closed ones — a bird, a shadow, one frame of sensor noise — go
     * first because they carry no analysis value.
     */
    private prune(): void {
        if (this.tracks.length <= MAX_TRACKS) return;
        const closed = this.tracks.filter((t) => !t.active);
        if (!closed.length) return;
        const excess = this.tracks.length - MAX_TRACKS;
        const doomed = new Set(
            closed
                .slice()
                .sort((a, b) => a.hits - b.hits || a.updatedAt - b.updatedAt)
                .slice(0, excess)
        );
        this.tracks = this.tracks.filter((t) => !doomed.has(t));
    }

    /** Start a track by hand, e.g. from a template tracker seeded by the user. */
    createManual(x: number, y: number, w: number, h: number, t: number, label: string): Track {
        const track: Track = {
            id: this.nextId++,
            label,
            color: TRACK_COLORS[(this.nextId - 2) % TRACK_COLORS.length],
            source: 'template',
            samples: [{ t, x, y, w, h, score: 1, predicted: false }],
            missed: 0,
            hits: 1,
            vx: 0,
            vy: 0,
            active: true,
            startedAt: t,
            updatedAt: t
        };
        this.tracks.push(track);
        return track;
    }

    /** Record a coasted sample on a track whose own measurement source missed. */
    appendPredicted(track: Track, x: number, y: number, w: number, h: number, t: number, cfg: TrackConfig): void {
        track.missed++;
        this.push(track, { t, x, y, w, h, score: 0, predicted: true }, cfg);
    }

    /** Record a measurement on a specific track (used by the template tracker). */
    appendTo(track: Track, x: number, y: number, w: number, h: number, t: number, score: number, cfg: TrackConfig): void {
        track.missed = 0;
        track.hits++;
        this.push(track, { t, x, y, w, h, score, predicted: false }, cfg);
    }

    private appendMeasurement(track: Track, blob: Blob, t: number, cfg: TrackConfig): void {
        track.missed = 0;
        track.hits++;
        this.push(
            track,
            {
                t,
                x: blob.centroid.x,
                y: blob.centroid.y,
                w: blob.bbox.w,
                h: blob.bbox.h,
                score: Math.min(1, blob.intensity / 128),
                predicted: false
            },
            cfg
        );
    }

    private spawn(blob: Blob, t: number, cfg: TrackConfig): void {
        const track: Track = {
            id: this.nextId++,
            label: `#${this.nextId - 1}`,
            color: TRACK_COLORS[(this.nextId - 2) % TRACK_COLORS.length],
            source: 'auto',
            samples: [
                {
                    t,
                    x: blob.centroid.x,
                    y: blob.centroid.y,
                    w: blob.bbox.w,
                    h: blob.bbox.h,
                    score: Math.min(1, blob.intensity / 128),
                    predicted: false
                }
            ],
            missed: 0,
            hits: 1,
            vx: 0,
            vy: 0,
            active: true,
            startedAt: t,
            updatedAt: t
        };
        this.tracks.push(track);
        void cfg;
    }

    private push(track: Track, sample: TrackSample, cfg: TrackConfig): void {
        const prev = track.samples[track.samples.length - 1];
        const dt = prev ? sample.t - prev.t : Infinity;

        // Two samples at one instant are not two observations of time. Keep the
        // better of the pair — a measurement always beats a prediction — rather
        // than appending a zero-length interval that would corrupt every
        // velocity derived from this track.
        if (prev && dt <= 1e-6) {
            if (!sample.predicted && prev.predicted) track.samples[track.samples.length - 1] = sample;
            return;
        }

        if (dt > 1e-4 && Number.isFinite(dt)) {
            // Exponential smoothing on velocity: raw frame-to-frame differences
            // are far too jittery to predict with, especially for blob centroids
            // that shift as the visible part of the object changes.
            const vx = (sample.x - prev.x) / dt;
            const vy = (sample.y - prev.y) / dt;
            const a = 0.45;
            track.vx = track.vx * (1 - a) + vx * a;
            track.vy = track.vy * (1 - a) + vy * a;
        }
        track.samples.push(sample);
        track.updatedAt = sample.t;
        if (track.samples.length > cfg.maxSamples) track.samples.shift();
    }
}

function iou(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): number {
    const x1 = Math.max(a.x, b.x);
    const y1 = Math.max(a.y, b.y);
    const x2 = Math.min(a.x + a.w, b.x + b.w);
    const y2 = Math.min(a.y + a.h, b.y + b.h);
    if (x2 <= x1 || y2 <= y1) return 0;
    const inter = (x2 - x1) * (y2 - y1);
    return inter / (a.w * a.h + b.w * b.h - inter);
}
