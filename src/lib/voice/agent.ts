/**
 * The conversational brain behind the phone agent.
 *
 * A phone call is a hard latency budget: Twilio abandons a webhook request after
 * 15 seconds and the caller hears dead air the whole time. So this runs at low
 * effort with a small output cap, never retries, and always returns something
 * speakable — a timeout or an API error becomes a spoken apology, not an exception
 * that drops the call.
 */

import Anthropic from '@anthropic-ai/sdk';
import { MODEL, voiceConfig } from './config';
import type { Conversation, StoredMessage } from './store';

/** Marker the model appends when the conversation is finished. Stripped before speaking. */
const END_CALL_MARKER = '[END_CALL]';

const BASE_SYSTEM_PROMPT = `You are a voice agent on a live phone call. Everything you write is converted to speech and spoken aloud to the caller.

Speaking rules:
- Reply in the language the caller is speaking. Default to Egyptian Arabic.
- Keep each turn to one or two short sentences. This is a conversation, not a document.
- Use plain spoken words only. No markdown, bullet points, headings, emoji, code, URLs, or symbols. Write numbers, times, dates and amounts the way a person says them out loud.
- Never describe what you are doing ("let me check", "one moment") unless you genuinely need the caller to wait.

Handling the caller:
- The caller's words reach you as automatic speech recognition output and will contain mistakes. When a name, phone number, address, or amount matters, read it back and confirm before acting on it.
- If you did not understand, say so plainly and ask them to repeat.
- Ask one question at a time.

Boundaries:
- Never invent facts about prices, availability, policies, or anyone's account. If you do not know something, say you will pass it to a person rather than guessing.
- Deliver what the caller asked for at the scope they intended. Do not promise actions you have no way to perform.

Ending the call:
- When the conversation is genuinely finished, say a short goodbye and end that message with ${END_CALL_MARKER}.
- Only use that marker when the call should hang up.`;

let cachedClient: Anthropic | null = null;

function client(): Anthropic {
    if (!cachedClient) {
        cachedClient = new Anthropic();
    }
    return cachedClient;
}

function systemPrompt(conversation: Conversation): string {
    const base = voiceConfig.systemPromptOverride ?? BASE_SYSTEM_PROMPT;
    if (conversation.direction === 'outbound' && conversation.brief) {
        return `${base}

You placed this outbound call. Your purpose:
${conversation.brief}

Introduce yourself and state why you are calling in your first turn. If you reach a voicemail or the person says it is a bad time, apologise briefly and end the call.`;
    }
    return base;
}

/** Strip anything that would be read out as punctuation noise by the TTS voice. */
function toSpeakableText(raw: string): string {
    return raw
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/[*_#`>|]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export interface AgentReply {
    /** Text to speak to the caller. Always non-empty. */
    text: string;
    /** Full content blocks to replay on the next turn, thinking blocks included. */
    content: StoredMessage['content'] | null;
    /** True when the agent signalled the call is over, or an error makes continuing pointless. */
    shouldHangUp: boolean;
    outcome: 'ok' | 'refusal' | 'timeout' | 'error';
}

/**
 * Produce the agent's next spoken turn.
 *
 * `messages` must already include the caller's latest utterance. On the opening
 * turn of an outbound call it may be a single priming user message.
 */
export async function generateReply(conversation: Conversation): Promise<AgentReply> {
    try {
        const response = await client().beta.messages.create(
            {
                model: MODEL,
                max_tokens: 2000,
                // Phone calls are latency-bound. Low effort keeps thinking short;
                // thinking stays on, which Opus 5 needs for reliable tool-free replies.
                output_config: { effort: 'low' },
                // Route safety refusals to a fallback model instead of dead air.
                betas: ['server-side-fallback-2026-07-01'],
                fallbacks: 'default',
                // Caches the conversation prefix so later turns in the call are faster.
                cache_control: { type: 'ephemeral' },
                system: systemPrompt(conversation),
                messages: conversation.messages
            },
            { timeout: voiceConfig.replyTimeoutMs, maxRetries: 0 }
        );

        if (response.stop_reason === 'refusal') {
            return {
                text: 'معلش، مش هقدر أساعد في الموضوع ده. هحول حضرتك لواحد من زمايلي.',
                content: null,
                shouldHangUp: true,
                outcome: 'refusal'
            };
        }

        const spoken = toSpeakableText(
            response.content
                .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text')
                .map((block) => block.text)
                .join(' ')
        );

        const shouldHangUp = spoken.includes(END_CALL_MARKER);
        const text = toSpeakableText(spoken.split(END_CALL_MARKER).join(' '));

        if (!text) {
            return {
                text: 'معلش، ممكن تعيد اللي قلته تاني؟',
                content: null,
                shouldHangUp: false,
                outcome: 'error'
            };
        }

        return { text, content: response.content, shouldHangUp, outcome: 'ok' };
    } catch (error) {
        const timedOut = error instanceof Anthropic.APIConnectionTimeoutError || (error as Error)?.name === 'TimeoutError';
        console.error('[voice] reply generation failed', error);
        return {
            text: timedOut ? 'معلش، اتأخرت عليك شوية. ممكن تقول تاني؟' : 'معلش، في مشكلة تقنية عندي دلوقتي. من فضلك حاول تتصل تاني بعد شوية.',
            content: null,
            shouldHangUp: !timedOut,
            outcome: timedOut ? 'timeout' : 'error'
        };
    }
}
