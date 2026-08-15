/**
 * Runtime configuration for the phone agent.
 *
 * Everything is read from the environment so the same build can be pointed at a
 * different Twilio number, language or persona without a code change.
 */

function env(name: string): string | undefined {
    const value = process.env[name];
    return value && value.trim() !== '' ? value.trim() : undefined;
}

function required(name: string): string {
    const value = env(name);
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

export const voiceConfig = {
    /** Twilio account SID, e.g. ACxxxxxxxx. */
    get accountSid() {
        return required('TWILIO_ACCOUNT_SID');
    },
    /** Twilio auth token. Also the key Twilio signs webhook requests with. */
    get authToken() {
        return required('TWILIO_AUTH_TOKEN');
    },
    /** The Twilio number the agent answers on and calls out from, in E.164 format. */
    get phoneNumber() {
        return required('TWILIO_PHONE_NUMBER');
    },
    /** Shared secret required to trigger an outbound call through the HTTP API. */
    get apiToken() {
        return required('VOICE_API_TOKEN');
    },

    /**
     * Public origin Twilio reaches this site on, e.g. https://example.netlify.app.
     * Only needed when the forwarded host headers can't be trusted; the webhook
     * handlers fall back to reconstructing the URL from the request.
     */
    get publicBaseUrl() {
        return env('VOICE_PUBLIC_BASE_URL')?.replace(/\/$/, '');
    },

    /** Language Twilio transcribes the caller's speech with. */
    get sttLanguage() {
        return env('VOICE_STT_LANGUAGE') ?? 'ar-EG';
    },
    /** Twilio/Polly voice used to speak the agent's replies. */
    get ttsVoice() {
        return env('VOICE_TTS_VOICE') ?? 'Polly.Hala-Neural';
    },

    /** Opening line for inbound calls. */
    get greeting() {
        return env('VOICE_GREETING') ?? 'أهلاً بيك، معاك المساعد الآلي. اتفضل، أقدر أساعدك في إيه؟';
    },

    /** Optional override for the agent's persona and rules. */
    get systemPromptOverride() {
        return env('VOICE_SYSTEM_PROMPT');
    },

    /**
     * Signature validation is on unless explicitly disabled. Turn it off only for
     * local testing where requests don't actually originate from Twilio.
     */
    get validateSignature() {
        return env('VOICE_VALIDATE_SIGNATURE')?.toLowerCase() !== 'false';
    },

    /**
     * How long a single reply may take before the caller hears a filler line.
     * Twilio abandons a webhook request at 15s, so this must stay well under that.
     */
    get replyTimeoutMs() {
        return Number(env('VOICE_REPLY_TIMEOUT_MS') ?? 9000);
    },

    /** Turns to keep before the oldest are dropped from the model's context. */
    get maxTurns() {
        return Number(env('VOICE_MAX_TURNS') ?? 40);
    }
};

export const MODEL = 'claude-opus-5';
