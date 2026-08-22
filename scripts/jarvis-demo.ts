/**
 * A walk-through of the phase 1 path: register a patient, run an assessment, sign it, and prove
 * the guard rails hold. Run with `npm run jarvis:demo`.
 */
import { createInMemoryStore } from '../src/jarvis/db/store';
import { createJarvis, PHASE_1_GRANTS } from '../src/jarvis/orchestrator';
import { signAssessment } from '../src/jarvis/agents/assessment';
import type { AssessmentInput, AssessmentRecord, PatientRecord } from '../src/jarvis/types';

const store = createInMemoryStore();
const jarvis = createJarvis({ store, grants: PHASE_1_GRANTS });

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

function heading(text: string) {
    console.log(`\n── ${text} ${'─'.repeat(Math.max(0, 60 - text.length))}`);
}

heading('1. Clean assessment');
const clean = await jarvis.dispatch<AssessmentRecord>('assessment', baseInput);
if (clean.status !== 'ok') throw new Error(`expected ok, got ${clean.status}`);
console.log(clean.data.findings.functionalSummary);
console.log('Problem list:', clean.data.findings.problemList);
console.log('Status:', clean.data.status);

heading('2. Clinician signs — this is what unlocks Agent 2');
const signed = await signAssessment(jarvis.context('assessment'), clean.data.id, 'clin_001');
console.log('Status:', signed.status, '· signed by', signed.signedBy);

heading('3. Red flag escalates and halts the pipeline');
const flagged = await jarvis.dispatch<AssessmentRecord>('assessment', {
    ...baseInput,
    history: { ...baseInput.history, screening: { ...baseInput.history.screening, 'unexplained-weight-loss': true } }
});
console.log('Outcome:', flagged.status);
if (flagged.status === 'escalated')
    console.log(
        'Flags:',
        flagged.redFlags.map((flag) => `${flag.label} (${flag.urgency})`)
    );

heading('4. Missing screening is rejected at the boundary');
const { screening, ...historyWithoutScreening } = baseInput.history;
const invalid = await jarvis.dispatch('assessment', { ...baseInput, history: historyWithoutScreening });
console.log('Outcome:', invalid.status, invalid.status === 'rejected' ? invalid.errors : '');

heading('5. Unbuilt module fails with a useful message');
const planned = await jarvis.dispatch('treatment-planning', {});
console.log('Outcome:', planned.status, planned.status === 'rejected' ? planned.errors : '');

heading('6. Ungranted scope is refused');
const locked = createJarvis({ store, grants: { assessment: ['phi:read'] } });
const denied = await locked.dispatch('assessment', baseInput);
console.log('Outcome:', denied.status, denied.status === 'rejected' ? denied.errors : '');

heading('Audit trail');
for (const event of await jarvis.auditTrail()) {
    console.log(`${event.agentId} · ${event.action} ·`, event.detail);
}
