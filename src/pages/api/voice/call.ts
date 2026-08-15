/**
 * Places an outbound call.
 *
 * This endpoint spends money and dials arbitrary numbers, so it is gated behind
 * `VOICE_API_TOKEN` rather than left open like the Twilio webhooks (which are
 * instead verified by signature).
 */

import type { APIRoute } from 'astro';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { voiceConfig } from '../../../lib/voice/config';
import { saveBrief } from '../../../lib/voice/store';
import { placeCall, requestOrigin } from '../../../lib/voice/twilio';

export const prerender = false;

const E164 = /^\+[1-9]\d{6,14}$/;
const MAX_BRIEF_LENGTH = 4000;

function isAuthorized(request: Request): boolean {
    const header = request.headers.get('authorization') ?? '';
    const presented = header.startsWith('Bearer ') ? header.slice(7) : (request.headers.get('x-voice-token') ?? '');

    const expected = voiceConfig.apiToken;
    const presentedBuffer = Buffer.from(presented, 'utf-8');
    const expectedBuffer = Buffer.from(expected, 'utf-8');
    if (presentedBuffer.length !== expectedBuffer.length) return false;
    return timingSafeEqual(presentedBuffer, expectedBuffer);
}

function json(body: unknown, status: number): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' }
    });
}

export const POST: APIRoute = async ({ request }) => {
    if (!isAuthorized(request)) {
        return json({ error: 'Unauthorized' }, 401);
    }

    let payload: { to?: string; brief?: string };
    try {
        payload = await request.json();
    } catch {
        return json({ error: 'Request body must be JSON' }, 400);
    }

    const to = payload.to?.trim() ?? '';
    const brief = payload.brief?.trim() ?? '';

    if (!E164.test(to)) {
        return json({ error: 'Field "to" must be a phone number in E.164 format, e.g. +201234567890' }, 400);
    }
    if (!brief) {
        return json({ error: 'Field "brief" is required — tell the agent why it is calling' }, 400);
    }
    if (brief.length > MAX_BRIEF_LENGTH) {
        return json({ error: `Field "brief" must be at most ${MAX_BRIEF_LENGTH} characters` }, 400);
    }

    // Write the brief before dialling, so the answer webhook can never race it.
    const briefId = randomUUID();
    await saveBrief({ id: briefId, to, brief, createdAt: new Date().toISOString() });

    const origin = requestOrigin(request);
    try {
        const { sid } = await placeCall({
            to,
            answerUrl: `${origin}/api/voice/outbound?brief=${briefId}`,
            statusCallbackUrl: `${origin}/api/voice/status`
        });
        return json({ callSid: sid, briefId }, 202);
    } catch (error) {
        console.error('[voice] failed to place outbound call', error);
        return json({ error: (error as Error).message }, 502);
    }
};
