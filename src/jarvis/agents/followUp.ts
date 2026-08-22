import type { AgentContext, AgentModule, AgentOutcome, Checkpoint, OutboundMessage, OutcomeMeasure, PatientRecord } from '../types';
import { InputValidationError, isObject } from '../validation';

export interface CheckInRequest {
    programmeId: string;
    checkpoint: Checkpoint;
}

export interface FollowUpReply {
    patientId: string;
    programmeId: string;
    checkpoint: Checkpoint;
    painScore: number;
    adherence: OutcomeMeasure['adherence'];
    freeText: string;
}

/** Days after the programme is issued that each checkpoint fires. */
export const CHECKPOINT_OFFSET_DAYS: Record<Checkpoint, number> = { 'day-3': 3, 'week-1': 7, 'week-2': 14, 'week-6': 42 };

/**
 * Provider-approved templates. Agent 5 renders one of these and nothing else — it has no path to
 * compose free text, which is what keeps it from giving clinical advice by accident.
 */
export const MESSAGE_TEMPLATES: Record<Checkpoint, { id: string; render: (vars: { days: number }) => string }> = {
    'day-3': {
        id: 'checkin_day3_v1',
        render: ({ days }) =>
            `Hi, it's your physio clinic. You're ${days} days into your home programme. How's it going? Reply with your pain out of 10 and how many sessions you've managed. Reply STOP to stop these messages.`
    },
    'week-1': {
        id: 'checkin_week1_v1',
        render: ({ days }) =>
            `Hi, it's your physio clinic — ${days} days in. Reply with your pain out of 10 and how many sessions you managed this week. Reply STOP to stop these messages.`
    },
    'week-2': {
        id: 'checkin_week2_v1',
        render: ({ days }) =>
            `Hi, it's your physio clinic. Two weeks into the programme (${days} days). Reply with your pain out of 10 and how many sessions you managed. Reply STOP to stop these messages.`
    },
    'week-6': {
        id: 'checkin_week6_v1',
        render: ({ days }) =>
            `Hi, it's your physio clinic — ${days} days since your programme started. Reply with your pain out of 10 and how you're finding day-to-day activity. Reply STOP to stop these messages.`
    }
};

/**
 * Phrases in a reply that stop the automation and put a human in front of the patient. Deliberately
 * over-inclusive: a false escalation costs a phone call, a missed one costs much more.
 */
export const CONCERN_PHRASES: readonly string[] = [
    'worse',
    'worsening',
    'numb',
    'numbness',
    'weakness',
    'giving way',
    'bladder',
    'bowel',
    'saddle',
    'fever',
    'night sweats',
    'chest pain',
    'short of breath',
    'swollen',
    'swelling',
    'fell',
    'a&e',
    'emergency'
];

/** Local-time window outside which a check-in is held until the next morning. */
const SEND_WINDOW = { openHour: 9, closeHour: 20 };

function parseInput(input: unknown): CheckInRequest {
    if (!isObject(input)) throw new InputValidationError(['input must be an object']);
    const errors: string[] = [];
    if (typeof input.programmeId !== 'string' || !input.programmeId) errors.push('programmeId is required');
    if (typeof input.checkpoint !== 'string' || !(input.checkpoint in CHECKPOINT_OFFSET_DAYS))
        errors.push('checkpoint must be one of day-3, week-1, week-2, week-6');
    if (errors.length) throw new InputValidationError(errors);
    return input as unknown as CheckInRequest;
}

/** Holds anything outside the send window until the next morning. */
export function scheduleWithinWindow(issuedAt: Date, offsetDays: number): Date {
    const scheduled = new Date(issuedAt.getTime() + offsetDays * 24 * 60 * 60 * 1000);
    const hour = scheduled.getHours();
    if (hour < SEND_WINDOW.openHour) scheduled.setHours(SEND_WINDOW.openHour, 0, 0, 0);
    if (hour >= SEND_WINDOW.closeHour) {
        scheduled.setDate(scheduled.getDate() + 1);
        scheduled.setHours(SEND_WINDOW.openHour, 0, 0, 0);
    }
    return scheduled;
}

function suppressionReason(patient: PatientRecord, escalated: boolean): string | null {
    if (!patient.consent.automatedFollowUp) return 'patient has not consented to automated follow-up';
    if (!patient.contact.whatsApp) return 'no WhatsApp number on file';
    if (escalated) return 'an earlier reply escalated to a clinician — sequence suspended';
    return null;
}

/**
 * Agent 5 — follow-up automation.
 *
 * Drafts a templated check-in for a consenting patient, holds it for approval, and only then hands
 * it to the messaging provider. Suppressed check-ins never reach the approval queue because
 * nothing is going out. Replies come back through `ingestFollowUpReply`.
 */
export const followUpAgent: AgentModule<CheckInRequest, OutboundMessage> = {
    id: 'follow-up',
    title: 'Follow-up check-in',
    scopes: ['phi:read', 'phi:write', 'messaging:send'],
    requiresApproval: true,
    /** A suppressed message is not outbound, so it does not need a human. */
    needsApproval: (message: OutboundMessage) => message.status === 'draft',
    parse: parseInput,

    async run(request: CheckInRequest, ctx: AgentContext): Promise<AgentOutcome<OutboundMessage>> {
        const programme = await ctx.store.programmes.get(request.programmeId);
        if (!programme) return { status: 'rejected', errors: [`unknown programme ${request.programmeId}`] };

        const patient = await ctx.store.patients.get(programme.patientId);
        if (!patient) return { status: 'rejected', errors: [`unknown patient ${programme.patientId}`] };

        const outcomes = await ctx.store.outcomes.list({ programmeId: programme.id });
        const alreadyEscalated = outcomes.some((outcome) => outcome.escalated);
        const template = MESSAGE_TEMPLATES[request.checkpoint];
        const offsetDays = CHECKPOINT_OFFSET_DAYS[request.checkpoint];
        const blocked = suppressionReason(patient, alreadyEscalated);

        const message: OutboundMessage = {
            id: ctx.newId('msg'),
            patientId: patient.id,
            programmeId: programme.id,
            checkpoint: request.checkpoint,
            channel: 'whatsapp',
            templateId: template.id,
            body: template.render({ days: offsetDays }),
            createdAt: ctx.now().toISOString(),
            scheduledFor: scheduleWithinWindow(new Date(programme.createdAt), offsetDays).toISOString(),
            status: blocked ? 'suppressed' : 'draft',
            suppressedReason: blocked ?? undefined
        };

        await ctx.store.messages.put(message);
        ctx.audit(blocked ? 'checkin.suppressed' : 'checkin.drafted', {
            messageId: message.id,
            programmeId: programme.id,
            checkpoint: request.checkpoint,
            ...(blocked ? { reason: blocked } : {})
        });

        return { status: 'ok', data: message };
    },

    /** Runs only after a named human approves the draft. */
    async deliver(message: OutboundMessage, ctx: AgentContext): Promise<OutboundMessage> {
        const messaging = ctx.services.messaging;
        if (!messaging) throw new Error('messaging adapter unavailable');
        if (message.status === 'suppressed') throw new Error(`message ${message.id} is suppressed and must not be sent`);

        const receipt = await messaging.send({ ...message, status: 'approved' });
        const sent: OutboundMessage = { ...message, status: 'sent', providerId: receipt.providerId, sentAt: receipt.sentAt };
        await ctx.store.messages.put(sent);
        ctx.audit('checkin.sent', { messageId: sent.id, checkpoint: sent.checkpoint, providerId: receipt.providerId });
        return sent;
    }
};

export function detectConcerns(freeText: string, painScore: number, baselinePainScore: number): string[] {
    const text = freeText.toLowerCase();
    const concerns = CONCERN_PHRASES.filter((phrase) => text.includes(phrase));
    if (painScore >= baselinePainScore + 2) concerns.push(`pain up from ${baselinePainScore}/10 to ${painScore}/10`);
    if (painScore >= 8) concerns.push(`pain reported at ${painScore}/10`);
    return concerns;
}

/**
 * Records a patient's reply as an outcome measure. A reply that raises a concern escalates to a
 * clinician and suspends every remaining check-in for that programme — the automation stops the
 * moment a human is needed.
 */
export async function ingestFollowUpReply(ctx: AgentContext, reply: FollowUpReply): Promise<OutcomeMeasure> {
    const programme = await ctx.store.programmes.get(reply.programmeId);
    if (!programme) throw new Error(`unknown programme ${reply.programmeId}`);

    const plan = await ctx.store.plans.get(programme.planId);
    const assessment = plan ? await ctx.store.assessments.get(plan.assessmentId) : null;
    const baselinePainScore = assessment?.input.history.painScore ?? reply.painScore;

    const concerns = detectConcerns(reply.freeText, reply.painScore, baselinePainScore);
    const outcome: OutcomeMeasure = {
        id: ctx.newId('out'),
        patientId: reply.patientId,
        programmeId: reply.programmeId,
        checkpoint: reply.checkpoint,
        recordedAt: ctx.now().toISOString(),
        painScore: reply.painScore,
        adherence: reply.adherence,
        freeText: reply.freeText,
        concerns,
        escalated: concerns.length > 0
    };

    await ctx.store.outcomes.put(outcome);
    ctx.audit('outcome.recorded', { outcomeId: outcome.id, checkpoint: outcome.checkpoint, escalated: outcome.escalated, concerns: concerns.length });

    if (outcome.escalated) {
        const pending = await ctx.store.messages.list({ programmeId: reply.programmeId, status: 'draft' });
        for (const message of pending) {
            await ctx.store.messages.put({ ...message, status: 'suppressed', suppressedReason: 'sequence suspended pending clinician review' });
        }
        ctx.audit('followup.suspended', { programmeId: reply.programmeId, suppressed: pending.length });
    }

    return outcome;
}

/** STOP means stop. Consent is withdrawn on the patient record, so every later check-in suppresses itself. */
export async function optOut(ctx: AgentContext, patientId: string): Promise<PatientRecord> {
    const patient = await ctx.store.patients.get(patientId);
    if (!patient) throw new Error(`unknown patient ${patientId}`);

    const updated: PatientRecord = { ...patient, consent: { ...patient.consent, automatedFollowUp: false, recordedAt: ctx.now().toISOString() } };
    await ctx.store.patients.put(updated);
    ctx.audit('followup.opted-out', { patientId });
    return updated;
}
