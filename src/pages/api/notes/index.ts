import type { APIRoute } from 'astro';
import { createNote, getIndex, searchNotes } from '../../../lib/brain/store';
import { allTags } from '../../../lib/brain/notes';
import { json, readJson } from '../../../lib/brain/http';
import type { NoteInput } from '../../../lib/brain/types';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
    const notes = await searchNotes({
        q: url.searchParams.get('q') ?? undefined,
        tag: url.searchParams.get('tag') ?? undefined,
        limit: Number(url.searchParams.get('limit')) || undefined
    });
    return json({ notes, tags: allTags(await getIndex()) });
};

export const POST: APIRoute = async ({ request }) => {
    const input = await readJson<NoteInput>(request);
    if (!input?.title?.trim() && !input?.body?.trim()) {
        return json({ error: 'A note needs a title or a body' }, 400);
    }
    return json({ note: await createNote(input) }, 201);
};
