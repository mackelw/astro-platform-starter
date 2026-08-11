import { Marked } from 'marked';
import markedShiki from 'marked-shiki';
import { highlighterPromise } from './highlighter';

export type WikiLinkTarget = { href: string; exists: boolean };
export type WikiLinkResolver = (target: string) => WikiLinkTarget | null;

type WikiLinkToken = {
    type: 'wikiLink';
    raw: string;
    target: string;
    text: string;
};

function escapeHtml(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// [[Note title]] and [[Note title|display text]] become links between notes.
// An unresolved target still renders as a link — to the "new note" form — which is
// how a brain grows: you link to the note you haven't written yet.
function wikiLinkExtension(resolve: WikiLinkResolver) {
    return {
        name: 'wikiLink',
        level: 'inline' as const,
        start: (src: string) => src.indexOf('[['),
        tokenizer(src: string): WikiLinkToken | undefined {
            const match = /^\[\[([^\[\]|]+)(?:\|([^\[\]]*))?\]\]/.exec(src);
            if (!match) return undefined;
            return {
                type: 'wikiLink',
                raw: match[0],
                target: match[1].trim(),
                text: (match[2] ?? match[1]).trim()
            };
        },
        renderer(token: WikiLinkToken): string {
            const resolved = resolve(token.target);
            const href = resolved?.href ?? `/brain/new?title=${encodeURIComponent(token.target)}`;
            const className = resolved?.exists ? 'wikilink' : 'wikilink wikilink-missing';
            const title = resolved?.exists ? '' : ` title="${escapeHtml(token.target)} — not written yet"`;
            return `<a class="${className}" href="${escapeHtml(href)}"${title}>${escapeHtml(token.text)}</a>`;
        }
    };
}

export async function renderMarkdown(content: string, options: { resolveWikiLink?: WikiLinkResolver } = {}): Promise<string> {
    const highlighter = await highlighterPromise;
    const marked = new Marked().use(
        markedShiki({
            highlight(code, lang) {
                return highlighter.codeToHtml(code, { lang, theme: 'min-dark' });
            }
        })
    );

    if (options.resolveWikiLink) {
        marked.use({ extensions: [wikiLinkExtension(options.resolveWikiLink)] });
    }

    return marked.parse(content ?? '');
}
