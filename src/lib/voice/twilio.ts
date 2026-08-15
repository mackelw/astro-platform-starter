/**
 * Twilio integration: request authentication and the outbound call REST call.
 *
 * The webhook endpoints are public URLs that place and control phone calls, so
 * every request is verified against Twilio's HMAC signature before it is acted on.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { voiceConfig } from './config';

export type TwilioParams = Record<string, string>;

/** Read a Twilio webhook's `application/x-www-form-urlencoded` body. */
export async function parseTwilioBody(request: Request): Promise<TwilioParams> {
    const raw = await request.text();
    const params: TwilioParams = {};
    for (const [key, value] of new URLSearchParams(raw)) {
        params[key] = value;
    }
    return params;
}

/**
 * Rebuild the URL exactly as Twilio requested it — the signature is computed over
 * that string, so a mismatch in scheme or host invalidates an otherwise good request.
 * Behind Netlify's proxy the request URL's origin is internal, hence the forwarded
 * headers; `VOICE_PUBLIC_BASE_URL` overrides both when set.
 */
export function requestOrigin(request: Request): string {
    const configured = voiceConfig.publicBaseUrl;
    if (configured) return configured;

    const url = new URL(request.url);
    const proto = request.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '');
    const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? url.host;
    return `${proto}://${host}`;
}

export function webhookUrl(request: Request): string {
    const url = new URL(request.url);
    return `${requestOrigin(request)}${url.pathname}${url.search}`;
}

/**
 * Twilio signs `url + key1 + value1 + key2 + value2 + ...` with the account's auth
 * token, keys sorted lexicographically, HMAC-SHA1, base64 encoded.
 */
function expectedSignature(url: string, params: TwilioParams): string {
    const payload = Object.keys(params)
        .sort()
        .reduce((acc, key) => acc + key + params[key], url);
    return createHmac('sha1', voiceConfig.authToken).update(Buffer.from(payload, 'utf-8')).digest('base64');
}

export function isValidTwilioSignature(request: Request, params: TwilioParams): boolean {
    if (!voiceConfig.validateSignature) return true;

    const received = request.headers.get('x-twilio-signature');
    if (!received) return false;

    const expected = expectedSignature(webhookUrl(request), params);
    const receivedBuffer = Buffer.from(received, 'utf-8');
    const expectedBuffer = Buffer.from(expected, 'utf-8');
    if (receivedBuffer.length !== expectedBuffer.length) return false;
    return timingSafeEqual(receivedBuffer, expectedBuffer);
}

export interface PlaceCallOptions {
    to: string;
    /** Absolute URL Twilio fetches TwiML from once the callee answers. */
    answerUrl: string;
    /** Absolute URL Twilio posts call lifecycle events to. */
    statusCallbackUrl: string;
}

/** Ask Twilio to dial a number and hand the answered call to our TwiML. */
export async function placeCall({ to, answerUrl, statusCallbackUrl }: PlaceCallOptions): Promise<{ sid: string }> {
    const accountSid = voiceConfig.accountSid;
    const body = new URLSearchParams({
        To: to,
        From: voiceConfig.phoneNumber,
        Url: answerUrl,
        Method: 'POST',
        StatusCallback: statusCallbackUrl,
        StatusCallbackMethod: 'POST'
    });
    for (const event of ['initiated', 'ringing', 'answered', 'completed']) {
        body.append('StatusCallbackEvent', event);
    }

    const credentials = Buffer.from(`${accountSid}:${voiceConfig.authToken}`).toString('base64');
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`, {
        method: 'POST',
        headers: {
            Authorization: `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body
    });

    const data = await response.json();
    if (!response.ok) {
        throw new Error(`Twilio rejected the call: ${data?.message ?? response.statusText}`);
    }
    return { sid: data.sid };
}
