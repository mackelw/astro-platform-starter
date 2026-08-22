import type { MessagingAdapter, OutboundMessage, PublishingAdapter } from './types';

/**
 * Development adapters for the two outward-facing edges.
 *
 * They record what would have gone out instead of sending it, so the approval flow can be exercised
 * end to end without a provider account. Swap in the real WhatsApp Business API client and the real
 * publishing client at deployment — `MessagingAdapter` and `PublishingAdapter` are the only surface
 * Agents 5 and 6 depend on.
 */

export interface RecordedMessage {
    message: OutboundMessage;
    at: string;
}

export function createRecordingMessagingAdapter(): MessagingAdapter & { sent: RecordedMessage[] } {
    const sent: RecordedMessage[] = [];
    return {
        sent,
        async send(message) {
            const sentAt = new Date().toISOString();
            sent.push({ message, at: sentAt });
            return { providerId: `dev_${message.id}`, sentAt };
        }
    };
}

export function createRecordingPublishingAdapter(): PublishingAdapter & { published: string[] } {
    const published: string[] = [];
    return {
        published,
        async publish(draft) {
            published.push(draft.id);
            return { publishedAt: new Date().toISOString(), url: `https://clinic.example/content/${draft.id}` };
        }
    };
}
