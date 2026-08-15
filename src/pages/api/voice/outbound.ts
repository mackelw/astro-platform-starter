/**
 * Twilio fetches this once an outbound call is answered. The `brief` query
 * parameter points at the instructions stored before the call was placed.
 */

import type { APIRoute } from 'astro';
import { voiceConfig } from '../../../lib/voice/config';
import { getBrief, startConversation } from '../../../lib/voice/store';
import { authenticateTwilio, rejected, speakNextTurn } from '../../../lib/voice/webhook';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
    const params = await authenticateTwilio(request);
    if (!params) return rejected();

    const briefId = new URL(request.url).searchParams.get('brief');
    const brief = briefId ? await getBrief(briefId) : null;

    const conversation = await startConversation({
        callSid: params.CallSid,
        direction: 'outbound',
        from: params.From ?? voiceConfig.phoneNumber,
        to: params.To ?? brief?.to ?? 'unknown',
        brief: brief?.brief,
        // The other party just said "hello" — the agent speaks first here, so the
        // opening line is generated rather than fixed, driven by the brief.
        messages: [{ role: 'user', content: '<call_answered /> الشخص رد على المكالمة. ابدأ الكلام دلوقتي.' }]
    });

    return speakNextTurn(conversation);
};
