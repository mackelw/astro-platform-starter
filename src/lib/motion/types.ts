/**
 * Shared types for the motion analysis engine.
 *
 * Coordinate convention: every value that leaves this library is expressed in
 * *intrinsic video pixels* (i.e. `video.videoWidth` x `video.videoHeight`),
 * never in processing-buffer pixels and never in CSS pixels. The pipeline
 * downscales frames internally for speed and scales results back up before
 * handing them out, so callers can mix results from different processing
 * resolutions without bookkeeping.
 *
 * Time convention: `t` is always the media timeline position in seconds
 * (`video.currentTime`). Converting timeline seconds to real-world seconds is
 * the job of `Calibration.captureFps / Calibration.timelineFps` — that ratio is
 * what makes a 120 fps slow-motion clip from a Pocket 3 report true speeds.
 */

export interface Point {
    x: number;
    y: number;
}

export interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
}

/** A connected region of changed pixels found in a single frame. */
export interface Blob {
    bbox: Rect;
    centroid: Point;
    /** Area in video pixels squared. */
    area: number;
    /** Mean absolute difference inside the blob, 0..255. Higher = stronger motion. */
    intensity: number;
}

/** One observation of a tracked object. */
export interface TrackSample {
    /** Media timeline position, seconds. */
    t: number;
    /** Centre of the object, video pixels. */
    x: number;
    y: number;
    /** Bounding box size, video pixels. */
    w: number;
    h: number;
    /** 0..1. For auto tracks this is detection strength, for template tracks the NCC score. */
    score: number;
    /** True when the sample was predicted (object briefly lost) rather than measured. */
    predicted: boolean;
}

export type TrackSource = 'auto' | 'template';

export interface Track {
    id: number;
    label: string;
    color: string;
    source: TrackSource;
    samples: TrackSample[];
    /** Consecutive frames without a measurement. */
    missed: number;
    /** Total measured frames. */
    hits: number;
    /** Smoothed velocity used for prediction, video px per second. */
    vx: number;
    vy: number;
    active: boolean;
    /** Media time of the first sample. */
    startedAt: number;
    /** Media time of the last sample. */
    updatedAt: number;
}

export type BackgroundMode = 'adjacent' | 'running';

export interface DetectConfig {
    /** Width of the internal analysis buffer. Height follows the video aspect. */
    processingWidth: number;
    /** Absolute grey-level difference above which a pixel counts as moving, 0..255. */
    threshold: number;
    /** Box-blur radius applied before differencing. Kills sensor noise. */
    blurRadius: number;
    /** Dilation radius applied to the binary mask. Merges fragments of one object. */
    dilate: number;
    /** Ignore blobs smaller than this fraction of the frame, in percent. */
    minAreaPct: number;
    /** Ignore blobs larger than this fraction of the frame, in percent. */
    maxAreaPct: number;
    /** `adjacent` = compare with previous frame. `running` = compare with a learned background. */
    backgroundMode: BackgroundMode;
    /** Background adaptation speed, 0..1. Only used in `running` mode. */
    learningRate: number;
    /**
     * Estimate and cancel whole-frame translation before differencing. Essential
     * for the Pocket 3: the gimbal pans during ActiveTrack, which would otherwise
     * light up the entire frame as "motion".
     */
    compensateCameraMotion: boolean;
    /** Maximum blobs kept per frame, largest first. */
    maxBlobs: number;
    /**
     * Refuse to detect on frames where compensation could not settle the scene.
     * A frame in which most of the picture is moving carries no information
     * about *which* object moved, and mining it produces hundreds of spurious
     * tracks that bury the real ones.
     */
    stabilityGate: boolean;
    /** Fraction of the frame that may move before a frame is rejected, percent. */
    unstableAbovePct: number;
}

export interface TrackConfig {
    /** Max association distance as a multiple of the object's own size. */
    gateFactor: number;
    /** Frames an object may be missing before its track is closed. */
    maxMissed: number;
    /** Measurements needed before a track is shown. Suppresses one-frame noise. */
    minHits: number;
    /** Hard cap on samples per track to bound memory on long clips. */
    maxSamples: number;
}

export interface Calibration {
    /** Two points in video pixels spanning a known real-world distance. */
    refLine: [Point, Point] | null;
    /** Real-world length of `refLine`, metres. */
    refLengthM: number;
    /** Frames per second the camera actually captured at (120 for Pocket 3 slow-mo). */
    captureFps: number;
    /** Frames per second the file plays back at (30 for a 4x slow-mo file). */
    timelineFps: number;
}

/** Three points making up a joint angle measurement, plus the frame it was taken on. */
export interface AngleMarker {
    id: number;
    label: string;
    color: string;
    /** Media time the marker belongs to. */
    t: number;
    a: Point;
    /** Vertex. */
    b: Point;
    c: Point;
}

export interface GlobalMotion {
    dx: number;
    dy: number;
    /** Fraction of probe blocks that agreed with the median, 0..1. */
    confidence: number;
    /**
     * True when the winning displacement sits against the edge of the searched
     * window, meaning the real displacement probably lies beyond it.
     *
     * Confidence cannot express this: it measures whether the probe blocks
     * agreed, and blocks agree perfectly well on a wrong answer when they all
     * saturate at the same boundary. A pan faster than the search range is
     * exactly that case.
     */
    clipped: boolean;
}

/** Everything the pipeline produces for one analysed frame. */
export interface FrameResult {
    t: number;
    /** Analysis buffer dimensions, for mask rendering. */
    procW: number;
    procH: number;
    /** Binary motion mask at processing resolution, 0 or 255. */
    mask: Uint8Array;
    blobs: Blob[];
    /** Fraction of the frame that is moving, 0..1. */
    motionRatio: number;
    camera: GlobalMotion;
    /** True when the frame was rejected as too unsettled to detect on. */
    unstable: boolean;
    /** Wall-clock milliseconds this frame took to analyse. */
    costMs: number;
}

export interface KinematicSample {
    t: number;
    /** Smoothed position, video pixels. */
    x: number;
    y: number;
    /** Velocity components, metres per second (real time). */
    vx: number;
    vy: number;
    /** Speed magnitude, metres per second (real time). */
    speed: number;
    /** Acceleration magnitude, metres per second squared (real time). */
    accel: number;
    /** Cumulative path length, metres. */
    distance: number;
    /** Direction of travel, degrees, 0 = right, counter-clockwise positive. */
    heading: number;
}

export interface KinematicSeries {
    trackId: number;
    label: string;
    color: string;
    samples: KinematicSample[];
    /** Units are metres when calibrated, otherwise raw video pixels. */
    calibrated: boolean;
    maxSpeed: number;
    meanSpeed: number;
    totalDistance: number;
    /** Real-world duration, seconds. */
    duration: number;
}
