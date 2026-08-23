/** Client helper for the `/api/speak` proxy.
 *
 * Browser-only — it plays audio. The API key stays on the server; this module
 * never sees it. */

/** Strips the parts of an agent transcript that shouldn't be read aloud:
 * terminal escapes, session bookkeeping lines, code fences and markdown marks. */
export function cleanForSpeech(text: string): string {
    return String(text ?? '')
        .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !/^(session_id:|session:|duration:|messages:|query:|initializing agent|resume this session|[-─=]{3,})/i.test(line))
        .join(' ')
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/[*_#>`]/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

export interface SpeakOptions {
    /** Override the server's configured voice. */
    voiceId?: string;
    /** Cancel an in-flight utterance. */
    signal?: AbortSignal;
    /** Called when playback starts, e.g. to put the Reactor into `speaking`. */
    onStart?: () => void;
}

export class SpeechUnavailableError extends Error {
    constructor(
        readonly status: number,
        message: string
    ) {
        super(message);
        this.name = 'SpeechUnavailableError';
    }
}

/** Speaks `text` and resolves once playback finishes.
 *
 * Throws `SpeechUnavailableError` when the server has no key configured (503),
 * so a caller can fall back to browser speech synthesis. */
export async function speak(text: string, options: SpeakOptions = {}): Promise<void> {
    const spoken = cleanForSpeech(text);
    if (!spoken) return;

    const response = await fetch('/api/speak', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: spoken, voiceId: options.voiceId }),
        signal: options.signal
    });

    if (!response.ok) {
        const detail = await response.json().catch(() => ({ error: `Speech request failed (${response.status}).` }));
        throw new SpeechUnavailableError(response.status, detail.error ?? `Speech request failed (${response.status}).`);
    }

    const url = URL.createObjectURL(await response.blob());
    const audio = new Audio(url);

    try {
        await new Promise<void>((resolve, reject) => {
            audio.onended = () => resolve();
            audio.onerror = () => reject(new Error('Audio playback failed.'));
            options.signal?.addEventListener('abort', () => {
                audio.pause();
                resolve();
            });
            options.onStart?.();
            audio.play().catch(reject);
        });
    } finally {
        // Revoke on every path, or a long session leaks a blob per utterance.
        URL.revokeObjectURL(url);
    }
}
