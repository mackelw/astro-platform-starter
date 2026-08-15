/**
 * Per-call state, kept in Netlify Blobs.
 *
 * Twilio webhooks are stateless and each turn of a conversation arrives as a
 * separate HTTP request, so the transcript has to live somewhere both the
 * inbound and outbound handlers can reach. The call SID is the natural key.
 */

import { getStore } from '@netlify/blobs';
import type Anthropic from '@anthropic-ai/sdk';
import { voiceConfig } from './config';

export type StoredMessage = Anthropic.Beta.BetaMessageParam;

export interface Conversation {
    callSid: string;
    direction: 'inbound' | 'outbound';
    from: string;
    to: string;
    /** What the agent was asked to accomplish. Outbound calls only. */
    brief?: string;
    messages: StoredMessage[];
    startedAt: string;
    updatedAt: string;
    endedAt?: string;
    /** Final Twilio call status, e.g. completed, no-answer, busy, failed. */
    finalStatus?: string;
    /** Consecutive turns where speech recognition returned nothing. */
    emptyTurns?: number;
}

/** An outbound call's instructions, written before the call is placed. */
export interface CallBrief {
    id: string;
    to: string;
    brief: string;
    createdAt: string;
}

function conversations() {
    return getStore({ name: 'voice-calls', consistency: 'strong' });
}

function briefs() {
    return getStore({ name: 'voice-briefs', consistency: 'strong' });
}

export async function getConversation(callSid: string): Promise<Conversation | null> {
    return (await conversations().get(callSid, { type: 'json' })) as Conversation | null;
}

export async function saveConversation(conversation: Conversation): Promise<void> {
    await conversations().setJSON(conversation.callSid, {
        ...conversation,
        updatedAt: new Date().toISOString()
    });
}

export type NewConversation = Omit<Conversation, 'messages' | 'startedAt' | 'updatedAt'> & {
    /** Optional opening turns, e.g. a greeting the caller is about to hear. */
    messages?: StoredMessage[];
};

export async function startConversation(input: NewConversation): Promise<Conversation> {
    const now = new Date().toISOString();
    const conversation: Conversation = { ...input, messages: input.messages ?? [], startedAt: now, updatedAt: now };
    await saveConversation(conversation);
    return conversation;
}

/**
 * Append a turn, trimming the oldest exchanges once the transcript grows past
 * `VOICE_MAX_TURNS` so a long call can't push the request past the context window.
 */
export function appendMessage(conversation: Conversation, message: StoredMessage): Conversation {
    const messages = [...conversation.messages, message];
    const limit = voiceConfig.maxTurns;
    return { ...conversation, messages: messages.length > limit ? messages.slice(-limit) : messages };
}

export async function saveBrief(brief: CallBrief): Promise<void> {
    await briefs().setJSON(brief.id, brief);
}

export async function getBrief(id: string): Promise<CallBrief | null> {
    return (await briefs().get(id, { type: 'json' })) as CallBrief | null;
}

export async function listRecentCalls(limit = 20): Promise<Conversation[]> {
    const { blobs } = await conversations().list();
    const loaded = await Promise.all(blobs.map(({ key }) => getConversation(key)));
    return loaded
        .filter((conversation): conversation is Conversation => conversation !== null)
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
        .slice(0, limit);
}
