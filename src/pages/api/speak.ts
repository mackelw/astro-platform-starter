import type { APIRoute } from 'astro';
import { ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID, ELEVENLABS_MODEL } from 'astro:env/server';

export const prerender = false;

/* Text-to-speech proxy. The ElevenLabs key is read here, server-side, and the
   upstream audio is streamed straight back — the browser never sees the
   credential, which is the property the original dashboard's voice.py had. */

const API_BASE = 'https://api.elevenlabs.io/v1/text-to-speech';
const DEFAULT_VOICE_ID = 'JBFqnCBsd6RMkjVDRZzb';
const DEFAULT_MODEL = 'eleven_turbo_v2_5';

/** Upper bound on a single utterance, matching the client's own truncation. */
const MAX_TEXT_LENGTH = 5000;

const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' }
    });

export const POST: APIRoute = async ({ request }) => {
    /* Declared as `secret` in astro.config.mjs, so this reads the runtime
       environment rather than a value baked in at build time. */
    const apiKey = ELEVENLABS_API_KEY;
    if (!apiKey) {
        return json({ error: 'Speech is not configured. Set ELEVENLABS_API_KEY to enable it.' }, 503);
    }

    let payload: unknown;
    try {
        payload = await request.json();
    } catch {
        return json({ error: 'Expected a JSON body.' }, 400);
    }

    const { text, voiceId } = (payload ?? {}) as { text?: unknown; voiceId?: unknown };

    if (typeof text !== 'string' || !text.trim()) {
        return json({ error: 'Expected a non-empty "text" string.' }, 400);
    }
    if (text.length > MAX_TEXT_LENGTH) {
        return json({ error: `Text is ${text.length} characters; the limit is ${MAX_TEXT_LENGTH}.` }, 413);
    }
    /* Reject a caller-supplied voice that isn't a plain id, so this can't be
       used to reach other paths on the ElevenLabs API. */
    if (voiceId !== undefined && (typeof voiceId !== 'string' || !/^[A-Za-z0-9]{1,40}$/.test(voiceId))) {
        return json({ error: 'Invalid "voiceId".' }, 400);
    }

    const voice = voiceId ?? ELEVENLABS_VOICE_ID ?? DEFAULT_VOICE_ID;
    const model = ELEVENLABS_MODEL ?? DEFAULT_MODEL;

    let upstream: Response;
    try {
        upstream = await fetch(`${API_BASE}/${voice}`, {
            method: 'POST',
            headers: {
                'xi-api-key': apiKey,
                'content-type': 'application/json',
                accept: 'audio/mpeg'
            },
            body: JSON.stringify({ text, model_id: model })
        });
    } catch (error) {
        return json({ error: `Could not reach the speech service: ${error instanceof Error ? error.message : 'unknown error'}` }, 502);
    }

    if (!upstream.ok || !upstream.body) {
        /* Pass through what upstream said, but never the key or its headers. */
        const detail = await upstream.text().catch(() => '');
        return json({ error: `Speech service returned ${upstream.status}.`, detail: detail.slice(0, 500) }, upstream.status === 401 ? 502 : upstream.status);
    }

    return new Response(upstream.body, {
        headers: {
            'content-type': 'audio/mpeg',
            'cache-control': 'no-store'
        }
    });
};
