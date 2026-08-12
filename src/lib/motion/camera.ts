/**
 * Camera negotiation.
 *
 * Opening a camera and getting pictures out of it are different problems. UVC
 * webcams — the Osmo Pocket 3 among them — advertise capability tables that
 * their firmware, the USB link or the OS driver cannot always honour. Ask for a
 * mode from that table which the device will not actually produce, and
 * `getUserMedia` resolves happily with a track whose `readyState` is `live`,
 * while not one frame ever arrives. The picture stays black with no error
 * anywhere.
 *
 * The Pocket 3 makes this worse by enumerating as two identical video inputs,
 * only one of which carries the picture.
 *
 * So instead of demanding a mode and hoping, this module probes: it opens a
 * candidate, waits for a real frame, and moves on if none comes. The first
 * combination that actually delivers wins.
 */

export interface CameraCandidate {
    deviceId?: string;
    /** Human-readable description of what is being tried, for progress output. */
    description: string;
    constraints: MediaTrackConstraints;
}

export interface CameraAttemptResult {
    stream: MediaStream;
    candidate: CameraCandidate;
    settings: MediaTrackSettings;
}

export interface CameraFailure {
    candidate: CameraCandidate;
    /** `no-frames` when the device opened but stayed silent. */
    reason: 'no-frames' | 'error';
    message?: string;
}

/**
 * Resolution ladder, most permissive first.
 *
 * The bare candidate — no size or frame rate at all — lets the browser choose
 * the device's own preferred mode, which is by far the most likely to work.
 * Only if that produces nothing do we start naming resolutions, descending,
 * because a device that cannot sustain 1080p often manages 720p or 480p.
 */
const MODES: { description: string; constraints: MediaTrackConstraints }[] = [
    { description: 'الوضع الافتراضي للجهاز', constraints: {} },
    { description: '1280×720', constraints: { width: { ideal: 1280 }, height: { ideal: 720 } } },
    { description: '1920×1080', constraints: { width: { ideal: 1920 }, height: { ideal: 1080 } } },
    { description: '640×480', constraints: { width: { ideal: 640 }, height: { ideal: 480 } } },
    { description: '30 إطار/ث كحد أقصى', constraints: { frameRate: { max: 30 } } }
];

/**
 * Build the probe order.
 *
 * Modes are the outer loop and devices the inner one: trying every device at
 * its default mode before trying any device at a forced resolution finds a
 * working input several seconds sooner in the common case.
 */
export function buildCandidates(devices: MediaDeviceInfo[], preferredDeviceId?: string): CameraCandidate[] {
    const targets: { deviceId?: string; name: string }[] = preferredDeviceId
        ? [{ deviceId: preferredDeviceId, name: labelFor(devices, preferredDeviceId) }]
        : devices.length
          ? devices.map((d, i) => ({ deviceId: d.deviceId, name: d.label || `مدخل ${i + 1}` }))
          : [{ deviceId: undefined, name: 'الكاميرا الافتراضية' }];

    const candidates: CameraCandidate[] = [];
    for (const mode of MODES) {
        for (const target of targets) {
            candidates.push({
                deviceId: target.deviceId,
                description: `${target.name} · ${mode.description}`,
                constraints: {
                    ...mode.constraints,
                    ...(target.deviceId ? { deviceId: { exact: target.deviceId } } : {})
                }
            });
        }
    }
    return candidates;
}

function labelFor(devices: MediaDeviceInfo[], deviceId: string): string {
    const index = devices.findIndex((d) => d.deviceId === deviceId);
    if (index === -1) return 'الكاميرا المحددة';
    return devices[index].label || `مدخل ${index + 1}`;
}

/**
 * Resolve once the video element has presented several frames in a row.
 *
 * Several, not one: `loadedmetadata` fires off the negotiated format rather
 * than real data, and a single frame proves just as little — a camera that
 * emits one picture and then freezes is a failure mode in its own right, and
 * accepting it would hand the user a permanently frozen still. Sustained
 * delivery is the only thing worth accepting.
 *
 * `requestVideoFrameCallback` fires exactly once per presented frame, so it is
 * the precise signal. Where it is unavailable, an advancing `currentTime`
 * carries the same meaning. Only one of the two counts, so frames are never
 * double-counted.
 */
export function waitForSustainedFrames(video: HTMLVideoElement, minFrames: number, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
        let settled = false;
        let frames = 0;
        let poll = 0;

        const finish = (ok: boolean) => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timer);
            if (poll) window.clearInterval(poll);
            resolve(ok);
        };
        const count = () => {
            frames++;
            if (frames >= minFrames) finish(true);
        };

        const timer = window.setTimeout(() => finish(false), timeoutMs);

        const withCallback = video as HTMLVideoElement & {
            requestVideoFrameCallback?: (cb: () => void) => number;
        };
        if (typeof withCallback.requestVideoFrameCallback === 'function') {
            const tick = () => {
                if (settled) return;
                count();
                if (!settled) withCallback.requestVideoFrameCallback!(tick);
            };
            withCallback.requestVideoFrameCallback(tick);
        } else {
            let lastTime = -1;
            poll = window.setInterval(() => {
                if (video.videoWidth > 0 && video.currentTime > 0 && video.currentTime !== lastTime) {
                    lastTime = video.currentTime;
                    count();
                }
            }, 100);
        }
    });
}

/**
 * Try each candidate until one delivers a frame.
 *
 * The video element is used as the probe target because it is the only place a
 * frame can actually be observed. Streams that fail are stopped immediately so
 * the device is free for the next attempt — some cameras allow only one open
 * handle at a time.
 */
export async function openFirstWorkingCamera(
    video: HTMLVideoElement,
    candidates: CameraCandidate[],
    options: {
        frameTimeoutMs?: number;
        /** Frames a candidate must deliver before it is accepted. */
        minFrames?: number;
        onProgress?: (candidate: CameraCandidate, index: number, total: number) => void;
    } = {}
): Promise<{ result: CameraAttemptResult | null; failures: CameraFailure[] }> {
    const frameTimeoutMs = options.frameTimeoutMs ?? 1800;
    const minFrames = options.minFrames ?? 3;
    const failures: CameraFailure[] = [];

    for (let i = 0; i < candidates.length; i++) {
        const candidate = candidates[i];
        options.onProgress?.(candidate, i, candidates.length);

        let stream: MediaStream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ video: candidate.constraints, audio: false });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            failures.push({ candidate, reason: 'error', message });
            // A permission refusal applies to every candidate, so stop rather
            // than prompting the user once per combination.
            if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'SecurityError')) break;
            continue;
        }

        video.srcObject = stream;
        // Deliberately not awaited: play() resolves when playback actually
        // begins, so on a stream that never produces a frame — the exact case
        // being probed — the promise never settles and the whole probe hangs on
        // its first candidate. The frame wait below has its own timeout and is
        // the only signal that matters here.
        void video.play().catch(() => undefined);

        const gotFrames = await waitForSustainedFrames(video, minFrames, frameTimeoutMs);
        if (gotFrames) {
            return {
                result: { stream, candidate, settings: stream.getVideoTracks()[0]?.getSettings?.() ?? {} },
                failures
            };
        }

        failures.push({ candidate, reason: 'no-frames' });
        stream.getTracks().forEach((t) => t.stop());
        video.srcObject = null;
    }

    return { result: null, failures };
}
