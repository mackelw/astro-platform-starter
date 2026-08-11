import type { Note, NoteSummary } from './types';

export const INBOX_TAG = 'inbox';

// Matches [[Note title]] and [[Note title|display text]]
export const WIKI_LINK_PATTERN = /\[\[([^\[\]|]+)(?:\|([^\[\]]*))?\]\]/g;

const ARABIC = '\\u0600-\\u06FF\\u0750-\\u077F';
const SLUG_STRIP = new RegExp(`[^a-z0-9${ARABIC}\\s-]`, 'g');

// Keeps Arabic letters intact so Arabic titles produce readable ids
// (Netlify Blobs keys and URL path segments both handle them fine once encoded).
export function slugify(input: string): string {
    const slug = (input ?? '')
        .toLowerCase()
        .normalize('NFKC')
        .replace(/[ً-ٰٟ]/g, '') // Arabic diacritics
        .replace(SLUG_STRIP, '')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/-{2,}/g, '-')
        .replace(/^-|-$/g, '');
    return slug.slice(0, 80);
}

export function normalizeTags(tags?: string[] | string): string[] {
    const raw = Array.isArray(tags) ? tags : (tags ?? '').split(',');
    const seen = new Set<string>();
    for (const tag of raw) {
        const clean = tag.trim().toLowerCase().replace(/^#/, '').replace(/\s+/g, '-');
        if (clean) seen.add(clean);
    }
    return [...seen];
}

export function parseWikiLinks(body: string): string[] {
    const ids = new Set<string>();
    for (const [, target] of (body ?? '').matchAll(WIKI_LINK_PATTERN)) {
        const id = slugify(target);
        if (id) ids.add(id);
    }
    return [...ids];
}

export function excerpt(body: string, length = 200): string {
    const plain = (body ?? '')
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(WIKI_LINK_PATTERN, (_m, target, display) => display || target)
        .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/^\s{0,3}#{1,6}\s+/gm, '')
        .replace(/[*_`>]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    return plain.length > length ? plain.slice(0, length).trimEnd() + '…' : plain;
}

export function toSummary(note: Note): NoteSummary {
    const { body, ...rest } = note;
    return { ...rest, excerpt: excerpt(body) };
}

// A note is reachable by its stable id and by the slug of its current title, so
// renaming a note keeps old permalinks working while new [[wiki-links]] that use
// the new title still resolve.
export function linkKeys(note: Pick<Note, 'id' | 'title'>): string[] {
    const titleSlug = slugify(note.title);
    return titleSlug && titleSlug !== note.id ? [note.id, titleSlug] : [note.id];
}

export function resolveLink(target: string, index: NoteSummary[]): NoteSummary | undefined {
    const wanted = slugify(target);
    if (!wanted) return undefined;
    return index.find((summary) => linkKeys(summary).includes(wanted));
}

export function backlinksFor(note: Pick<Note, 'id' | 'title'>, index: NoteSummary[]): NoteSummary[] {
    const keys = linkKeys(note);
    return index.filter((summary) => summary.id !== note.id && summary.linksTo.some((link) => keys.includes(link)));
}

export function allTags(index: NoteSummary[]): { tag: string; count: number }[] {
    const counts = new Map<string, number>();
    for (const summary of index) {
        for (const tag of summary.tags) {
            counts.set(tag, (counts.get(tag) ?? 0) + 1);
        }
    }
    return [...counts.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}
