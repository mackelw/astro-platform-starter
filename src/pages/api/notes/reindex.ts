import type { APIRoute } from 'astro';
import { rebuildIndex } from '../../../lib/brain/store';
import { json } from '../../../lib/brain/http';

export const prerender = false;

export const POST: APIRoute = async () => {
    const index = await rebuildIndex();
    return json({ rebuilt: index.length });
};
