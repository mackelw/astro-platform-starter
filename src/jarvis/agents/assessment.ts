import type { AgentContext, AgentModule, AgentOutcome, AssessmentInput, AssessmentRecord, RedFlagHit, RomDeficit, RomMeasurement } from '../types';
import { DEFAULT_RED_FLAGS, normativeRange } from './clinicalReference';

/** Thrown by `parse`. The orchestrator turns it into a `rejected` outcome. */
export class InputValidationError extends Error {
    constructor(readonly errors: string[]) {
        super(`Invalid assessment input: ${errors.join('; ')}`);
        this.name = 'InputValidationError';
    }
}

/** A deficit smaller than this is treated as measurement noise rather than a finding. */
const DEFICIT_THRESHOLD_PERCENT = 10;

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseInput(input: unknown): AssessmentInput {
    const errors: string[] = [];
    if (!isObject(input)) throw new InputValidationError(['input must be an object']);

    const { patientId, clinicianId, history, posture, gait, rangeOfMotion } = input;

    if (typeof patientId !== 'string' || !patientId) errors.push('patientId is required');
    if (typeof clinicianId !== 'string' || !clinicianId) errors.push('clinicianId is required');

    if (!isObject(history)) {
        errors.push('history is required');
    } else {
        if (typeof history.presentingComplaint !== 'string' || !history.presentingComplaint) errors.push('history.presentingComplaint is required');
        if (typeof history.painScore !== 'number' || history.painScore < 0 || history.painScore > 10) errors.push('history.painScore must be 0–10');
        if (typeof history.durationDays !== 'number' || history.durationDays < 0) errors.push('history.durationDays must be a non-negative number');
        if (!['acute', 'subacute', 'chronic'].includes(String(history.onset))) errors.push('history.onset must be acute, subacute or chronic');
        if (!isObject(history.screening)) errors.push('history.screening is required — red-flag screening cannot be skipped');
    }

    for (const [name, value] of [
        ['posture', posture],
        ['gait', gait],
        ['rangeOfMotion', rangeOfMotion]
    ] as const) {
        if (!Array.isArray(value)) errors.push(`${name} must be an array`);
    }

    if (Array.isArray(rangeOfMotion)) {
        rangeOfMotion.forEach((measurement, index) => {
            if (!isObject(measurement)) {
                errors.push(`rangeOfMotion[${index}] must be an object`);
                return;
            }
            if (typeof measurement.degrees !== 'number' || Number.isNaN(measurement.degrees)) errors.push(`rangeOfMotion[${index}].degrees must be a number`);
            if (typeof measurement.joint !== 'string' || typeof measurement.movement !== 'string')
                errors.push(`rangeOfMotion[${index}] needs joint and movement`);
        });
    }

    if (errors.length) throw new InputValidationError(errors);
    return input as unknown as AssessmentInput;
}

export function screenRedFlags(screening: Record<string, boolean>): RedFlagHit[] {
    return DEFAULT_RED_FLAGS.filter((flag) => screening[flag.id] === true).map(({ id, label, action, urgency }) => ({ id, label, action, urgency }));
}

export function analyseRangeOfMotion(measurements: RomMeasurement[]): RomDeficit[] {
    const deficits: RomDeficit[] = [];
    for (const measurement of measurements) {
        const expectedDegrees = normativeRange(measurement.joint, measurement.movement);
        if (expectedDegrees === undefined) continue;

        const deficitPercent = expectedDegrees > 0 ? Math.round(((expectedDegrees - measurement.degrees) / expectedDegrees) * 100) : 0;
        const isRestricted = measurement.degrees < expectedDegrees && (expectedDegrees === 0 || deficitPercent >= DEFICIT_THRESHOLD_PERCENT);
        if (!isRestricted && !measurement.painAtEndRange) continue;

        deficits.push({
            joint: measurement.joint,
            movement: measurement.movement,
            side: measurement.side,
            measuredDegrees: measurement.degrees,
            expectedDegrees,
            deficitPercent: Math.max(deficitPercent, 0),
            painAtEndRange: measurement.painAtEndRange === true
        });
    }
    return deficits.sort((a, b) => b.deficitPercent - a.deficitPercent);
}

/**
 * Irritability in the Maitland sense: how easily symptoms are provoked and how long they take to
 * settle. It sets the starting dose for Agent 4, so it is deliberately conservative.
 */
export function gradeIrritability(painScore: number, onset: string, deficits: RomDeficit[]): 'low' | 'moderate' | 'high' {
    const painfulEndRange = deficits.filter((deficit) => deficit.painAtEndRange).length;
    if (painScore >= 7 || (onset === 'acute' && painfulEndRange >= 2)) return 'high';
    if (painScore >= 4 || painfulEndRange >= 1) return 'moderate';
    return 'low';
}

function buildProblemList(input: AssessmentInput, deficits: RomDeficit[]): string[] {
    const problems: string[] = [input.history.presentingComplaint];

    for (const deficit of deficits.slice(0, 3)) {
        const restriction = deficit.deficitPercent > 0 ? `${deficit.deficitPercent}% restricted` : 'end-range restricted';
        problems.push(`${deficit.side} ${deficit.joint} ${deficit.movement} ${restriction}${deficit.painAtEndRange ? ', painful at end range' : ''}`);
    }

    for (const observation of input.posture.filter((entry) => entry.significance !== 'incidental')) {
        problems.push(`Posture: ${observation.region} — ${observation.finding}`);
    }

    for (const observation of input.gait) {
        problems.push(`Gait (${observation.phase}): ${observation.finding}`);
    }

    return problems;
}

function summarise(input: AssessmentInput, deficits: RomDeficit[], irritability: string): string {
    const { history } = input;
    const lead = `${history.onset} presentation of ${history.presentingComplaint}, ${history.durationDays} days, pain ${history.painScore}/10, irritability ${irritability}.`;
    const rom = deficits.length
        ? ` Key restriction: ${deficits[0].side} ${deficits[0].joint} ${deficits[0].movement}.`
        : ' No significant range-of-motion restriction recorded.';
    const goals = history.patientGoals?.length ? ` Patient goals: ${history.patientGoals.join('; ')}.` : '';
    return `${lead}${rom}${goals}`;
}

/**
 * Agent 1 — physiotherapy assessment.
 *
 * Reads intake (history, posture, gait, range of motion), screens for red flags, derives a
 * problem list, and writes an `AssessmentRecord` to the assessment database. The record lands as
 * `draft`: it is advisory and must be signed by a clinician before Agent 2 may read it. Red flags
 * short-circuit the pipeline and escalate.
 */
export const assessmentAgent: AgentModule<AssessmentInput, AssessmentRecord> = {
    id: 'assessment',
    title: 'Physiotherapy assessment',
    scopes: ['phi:read', 'phi:write'],
    requiresApproval: false,
    parse: parseInput,

    async run(input: AssessmentInput, ctx: AgentContext): Promise<AgentOutcome<AssessmentRecord>> {
        const patient = await ctx.store.patients.get(input.patientId);
        if (!patient) return { status: 'rejected', errors: [`unknown patient ${input.patientId}`] };
        if (!patient.consent.dataProcessing) return { status: 'rejected', errors: ['patient has not consented to data processing'] };

        const redFlags = screenRedFlags(input.history.screening ?? {});
        const romDeficits = analyseRangeOfMotion(input.rangeOfMotion);
        const irritability = gradeIrritability(input.history.painScore, input.history.onset, romDeficits);

        const record: AssessmentRecord = {
            id: ctx.newId('asm'),
            patientId: input.patientId,
            clinicianId: input.clinicianId,
            createdAt: ctx.now().toISOString(),
            input,
            findings: {
                problemList: buildProblemList(input, romDeficits),
                romDeficits,
                irritability,
                functionalSummary: summarise(input, romDeficits, irritability)
            },
            redFlags,
            status: redFlags.length ? 'escalated' : 'draft'
        };

        await ctx.store.assessments.put(record);
        ctx.audit('assessment.written', { assessmentId: record.id, patientId: record.patientId, redFlags: redFlags.length, status: record.status });

        if (redFlags.length) {
            return {
                status: 'escalated',
                reason: 'Red flags identified during screening — clinician review required before treatment planning.',
                redFlags,
                data: record
            };
        }

        return { status: 'ok', data: record };
    }
};

/**
 * A clinician signing the record is what unlocks downstream planning. Nothing else may set
 * `status` to `signed`.
 */
export async function signAssessment(ctx: AgentContext, assessmentId: string, clinicianId: string): Promise<AssessmentRecord> {
    const record = await ctx.store.assessments.get(assessmentId);
    if (!record) throw new Error(`unknown assessment ${assessmentId}`);
    if (record.status === 'escalated') throw new Error('escalated assessments must be cleared of red flags before signing');

    const signed: AssessmentRecord = { ...record, status: 'signed', signedBy: clinicianId, signedAt: ctx.now().toISOString() };
    await ctx.store.assessments.put(signed);
    ctx.audit('assessment.signed', { assessmentId, clinicianId });
    return signed;
}
