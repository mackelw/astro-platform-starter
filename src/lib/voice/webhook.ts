/**
 * Shared plumbing for the Twilio webhook endpoints.
 */

import { isValidTwilioSignature, parseTwilioBody, type TwilioParams } from './twilio';
import { generateReply } from './agent';
import { appendMessage, saveConversation, type Conversation } from './store';
import { sayAndGather, sayAndHangUp, twimlResponse } from './twiml';

/** Where `<Gather>` sends the caller's transcribed speech. */
export const RESPOND_ACTION = '/api/voice/respond';

/**
 * Parse a webhook body and verify it really came from Twilio.
 * Returns null when the signature doesn't check out.
 */
export async function authenticateTwilio(request: Request): Promise<TwilioParams | null> {
    const params = await parseTwilioBody(request);
    if (!isValidTwilioSignature(request, params)) {
        console.warn('[voice] rejected webhook with invalid Twilio signature');
        return null;
    }
    return params;
}

export function rejected(): Response {
    return new Response('Invalid Twilio signature', { status: 403 });
}

/**
 * Ask the agent for its next line, persist the turn, and turn it into TwiML that
 * either keeps listening or hangs up.
 */
export async function speakNextTurn(conversation: Conversation): Promise<Response> {
    const reply = await generateReply(conversation);

    let updated = conversation;
    if (reply.content) {
        updated = appendMessage(updated, { role: 'assistant', content: reply.content });
    }
    if (reply.shouldHangUp) {
        updated = { ...updated, endedAt: new Date().toISOString() };
    }
    await saveConversation(updated);

    return twimlResponse(reply.shouldHangUp ? sayAndHangUp(reply.text) : sayAndGather(reply.text, RESPOND_ACTION));
}
