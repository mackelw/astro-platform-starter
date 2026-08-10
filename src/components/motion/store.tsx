import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { MotionEngine } from '../../lib/motion/engine';
import { DEFAULT_DETECT_CONFIG } from '../../lib/motion/detect';
import { DEFAULT_TRACK_CONFIG, TRACK_COLORS } from '../../lib/motion/tracker';
import { DEFAULT_CALIBRATION, DEFAULT_KINEMATICS_OPTIONS, computeKinematics, pixelsPerMetre, realTimeScale } from '../../lib/motion/kinematics';
import { DEFAULT_OVERLAY_OPTIONS, type OverlayOptions } from '../../lib/motion/overlay';
import { buildAngleSeries, angleLabels, type AngleSeries } from '../../lib/motion/angles';
import { findPreset, guessPreset, type CameraPreset } from '../../lib/motion/presets';
import type {
    AngleMarker,
    Calibration,
    DetectConfig,
    KinematicSeries,
    Point,
    Rect,
    Track,
    TrackConfig
} from '../../lib/motion/types';

export type SourceKind = 'none' | 'file' | 'live';
export type Tool = 'none' | 'roi' | 'calibrate' | 'angle';

export interface SourceState {
    kind: SourceKind;
    name: string;
    /** Object URL for file sources; revoked when the source changes. */
    url: string | null;
    stream: MediaStream | null;
}

export interface LiveStats {
    /** Analysed frames per second. */
    analysisFps: number;
    /** Detected frame rate of the source. */
    sourceFps: number;
    costMs: number;
    motionRatio: number;
    cameraDx: number;
    cameraDy: number;
    blobCount: number;
    activeTracks: number;
}

/** `requestVideoFrameCallback` is still unflagged-but-untyped in some TS libs. */
interface VideoFrameMeta {
    mediaTime: number;
    presentedFrames: number;
}
type FrameCallbackVideo = HTMLVideoElement & {
    requestVideoFrameCallback?: (cb: (now: number, meta: VideoFrameMeta) => void) => number;
    cancelVideoFrameCallback?: (handle: number) => void;
};

interface StudioValue {
    videoRef: React.RefObject<HTMLVideoElement>;
    engine: MotionEngine;

    source: SourceState;
    openFile: (file: File) => void;
    startLive: (deviceId?: string) => Promise<void>;
    stopSource: () => void;
    devices: MediaDeviceInfo[];
    liveError: string | null;

    cfg: DetectConfig;
    setCfg: (patch: Partial<DetectConfig>) => void;
    trackCfg: TrackConfig;
    setTrackCfg: (patch: Partial<TrackConfig>) => void;
    cal: Calibration;
    setCal: (patch: Partial<Calibration>) => void;
    presetId: string;
    applyPreset: (id: string) => void;
    preset: CameraPreset;
    overlayOpts: OverlayOptions;
    setOverlayOpts: (patch: Partial<OverlayOptions>) => void;
    smoothWindow: number;
    setSmoothWindow: (n: number) => void;

    autoDetect: boolean;
    setAutoDetect: (v: boolean) => void;
    analyzing: boolean;
    setAnalyzing: (v: boolean) => void;

    tool: Tool;
    setTool: (t: Tool) => void;
    pendingAngle: Point[];
    setPendingAngle: (p: Point[]) => void;
    angleLabel: string;
    setAngleLabel: (s: string) => void;
    markers: AngleMarker[];
    addMarker: (a: Point, b: Point, c: Point) => void;
    removeMarker: (id: number) => void;
    clearMarkers: () => void;

    selectRoi: (rect: Rect) => void;
    clearRoi: () => void;
    setCalibrationLine: (line: [Point, Point]) => void;

    tracks: Track[];
    version: number;
    bumpVersion: () => void;
    selectedTrackId: number | null;
    setSelectedTrackId: (id: number | null) => void;
    removeTrack: (id: number) => void;
    clearTracks: () => void;

    stats: LiveStats;
    currentTime: number;
    duration: number;
    paused: boolean;
    playbackRate: number;
    setPlaybackRate: (r: number) => void;

    kinematics: KinematicSeries[];
    angleSeries: AngleSeries[];
    ppm: number | null;
    timeScale: number;

    recording: boolean;
    toggleRecording: () => void;
    /** Set by VideoStage so the store can composite the overlay for capture. */
    overlayCanvasRef: React.RefObject<HTMLCanvasElement>;
}

const StudioContext = createContext<StudioValue | null>(null);

export function useStudio(): StudioValue {
    const ctx = useContext(StudioContext);
    if (!ctx) throw new Error('useStudio must be used inside <StudioProvider>');
    return ctx;
}

export function StudioProvider({ children }: { children: React.ReactNode }): React.ReactElement {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const engineRef = useRef<MotionEngine | null>(null);
    if (!engineRef.current) engineRef.current = new MotionEngine();
    const engine = engineRef.current;

    const [source, setSource] = useState<SourceState>({ kind: 'none', name: '', url: null, stream: null });
    const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
    const [liveError, setLiveError] = useState<string | null>(null);

    const [cfg, setCfgState] = useState<DetectConfig>(DEFAULT_DETECT_CONFIG);
    const [trackCfg, setTrackCfgState] = useState<TrackConfig>(DEFAULT_TRACK_CONFIG);
    const [cal, setCalState] = useState<Calibration>(DEFAULT_CALIBRATION);
    const [presetId, setPresetId] = useState('4k60');
    const [overlayOpts, setOverlayOptsState] = useState<OverlayOptions>(DEFAULT_OVERLAY_OPTIONS);
    const [smoothWindow, setSmoothWindow] = useState(DEFAULT_KINEMATICS_OPTIONS.smoothWindow);

    const [autoDetect, setAutoDetect] = useState(true);
    const [analyzing, setAnalyzing] = useState(true);

    const [tool, setToolState] = useState<Tool>('none');
    const [pendingAngle, setPendingAngle] = useState<Point[]>([]);
    const [angleLabel, setAngleLabel] = useState('الركبة');
    const [markers, setMarkers] = useState<AngleMarker[]>([]);
    const markerIdRef = useRef(1);

    const [version, setVersion] = useState(0);
    const [selectedTrackId, setSelectedTrackId] = useState<number | null>(null);
    const [stats, setStats] = useState<LiveStats>({
        analysisFps: 0,
        sourceFps: 0,
        costMs: 0,
        motionRatio: 0,
        cameraDx: 0,
        cameraDy: 0,
        blobCount: 0,
        activeTracks: 0
    });
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [paused, setPaused] = useState(true);
    const [playbackRate, setPlaybackRateState] = useState(1);
    const [recording, setRecording] = useState(false);

    // Config the analysis loop reads without re-subscribing every render.
    const loopState = useRef({ cfg, trackCfg, autoDetect, analyzing });
    loopState.current = { cfg, trackCfg, autoDetect, analyzing };

    const recorderRef = useRef<MediaRecorder | null>(null);
    const recordChunksRef = useRef<BlobPart[]>([]);
    const compositeRef = useRef<HTMLCanvasElement | null>(null);

    const bumpVersion = useCallback(() => setVersion((v) => v + 1), []);

    const setCfg = useCallback(
        (patch: Partial<DetectConfig>) => {
            setCfgState((c) => {
                const next = { ...c, ...patch };
                // Changing how frames are compared invalidates the learned
                // background, so start it over rather than mixing models.
                if (
                    patch.processingWidth !== undefined ||
                    patch.backgroundMode !== undefined ||
                    patch.blurRadius !== undefined
                ) {
                    engine.resetTemporal();
                }
                return next;
            });
        },
        [engine]
    );

    const setTrackCfg = useCallback((patch: Partial<TrackConfig>) => setTrackCfgState((c) => ({ ...c, ...patch })), []);
    const setCal = useCallback((patch: Partial<Calibration>) => setCalState((c) => ({ ...c, ...patch })), []);
    const setOverlayOpts = useCallback((patch: Partial<OverlayOptions>) => setOverlayOptsState((o) => ({ ...o, ...patch })), []);

    const applyPreset = useCallback((id: string) => {
        setPresetId(id);
        const p = findPreset(id);
        if (p.id !== 'custom') {
            setCalState((c) => ({ ...c, captureFps: p.captureFps, timelineFps: p.timelineFps }));
        }
    }, []);

    const setTool = useCallback((t: Tool) => {
        setToolState(t);
        setPendingAngle([]);
    }, []);

    const stopSource = useCallback(() => {
        const video = videoRef.current;
        if (video) {
            video.pause();
            video.removeAttribute('src');
            video.srcObject = null;
            video.load();
        }
        setSource((prev) => {
            if (prev.url) URL.revokeObjectURL(prev.url);
            prev.stream?.getTracks().forEach((t) => t.stop());
            return { kind: 'none', name: '', url: null, stream: null };
        });
        engine.resetAll();
        setDuration(0);
        setCurrentTime(0);
        bumpVersion();
    }, [engine, bumpVersion]);

    const openFile = useCallback(
        (file: File) => {
            setLiveError(null);
            const url = URL.createObjectURL(file);
            setSource((prev) => {
                if (prev.url) URL.revokeObjectURL(prev.url);
                prev.stream?.getTracks().forEach((t) => t.stop());
                return { kind: 'file', name: file.name, url, stream: null };
            });
            engine.resetAll();
            bumpVersion();
        },
        [engine, bumpVersion]
    );

    const startLive = useCallback(
        async (deviceId?: string) => {
            setLiveError(null);
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: deviceId
                        ? { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60 } }
                        : { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60 } },
                    audio: false
                });
                setSource((prev) => {
                    if (prev.url) URL.revokeObjectURL(prev.url);
                    prev.stream?.getTracks().forEach((t) => t.stop());
                    const label = stream.getVideoTracks()[0]?.label || 'Live camera';
                    return { kind: 'live', name: label, url: null, stream };
                });
                engine.resetAll();
                bumpVersion();
                // Device labels stay blank until a stream has been granted, so
                // refresh the list now that we have permission.
                const list = await navigator.mediaDevices.enumerateDevices();
                setDevices(list.filter((d) => d.kind === 'videoinput'));
            } catch (err) {
                setLiveError(err instanceof Error ? err.message : String(err));
            }
        },
        [engine, bumpVersion]
    );

    useEffect(() => {
        if (!navigator.mediaDevices?.enumerateDevices) return;
        navigator.mediaDevices
            .enumerateDevices()
            .then((list) => setDevices(list.filter((d) => d.kind === 'videoinput')))
            .catch(() => undefined);
    }, []);

    // Attach the current source to the video element.
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        if (source.kind === 'file' && source.url) {
            video.srcObject = null;
            video.src = source.url;
            video.load();
        } else if (source.kind === 'live' && source.stream) {
            video.removeAttribute('src');
            video.srcObject = source.stream;
            video.play().catch(() => undefined);
        }
    }, [source]);

    useEffect(() => {
        const video = videoRef.current;
        if (video) video.playbackRate = playbackRate;
    }, [playbackRate, source]);

    const setPlaybackRate = useCallback((r: number) => {
        setPlaybackRateState(r);
        if (videoRef.current) videoRef.current.playbackRate = r;
    }, []);

    // Video element event wiring.
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const onMeta = () => {
            setDuration(Number.isFinite(video.duration) ? video.duration : 0);
            engine.resetAll();
            bumpVersion();
        };
        const onTime = () => setCurrentTime(video.currentTime);
        const onPlay = () => setPaused(false);
        const onPause = () => setPaused(true);
        // A seek discards the frame history the detector depends on; keeping it
        // would produce one frame of spurious whole-scene "motion".
        const onSeeking = () => engine.resetTemporal();

        video.addEventListener('loadedmetadata', onMeta);
        video.addEventListener('timeupdate', onTime);
        video.addEventListener('play', onPlay);
        video.addEventListener('pause', onPause);
        video.addEventListener('seeking', onSeeking);
        return () => {
            video.removeEventListener('loadedmetadata', onMeta);
            video.removeEventListener('timeupdate', onTime);
            video.removeEventListener('play', onPlay);
            video.removeEventListener('pause', onPause);
            video.removeEventListener('seeking', onSeeking);
        };
    }, [engine, bumpVersion]);

    // Guess the recording mode from the file once its frame rate is known.
    const guessedRef = useRef(false);
    useEffect(() => {
        guessedRef.current = false;
    }, [source]);

    // The analysis loop.
    useEffect(() => {
        const video = videoRef.current as FrameCallbackVideo | null;
        if (!video) return;

        let stopped = false;
        let rafHandle = 0;
        let vfcHandle = 0;
        let lastAnalysedTime = -1;
        let framesThisSecond = 0;
        let windowStart = performance.now();
        let lastPresented = -1;
        let lastMediaTime = -1;
        let fpsEstimate = 0;

        const analyse = (t: number) => {
            const s = loopState.current;
            if (!s.analyzing) return;
            // Analysing the same frame twice would inject a zero-motion sample
            // and skew every downstream average.
            if (t === lastAnalysedTime) return;
            lastAnalysedTime = t;

            const result = engine.analyze(video, t, s.cfg, s.trackCfg, s.autoDetect);
            if (!result) return;
            framesThisSecond++;

            const now = performance.now();
            if (now - windowStart >= 500) {
                const fps = (framesThisSecond * 1000) / (now - windowStart);
                framesThisSecond = 0;
                windowStart = now;
                setStats({
                    analysisFps: fps,
                    sourceFps: fpsEstimate,
                    costMs: result.costMs,
                    motionRatio: result.motionRatio,
                    cameraDx: result.camera.dx,
                    cameraDy: result.camera.dy,
                    blobCount: result.blobs.length,
                    activeTracks: engine.tracker.all().filter((tr) => tr.active).length
                });
                bumpVersion();
            }
        };

        const onFrame = (_now: number, meta: VideoFrameMeta) => {
            if (stopped) return;
            if (lastPresented >= 0 && meta.presentedFrames > lastPresented && meta.mediaTime > lastMediaTime) {
                const dFrames = meta.presentedFrames - lastPresented;
                const dTime = meta.mediaTime - lastMediaTime;
                const instant = dFrames / dTime;
                // Playback rate is baked out because mediaTime advances in
                // media seconds regardless of how fast we are playing.
                if (instant > 5 && instant < 500) fpsEstimate = fpsEstimate ? fpsEstimate * 0.8 + instant * 0.2 : instant;
            }
            lastPresented = meta.presentedFrames;
            lastMediaTime = meta.mediaTime;

            if (!guessedRef.current && fpsEstimate > 5 && video.videoWidth) {
                guessedRef.current = true;
                const guess = guessPreset(video.videoWidth, video.videoHeight, Math.round(fpsEstimate));
                if (guess) applyPreset(guess.id);
            }

            analyse(meta.mediaTime);
            vfcHandle = video.requestVideoFrameCallback!(onFrame);
        };

        const onRaf = () => {
            if (stopped) return;
            if (!video.paused && !video.ended) analyse(video.currentTime);
            rafHandle = requestAnimationFrame(onRaf);
        };

        if (typeof video.requestVideoFrameCallback === 'function') {
            vfcHandle = video.requestVideoFrameCallback(onFrame);
        } else {
            // Safari < 15.4 and older Firefox: fall back to animation frames.
            // Analysis then tops out at display rate and cannot see 120 fps
            // footage frame by frame, but everything still works.
            rafHandle = requestAnimationFrame(onRaf);
        }

        return () => {
            stopped = true;
            if (rafHandle) cancelAnimationFrame(rafHandle);
            if (vfcHandle && video.cancelVideoFrameCallback) video.cancelVideoFrameCallback(vfcHandle);
        };
    }, [engine, bumpVersion, applyPreset, source]);

    // Recording the annotated view.
    const compositeFrame = useCallback(() => {
        const video = videoRef.current;
        const overlay = overlayCanvasRef.current;
        const composite = compositeRef.current;
        if (!video || !overlay || !composite) return;
        const ctx = composite.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(video, 0, 0, composite.width, composite.height);
        ctx.drawImage(overlay, 0, 0, composite.width, composite.height);
    }, []);

    useEffect(() => {
        if (!recording) return;
        let handle = 0;
        const tick = () => {
            compositeFrame();
            handle = requestAnimationFrame(tick);
        };
        handle = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(handle);
    }, [recording, compositeFrame]);

    const toggleRecording = useCallback(() => {
        if (recording) {
            recorderRef.current?.stop();
            return;
        }
        const video = videoRef.current;
        if (!video || !video.videoWidth) return;
        if (typeof MediaRecorder === 'undefined') {
            setLiveError('هذا المتصفح لا يدعم تسجيل الفيديو (MediaRecorder).');
            return;
        }
        // Cap the capture size: encoding 4K in the browser drops frames and the
        // annotated export is for review, not for archival.
        const width = Math.min(1280, video.videoWidth);
        const height = Math.round((width * video.videoHeight) / video.videoWidth);
        const canvas = compositeRef.current ?? document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        compositeRef.current = canvas;

        const stream = canvas.captureStream(30);
        const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(
            (m) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)
        );
        const recorder = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 6_000_000 } : undefined);
        recordChunksRef.current = [];
        recorder.ondataavailable = (e) => {
            if (e.data.size) recordChunksRef.current.push(e.data);
        };
        recorder.onstop = () => {
            const blob = new Blob(recordChunksRef.current, { type: recorder.mimeType || 'video/webm' });
            const a = document.createElement('a');
            const url = URL.createObjectURL(blob);
            a.href = url;
            a.download = `motion-overlay-${Date.now()}.webm`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            setRecording(false);
        };
        recorderRef.current = recorder;
        recorder.start(1000);
        setRecording(true);
    }, [recording]);

    const addMarker = useCallback(
        (a: Point, b: Point, c: Point) => {
            const video = videoRef.current;
            const t = video ? video.currentTime : 0;
            setMarkers((prev) => {
                // Angle groups are their own categorical series, so they draw
                // from the same fixed-order palette the tracks use.
                const known = angleLabels(prev);
                const idx = known.indexOf(angleLabel);
                const color = TRACK_COLORS[(idx === -1 ? known.length : idx) % TRACK_COLORS.length];
                return [...prev, { id: markerIdRef.current++, label: angleLabel, color, t, a, b, c }];
            });
        },
        [angleLabel]
    );

    const removeMarker = useCallback((id: number) => setMarkers((prev) => prev.filter((m) => m.id !== id)), []);
    const clearMarkers = useCallback(() => setMarkers([]), []);

    const selectRoi = useCallback(
        (rect: Rect) => {
            engine.selectRoi(rect);
            bumpVersion();
        },
        [engine, bumpVersion]
    );

    const clearRoi = useCallback(() => {
        engine.clearRoi();
        bumpVersion();
    }, [engine, bumpVersion]);

    const setCalibrationLine = useCallback((line: [Point, Point]) => setCalState((c) => ({ ...c, refLine: line })), []);

    const removeTrack = useCallback(
        (id: number) => {
            if (engine.templateTrack?.id === id) engine.clearRoi();
            engine.tracker.remove(id);
            setSelectedTrackId((cur) => (cur === id ? null : cur));
            bumpVersion();
        },
        [engine, bumpVersion]
    );

    const clearTracks = useCallback(() => {
        engine.tracker.reset();
        engine.clearRoi();
        setSelectedTrackId(null);
        bumpVersion();
    }, [engine, bumpVersion]);

    const tracks = useMemo(() => engine.tracker.visible(trackCfg), [engine, trackCfg, version]);

    const kinematics = useMemo(
        () =>
            tracks
                .filter((t) => t.samples.length >= 3)
                .map((t) => computeKinematics(t, cal, { smoothWindow, dropPredicted: false })),
        [tracks, cal, smoothWindow]
    );

    const angleSeries = useMemo(
        () =>
            angleLabels(markers)
                .map((label) => buildAngleSeries(markers, label, cal))
                .filter((s): s is AngleSeries => s !== null),
        [markers, cal]
    );

    const ppm = useMemo(() => pixelsPerMetre(cal), [cal]);
    const timeScale = useMemo(() => realTimeScale(cal), [cal]);
    const preset = useMemo(() => findPreset(presetId), [presetId]);

    const value: StudioValue = {
        videoRef,
        engine,
        source,
        openFile,
        startLive,
        stopSource,
        devices,
        liveError,
        cfg,
        setCfg,
        trackCfg,
        setTrackCfg,
        cal,
        setCal,
        presetId,
        applyPreset,
        preset,
        overlayOpts,
        setOverlayOpts,
        smoothWindow,
        setSmoothWindow,
        autoDetect,
        setAutoDetect,
        analyzing,
        setAnalyzing,
        tool,
        setTool,
        pendingAngle,
        setPendingAngle,
        angleLabel,
        setAngleLabel,
        markers,
        addMarker,
        removeMarker,
        clearMarkers,
        selectRoi,
        clearRoi,
        setCalibrationLine,
        tracks,
        version,
        bumpVersion,
        selectedTrackId,
        setSelectedTrackId,
        removeTrack,
        clearTracks,
        stats,
        currentTime,
        duration,
        paused,
        playbackRate,
        setPlaybackRate,
        kinematics,
        angleSeries,
        ppm,
        timeScale,
        recording,
        toggleRecording,
        overlayCanvasRef
    };

    return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}
