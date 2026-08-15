/**
 * Builders for the TwiML documents Twilio executes on a live call.
 *
 * Every value that reaches the XML goes through `escapeXml` — the agent's replies
 * are model output and a stray `&` or `<` would produce a document Twilio rejects,
 * which the caller experiences as the call dropping.
 */

import { voiceConfig } from './config';

export function escapeXml(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export function twimlResponse(body: string): Response {
    return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<Response>${body}</Response>`, {
        status: 200,
        headers: { 'Content-Type': 'text/xml; charset=utf-8' }
    });
}

function say(text: string): string {
    return `<Say voice="${escapeXml(voiceConfig.ttsVoice)}">${escapeXml(text)}</Say>`;
}

/**
 * Speak a line and then listen for the caller's reply.
 *
 * The `<Say>` is nested inside `<Gather>` so the caller can interrupt the agent
 * mid-sentence instead of waiting for it to finish. `actionOnEmptyResult` makes
 * Twilio call us back even when it heard nothing, so silence gets a re-prompt
 * rather than hanging up.
 */
export function sayAndGather(text: string, action: string): string {
    return (
        `<Gather input="speech" action="${escapeXml(action)}" method="POST"` +
        ` language="${escapeXml(voiceConfig.sttLanguage)}" speechTimeout="auto" actionOnEmptyResult="true">` +
        `${say(text)}` +
        `</Gather>`
    );
}

/** Speak a final line and hang up. */
export function sayAndHangUp(text: string): string {
    return `${say(text)}<Hangup/>`;
}

export { say };
