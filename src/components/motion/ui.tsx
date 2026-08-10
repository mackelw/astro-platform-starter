import React from 'react';

/**
 * Small presentational primitives shared by the studio panels. Nothing here
 * knows about motion analysis — it is layout, spacing and form controls only.
 */

export function Panel({
    title,
    subtitle,
    children,
    actions,
    dense
}: {
    title: string;
    subtitle?: string;
    children: React.ReactNode;
    actions?: React.ReactNode;
    dense?: boolean;
}): React.ReactElement {
    return (
        <section className="rounded-lg border border-white/15 bg-white/5 backdrop-blur-sm">
            <header className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
                <div>
                    <h3 className="text-sm font-bold tracking-tight">{title}</h3>
                    {subtitle && <p className="mt-0.5 text-xs text-white/60">{subtitle}</p>}
                </div>
                {actions}
            </header>
            <div className={dense ? 'p-3' : 'flex flex-col gap-4 p-4'}>{children}</div>
        </section>
    );
}

export function Field({
    label,
    hint,
    children
}: {
    label: string;
    hint?: string;
    children: React.ReactNode;
}): React.ReactElement {
    return (
        <label className="flex flex-col gap-1.5 text-xs">
            <span className="font-semibold text-white/85">{label}</span>
            {children}
            {hint && <span className="text-[11px] leading-snug text-white/50">{hint}</span>}
        </label>
    );
}

export function Slider({
    label,
    value,
    min,
    max,
    step = 1,
    unit,
    hint,
    onChange
}: {
    label: string;
    value: number;
    min: number;
    max: number;
    step?: number;
    unit?: string;
    hint?: string;
    onChange: (v: number) => void;
}): React.ReactElement {
    return (
        <div className="flex flex-col gap-1.5 text-xs">
            <div className="flex items-baseline justify-between gap-2">
                <span className="font-semibold text-white/85">{label}</span>
                <span className="font-mono text-[11px] text-primary">
                    {value}
                    {unit ? ` ${unit}` : ''}
                </span>
            </div>
            <input
                type="range"
                className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/20 accent-primary"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => onChange(Number(e.target.value))}
            />
            {hint && <span className="text-[11px] leading-snug text-white/50">{hint}</span>}
        </div>
    );
}

export function Toggle({
    label,
    checked,
    hint,
    onChange
}: {
    label: string;
    checked: boolean;
    hint?: string;
    onChange: (v: boolean) => void;
}): React.ReactElement {
    return (
        <label className="flex cursor-pointer items-start gap-2.5 text-xs">
            <input
                type="checkbox"
                className="mt-0.5 size-4 shrink-0 cursor-pointer accent-primary"
                checked={checked}
                onChange={(e) => onChange(e.target.checked)}
            />
            <span className="flex flex-col gap-0.5">
                <span className="font-semibold text-white/85">{label}</span>
                {hint && <span className="text-[11px] leading-snug text-white/50">{hint}</span>}
            </span>
        </label>
    );
}

export function Segmented<T extends string>({
    value,
    options,
    onChange
}: {
    value: T;
    options: { value: T; label: string; title?: string }[];
    onChange: (v: T) => void;
}): React.ReactElement {
    return (
        <div className="flex flex-wrap gap-1 rounded-md bg-black/25 p-1">
            {options.map((o) => (
                <button
                    key={o.value}
                    type="button"
                    title={o.title}
                    onClick={() => onChange(o.value)}
                    className={`grow rounded px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                        value === o.value ? 'bg-primary text-primary-content' : 'text-white/70 hover:bg-white/10'
                    }`}
                >
                    {o.label}
                </button>
            ))}
        </div>
    );
}

export function Select({
    value,
    onChange,
    children
}: {
    value: string;
    onChange: (v: string) => void;
    children: React.ReactNode;
}): React.ReactElement {
    return (
        <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full rounded border border-white/20 bg-black/30 px-2.5 py-2 text-xs text-white outline-none focus:border-primary"
        >
            {children}
        </select>
    );
}

export function NumberInput({
    value,
    onChange,
    min,
    max,
    step = 1,
    suffix
}: {
    value: number;
    onChange: (v: number) => void;
    min?: number;
    max?: number;
    step?: number;
    suffix?: string;
}): React.ReactElement {
    return (
        <div className="flex items-center gap-2 rounded border border-white/20 bg-black/30 px-2.5 focus-within:border-primary">
            <input
                type="number"
                value={Number.isFinite(value) ? value : ''}
                min={min}
                max={max}
                step={step}
                onChange={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isFinite(n)) onChange(n);
                }}
                className="w-full bg-transparent py-2 text-xs text-white outline-none"
            />
            {suffix && <span className="shrink-0 text-[11px] text-white/50">{suffix}</span>}
        </div>
    );
}

export function TextInput({
    value,
    onChange,
    placeholder
}: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
}): React.ReactElement {
    return (
        <input
            type="text"
            value={value}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
            className="w-full rounded border border-white/20 bg-black/30 px-2.5 py-2 text-xs text-white outline-none placeholder:text-white/35 focus:border-primary"
        />
    );
}

export function Button({
    children,
    onClick,
    variant = 'default',
    disabled,
    title,
    full
}: {
    children: React.ReactNode;
    onClick?: () => void;
    variant?: 'default' | 'primary' | 'danger' | 'ghost';
    disabled?: boolean;
    title?: string;
    full?: boolean;
}): React.ReactElement {
    const styles: Record<string, string> = {
        default: 'bg-white/10 text-white hover:bg-white/20',
        primary: 'bg-primary text-primary-content hover:bg-primary/85',
        danger: 'bg-red-500/15 text-red-200 hover:bg-red-500/30',
        ghost: 'text-white/70 hover:bg-white/10'
    };
    return (
        <button
            type="button"
            title={title}
            disabled={disabled}
            onClick={onClick}
            className={`inline-flex items-center justify-center gap-1.5 rounded px-3 py-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:bg-white/5 disabled:text-white/30 ${styles[variant]} ${full ? 'w-full' : ''}`}
        >
            {children}
        </button>
    );
}

export function Stat({
    label,
    value,
    tone = 'default'
}: {
    label: string;
    value: string;
    tone?: 'default' | 'good' | 'warn';
}): React.ReactElement {
    const toneClass = tone === 'good' ? 'text-green-300' : tone === 'warn' ? 'text-amber-300' : 'text-white';
    return (
        <div className="rounded bg-black/25 px-2.5 py-2">
            <div className="text-[10px] uppercase tracking-wide text-white/50">{label}</div>
            <div className={`mt-0.5 font-mono text-sm font-semibold ${toneClass}`}>{value}</div>
        </div>
    );
}

export function Hint({ children }: { children: React.ReactNode }): React.ReactElement {
    return (
        <p className="rounded border border-primary/30 bg-primary/10 px-3 py-2 text-[11px] leading-relaxed text-white/80">
            {children}
        </p>
    );
}
