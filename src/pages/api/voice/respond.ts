/**
 * The conversation loop: Twilio posts here with the caller's transcribed speech
 * each time a `<Gather>` completes.
 */

import type { APIRoute } from 'astro';
import { voiceConfig } from '../../../lib/voice/config';
import { appendMessage, getConversation, saveConversation, startConversation, type Conversation } from '../../../lib/voice/store';
import { sayAndGather, sayAndHangUp, twimlResponse } from '../../../lib/voice/twiml';
import { authenticateTwilio, rejected, speakNextTurn, RESPOND_ACTION } from '../../../lib/voice/webhook';

export const prerender = false;

/** Give up and hang up after this many turns of hearing nothing. */
const MAX_EMPTY_TURNS = 2;

export const POST: APIRoute = async ({ request }) => {
    const params = await authenticateTwilio(request);
    if (!params) return rejected();

    const callSid = params.CallSid;
    const speech = params.SpeechResult?.trim() ?? '';

    // The store should already hold this call, but a mid-call storage hiccup
    // shouldn't drop a live caller — rebuild from the webhook parameters instead.
    const conversation: Conversation =
        (await getConversation(callSid)) ??
        (await startConversation({
            callSid,
            direction: 'inbound',
            from: params.From ?? 'unknown',
            to: params.To ?? voiceConfig.phoneNumber
        }));

    if (!speech) {
        const emptyTurns = (conversation.emptyTurns ?? 0) + 1;

        if (emptyTurns > MAX_EMPTY_TURNS) {
            await saveConversation({ ...conversation, emptyTurns, endedAt: new Date().toISOString() });
            return twimlResponse(sayAndHangUp('يبدو إن مفيش حد على الخط. شكراً لاتصالك، مع السلامة.'));
        }

        await saveConversation({ ...conversation, emptyTurns });
        return twimlResponse(sayAndGather('معلش، مسمعتش حاجة. ممكن تقول تاني؟', RESPOND_ACTION));
    }

    const withCallerTurn = appendMessage({ ...conversation, emptyTurns: 0 }, { role: 'user', content: speech });
    return speakNextTurn(withCallerTurn);
};
