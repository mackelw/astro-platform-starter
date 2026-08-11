import type { APIRoute } from 'astro';
import { deleteNote, getNote, updateNote } from '../../../lib/brain/store';
import { json, readJson } from '../../../lib/brain/http';
import type { NoteInput } from '../../../lib/brain/types';

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
    const note = await getNote(params.id!);
    return note ? json({ note }) : json({ error: 'Note not found' }, 404);
};

export const PUT: APIRoute = async ({ params, request }) => {
    const input = await readJson<NoteInput>(request);
    if (!input) return json({ error: 'Expected a JSON body' }, 400);

    const note = await updateNote(params.id!, input);
    return note ? json({ note }) : json({ error: 'Note not found' }, 404);
};

export const DELETE: APIRoute = async ({ params }) => {
    const deleted = await deleteNote(params.id!);
    return deleted ? json({ deleted: params.id }) : json({ error: 'Note not found' }, 404);
};
