import { useEffect, useState } from 'react';
import { Marked } from 'marked';
import type { Note } from '../../../lib/brain/types';

interface Props {
    note?: Note;
    initialTitle?: string;
}

// A light stand-in for the server renderer in src/utils/markdown.ts: same
// [[wiki-link]] syntax, but without pulling the Shiki highlighter into the
// browser bundle just to preview a draft.
const preview = new Marked().use({
    extensions: [
        {
            name: 'wikiLink',
            level: 'inline' as const,
            start: (src: string) => src.indexOf('[['),
            tokenizer(src: string) {
                const match = /^\[\[([^\[\]|]+)(?:\|([^\[\]]*))?\]\]/.exec(src);
                if (!match) return undefined;
                return { type: 'wikiLink', raw: match[0], text: (match[2] ?? match[1]).trim() };
            },
            renderer: (token: { text: string }) => `<span class="wikilink">${token.text}</span>`
        }
    ]
});

export default function NoteEditor({ note, initialTitle }: Props) {
    const [title, setTitle] = useState(note?.title ?? initialTitle ?? '');
    const [tags, setTags] = useState((note?.tags ?? []).join(', '));
    const [body, setBody] = useState(note?.body ?? '');
    const [showPreview, setShowPreview] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const save = async () => {
        if (!title.trim() && !body.trim()) {
            setError('اكتب عنوان أو محتوى الأول.');
            return;
        }

        setSaving(true);
        setError(null);
        try {
            const response = await fetch(note ? `/api/notes/${encodeURIComponent(note.id)}` : '/api/notes', {
                method: note ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, body, tags })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error ?? 'الحفظ فشل');
            window.location.href = `/brain/${encodeURIComponent(data.note.id)}`;
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : 'الحفظ فشل');
            setSaving(false);
        }
    };

    const remove = async () => {
        if (!note || !confirm(`تحذف "${note.title}" نهائيًا؟`)) return;

        setSaving(true);
        const response = await fetch(`/api/notes/${encodeURIComponent(note.id)}`, { method: 'DELETE' });
        if (response.ok) {
            window.location.href = '/brain';
        } else {
            setError('الحذف فشل');
            setSaving(false);
        }
    };

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 's') {
                event.preventDefault();
                save();
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    });

    return (
        <div className="space-y-4">
            {/* dir="auto" so a note titled in English aligns left and one in Arabic aligns right. */}
            <input
                className="field text-xl font-semibold"
                dir="auto"
                placeholder="عنوان الملاحظة"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                autoFocus={!note}
            />
            <input className="field" placeholder="تاجز مفصولة بفاصلة — مثال: قراءة, أفكار" value={tags} onChange={(event) => setTags(event.target.value)} />

            {showPreview ? (
                <div
                    className="markdown min-h-80 p-4 border rounded-lg border-white/15 bg-white/5"
                    dangerouslySetInnerHTML={{ __html: preview.parse(body) as string }}
                />
            ) : (
                <textarea
                    className="field min-h-80 font-mono text-sm leading-relaxed"
                    dir="auto"
                    placeholder={'اكتب بصيغة Markdown.\nاربط ملاحظة تانية كده: [[اسم الملاحظة]]'}
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                />
            )}

            {error && <p className="text-primary">{error}</p>}

            <div className="flex flex-wrap items-center gap-3">
                <button type="button" className="btn" onClick={save} disabled={saving}>
                    {saving ? 'جارٍ الحفظ…' : 'حفظ'}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setShowPreview(!showPreview)}>
                    {showPreview ? 'تحرير' : 'معاينة'}
                </button>
                <span className="text-sm opacity-50">Ctrl/⌘ + S</span>
                {note && (
                    <button type="button" className="ms-auto text-sm underline opacity-60 hover:opacity-100" onClick={remove} disabled={saving}>
                        حذف الملاحظة
                    </button>
                )}
            </div>
        </div>
    );
}
