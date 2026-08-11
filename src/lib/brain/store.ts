import { getStore } from '@netlify/blobs';
import type { Note, NoteInput, NoteSummary } from './types';
import { excerpt, normalizeTags, parseWikiLinks, slugify, toSummary } from './notes';

const STORE_NAME = 'second-brain';
const INDEX_KEY = 'index';
const NOTE_PREFIX = 'notes/';

const writeStore = () => getStore(STORE_NAME);
// Reads that must reflect a write we just made (the index, mostly) need strong
// consistency — same reason src/pages/api/blobs.ts asks for it when listing.
const readStore = () => getStore({ name: STORE_NAME, consistency: 'strong' });

const noteKey = (id: string) => `${NOTE_PREFIX}${id}`;
const byRecent = (a: NoteSummary, b: NoteSummary) => b.updatedAt.localeCompare(a.updatedAt);

export async function getIndex(): Promise<NoteSummary[]> {
    const index = await readStore().get(INDEX_KEY, { type: 'json' });
    return Array.isArray(index) ? (index as NoteSummary[]) : [];
}

async function putIndex(index: NoteSummary[]): Promise<void> {
    await writeStore().setJSON(INDEX_KEY, index.sort(byRecent));
}

export async function getNote(id: string): Promise<Note | null> {
    const note = await readStore().get(noteKey(id), { type: 'json' });
    return (note as Note) ?? null;
}

export async function getNotes(ids: string[]): Promise<Note[]> {
    const notes: Note[] = [];
    // Bounded fan-out so a large brain doesn't open hundreds of sockets at once.
    for (let i = 0; i < ids.length; i += 20) {
        const batch = await Promise.all(ids.slice(i, i + 20).map((id) => getNote(id)));
        notes.push(...(batch.filter(Boolean) as Note[]));
    }
    return notes;
}

async function uniqueId(title: string, index: NoteSummary[]): Promise<string> {
    const base = slugify(title) || `note-${Date.now().toString(36)}`;
    const taken = new Set(index.map((summary) => summary.id));
    if (!taken.has(base)) return base;
    for (let n = 2; ; n++) {
        const candidate = `${base}-${n}`;
        if (!taken.has(candidate)) return candidate;
    }
}

export async function createNote(input: NoteInput): Promise<Note> {
    const index = await getIndex();
    const title = input.title?.trim() || 'Untitled';
    const body = input.body ?? '';
    const now = new Date().toISOString();
    const note: Note = {
        id: await uniqueId(title, index),
        title,
        body,
        tags: normalizeTags(input.tags),
        linksTo: parseWikiLinks(body),
        createdAt: now,
        updatedAt: now
    };
    if (input.url) note.url = input.url;

    await writeStore().setJSON(noteKey(note.id), note);
    await putIndex([...index.filter((summary) => summary.id !== note.id), toSummary(note)]);
    return note;
}

export async function updateNote(id: string, input: NoteInput): Promise<Note | null> {
    const existing = await getNote(id);
    if (!existing) return null;

    const body = input.body ?? existing.body;
    const note: Note = {
        ...existing,
        title: input.title?.trim() || existing.title,
        body,
        tags: input.tags === undefined ? existing.tags : normalizeTags(input.tags),
        url: input.url === undefined ? existing.url : input.url || undefined,
        linksTo: parseWikiLinks(body),
        updatedAt: new Date().toISOString()
    };

    await writeStore().setJSON(noteKey(id), note);
    const index = await getIndex();
    await putIndex([...index.filter((summary) => summary.id !== id), toSummary(note)]);
    return note;
}

export async function deleteNote(id: string): Promise<boolean> {
    const existing = await getNote(id);
    if (!existing) return false;
    await writeStore().delete(noteKey(id));
    const index = await getIndex();
    await putIndex(index.filter((summary) => summary.id !== id));
    return true;
}

// Repair path: the index is derived data, so it can always be rebuilt from the
// notes/* blobs if a write is interrupted midway.
export async function rebuildIndex(): Promise<NoteSummary[]> {
    const { blobs } = await readStore().list({ prefix: NOTE_PREFIX });
    const ids = blobs.map(({ key }) => key.slice(NOTE_PREFIX.length));
    const index = (await getNotes(ids)).map(toSummary);
    await putIndex(index);
    return index.sort(byRecent);
}

export type SearchOptions = {
    q?: string;
    tag?: string;
    limit?: number;
};

export type SearchHit = NoteSummary & { match?: string };

// One code path for both listing and searching: filter the index by tag, then —
// only when there is a query — pull the full bodies of the survivors to rank them.
export async function searchNotes({ q, tag, limit = 50 }: SearchOptions): Promise<SearchHit[]> {
    const index = await getIndex();
    const filtered = tag ? index.filter((summary) => summary.tags.includes(tag)) : index;

    const query = q?.trim().toLowerCase();
    if (!query) return filtered.sort(byRecent).slice(0, limit);

    const bodies = new Map((await getNotes(filtered.map((summary) => summary.id))).map((note) => [note.id, note.body]));
    const scored: { hit: SearchHit; score: number }[] = [];

    for (const summary of filtered) {
        const body = bodies.get(summary.id) ?? '';
        let score = 0;
        if (summary.title.toLowerCase().includes(query)) score += 5;
        if (summary.tags.some((t) => t.includes(query))) score += 3;

        const bodyIndex = body.toLowerCase().indexOf(query);
        if (bodyIndex >= 0) score += 1;
        if (!score) continue;

        // Show the surrounding sentence for body hits so the result explains itself.
        const match = bodyIndex >= 0 ? excerpt(body.slice(Math.max(0, bodyIndex - 60)), 160) : undefined;
        scored.push({ hit: { ...summary, match }, score });
    }

    return scored
        .sort((a, b) => b.score - a.score || byRecent(a.hit, b.hit))
        .slice(0, limit)
        .map(({ hit }) => hit);
}
