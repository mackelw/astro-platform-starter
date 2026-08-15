/**
 * Twilio calls this when someone dials the agent's number.
 * Configure it as the number's "A call comes in" webhook (HTTP POST).
 */

import type { APIRoute } from 'astro';
import { voiceConfig } from '../../../lib/voice/config';
import { startConversation } from '../../../lib/voice/store';
import { sayAndGather, twimlResponse } from '../../../lib/voice/twiml';
import { authenticateTwilio, rejected, RESPOND_ACTION } from '../../../lib/voice/webhook';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
    const params = await authenticateTwilio(request);
    if (!params) return rejected();

    const from = params.From ?? 'unknown';
    const greeting = voiceConfig.greeting;

    // Seed the transcript with the greeting the caller is about to hear, so the
    // agent's next turn knows what it already said. The API requires the first
    // message to come from the user, hence the call-start marker.
    await startConversation({
        callSid: params.CallSid,
        direction: 'inbound',
        from,
        to: params.To ?? voiceConfig.phoneNumber,
        messages: [
            { role: 'user', content: `<call_started direction="inbound" from="${from}" />` },
            { role: 'assistant', content: greeting }
        ]
    });

    return twimlResponse(sayAndGather(greeting, RESPOND_ACTION));
};
