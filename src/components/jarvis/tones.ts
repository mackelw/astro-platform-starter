/** Signal colours shared by the HUD components.
 *
 * Each one maps to a `--color-hud-*` theme token and is applied through the
 * `--hud-tone` custom property, so a component styles its dot, rule or value
 * from one declaration instead of a class per colour. */
export const tones = ['cyan', 'ok', 'warn', 'alert', 'violet', 'muted'] as const;

export type Tone = (typeof tones)[number];

const tokens: Record<Tone, string> = {
    cyan: 'var(--color-hud-cyan)',
    ok: 'var(--color-hud-green)',
    warn: 'var(--color-hud-amber)',
    alert: 'var(--color-hud-red)',
    violet: 'var(--color-hud-violet)',
    muted: 'var(--color-hud-dim)'
};

export function toneVar(tone: Tone): string {
    return tokens[tone];
}

/** Telemetry event kinds. Each has a `.hud-entry--*` accent in `jarvis.css`;
 * adding a kind means adding it here and one rule there. */
export const logKinds = ['run', 'status', 'voice', 'latency', 'tool', 'command', 'complete', 'send', 'error', 'thought', 'reasoning', 'note'] as const;

export type LogKind = (typeof logKinds)[number];
