import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { detectConcerns, followUpAgent, ingestFollowUpReply, optOut, scheduleWithinWindow } from './followUp';
import { createHarness, seedProgramme, testPatient } from '../testing/fixtures';
import type { HomeExerciseProgramme, OutboundMessage } from '../types';

describe('send window', () => {
    test('holds an early-morning send until nine', () => {
        const scheduled = scheduleWithinWindow(new Date(2026, 0, 5, 6, 30), 0);
        assert.equal(scheduled.getHours(), 9);
        assert.equal(scheduled.getDate(), 5);
    });

    test('pushes a late-evening send to the next morning', () => {
        const scheduled = scheduleWithinWindow(new Date(2026, 0, 5, 21, 15), 0);
        assert.equal(scheduled.getHours(), 9);
        assert.equal(scheduled.getDate(), 6);
    });

    test('leaves a midday send alone', () => {
        const scheduled = scheduleWithinWindow(new Date(2026, 0, 5, 13, 0), 0);
        assert.equal(scheduled.getHours(), 13);
    });

    test('applies the checkpoint offset', () => {
        const scheduled = scheduleWithinWindow(new Date(2026, 0, 5, 13, 0), 7);
        assert.equal(scheduled.getDate(), 12);
    });
});

describe('concern detection', () => {
    test('catches a red-flag phrase', () => {
        assert.ok(detectConcerns('some numbness in my hand', 4, 5).includes('numb'));
    });

    test('catches a pain jump against the baseline', () => {
        assert.ok(detectConcerns('about the same really', 7, 5).some((concern) => /pain up from 5/.test(concern)));
    });

    test('catches a high absolute score', () => {
        assert.ok(detectConcerns('ok', 9, 9).some((concern) => /9\/10/.test(concern)));
    });

    test('a good week raises nothing', () => {
        assert.deepEqual(detectConcerns('much better, sleeping through', 2, 5), []);
    });

    test('a one-point rise is not an escalation', () => {
        assert.deepEqual(detectConcerns('about the same', 6, 5), []);
    });
});

describe('the check-in module', () => {
    test('a draft waits for approval and sends nothing', async () => {
        const harness = createHarness();
        const programme = await seedProgramme(harness);

        const outcome = await harness.jarvis.dispatch<OutboundMessage>('follow-up', { programmeId: programme.id, checkpoint: 'week-1' });
        assert.equal(outcome.status, 'needs-approval');
        if (outcome.status !== 'needs-approval') return;

        assert.equal(outcome.draft.status, 'draft');
        assert.equal(harness.messaging.sent.length, 0, 'nothing goes out before approval');
        assert.equal((await harness.jarvis.pendingApprovals()).length, 1);
    });

    test('the body comes from an approved template and offers an opt-out', async () => {
        const harness = createHarness();
        const programme = await seedProgramme(harness);

        const outcome = await harness.jarvis.dispatch<OutboundMessage>('follow-up', { programmeId: programme.id, checkpoint: 'week-1' });
        assert.equal(outcome.status, 'needs-approval');
        if (outcome.status !== 'needs-approval') return;

        assert.equal(outcome.draft.templateId, 'checkin_week1_v1');
        assert.match(outcome.draft.body, /Reply STOP/);
    });

    test('approval is what sends it', async () => {
        const harness = createHarness();
        const programme = await seedProgramme(harness);

        const outcome = await harness.jarvis.dispatch<OutboundMessage>('follow-up', { programmeId: programme.id, checkpoint: 'week-1' });
        assert.equal(outcome.status, 'needs-approval');
        if (outcome.status !== 'needs-approval') return;

        const decision = await harness.jarvis.decideApproval(outcome.approvalId, { approved: true, decidedBy: 'clin_test' });
        assert.equal(harness.messaging.sent.length, 1);
        assert.equal((decision.delivered as OutboundMessage).status, 'sent');
        assert.equal((await harness.store.messages.get(outcome.draft.id))?.status, 'sent');
    });

    test('rejection sends nothing', async () => {
        const harness = createHarness();
        const programme = await seedProgramme(harness);

        const outcome = await harness.jarvis.dispatch<OutboundMessage>('follow-up', { programmeId: programme.id, checkpoint: 'week-1' });
        assert.equal(outcome.status, 'needs-approval');
        if (outcome.status !== 'needs-approval') return;

        await harness.jarvis.decideApproval(outcome.approvalId, { approved: false, decidedBy: 'clin_test' });
        assert.equal(harness.messaging.sent.length, 0);
        assert.equal((await harness.store.messages.get(outcome.draft.id))?.status, 'draft');
    });

    test('suppresses a check-in without follow-up consent, and skips the approval queue', async () => {
        const harness = createHarness();
        const programme = await seedProgramme(harness);
        const patient = testPatient();
        await harness.store.patients.put({ ...patient, consent: { ...patient.consent, automatedFollowUp: false } });

        const outcome = await harness.jarvis.dispatch<OutboundMessage>('follow-up', { programmeId: programme.id, checkpoint: 'week-1' });
        assert.equal(outcome.status, 'ok', 'a suppressed message is not a decision for a human');
        if (outcome.status !== 'ok') return;

        assert.equal(outcome.data.status, 'suppressed');
        assert.match(outcome.data.suppressedReason ?? '', /consented/);
        assert.equal((await harness.jarvis.pendingApprovals()).length, 0);
    });

    test('suppresses a check-in with no WhatsApp number', async () => {
        const harness = createHarness();
        const programme = await seedProgramme(harness);
        await harness.store.patients.put(testPatient({ contact: {} }));

        const outcome = await harness.jarvis.dispatch<OutboundMessage>('follow-up', { programmeId: programme.id, checkpoint: 'week-1' });
        assert.equal(outcome.status, 'ok');
        if (outcome.status !== 'ok') return;
        assert.match(outcome.data.suppressedReason ?? '', /WhatsApp number/);
    });

    test('a suppressed message cannot be delivered even if something tries', async () => {
        const harness = createHarness();
        const programme = await seedProgramme(harness);
        await harness.store.patients.put(testPatient({ contact: {} }));

        const outcome = await harness.jarvis.dispatch<OutboundMessage>('follow-up', { programmeId: programme.id, checkpoint: 'week-1' });
        assert.equal(outcome.status, 'ok');
        if (outcome.status !== 'ok') return;

        await assert.rejects(() => followUpAgent.deliver!(outcome.data, harness.jarvis.context('follow-up')), /suppressed/);
        assert.equal(harness.messaging.sent.length, 0);
    });

    test('refuses an unknown checkpoint', async () => {
        const harness = createHarness();
        const programme = await seedProgramme(harness);
        const outcome = await harness.jarvis.dispatch('follow-up', { programmeId: programme.id, checkpoint: 'month-3' });
        assert.equal(outcome.status, 'rejected');
    });

    test('refuses an unknown programme', async () => {
        const harness = createHarness();
        const outcome = await harness.jarvis.dispatch('follow-up', { programmeId: 'hep_nothing', checkpoint: 'week-1' });
        assert.equal(outcome.status, 'rejected');
    });
});

describe('replies', () => {
    test('a clean reply is recorded without escalating', async () => {
        const harness = createHarness();
        const programme = await seedProgramme(harness);

        const outcome = await ingestFollowUpReply(harness.jarvis.context('follow-up'), {
            patientId: programme.patientId,
            programmeId: programme.id,
            checkpoint: 'week-1',
            painScore: 3,
            adherence: 'full',
            freeText: 'going well'
        });

        assert.equal(outcome.escalated, false);
        assert.deepEqual(outcome.concerns, []);
    });

    test('a concerning reply escalates and suspends the pending sequence', async () => {
        const harness = createHarness();
        const programme = await seedProgramme(harness);

        const pending = await harness.jarvis.dispatch<OutboundMessage>('follow-up', { programmeId: programme.id, checkpoint: 'week-2' });
        assert.equal(pending.status, 'needs-approval');
        if (pending.status !== 'needs-approval') return;

        const outcome = await ingestFollowUpReply(harness.jarvis.context('follow-up'), {
            patientId: programme.patientId,
            programmeId: programme.id,
            checkpoint: 'week-1',
            painScore: 8,
            adherence: 'partial',
            freeText: 'worse this week and my hand feels numb'
        });

        assert.equal(outcome.escalated, true);
        assert.equal((await harness.store.messages.get(pending.draft.id))?.status, 'suppressed');
    });

    test('after an escalation the next check-in suppresses itself', async () => {
        const harness = createHarness();
        const programme = await seedProgramme(harness);

        await ingestFollowUpReply(harness.jarvis.context('follow-up'), {
            patientId: programme.patientId,
            programmeId: programme.id,
            checkpoint: 'week-1',
            painScore: 9,
            adherence: 'none',
            freeText: 'much worse'
        });

        const outcome = await harness.jarvis.dispatch<OutboundMessage>('follow-up', { programmeId: programme.id, checkpoint: 'week-6' });
        assert.equal(outcome.status, 'ok');
        if (outcome.status !== 'ok') return;
        assert.match(outcome.data.suppressedReason ?? '', /suspended/);
    });

    test('the baseline for a pain jump is the assessment, not the reply', async () => {
        const harness = createHarness();
        const programme: HomeExerciseProgramme = await seedProgramme(harness);

        const outcome = await ingestFollowUpReply(harness.jarvis.context('follow-up'), {
            patientId: programme.patientId,
            programmeId: programme.id,
            checkpoint: 'week-1',
            painScore: 7,
            adherence: 'full',
            freeText: 'no change'
        });

        assert.ok(outcome.concerns.some((concern) => /pain up from 5\/10 to 7\/10/.test(concern)));
    });
});

describe('opt-out', () => {
    test('STOP withdraws consent on the record', async () => {
        const harness = createHarness();
        const programme = await seedProgramme(harness);

        const updated = await optOut(harness.jarvis.context('follow-up'), programme.patientId);
        assert.equal(updated.consent.automatedFollowUp, false);
        assert.equal(updated.consent.dataProcessing, true, 'withdrawing messaging consent is not withdrawing clinical consent');
    });

    test('an unknown patient cannot be opted out', async () => {
        const harness = createHarness();
        await assert.rejects(() => optOut(harness.jarvis.context('follow-up'), 'pat_nobody'), /unknown patient/);
    });
});
