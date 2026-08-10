import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStudio } from './store';
import { OverlayRenderer, sampleAt } from '../../lib/motion/overlay';
import type { Point, Rect } from '../../lib/motion/types';
import { Button } from './ui';

/**
 * The video surface: the picture, the analysis overlay drawn on top of it, the
 * pointer tools, and the transport controls.
 *
 * The overlay lives in its own canvas rather than being drawn into the video —
 * it must stay visible and correct while the video is paused, which is exactly
 * when frame-by-frame measurement happens.
 */
export function VideoStage(): React.ReactElement {
    const studio = useStudio();
    const {
        videoRef,
        engine,
        source,
        overlayOpts,
        cal,
        markers,
        pendingAngle,
        setPendingAngle,
        addMarker,
        tool,
        selectRoi,
        setCalibrationLine,
        tracks,
        selectedTrackId,
        setSelectedTrackId,
        currentTime,
        overlayCanvasRef
    } = studio;

    const wrapRef = useRef<HTMLDivElement | null>(null);
    const rendererRef = useRef<OverlayRenderer | null>(null);
    if (!rendererRef.current) rendererRef.current = new OverlayRenderer();

    const [drag, setDrag] = useState<{ start: Point; current: Point } | null>(null);
    const [videoSize, setVideoSize] = useState({ w: 0, h: 0 });

    // Keep the render loop reading fresh values without restarting on every
    // state change — restarting a rAF loop 60 times a second is its own bug.
    const stateRef = useRef({ overlayOpts, cal, markers, pendingAngle, tracks, selectedTrackId, currentTime, drag, tool });
    stateRef.current = { overlayOpts, cal, markers, pendingAngle, tracks, selectedTrackId, currentTime, drag, tool };

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        const onMeta = () => setVideoSize({ w: video.videoWidth, h: video.videoHeight });
        video.addEventListener('loadedmetadata', onMeta);
        video.addEventListener('resize', onMeta);
        onMeta();
        return () => {
            video.removeEventListener('loadedmetadata', onMeta);
            video.removeEventListener('resize', onMeta);
        };
    }, [videoRef, source]);

    // Overlay render loop.
    useEffect(() => {
        let handle = 0;
        const draw = () => {
            handle = requestAnimationFrame(draw);
            const canvas = overlayCanvasRef.current;
            const video = videoRef.current;
            if (!canvas || !video || !video.videoWidth) return;

            const rect = canvas.getBoundingClientRect();
            if (!rect.width) return;
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            // Cap the backing store at the source resolution: rendering the
            // overlay larger than the video buys nothing.
            const targetW = Math.min(Math.round(rect.width * dpr), video.videoWidth);
            const targetH = Math.round((targetW * video.videoHeight) / video.videoWidth);
            if (canvas.width !== targetW || canvas.height !== targetH) {
                canvas.width = targetW;
                canvas.height = targetH;
            }
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            const s = stateRef.current;
            const dragRect: Rect | null =
                s.drag && s.tool === 'roi'
                    ? {
                          x: Math.min(s.drag.start.x, s.drag.current.x),
                          y: Math.min(s.drag.start.y, s.drag.current.y),
                          w: Math.abs(s.drag.current.x - s.drag.start.x),
                          h: Math.abs(s.drag.current.y - s.drag.start.y)
                      }
                    : null;

            rendererRef.current!.render(ctx, {
                videoW: video.videoWidth,
                videoH: video.videoHeight,
                result: engine.lastResult,
                tracks: s.tracks,
                selectedTrackId: s.selectedTrackId,
                templateBox: engine.templateBox(),
                templateLost: engine.template.lost,
                calibration: s.cal,
                markers: s.markers,
                pendingAngle: s.pendingAngle,
                dragRect,
                dragLine: s.drag && s.tool === 'calibrate' ? [s.drag.start, s.drag.current] : null,
                // Live streams have no meaningful currentTime for overlay
                // lookup; use the newest sample time instead.
                currentTime: source.kind === 'live' ? engine.lastResult?.t ?? video.currentTime : video.currentTime,
                options: s.overlayOpts
            });
        };
        handle = requestAnimationFrame(draw);
        return () => cancelAnimationFrame(handle);
    }, [engine, overlayCanvasRef, videoRef, source.kind]);

    const toVideoPoint = useCallback(
        (e: React.PointerEvent): Point | null => {
            const canvas = overlayCanvasRef.current;
            const video = videoRef.current;
            if (!canvas || !video || !video.videoWidth) return null;
            const rect = canvas.getBoundingClientRect();
            return {
                x: ((e.clientX - rect.left) / rect.width) * video.videoWidth,
                y: ((e.clientY - rect.top) / rect.height) * video.videoHeight
            };
        },
        [overlayCanvasRef, videoRef]
    );

    const onPointerDown = (e: React.PointerEvent) => {
        const p = toVideoPoint(e);
        if (!p) return;

        if (tool === 'angle') {
            const next = [...pendingAngle, p];
            if (next.length === 3) {
                // Order is a → vertex → c, so the second click is the joint.
                addMarker(next[0], next[1], next[2]);
                setPendingAngle([]);
            } else {
                setPendingAngle(next);
            }
            return;
        }

        if (tool === 'roi' || tool === 'calibrate') {
            (e.target as Element).setPointerCapture?.(e.pointerId);
            setDrag({ start: p, current: p });
            return;
        }

        // Selection tool: pick whichever track's box contains the click.
        const hit = pickTrack(p);
        setSelectedTrackId(hit);
    };

    const pickTrack = (p: Point): number | null => {
        let best: number | null = null;
        let bestArea = Infinity;
        for (const track of tracks) {
            const s = sampleAt(track, currentTime);
            if (!s) continue;
            if (Math.abs(p.x - s.x) <= s.w / 2 && Math.abs(p.y - s.y) <= s.h / 2) {
                const area = s.w * s.h;
                // Prefer the smallest matching box so a small object inside a
                // big one is still selectable.
                if (area < bestArea) {
                    bestArea = area;
                    best = track.id;
                }
            }
        }
        return best;
    };

    const onPointerMove = (e: React.PointerEvent) => {
        if (!drag) return;
        const p = toVideoPoint(e);
        if (p) setDrag({ start: drag.start, current: p });
    };

    const onPointerUp = () => {
        if (!drag) return;
        const { start, current } = drag;
        setDrag(null);
        if (tool === 'roi') {
            const rect: Rect = {
                x: Math.min(start.x, current.x),
                y: Math.min(start.y, current.y),
                w: Math.abs(current.x - start.x),
                h: Math.abs(current.y - start.y)
            };
            if (rect.w > 8 && rect.h > 8) selectRoi(rect);
        } else if (tool === 'calibrate') {
            if (Math.hypot(current.x - start.x, current.y - start.y) > 8) setCalibrationLine([start, current]);
        }
    };

    const cursor =
        tool === 'roi' || tool === 'calibrate' ? 'crosshair' : tool === 'angle' ? 'cell' : 'default';

    return (
        <div className="flex flex-col gap-3">
            <div
                ref={wrapRef}
                className="relative overflow-hidden rounded-lg border border-white/15 bg-black"
                style={{ aspectRatio: videoSize.w && videoSize.h ? `${videoSize.w} / ${videoSize.h}` : '16 / 9' }}
            >
                <video
                    ref={videoRef}
                    className="absolute inset-0 size-full object-contain"
                    playsInline
                    muted
                    controls={false}
                />
                <canvas
                    ref={overlayCanvasRef}
                    className="absolute inset-0 size-full touch-none"
                    style={{ cursor }}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerUp}
                />
                {source.kind === 'none' && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center">
                        <p className="text-sm font-semibold text-white/80">لا يوجد مصدر فيديو</p>
                        <p className="max-w-sm text-xs text-white/50">
                            ارفع مقطعاً من كاميرا Osmo Pocket 3، أو وصّل الكاميرا بوضع الويب كام (USB) وابدأ البث المباشر من
                            لوحة «المصدر».
                        </p>
                    </div>
                )}
                {tool !== 'none' && <ToolHint tool={tool} pending={pendingAngle.length} />}
            </div>
            <Transport />
        </div>
    );
}

function ToolHint({ tool, pending }: { tool: string; pending: number }): React.ReactElement {
    const text =
        tool === 'roi'
            ? 'ارسم مستطيلاً حول الجسم المراد تتبّعه'
            : tool === 'calibrate'
              ? 'ارسم خطاً على مسافة معلومة الطول في المشهد'
              : `اضغط على ٣ نقاط: الطرف الأول ← المفصل ← الطرف الثاني (${pending}/3)`;
    return (
        <div className="pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-black/70 to-transparent p-3">
            <p className="text-center text-xs font-semibold text-white">{text}</p>
        </div>
    );
}

/** Play/pause, frame stepping, scrubbing and playback speed. */
function Transport(): React.ReactElement {
    const { videoRef, source, duration, currentTime, paused, playbackRate, setPlaybackRate, cal, engine } = useStudio();
    const isLive = source.kind === 'live';
    const frameStep = useMemo(() => 1 / Math.max(1, cal.timelineFps), [cal.timelineFps]);

    const step = useCallback(
        (frames: number) => {
            const video = videoRef.current;
            if (!video || isLive) return;
            video.pause();
            // Nudge onto the middle of the target frame so the browser doesn't
            // round back to the frame we came from.
            video.currentTime = Math.max(0, Math.min(duration, video.currentTime + frames * frameStep));
            engine.resetTemporal();
        },
        [videoRef, isLive, duration, frameStep, engine]
    );

    const toggle = useCallback(() => {
        const video = videoRef.current;
        if (!video || isLive) return;
        if (video.paused) video.play().catch(() => undefined);
        else video.pause();
    }, [videoRef, isLive]);

    // Keyboard transport: space to play, arrows to step. Skipped while typing
    // in a field so numeric inputs keep working normally.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null;
            if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
            if (e.code === 'Space') {
                e.preventDefault();
                toggle();
            } else if (e.code === 'ArrowRight') {
                e.preventDefault();
                step(e.shiftKey ? 10 : 1);
            } else if (e.code === 'ArrowLeft') {
                e.preventDefault();
                step(e.shiftKey ? -10 : -1);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [toggle, step]);

    return (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-white/15 bg-white/5 p-2.5">
            <Button onClick={toggle} disabled={isLive || source.kind === 'none'} variant="primary" title="مسافة">
                {paused ? '▶ تشغيل' : '⏸ إيقاف'}
            </Button>
            <Button onClick={() => step(-1)} disabled={isLive || source.kind === 'none'} title="سهم لليسار">
                ⟨ إطار
            </Button>
            <Button onClick={() => step(1)} disabled={isLive || source.kind === 'none'} title="سهم لليمين">
                إطار ⟩
            </Button>

            <input
                type="range"
                className="h-1.5 min-w-32 grow cursor-pointer appearance-none rounded-full bg-white/20 accent-primary disabled:opacity-40"
                min={0}
                max={duration || 0}
                step={0.001}
                value={Math.min(currentTime, duration || 0)}
                disabled={isLive || !duration}
                onChange={(e) => {
                    const video = videoRef.current;
                    if (video) video.currentTime = Number(e.target.value);
                }}
            />

            <span className="font-mono text-xs text-white/70 tabular-nums">
                {formatTime(currentTime)} / {isLive ? 'مباشر' : formatTime(duration)}
            </span>

            <select
                value={playbackRate}
                onChange={(e) => setPlaybackRate(Number(e.target.value))}
                disabled={isLive}
                className="rounded border border-white/20 bg-black/30 px-2 py-1.5 text-xs text-white outline-none focus:border-primary disabled:opacity-40"
                title="سرعة العرض"
            >
                {[0.1, 0.25, 0.5, 1, 2].map((r) => (
                    <option key={r} value={r}>
                        {r}×
                    </option>
                ))}
            </select>
        </div>
    );
}

function formatTime(seconds: number): string {
    if (!Number.isFinite(seconds)) return '00:00.00';
    const m = Math.floor(seconds / 60);
    const s = seconds - m * 60;
    return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
}
