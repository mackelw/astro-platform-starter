# jarvis-os setup notes

Config and notes for [Itsme23476/jarvis-os](https://github.com/Itsme23476/jarvis-os),
a voice HUD that drives your own Claude Code. The upstream project is cloned
separately and is gitignored here — only our own config lives in this folder.

`persona.md` in this folder is the rewritten persona: copy it over the
upstream `jarvis-os/persona.md` after cloning.

## Install

```bash
git clone https://github.com/Itsme23476/jarvis-os.git
cd jarvis-os
cp .env.example .env
# set ELEVENLABS_API_KEY in .env
cp ../jarvis-os-setup/persona.md persona.md
./start.sh
```

Opens on <http://localhost:8730>. Click **◉ VOICE**, allow the mic, and talk.

## Before first run: check for a stale auth override

```bash
grep -E 'ANTHROPIC_BASE_URL|ANTHROPIC_AUTH_TOKEN' ~/.claude/settings.json
```

Any hit — delete those keys. They override the subscription login and 401 on
every request. The symptom is that it transcribes speech but never answers,
with `authentication_failed` in `/tmp/jarvis-claude-raw.log` (the ground-truth
log for any misbehaviour).

## .env settings that matter

| Key | Value | Note |
|---|---|---|
| `ELEVENLABS_API_KEY` | *(required)* | Voice in/out. Without it `/api/status` reports `stt`/`tts` as `none` and only typed input works. |
| `ELEVENLABS_VOICE_ID` | `JBFqnCBsd6RMkjVDRZzb` | "George" — British, calm. Upstream default. `/api/voices` lists your account's voices once running. |
| `JARVIS_PERMISSION` | `bypass` | See below. |
| `JARVIS_MCP` | `all` | `none` to isolate a connector that hangs a run. |

## The permission trade-off

Default is `bypass`, which runs Claude with `--dangerously-skip-permissions`.
It has to: headless, there is nobody to click "allow", so every tool call —
connectors included — stalls forever without it.

The cost: **the assistant can use tools that touch the real world, including
sending email, without asking first.** The guardrails then live entirely in
`persona.md` and installed skills, not in a per-action prompt. That is why the
persona's "never send anything unasked — draft it and wait" boundary is
load-bearing rather than decorative.

`JARVIS_PERMISSION=default` restores approval prompts, at the price of tool
calls not completing headlessly.

## Won't run as root

`--dangerously-skip-permissions` is refused under root/sudo, so `bypass` fails
in a root container. On a normal user account this does not come up.

## Verified

Checked on Claude Code 2.1.231, Python 3.11, running headless:

- `claude -p … --output-format stream-json` streams correctly and reports
  `apiKeySource: "none"` (subscription auth, no API key needed).
- Server boots, HUD and assets serve, and `POST /api/run` with
  `{"message": "..."}` returns a persona-shaped answer over NDJSON.

Voice in/out and the browser UI were not exercised — they need a machine with
a microphone, audio output and a display.
