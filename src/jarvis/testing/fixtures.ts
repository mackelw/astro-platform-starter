import { createRecordingMessagingAdapter, createRecordingPublishingAdapter } from '../adapters';
import { createInMemoryStore } from '../db/store';
import { ALL_MODULE_GRANTS, createJarvis } from '../orchestrator';
import type {
    AgentId,
    AssessmentInput,
    AssessmentRecord,
    ExerciseLibraryService,
    HomeExerciseProgramme,
    JarvisStore,
    PatientRecord,
    Scope,
    TreatmentPlan
} from '../types';
import type { Jarvis } from '../orchestrator';
import { signAssessment } from '../agents/assessment';
import { acceptPlan } from '../agents/treatmentPlanning';

/**
 * Test harness. Ids are sequential and the clock is fixed so that failures name a record instead of
 * a random string, and so scheduling assertions do not depend on when the suite runs.
 */
export interface Harness {
    store: JarvisStore;
    jarvis: Jarvis;
    messaging: ReturnType<typeof createRecordingMessagingAdapter>;
    publishing: ReturnType<typeof createRecordingPublishingAdapter>;
}

export const FIXED_NOW = new Date('2026-01-05T10:00:00.000Z');

export function createHarness(
    grants: Partial<Record<AgentId, readonly Scope[]>> = ALL_MODULE_GRANTS,
    options: { library?: ExerciseLibraryService } = {}
): Harness {
    const store = createInMemoryStore();
    const messaging = createRecordingMessagingAdapter();
    const publishing = createRecordingPublishingAdapter();
    const counters = new Map<string, number>();

    const jarvis = createJarvis({
        store,
        grants,
        messaging,
        publishing,
        library: options.library,
        now: () => new Date(FIXED_NOW),
        newId: (prefix) => {
            const next = (counters.get(prefix) ?? 0) + 1;
            counters.set(prefix, next);
            return `${prefix}_${next}`;
        }
    });

    return { store, jarvis, messaging, publishing };
}

export function testPatient(overrides: Partial<PatientRecord> = {}): PatientRecord {
    return {
        id: 'pat_test',
        displayName: 'Test Patient',
        dateOfBirth: '1985-04-12',
        contact: { whatsApp: '+000000000' },
        consent: { dataProcessing: true, automatedFollowUp: true, contentUse: false, recordedAt: FIXED_NOW.toISOString() },
        createdAt: FIXED_NOW.toISOString(),
        ...overrides
    };
}

/** A moderate-irritability right shoulder presentation — the case the demo walks through. */
export function shoulderAssessment(overrides: Partial<AssessmentInput> = {}): AssessmentInput {
    const base: AssessmentInput = {
        patientId: 'pat_test',
        clinicianId: 'clin_test',
        history: {
            presentingComplaint: 'Right shoulder pain on overhead reach',
            onset: 'subacute',
            durationDays: 35,
            painScore: 5,
            aggravatingFactors: ['overhead reach'],
            easingFactors: ['rest'],
            medicalHistory: [],
            screening: {},
            patientGoals: ['return to swimming']
        },
        posture: [{ region: 'scapula', finding: 'right downward rotation', significance: 'relevant' }],
        gait: [],
        rangeOfMotion: [
            { joint: 'shoulder', movement: 'flexion', side: 'right', degrees: 120, painAtEndRange: true },
            { joint: 'shoulder', movement: 'abduction', side: 'right', degrees: 95, painAtEndRange: true }
        ]
    };

    return { ...base, ...overrides, history: { ...base.history, ...overrides.history } };
}

async function dispatchOk<T>(jarvis: Jarvis, agentId: AgentId, input: unknown): Promise<T> {
    const outcome = await jarvis.dispatch<T>(agentId, input);
    if (outcome.status !== 'ok') throw new Error(`${agentId} returned ${outcome.status}: ${JSON.stringify(outcome)}`);
    return outcome.data;
}

/** Seeds a patient and returns a signed assessment — the precondition for planning. */
export async function seedSignedAssessment(harness: Harness, input: AssessmentInput = shoulderAssessment()): Promise<AssessmentRecord> {
    await harness.store.patients.put(testPatient({ id: input.patientId }));
    const assessment = await dispatchOk<AssessmentRecord>(harness.jarvis, 'assessment', input);
    return signAssessment(harness.jarvis.context('assessment'), assessment.id, 'clin_test');
}

/** Seeds through to an accepted plan — the precondition for programmes. */
export async function seedAcceptedPlan(harness: Harness, input: AssessmentInput = shoulderAssessment()): Promise<TreatmentPlan> {
    const assessment = await seedSignedAssessment(harness, input);
    const plan = await dispatchOk<TreatmentPlan>(harness.jarvis, 'treatment-planning', { assessmentId: assessment.id, clinicianId: 'clin_test' });
    return acceptPlan(harness.jarvis.context('treatment-planning'), plan.id, 'clin_test');
}

/** Seeds through to an issued programme — the precondition for follow-up. */
export async function seedProgramme(harness: Harness, input: AssessmentInput = shoulderAssessment()): Promise<HomeExerciseProgramme> {
    const plan = await seedAcceptedPlan(harness, input);
    return dispatchOk<HomeExerciseProgramme>(harness.jarvis, 'exercise-education', { planId: plan.id });
}
