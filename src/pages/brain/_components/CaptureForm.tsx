import { useState } from 'react';

interface Props {
    initialUrl?: string;
}

export default function CaptureForm({ initialUrl }: Props) {
    const [url, setUrl] = useState(initialUrl ?? '');
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState<{ text: string; href?: string; error?: boolean } | null>(null);

    const capture = async (event: React.FormEvent) => {
        event.preventDefault();
        setBusy(true);
        setMessage(null);
        try {
            const response = await fetch('/api/capture', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url, note })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error ?? 'اللقط فشل');

            setMessage({ text: `اتحفظ: ${data.note.title}`, href: `/brain/${encodeURIComponent(data.note.id)}` });
            setUrl('');
            setNote('');
        } catch (captureError) {
            setMessage({ text: captureError instanceof Error ? captureError.message : 'اللقط فشل', error: true });
        } finally {
            setBusy(false);
        }
    };

    return (
        <form onSubmit={capture} className="space-y-3">
            <input className="field" type="url" dir="ltr" required placeholder="https://…" value={url} onChange={(event) => setUrl(event.target.value)} />
            <input className="field" placeholder="ملاحظة سريعة (اختياري)" value={note} onChange={(event) => setNote(event.target.value)} />
            <div className="flex flex-wrap items-center gap-4">
                <button className="btn" type="submit" disabled={busy || !url}>
                    {busy ? 'بيجيب الصفحة…' : 'الْقُط اللينك'}
                </button>
                {message && (
                    <span className={message.error ? 'text-primary' : 'opacity-70'}>
                        {message.href ? <a href={message.href}>{message.text}</a> : message.text}
                    </span>
                )}
            </div>
        </form>
    );
}
