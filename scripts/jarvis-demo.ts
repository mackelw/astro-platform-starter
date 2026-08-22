/**
 * A walk-through of the whole pipeline: assessment → plan → programme → follow-up, plus the
 * content module running alongside it. Every guard rail in the system is exercised on the way.
 * Run with `npm run jarvis:demo`.
 */
import { createInMemoryStore } from '../src/jarvis/db/store';
import { createJarvis, ALL_MODULE_GRANTS } from '../src/jarvis/orchestrator';
import { signAssessment } from '../src/jarvis/agents/assessment';
import { acceptPlan } from '../src/jarvis/agents/treatmentPlanning';
import { ingestFollowUpReply, optOut } from '../src/jarvis/agents/followUp';
import { createRecordingMessagingAdapter } from '../src/jarvis/adapters';
import type {
    AssessmentInput,
    AssessmentRecord,
    ContentDraft,
    HomeExerciseProgramme,
    OutboundMessage,
    PatientRecord,
    TreatmentPlan
} from '../src/jarvis/types';

const store = createInMemoryStore();
const messaging = createRecordingMessagingAdapter();
const jarvis = createJarvis({ store, grants: ALL_MODULE_GRANTS, messaging });

function heading(text: string) {
    console.log(`\n── ${text} ${'─'.repeat(Math.max(0, 64 - text.length))}`);
}

function expect<T extends { status: string }>(outcome: T, status: T['status']): T {
    if (outcome.status !== status) throw new Error(`expected ${status}, got ${outcome.status}: ${JSON.stringify(outcome)}`);
    return outcome;
}

const patient: PatientRecord = {
    id: 'pat_001',
    displayName: 'Test Patient',
    dateOfBirth: '1985-04-12',
    contact: { whatsApp: '+000000000' },
    consent: { dataProcessing: true, automatedFollowUp: true, contentUse: false, recordedAt: new Date().toISOString() },
    createdAt: new Date().toISOString()
};
await store.patients.put(patient);

const baseInput: AssessmentInput = {
    patientId: patient.id,
    clinicianId: 'clin_001',
    history: {
        presentingComplaint: 'Right shoulder pain on overhead reach',
        onset: 'subacute',
        durationDays: 35,
        painScore: 5,
        aggravatingFactors: ['overhead reach', 'lying on right side'],
        easingFactors: ['rest', 'heat'],
        medicalHistory: ['nil relevant'],
        screening: { 'cauda-equina': false, 'unexplained-weight-loss': false, 'infection-signs': false },
        patientGoals: ['return to swimming', 'sleep through the night']
    },
    posture: [{ region: 'scapula', finding: 'right downward rotation at rest', significance: 'relevant' }],
    gait: [],
    rangeOfMotion: [
        { joint: 'shoulder', movement: 'flexion', side: 'right', degrees: 120, painAtEndRange: true },
        { joint: 'shoulder', movement: 'abduction', side: 'right', degrees: 95, painAtEndRange: true },
        { joint: 'shoulder', movement: 'external-rotation', side: 'right', degrees: 80, painAtEndRange: false },
        { joint: 'shoulder', movement: 'flexion', side: 'left', degrees: 178, painAtEndRange: false }
    ]
};

heading('Agent 1 — assessment');
const assessed = expect(await jarvis.dispatch<AssessmentRecord>('assessment', baseInput), 'ok') as { status: 'ok'; data: AssessmentRecord };
console.log(assessed.data.findings.functionalSummary);
console.log('Status:', assessed.data.status, '· irritability:', assessed.data.findings.irritability);

heading('Planning refuses to read an unsigned assessment');
const premature = await jarvis.dispatch('treatment-planning', { assessmentId: assessed.data.id, clinicianId: 'clin_001' });
console.log('Outcome:', premature.status, premature.status === 'rejected' ? premature.errors : '');

heading('Clinician signs');
const signed = await signAssessment(jarvis.context('assessment'), assessed.data.id, 'clin_001');
console.log('Status:', signed.status, '· signed by', signed.signedBy);

heading('Agent 2 — treatment plan, evidence brokered from Agent 3');
const planned = expect(await jarvis.dispatch<TreatmentPlan>('treatment-planning', { assessmentId: signed.id, clinicianId: 'clin_001' }), 'ok') as {
    status: 'ok';
    data: TreatmentPlan;
};
for (const intervention of planned.data.interventions) {
    console.log(`• [${intervention.family}] ${intervention.title} — ${intervention.dosage}`);
    for (const citation of intervention.citations) console.log(`    ↳ ${citation.title} (${citation.sourceType}, ${citation.strength})`);
}
console.log(
    'Goals:',
    planned.data.goals.map((goal) => `${goal.horizon}: ${goal.statement}`)
);
console.log('Precautions:', planned.data.precautions);
console.log('Review in', planned.data.reviewInDays, 'days · unsupported candidates:', planned.data.unsupported.length);

heading('Agent 3 — refuses patient data outright');
const leaked = await jarvis.dispatch('knowledge-base', { question: 'What helps shoulder pain?', patientId: 'pat_001' });
console.log('Outcome:', leaked.status, leaked.status === 'rejected' ? leaked.errors : '');

heading('Programmes need an accepted plan');
const tooEarly = await jarvis.dispatch('exercise-education', { planId: planned.data.id });
console.log('Outcome:', tooEarly.status, tooEarly.status === 'rejected' ? tooEarly.errors : '');

heading('Clinician accepts the plan');
const accepted = await acceptPlan(jarvis.context('treatment-planning'), planned.data.id, 'clin_001');
console.log('Status:', accepted.status, '· accepted by', accepted.acceptedBy);

heading('Agent 4 — home exercise programme');
const programme = expect(await jarvis.dispatch<HomeExerciseProgramme>('exercise-education', { planId: accepted.id }), 'ok') as {
    status: 'ok';
    data: HomeExerciseProgramme;
};
for (const exercise of programme.data.exercises) {
    const dose = exercise.durationMinutes
        ? `${exercise.durationMinutes} min`
        : `${exercise.sets}×${exercise.reps}${exercise.holdSeconds ? `, ${exercise.holdSeconds}s hold` : ''}`;
    console.log(`• ${exercise.name} [${exercise.source}] — ${dose}, ${exercise.frequencyPerWeek}×/week`);
}
console.log('Difficulty cap:', programme.data.difficultyCap, '· education topics:', programme.data.education.length);
console.log('Coverage gaps:', programme.data.coverageGaps.length ? programme.data.coverageGaps : 'none');

heading('Agent 5 — check-in waits for a human');
const checkIn = expect(await jarvis.dispatch<OutboundMessage>('follow-up', { programmeId: programme.data.id, checkpoint: 'week-1' }), 'needs-approval') as {
    status: 'needs-approval';
    approvalId: string;
    draft: OutboundMessage;
};
console.log('Template:', checkIn.draft.templateId, '· scheduled:', checkIn.draft.scheduledFor);
console.log('Body:', checkIn.draft.body);
console.log('Pending approvals:', (await jarvis.pendingApprovals()).length, '· messages actually sent so far:', messaging.sent.length);

const released = await jarvis.decideApproval(checkIn.approvalId, { approved: true, decidedBy: 'clin_001' });
console.log('Approved by', released.approval.decidedBy, '· provider id:', (released.delivered as OutboundMessage).providerId);
console.log('Messages sent:', messaging.sent.length);

heading('A worrying reply stops the automation');
const outcome = await ingestFollowUpReply(jarvis.context('follow-up'), {
    patientId: patient.id,
    programmeId: programme.data.id,
    checkpoint: 'week-1',
    painScore: 8,
    adherence: 'partial',
    freeText: 'Pain is worse this week and my hand feels numb'
});
console.log('Escalated:', outcome.escalated, '· concerns:', outcome.concerns);

const afterEscalation = expect(await jarvis.dispatch<OutboundMessage>('follow-up', { programmeId: programme.data.id, checkpoint: 'week-2' }), 'ok') as {
    status: 'ok';
    data: OutboundMessage;
};
console.log('Next check-in:', afterEscalation.data.status, '—', afterEscalation.data.suppressedReason);

heading('STOP means stop');
await optOut(jarvis.context('follow-up'), patient.id);
const afterOptOut = expect(await jarvis.dispatch<OutboundMessage>('follow-up', { programmeId: programme.data.id, checkpoint: 'week-6' }), 'ok') as {
    status: 'ok';
    data: OutboundMessage;
};
console.log('Next check-in:', afterOptOut.data.status, '—', afterOptOut.data.suppressedReason);

heading('Agent 6 — content, off-list topics refused');
const offList = await jarvis.dispatch('marketing', { topic: 'the one exercise that cures back pain', channel: 'instagram', audience: 'local runners' });
console.log('Outcome:', offList.status, offList.status === 'rejected' ? offList.errors[0].slice(0, 80) + '…' : '');

const draft = expect(
    await jarvis.dispatch<ContentDraft>('marketing', {
        topic: 'managing an acute flare-up',
        channel: 'instagram',
        audience: 'people mid-flare who are wondering whether to rest',
        callToAction: 'Book an assessment if it is not settling.'
    }),
    'needs-approval'
) as { status: 'needs-approval'; approvalId: string; draft: ContentDraft };
console.log(`${draft.draft.headline}\n${draft.draft.body}\n${draft.draft.hashtags.join(' ')}\n— ${draft.draft.disclaimer}`);

const publishDecision = await jarvis.decideApproval(draft.approvalId, { approved: false, decidedBy: 'clin_001', note: 'reword the opening' });
console.log('Decision:', publishDecision.approval.status, '· published:', (await store.content.get(draft.draft.id))?.status);

heading('Audit trail');
for (const event of await jarvis.auditTrail()) console.log(`${event.agentId.padEnd(19)} ${event.action.padEnd(24)}`, event.detail);
