import type { APIRoute } from 'astro';
import { createNote } from '../../lib/brain/store';
import { INBOX_TAG, normalizeTags } from '../../lib/brain/notes';
import { json, readJson } from '../../lib/brain/http';

export const prerender = false;

const FETCH_TIMEOUT_MS = 8000;
const MAX_HTML_BYTES = 200_000;

function decodeEntities(text: string): string {
    const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
    return text
        .replace(/&#(\d+);/g, (_m, code) => String.fromCodePoint(Number(code)))
        .replace(/&#x([0-9a-f]+);/gi, (_m, code) => String.fromCodePoint(parseInt(code, 16)))
        .replace(/&([a-z]+);/gi, (match, name) => named[name.toLowerCase()] ?? match);
}

function firstMatch(html: string, patterns: RegExp[]): string | undefined {
    for (const pattern of patterns) {
        const found = html.match(pattern)?.[1]?.trim();
        if (found) return decodeEntities(found).replace(/\s+/g, ' ');
    }
    return undefined;
}

// Best effort only — if the page can't be read we still save the link, since
// losing the capture is worse than saving it without a title.
async function readPageMeta(url: string): Promise<{ title?: string; description?: string }> {
    const response = await fetch(url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SecondBrain/1.0)' }
    });
    if (!response.ok) return {};

    const html = (await response.text()).slice(0, MAX_HTML_BYTES);
    return {
        title: firstMatch(html, [/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i, /<title[^>]*>([\s\S]*?)<\/title>/i]),
        description: firstMatch(html, [
            /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
            /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i
        ])
    };
}

export const POST: APIRoute = async ({ request }) => {
    const input = await readJson<{ url?: string; tags?: string[] | string; note?: string }>(request);
    const target = input?.url?.trim();
    if (!target) return json({ error: 'Expected a url' }, 400);

    let parsed: URL;
    try {
        parsed = new URL(target);
    } catch {
        return json({ error: `Not a valid URL: ${target}` }, 400);
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return json({ error: 'Only http(s) links can be captured' }, 400);
    }

    let meta: { title?: string; description?: string } = {};
    try {
        meta = await readPageMeta(parsed.href);
    } catch (error) {
        console.error(`Capture: could not read ${parsed.href}`, error);
    }

    const bodyParts = [meta.description, input?.note].filter(Boolean);
    const note = await createNote({
        title: meta.title || parsed.hostname + parsed.pathname,
        body: `[${meta.title || parsed.href}](${parsed.href})\n\n${bodyParts.join('\n\n')}`.trim(),
        tags: [...normalizeTags(input?.tags), INBOX_TAG],
        url: parsed.href
    });

    return json({ note }, 201);
};
