import type { AgentContext, AgentModule, AgentOutcome, ContentChannel, ContentDraft } from '../types';
import { InputValidationError, isObject } from '../validation';

export interface ContentRequest {
    topic: string;
    channel: ContentChannel;
    audience: string;
    keyPoints?: string[];
    callToAction?: string;
}

/**
 * The topics Agent 6 may write about. Anything outside the list is refused rather than improvised,
 * so the clinic decides its own subject matter.
 */
export const APPROVED_TOPICS: readonly string[] = [
    'what to expect at a first physiotherapy appointment',
    'managing an acute flare-up',
    'why exercise beats rest for most back pain',
    'returning to sport after injury',
    'desk setup and neck pain',
    'how long recovery usually takes',
    'strength training for older adults'
];

/** Claims a healthcare business should not make. Present in a request, the draft is refused. */
const PROHIBITED_CLAIMS = [
    'cure',
    'guaranteed',
    'guarantee',
    'miracle',
    'pain free forever',
    'best in',
    'no.1',
    'number one',
    'permanent fix',
    'proven to eliminate'
];

/** Identifier shapes from the clinical side of the system. None of them belong here. */
const IDENTIFIER_PATTERN = /\b(pat|asm|plan|hep|msg|out)_[a-z0-9]/i;
const FORBIDDEN_KEYS = ['patientid', 'assessmentid', 'planid', 'programmeid', 'displayname', 'dateofbirth', 'contact'];

const DISCLAIMER = 'General information only — not a substitute for individual assessment. If symptoms are severe, worsening, or new, see a clinician.';

const CHANNEL_STYLE: Record<ContentChannel, { headlineCase: 'sentence' | 'title'; maxWords: number; hashtagCount: number }> = {
    instagram: { headlineCase: 'sentence', maxWords: 90, hashtagCount: 5 },
    linkedin: { headlineCase: 'sentence', maxWords: 180, hashtagCount: 3 },
    blog: { headlineCase: 'title', maxWords: 320, hashtagCount: 0 },
    newsletter: { headlineCase: 'sentence', maxWords: 220, hashtagCount: 0 }
};

function titleCase(text: string): string {
    return text.replace(/\b\w/g, (character) => character.toUpperCase());
}

function parseInput(input: unknown): ContentRequest {
    if (!isObject(input)) throw new InputValidationError(['input must be an object']);
    const errors: string[] = [];

    if (typeof input.topic !== 'string' || !APPROVED_TOPICS.includes(input.topic.toLowerCase())) {
        errors.push(`topic must be one of the approved topics: ${APPROVED_TOPICS.join(' | ')}`);
    }
    if (typeof input.channel !== 'string' || !(input.channel in CHANNEL_STYLE)) errors.push('channel must be instagram, linkedin, blog or newsletter');
    if (typeof input.audience !== 'string' || !input.audience) errors.push('audience is required');

    // Agent 6 holds no phi scope, so patient data reaching it means a boundary leaked upstream.
    const leakedKeys = Object.keys(input).filter((key) => FORBIDDEN_KEYS.includes(key.toLowerCase()));
    if (leakedKeys.length) errors.push(`patient data must not reach the content module: ${leakedKeys.join(', ')}`);

    const freeText = [input.topic, input.audience, input.callToAction, ...((input.keyPoints as string[]) ?? [])]
        .filter((value) => typeof value === 'string')
        .join(' ');
    if (IDENTIFIER_PATTERN.test(freeText)) errors.push('content request contains a clinical record identifier');

    const claims = PROHIBITED_CLAIMS.filter((claim) => freeText.toLowerCase().includes(claim));
    if (claims.length) errors.push(`content must not claim: ${claims.join(', ')}`);

    if (errors.length) throw new InputValidationError(errors);
    return input as unknown as ContentRequest;
}

function buildBody(request: ContentRequest): string {
    const style = CHANNEL_STYLE[request.channel];
    const points = request.keyPoints?.length
        ? request.keyPoints
        : ['What people usually notice first', 'What actually helps, and roughly how long it takes', 'What is worth getting looked at'];

    const opening = `For ${request.audience}: ${request.topic}.`;
    const middle = points.map((point) => `• ${point}`).join('\n');
    const closing = request.callToAction ?? 'Book an assessment if this sounds like you.';

    const body = [opening, middle, closing].join('\n\n');
    const words = body.split(/\s+/);
    return words.length > style.maxWords ? `${words.slice(0, style.maxWords).join(' ')}…` : body;
}

/**
 * Agent 6 — marketing and content.
 *
 * Drafts channel-appropriate posts from an approved topic list. It holds only `publish:draft` and
 * no `phi` scope, so it cannot read a patient record; patient stories reach it only as material a
 * human has already de-identified and cleared. Nothing publishes without a recorded approval.
 */
export const marketingAgent: AgentModule<ContentRequest, ContentDraft> = {
    id: 'marketing',
    title: 'Marketing and content',
    scopes: ['publish:draft'],
    requiresApproval: true,
    parse: parseInput,

    async run(request: ContentRequest, ctx: AgentContext): Promise<AgentOutcome<ContentDraft>> {
        const style = CHANNEL_STYLE[request.channel];
        const headline = style.headlineCase === 'title' ? titleCase(request.topic) : `${request.topic.charAt(0).toUpperCase()}${request.topic.slice(1)}`;

        const draft: ContentDraft = {
            id: ctx.newId('con'),
            createdAt: ctx.now().toISOString(),
            channel: request.channel,
            topic: request.topic,
            audience: request.audience,
            headline,
            body: buildBody(request),
            hashtags: style.hashtagCount ? ['#physiotherapy', '#physio', '#rehab', '#injuryrecovery', '#movewell'].slice(0, style.hashtagCount) : [],
            disclaimer: DISCLAIMER,
            status: 'draft'
        };

        await ctx.store.content.put(draft);
        ctx.audit('content.drafted', { draftId: draft.id, channel: draft.channel });

        return { status: 'ok', data: draft };
    },

    /** Runs only after a named human approves the draft. */
    async deliver(draft: ContentDraft, ctx: AgentContext): Promise<ContentDraft> {
        const publishing = ctx.services.publishing;
        if (!publishing) throw new Error('publishing adapter unavailable');

        const receipt = await publishing.publish(draft);
        const published: ContentDraft = { ...draft, status: 'published', publishedAt: receipt.publishedAt, publishedUrl: receipt.url };
        await ctx.store.content.put(published);
        ctx.audit('content.published', { draftId: draft.id, channel: draft.channel });
        return published;
    }
};
