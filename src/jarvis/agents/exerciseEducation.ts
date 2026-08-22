import type {
    AgentContext,
    AgentModule,
    AgentOutcome,
    AssessmentRecord,
    EducationItem,
    ExerciseAsset,
    HomeExerciseProgramme,
    PrescribedExercise,
    TreatmentPlan
} from '../types';
import { InputValidationError, isObject } from '../validation';
import { inferRegion } from './clinicalReference';

export interface ProgrammeRequest {
    planId: string;
}

/** Irritability sets the ceiling on how hard anything in the programme may be. */
const DIFFICULTY_CAP: Record<AssessmentRecord['findings']['irritability'], 1 | 2 | 3 | 4 | 5> = {
    high: 2,
    moderate: 3,
    low: 5
};

const DOSAGE_BY_IRRITABILITY = {
    high: {
        sets: 2,
        reps: 10,
        holdSeconds: 20,
        durationMinutes: 10,
        frequencyPerWeek: 7,
        progression: 'Hold the dose for a week; progress only if symptoms settle within 24 hours.'
    },
    moderate: {
        sets: 3,
        reps: 10,
        holdSeconds: undefined,
        durationMinutes: 20,
        frequencyPerWeek: 4,
        progression: 'Add a set, then load, once the current dose is comfortable for three sessions.'
    },
    low: {
        sets: 3,
        reps: 12,
        holdSeconds: undefined,
        durationMinutes: 30,
        frequencyPerWeek: 3,
        progression: 'Increase load when the last two reps stop feeling hard.'
    }
} as const;

/** Maximum exercises in one programme. Short programmes get done; long ones do not. */
const MAX_EXERCISES = 4;

function parseInput(input: unknown): ProgrammeRequest {
    if (!isObject(input)) throw new InputValidationError(['input must be an object']);
    if (typeof input.planId !== 'string' || !input.planId) throw new InputValidationError(['planId is required']);
    return input as unknown as ProgrammeRequest;
}

/**
 * What the programme has to cover, read off the assessment's restrictions and the plan's
 * interventions rather than from the exercise catalogue — so a gap in the library shows up as a
 * gap, not as a quietly different programme.
 */
export function deriveTargets(assessment: AssessmentRecord, plan: TreatmentPlan): string[] {
    const region = inferRegion(assessment);
    const targets = new Set<string>();

    for (const deficit of assessment.findings.romDeficits.slice(0, 2)) targets.add(`${deficit.joint}-range`);
    for (const intervention of plan.interventions) {
        if (intervention.family === 'exercise-therapy') targets.add(`${region}-strength`);
        if (intervention.family === 'pain-modulation') targets.add('pain-modulation');
        if (intervention.family === 'load-management') targets.add('activity-tolerance');
    }
    if (assessment.input.posture.some((observation) => observation.significance !== 'incidental')) targets.add('motor-control');
    if (region === 'shoulder') targets.add('rotator-cuff-strength');
    if (region === 'knee') targets.add('quadriceps-strength');

    return [...targets];
}

function prescribe(asset: ExerciseAsset, assessment: AssessmentRecord, targets: string[]): PrescribedExercise {
    const dosage = DOSAGE_BY_IRRITABILITY[assessment.findings.irritability];
    const served = asset.targets.filter((target) => targets.includes(target));

    const prescription: PrescribedExercise = {
        exerciseId: asset.id,
        name: asset.name,
        source: asset.source,
        videoUrl: asset.videoUrl,
        frequencyPerWeek: dosage.frequencyPerWeek,
        progression: dosage.progression,
        rationale: `Addresses ${served.join(' and ')}.`
    };

    // A walking programme dosed in sets and reps is the kind of detail that tells a patient nobody
    // read their programme, so continuous assets carry minutes instead.
    if (asset.dosing === 'duration') return { ...prescription, durationMinutes: dosage.durationMinutes };
    return { ...prescription, sets: dosage.sets, reps: dosage.reps, holdSeconds: dosage.holdSeconds };
}

function buildEducation(plan: TreatmentPlan, assessment: AssessmentRecord): EducationItem[] {
    const education: EducationItem[] = plan.interventions
        .filter((intervention) => intervention.family === 'education' || intervention.family === 'load-management')
        .map((intervention) => ({ topic: intervention.title, summary: intervention.detail }));

    education.push({
        topic: 'What a flare-up means',
        summary:
            'Some discomfort during and after exercise is expected. Symptoms that settle within 24 hours are fine; symptoms that do not mean drop back a level and mention it at review.'
    });

    if (assessment.findings.irritability === 'high') {
        education.push({
            topic: 'Pacing while symptoms are irritable',
            summary: 'Little and often beats long sessions right now. Stop short of the point where symptoms sharpen.'
        });
    }

    return education;
}

/**
 * Agent 4 — exercise and patient education.
 *
 * Turns an accepted plan into a home programme, preferring the clinic's own filmed library and
 * recording where it had to fall back to the licensed catalogue. Dose is capped by the assessment's
 * irritability grade, and targets the library cannot serve are reported as coverage gaps rather
 * than silently substituted.
 */
export const exerciseEducationAgent: AgentModule<ProgrammeRequest, HomeExerciseProgramme> = {
    id: 'exercise-education',
    title: 'Exercise and patient education',
    scopes: ['phi:read', 'library:read'],
    requiresApproval: false,
    parse: parseInput,

    async run(request: ProgrammeRequest, ctx: AgentContext): Promise<AgentOutcome<HomeExerciseProgramme>> {
        const library = ctx.services.library;
        if (!library) return { status: 'rejected', errors: ['exercise library unavailable'] };

        const plan = await ctx.store.plans.get(request.planId);
        if (!plan) return { status: 'rejected', errors: [`unknown plan ${request.planId}`] };
        if (plan.status !== 'accepted') {
            return { status: 'rejected', errors: [`plan ${plan.id} is ${plan.status}; programmes are issued from accepted plans only`] };
        }

        const assessment = await ctx.store.assessments.get(plan.assessmentId);
        if (!assessment) return { status: 'rejected', errors: [`plan ${plan.id} references missing assessment ${plan.assessmentId}`] };

        const region = inferRegion(assessment);
        const targets = deriveTargets(assessment, plan);
        const difficultyCap = DIFFICULTY_CAP[assessment.findings.irritability];
        const exclude = assessment.input.history.screening['significant-trauma'] ? ['acute-fracture'] : [];

        const matches = await library.search({ region, targets, maxDifficulty: difficultyCap, exclude });

        const chosen: ExerciseAsset[] = [];
        const covered = new Set<string>();
        for (const asset of matches) {
            if (chosen.length >= MAX_EXERCISES) break;
            const adds = asset.targets.filter((target) => targets.includes(target) && !covered.has(target));
            if (!adds.length) continue;
            chosen.push(asset);
            adds.forEach((target) => covered.add(target));
        }

        if (!chosen.length) {
            ctx.audit('programme.no-assets', { planId: plan.id, targets: targets.length, difficultyCap });
            return {
                status: 'rejected',
                errors: [`no library asset matches ${targets.join(', ')} within difficulty ${difficultyCap} — clinician to prescribe manually`]
            };
        }

        const coverageGaps = [
            ...targets.filter((target) => !covered.has(target)).map((target) => `${target}: no asset within difficulty ${difficultyCap}`),
            ...chosen
                .filter((asset) => asset.source === 'licensed-catalogue')
                .map((asset) => `${asset.name}: filled from licensed catalogue, no clinic video exists`)
        ];

        const programme: HomeExerciseProgramme = {
            id: ctx.newId('hep'),
            patientId: plan.patientId,
            planId: plan.id,
            createdAt: ctx.now().toISOString(),
            exercises: chosen.map((asset) => prescribe(asset, assessment, targets)),
            education: buildEducation(plan, assessment),
            reviewInDays: plan.reviewInDays,
            difficultyCap,
            coverageGaps,
            status: 'issued'
        };

        await ctx.store.programmes.put(programme);
        ctx.audit('programme.issued', {
            programmeId: programme.id,
            planId: plan.id,
            exercises: programme.exercises.length,
            clinicAssets: chosen.filter((asset) => asset.source === 'clinic-library').length,
            coverageGaps: coverageGaps.length
        });

        return { status: 'ok', data: programme };
    }
};
