import type { AgentContext, AgentModule, AgentOutcome, EvidenceCitation, EvidenceQuery, EvidenceResult } from '../types';
import { EVIDENCE_CORPUS } from './evidenceCorpus';
import { InputValidationError, isObject } from '../validation';

const DEFAULT_LIMIT = 3;

/** Identifier shapes minted elsewhere in the system. Seeing one here means a boundary leaked. */
const IDENTIFIER_PATTERN = /\b(pat|asm|plan|hep|msg|out|apr|task)_[a-z0-9]/i;
const FORBIDDEN_KEYS = ['patientid', 'assessmentid', 'planid', 'programmeid', 'clinicianid', 'displayname', 'dateofbirth', 'contact'];

const SOURCE_WEIGHT: Record<EvidenceCitation['sourceType'], number> = {
    'clinical-guideline': 3,
    'systematic-review': 2.5,
    'randomised-trial': 2,
    'clinic-protocol': 1
};

const STRENGTH_WEIGHT: Record<EvidenceCitation['strength'], number> = { strong: 2, moderate: 1, limited: 0.5 };

function parseInput(input: unknown): EvidenceQuery {
    if (!isObject(input)) throw new InputValidationError(['input must be an object']);
    const errors: string[] = [];

    if (typeof input.question !== 'string' || input.question.trim().length < 8) errors.push('question is required and must be a real clinical question');

    // The knowledge base is the one module with no phi scope. Anything patient-shaped reaching it
    // is a design failure upstream, so it fails loudly rather than answering.
    const leakedKeys = Object.keys(input).filter((key) => FORBIDDEN_KEYS.includes(key.toLowerCase()));
    if (leakedKeys.length) errors.push(`patient data must not reach the knowledge base: ${leakedKeys.join(', ')}`);
    if (typeof input.question === 'string' && IDENTIFIER_PATTERN.test(input.question))
        errors.push('question contains a record identifier — send a de-identified question');

    if (input.limit !== undefined && (typeof input.limit !== 'number' || input.limit < 1)) errors.push('limit must be a positive number');

    if (errors.length) throw new InputValidationError(errors);
    return input as unknown as EvidenceQuery;
}

/**
 * Region and intervention family are hard constraints, not ranking hints. Without this a knee
 * guideline outranks a weaker shoulder one on source strength alone, and the plan cites the wrong
 * body part — the fastest way to lose a clinician's trust in the whole system.
 */
export function isEligible(citation: EvidenceCitation, query: EvidenceQuery): boolean {
    if (query.region && citation.region !== query.region && citation.region !== 'general') return false;
    if (query.family && !citation.families.includes(query.family)) return false;
    return true;
}

export function scoreCitation(citation: EvidenceCitation, query: EvidenceQuery): number {
    const haystack = [...citation.keywords, citation.title.toLowerCase()].join(' ').toLowerCase();
    const terms = [...(query.keywords ?? []), ...query.question.toLowerCase().split(/\W+/)].filter((term) => term.length > 3);

    let score = 0;
    if (query.region && citation.region === query.region) score += 3;
    if (query.region && citation.region === 'general') score += 1;
    if (query.family && citation.families.includes(query.family)) score += 3;

    const matched = new Set(terms.filter((term) => haystack.includes(term.toLowerCase())));
    score += Math.min(matched.size, 4);

    if (score === 0) return 0;
    return score + SOURCE_WEIGHT[citation.sourceType] + STRENGTH_WEIGHT[citation.strength];
}

/**
 * Agent 3 — evidence knowledge base.
 *
 * Answers de-identified clinical questions with ranked, attributable sources. It holds only
 * `evidence:read`, so it is structurally incapable of reading patient records, and it refuses input
 * that carries patient identifiers rather than quietly ignoring them.
 */
export const knowledgeBaseAgent: AgentModule<EvidenceQuery, EvidenceResult> = {
    id: 'knowledge-base',
    title: 'Evidence knowledge base',
    scopes: ['evidence:read'],
    requiresApproval: false,
    parse: parseInput,

    async run(query: EvidenceQuery, ctx: AgentContext): Promise<AgentOutcome<EvidenceResult>> {
        const ranked = EVIDENCE_CORPUS.filter((citation) => isEligible(citation, query))
            .map((citation) => ({ citation, score: scoreCitation(citation, query) }))
            .filter((entry) => entry.score > 0)
            .sort((a, b) => b.score - a.score || b.citation.year - a.citation.year)
            .slice(0, query.limit ?? DEFAULT_LIMIT)
            .map((entry) => entry.citation);

        await ctx.store.evidenceQueries.put({
            id: ctx.newId('evq'),
            at: ctx.now().toISOString(),
            taskId: ctx.taskId,
            question: query.question,
            region: query.region,
            family: query.family,
            citationIds: ranked.map((citation) => citation.id)
        });

        ctx.audit('evidence.answered', { region: query.region ?? 'any', family: query.family ?? 'any', results: ranked.length });

        return {
            status: 'ok',
            data: { query, citations: ranked, placeholderOnly: ranked.length > 0 && ranked.every((citation) => citation.isPlaceholder) }
        };
    }
};
