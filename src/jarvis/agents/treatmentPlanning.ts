import type {
    AgentContext,
    AgentModule,
    AgentOutcome,
    AssessmentRecord,
    BodyRegion,
    EvidenceCitation,
    InterventionFamily,
    PlannedIntervention,
    TreatmentGoal,
    TreatmentPlan
} from '../types';
import { InputValidationError, isObject } from '../validation';
import { inferRegion } from './clinicalReference';

export interface TreatmentPlanRequest {
    assessmentId: string;
    clinicianId: string;
}

interface InterventionCandidate {
    family: InterventionFamily;
    title: string;
    detail: string;
    dosage: string;
    keywords: string[];
}

function parseInput(input: unknown): TreatmentPlanRequest {
    if (!isObject(input)) throw new InputValidationError(['input must be an object']);
    const errors: string[] = [];
    if (typeof input.assessmentId !== 'string' || !input.assessmentId) errors.push('assessmentId is required');
    if (typeof input.clinicianId !== 'string' || !input.clinicianId) errors.push('clinicianId is required');
    if (errors.length) throw new InputValidationError(errors);
    return input as unknown as TreatmentPlanRequest;
}

/**
 * Candidate interventions for the presentation. Nothing here reaches the plan on its own — each
 * candidate has to come back from the knowledge base with a citation attached.
 */
export function proposeCandidates(assessment: AssessmentRecord, region: BodyRegion): InterventionCandidate[] {
    const { irritability } = assessment.findings;
    const { onset, aggravatingFactors } = assessment.input.history;
    const candidates: InterventionCandidate[] = [];

    candidates.push({
        family: 'education',
        title: 'Explanation of the presentation and expected course',
        detail: 'Walk through the findings, the expected timeframe, and what flare-ups do and do not mean.',
        dosage: 'Initial consultation, revisited at each review.',
        keywords: ['education', 'prognosis', 'reassurance']
    });

    if (irritability === 'high') {
        candidates.push({
            family: 'pain-modulation',
            title: 'Symptom-guided entry loading',
            detail: 'Isometric or pain-free-range work to give a tolerable entry point before progressive loading.',
            dosage: 'Daily, stopping short of symptom provocation.',
            keywords: ['isometric', 'irritability', 'dosing']
        });
    }

    candidates.push({
        family: 'exercise-therapy',
        title: irritability === 'high' ? 'Graded range and low-load strengthening' : 'Progressive resistance loading',
        detail:
            irritability === 'high'
                ? 'Restore available range first, adding low load once symptoms settle within 24 hours of activity.'
                : 'Progressive strengthening through available range, advancing load when 24-hour response stays settled.',
        dosage: irritability === 'high' ? '2 sets, 10 reps, daily' : '3 sets, 8–12 reps, 3× weekly',
        keywords: [region, 'strength', 'loading', 'exercise']
    });

    if (irritability !== 'low') {
        candidates.push({
            family: 'manual-therapy',
            title: 'Manual therapy as a short-term adjunct',
            detail: 'Hands-on treatment to open a window for active work. Adjunct only — never the whole plan.',
            dosage: 'Up to 4 sessions, reviewed against active progress.',
            keywords: ['manual therapy', 'mobilisation', region]
        });
    }

    if (onset === 'chronic' || aggravatingFactors.length > 0) {
        candidates.push({
            family: 'load-management',
            title: 'Activity and load modification',
            detail: `Modify the provoking activities (${aggravatingFactors.slice(0, 3).join(', ') || 'as identified'}) rather than stopping them, and rebuild tolerance.`,
            dosage: 'Reviewed weekly against symptom response.',
            keywords: ['activity', 'load', 'adherence']
        });
    }

    return candidates;
}

function buildGoals(assessment: AssessmentRecord): TreatmentGoal[] {
    const goals: TreatmentGoal[] = [];
    const [largestDeficit] = assessment.findings.romDeficits;

    if (largestDeficit) {
        goals.push({
            horizon: 'short-term',
            statement: `Restore ${largestDeficit.side} ${largestDeficit.joint} ${largestDeficit.movement} towards ${largestDeficit.expectedDegrees}°`,
            measure: `Goniometry, from ${largestDeficit.measuredDegrees}°`,
            targetDays: 28
        });
    }

    goals.push({
        horizon: 'short-term',
        statement: 'Reduce pain on the primary aggravating activity',
        measure: `Numeric pain rating scale, from ${assessment.input.history.painScore}/10`,
        targetDays: 21
    });

    for (const patientGoal of assessment.input.history.patientGoals.slice(0, 2)) {
        goals.push({ horizon: 'long-term', statement: patientGoal, measure: 'Patient-reported achievement at review', targetDays: 84 });
    }

    return goals;
}

function buildPrecautions(assessment: AssessmentRecord, citations: EvidenceCitation[]): string[] {
    const precautions: string[] = [];

    if (assessment.findings.irritability === 'high') {
        precautions.push('High irritability: symptoms should settle within 24 hours of any session — reduce load if they do not.');
    }
    if (assessment.input.history.screening['systemic-steroid-use']) {
        precautions.push('Long-term corticosteroid use recorded: consider fragility fracture risk when selecting loading.');
    }
    if (citations.some((citation) => citation.isPlaceholder)) {
        precautions.push('Evidence corpus is placeholder seed data — every citation in this plan must be checked against a licensed source before use.');
    }

    return precautions;
}

function reviewInterval(assessment: AssessmentRecord): number {
    if (assessment.findings.irritability === 'high') return 7;
    if (assessment.input.history.onset === 'chronic') return 28;
    return 14;
}

/**
 * Agent 2 — treatment planning.
 *
 * Reads a signed assessment, asks the knowledge base a de-identified question per candidate
 * intervention, and builds a plan from what comes back supported. A candidate the knowledge base
 * cannot support is dropped to `unsupported` rather than shipped uncited. The plan is `proposed`
 * until a clinician accepts it.
 */
export const treatmentPlanningAgent: AgentModule<TreatmentPlanRequest, TreatmentPlan> = {
    id: 'treatment-planning',
    title: 'Treatment planning',
    scopes: ['phi:read', 'phi:write', 'evidence:read'],
    requiresApproval: false,
    parse: parseInput,

    async run(request: TreatmentPlanRequest, ctx: AgentContext): Promise<AgentOutcome<TreatmentPlan>> {
        const evidence = ctx.services.evidence;
        if (!evidence) return { status: 'rejected', errors: ['evidence service unavailable — treatment planning cannot run uncited'] };

        const assessment = await ctx.store.assessments.get(request.assessmentId);
        if (!assessment) return { status: 'rejected', errors: [`unknown assessment ${request.assessmentId}`] };
        if (assessment.status !== 'signed') {
            return { status: 'rejected', errors: [`assessment ${assessment.id} is ${assessment.status}; planning reads signed assessments only`] };
        }

        const region = inferRegion(assessment);
        const interventions: PlannedIntervention[] = [];
        const unsupported: string[] = [];
        const allCitations: EvidenceCitation[] = [];

        for (const candidate of proposeCandidates(assessment, region)) {
            const result = await evidence.query({
                question: `What supports ${candidate.title.toLowerCase()} for a ${assessment.findings.irritability}-irritability ${region} presentation?`,
                region,
                family: candidate.family,
                keywords: candidate.keywords,
                limit: 2
            });

            if (!result.citations.length) {
                unsupported.push(`${candidate.title} — no supporting evidence found`);
                continue;
            }

            allCitations.push(...result.citations);
            interventions.push({
                id: ctx.newId('int'),
                family: candidate.family,
                title: candidate.title,
                detail: candidate.detail,
                dosage: candidate.dosage,
                citations: result.citations
            });
        }

        if (!interventions.length) {
            ctx.audit('plan.unsupported', { assessmentId: assessment.id, candidates: unsupported.length });
            return { status: 'rejected', errors: ['no candidate intervention could be supported by the knowledge base — clinician to plan manually'] };
        }

        const plan: TreatmentPlan = {
            id: ctx.newId('plan'),
            patientId: assessment.patientId,
            assessmentId: assessment.id,
            clinicianId: request.clinicianId,
            createdAt: ctx.now().toISOString(),
            goals: buildGoals(assessment),
            interventions,
            precautions: buildPrecautions(assessment, allCitations),
            reviewInDays: reviewInterval(assessment),
            unsupported,
            status: 'proposed'
        };

        await ctx.store.plans.put(plan);
        ctx.audit('plan.proposed', {
            planId: plan.id,
            assessmentId: assessment.id,
            interventions: interventions.length,
            unsupported: unsupported.length,
            region
        });

        return { status: 'ok', data: plan };
    }
};

/** A clinician accepting the plan is what unlocks Agent 4. Nothing else may set `status` to `accepted`. */
export async function acceptPlan(ctx: AgentContext, planId: string, clinicianId: string): Promise<TreatmentPlan> {
    const plan = await ctx.store.plans.get(planId);
    if (!plan) throw new Error(`unknown plan ${planId}`);
    if (plan.status === 'rejected') throw new Error(`plan ${planId} was rejected and cannot be accepted`);

    const accepted: TreatmentPlan = { ...plan, status: 'accepted', acceptedBy: clinicianId, acceptedAt: ctx.now().toISOString() };
    await ctx.store.plans.put(accepted);
    ctx.audit('plan.accepted', { planId, clinicianId });
    return accepted;
}
