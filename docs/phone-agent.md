# Phone Agent

An agent that holds a spoken conversation on a real phone line. It **answers** calls to your
Twilio number and **places** calls when you give it a number and a reason to call.

## How it works

Twilio owns the audio; Claude owns the conversation. Neither one talks to the caller directly —
they meet in the TwiML documents this app returns.

```
caller ──▶ Twilio ──POST /api/voice/incoming──▶ greeting + <Gather>
                 ◀── speech transcript ────────
       ──▶ Twilio ──POST /api/voice/respond ──▶ Claude reply + <Gather>
                                                (repeats until the agent says goodbye)
```

A call turn is one HTTP request: Twilio transcribes what the caller said, posts the text here,
this app asks Claude for the next line, and returns it as TwiML for Twilio to speak. Because each
turn is a separate stateless request, the transcript lives in Netlify Blobs keyed by Twilio's
call SID.

| Path                       | Purpose                                                                     |
| :------------------------- | :-------------------------------------------------------------------------- |
| `POST /api/voice/incoming` | Someone dialled your number. Greets them and starts listening.              |
| `POST /api/voice/respond`  | One conversation turn: caller's speech in, agent's reply out.               |
| `POST /api/voice/outbound` | An outbound call was answered. The agent speaks first, guided by the brief. |
| `POST /api/voice/status`   | Call lifecycle events, so finished calls get a final status.                |
| `POST /api/voice/call`     | Your own endpoint to place a call. Not a Twilio webhook.                    |

Source lives in `src/lib/voice/` (config, TwiML builders, Twilio client, blob store, Claude call)
and `src/pages/api/voice/` (the HTTP routes). `/phone` is a dashboard for placing calls and
seeing recent ones.

## Setup

### 1. Get a Twilio number

Buy a voice-capable number in the [Twilio Console](https://console.twilio.com/). Note your
Account SID and Auth Token from the dashboard.

### 2. Set environment variables

Copy `.env.example` to `.env` for local work, and set the same variables in
**Site configuration → Environment variables** on Netlify. At minimum:

```
ANTHROPIC_API_KEY
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_PHONE_NUMBER
VOICE_API_TOKEN     # generate with: openssl rand -hex 32
```

### 3. Point the number at this app

In the Twilio Console, open your number and under **Voice Configuration → A call comes in** set:

- Webhook: `https://your-site.netlify.app/api/voice/incoming`
- Method: `HTTP POST`

The other webhook URLs don't need configuring — they're supplied by the app itself as the call
progresses.

### 4. Try it

Call your Twilio number. To place a call, open `/phone`, paste your `VOICE_API_TOKEN`, and give
the agent a number and a reason to call. Or from the command line:

```bash
curl -X POST https://your-site.netlify.app/api/voice/call \
  -H "Authorization: Bearer $VOICE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"to":"+201234567890","brief":"Confirm tomorrow'\''s 4pm dentist appointment for Mr. Ahmed."}'
```

## Language and voice

Defaults are Egyptian Arabic for speech recognition (`VOICE_STT_LANGUAGE=ar-EG`) and the
`Polly.Hala-Neural` voice for speech output. The two settings are independent and both must suit
your callers — Twilio's
[supported languages](https://www.twilio.com/docs/voice/twiml/gather#language) and
[voices](https://www.twilio.com/docs/voice/twiml/say/text-speech) list the valid values.

The agent replies in whatever language it hears, but only the configured voice can pronounce it,
so a caller who switches languages mid-call will be answered in an accent that doesn't match.
If you need to serve several languages, run a number per language.

## Local development

Twilio has to reach your machine over the public internet, so a local-only server won't receive
webhooks. Run `netlify dev` and expose it with a tunnel (`ngrok http 8888`), then point the
Twilio number at the tunnel URL.

Set `VOICE_PUBLIC_BASE_URL` to the tunnel origin so signature validation sees the same URL Twilio
signed. `VOICE_VALIDATE_SIGNATURE=false` bypasses validation entirely for offline testing with
`curl` — never set it in a deployed environment, since it leaves the webhooks fully open.

## Design notes worth knowing

**The 15-second wall.** Twilio abandons a webhook request after 15 seconds, and the caller hears
silence for the whole wait. The Claude call therefore runs at `effort: "low"` with retries off and
a 9-second timeout; a timeout becomes a spoken "sorry, could you repeat that?" instead of a
dropped call. If you raise `VOICE_REPLY_TIMEOUT_MS`, keep it comfortably under 15000.

**Hanging up.** The agent ends a call by finishing its last message with an `[END_CALL]` marker,
which is stripped before the text is spoken. This is a marker rather than a tool call because a
tool round-trip would add a second model request to every turn's latency budget.

**Transcripts are lossy.** What reaches Claude is speech-recognition output, not what the caller
said. The system prompt tells the agent to read back names, numbers, and amounts before acting on
them; keep that instruction if you replace the prompt via `VOICE_SYSTEM_PROMPT`.

**Cost.** Every turn is a Twilio voice minute plus a Claude request carrying the whole transcript
so far. Prompt caching is on, so later turns in a call are cheaper than the token counts suggest,
but a long call is not free. `VOICE_MAX_TURNS` caps how much transcript is replayed.

## Security

The Twilio webhooks are public URLs that control live phone calls, so every request is verified
against Twilio's HMAC-SHA1 signature before it's acted on; an unsigned or altered request gets a 403. `POST /api/voice/call` isn't a Twilio request and can spend money on arbitrary numbers, so it
is gated behind the `VOICE_API_TOKEN` bearer token instead, compared in constant time.

That token is the only thing standing between the public internet and your Twilio balance. The
`/phone` dashboard deliberately never embeds it — you paste it in and it stays in that tab's
session storage. If you make the dashboard part of a real product, put it behind proper
authentication and keep the token server-side.

Two things this starter does **not** do, which you should consider before taking real calls:
recording consent and call-recipient consent. Many jurisdictions require disclosure that a caller
is speaking to an automated system, and outbound automated calling is separately regulated.
