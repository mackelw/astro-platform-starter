import { useEffect, useRef, useState } from 'react';
import type { SearchHit } from '../../../lib/brain/store';
import { formatDate } from '../../../lib/brain/format';

interface Props {
    initialNotes: SearchHit[];
    initialTags: { tag: string; count: number }[];
    initialTag?: string;
}

export default function NotesBrowser({ initialNotes, initialTags, initialTag }: Props) {
    const [query, setQuery] = useState('');
    const [tag, setTag] = useState<string | undefined>(initialTag);
    const [notes, setNotes] = useState<SearchHit[]>(initialNotes);
    const [tags, setTags] = useState(initialTags);
    const [loading, setLoading] = useState(false);
    // The first render already has server-fetched results; don't refetch them.
    const isFirstRun = useRef(true);

    useEffect(() => {
        if (isFirstRun.current) {
            isFirstRun.current = false;
            return;
        }

        const controller = new AbortController();
        const timer = setTimeout(async () => {
            setLoading(true);
            try {
                const params = new URLSearchParams();
                if (query.trim()) params.set('q', query.trim());
                if (tag) params.set('tag', tag);

                const response = await fetch(`/api/notes?${params}`, { signal: controller.signal });
                const data = await response.json();
                setNotes(data.notes ?? []);
                setTags(data.tags ?? []);
            } catch (error) {
                if (!controller.signal.aborted) console.error(error);
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        }, 250);

        return () => {
            controller.abort();
            clearTimeout(timer);
        };
    }, [query, tag]);

    return (
        <div>
            <div className="flex flex-col gap-3 mb-6 sm:flex-row">
                <input
                    type="search"
                    className="field"
                    placeholder="ابحث في العنوان والتاجز والمتن…"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    autoFocus
                />
                <a href="/brain/new" className="btn shrink-0">
                    ملاحظة جديدة
                </a>
            </div>

            {tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-8">
                    {tags.map(({ tag: name, count }) => (
                        <button key={name} type="button" className="chip" aria-pressed={tag === name} onClick={() => setTag(tag === name ? undefined : name)}>
                            <span>#{name}</span>
                            <span className="opacity-60">{count}</span>
                        </button>
                    ))}
                </div>
            )}

            <div className={'space-y-3 transition-opacity' + (loading ? ' opacity-50' : '')}>
                {notes.map((note) => (
                    <a key={note.id} href={`/brain/${encodeURIComponent(note.id)}`} className="card">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <span className="text-lg font-semibold">{note.title}</span>
                            <span className="text-sm opacity-50">{formatDate(note.updatedAt)}</span>
                        </div>
                        {(note.match || note.excerpt) && <p className="mt-2 text-sm opacity-70">{note.match || note.excerpt}</p>}
                        {note.tags.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-3 text-xs opacity-60">
                                {note.tags.map((name) => (
                                    <span key={name}>#{name}</span>
                                ))}
                            </div>
                        )}
                    </a>
                ))}

                {notes.length === 0 && (
                    <p className="py-12 text-center opacity-60">{query || tag ? 'مفيش نتائج للبحث ده.' : 'مفيش ملاحظات لسه — ابدأ بواحدة.'}</p>
                )}
            </div>
        </div>
    );
}
