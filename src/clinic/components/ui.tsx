import React, { useEffect } from 'react';

type Div = React.HTMLAttributes<HTMLDivElement>;

export function Card({ className = '', ...props }: Div) {
    // min-w-0 يمنع تمدد البطاقة داخل الشبكات عند وجود جدول عريض بداخلها
    return <div className={`min-w-0 rounded-xl border border-slate-200 bg-white shadow-sm ${className}`} {...props} />;
}

export function CardHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
    return (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <div>
                <h3 className="text-base font-bold text-slate-800">{title}</h3>
                {subtitle ? <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p> : null}
            </div>
            {action}
        </div>
    );
}

const variants: Record<string, string> = {
    primary: 'bg-teal-600 text-white hover:bg-teal-700',
    secondary: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50',
    danger: 'bg-rose-600 text-white hover:bg-rose-700',
    ghost: 'bg-transparent text-slate-600 hover:bg-slate-100',
    subtle: 'bg-teal-50 text-teal-700 hover:bg-teal-100'
};

export function Button({
    variant = 'primary',
    className = '',
    type = 'button',
    ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof variants }) {
    return (
        <button
            type={type}
            className={`inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
            {...props}
        />
    );
}

export function Badge({ className = '', children }: { className?: string; children: React.ReactNode }) {
    return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${className}`}>{children}</span>;
}

export function Field({ label, hint, className = '', children }: { label: string; hint?: string; className?: string; children: React.ReactNode }) {
    return (
        <label className={`block ${className}`}>
            <span className="mb-1 block text-xs font-semibold text-slate-600">{label}</span>
            {children}
            {hint ? <span className="mt-1 block text-[11px] text-slate-400">{hint}</span> : null}
        </label>
    );
}

const controlClass =
    'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-100';

export function Input({ className = '', ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
    return <input className={`${controlClass} ${className}`} {...props} />;
}

export function Select({ className = '', ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
    return <select className={`${controlClass} ${className}`} {...props} />;
}

export function Textarea({ className = '', ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
    return <textarea className={`${controlClass} min-h-24 ${className}`} {...props} />;
}

export function Modal({
    open,
    title,
    onClose,
    children,
    footer,
    wide = false
}: {
    open: boolean;
    title: string;
    onClose: () => void;
    children: React.ReactNode;
    footer?: React.ReactNode;
    wide?: boolean;
}) {
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', onKey);
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = '';
        };
    }, [open, onClose]);

    if (!open) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 sm:p-8" onMouseDown={onClose}>
            <div
                className={`w-full ${wide ? 'max-w-4xl' : 'max-w-xl'} rounded-xl bg-white shadow-xl`}
                onMouseDown={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
            >
                <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                    <h3 className="text-base font-bold text-slate-800">{title}</h3>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="إغلاق"
                        className="cursor-pointer rounded-lg px-2 py-1 text-lg text-slate-400 hover:bg-slate-100"
                    >
                        ✕
                    </button>
                </div>
                <div className="max-h-[70vh] overflow-y-auto px-4 py-4">{children}</div>
                {footer ? <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-4 py-3">{footer}</div> : null}
            </div>
        </div>
    );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
    return (
        <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
            <p className="text-sm font-semibold text-slate-600">{title}</p>
            {hint ? <p className="text-xs text-slate-400">{hint}</p> : null}
            {action ? <div className="mt-2">{action}</div> : null}
        </div>
    );
}

export function Table({ head, children }: { head: React.ReactNode[]; children: React.ReactNode }) {
    return (
        <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-right text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                        {head.map((cell, i) => (
                            <th key={i} className="px-4 py-2.5 font-semibold">
                                {cell}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">{children}</tbody>
            </table>
        </div>
    );
}

export function Td({ className = '', ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
    return <td className={`px-4 py-2.5 align-middle ${className}`} {...props} />;
}
