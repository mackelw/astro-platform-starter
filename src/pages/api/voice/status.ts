/**
 * Twilio posts call lifecycle events here so finished calls get a final status
 * in the store rather than sitting open forever.
 */

import type { APIRoute } from 'astro';
import { getConversation, saveConversation } from '../../../lib/voice/store';
import { authenticateTwilio, rejected } from '../../../lib/voice/webhook';

export const prerender = false;

const TERMINAL_STATUSES = new Set(['completed', 'busy', 'failed', 'no-answer', 'canceled']);

export const POST: APIRoute = async ({ request }) => {
    const params = await authenticateTwilio(request);
    if (!params) return rejected();

    const status = params.CallStatus;
    if (TERMINAL_STATUSES.has(status)) {
        const conversation = await getConversation(params.CallSid);
        if (conversation) {
            await saveConversation({
                ...conversation,
                finalStatus: status,
                endedAt: conversation.endedAt ?? new Date().toISOString()
            });
        }
    }

    return new Response(null, { status: 204 });
};
