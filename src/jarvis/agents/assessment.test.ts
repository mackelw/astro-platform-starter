import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { analyseRangeOfMotion, gradeIrritability, screenRedFlags, signAssessment } from './assessment';
import { DEFAULT_RED_FLAGS } from './clinicalReference';
import { createHarness, seedSignedAssessment, shoulderAssessment, testPatient } from '../testing/fixtures';
import type { AssessmentRecord } from '../types';

describe('red-flag screening', () => {
    for (const flag of DEFAULT_RED_FLAGS) {
        test(`${flag.id} fires on its own`, () => {
            const hits = screenRedFlags({ [flag.id]: true });
            assert.deepEqual(
                hits.map((hit) => hit.id),
                [flag.id]
            );
            assert.equal(hits[0].urgency, flag.urgency);
        });
    }

    test('a clean screen returns nothing', () => {
        assert.deepEqual(screenRedFlags({ 'cauda-equina': false, 'infection-signs': false }), []);
    });

    test('an unanswered question is not a hit', () => {
        assert.deepEqual(screenRedFlags({}), []);
    });
});

describe('range-of-motion analysis', () => {
    test('reports the deficit as a percentage of the normative range', () => {
        const [deficit] = analyseRangeOfMotion([{ joint: 'shoulder', movement: 'abduction', side: 'right', degrees: 95, painAtEndRange: true }]);
        assert.equal(deficit.expectedDegrees, 180);
        assert.equal(deficit.deficitPercent, 47);
    });

    test('ignores a restriction inside the noise threshold', () => {
        const deficits = analyseRangeOfMotion([{ joint: 'shoulder', movement: 'flexion', side: 'left', degrees: 170, painAtEndRange: false }]);
        assert.deepEqual(deficits, []);
    });

    test('reports pain at end range even when the range itself is full', () => {
        const [deficit] = analyseRangeOfMotion([{ joint: 'shoulder', movement: 'flexion', side: 'left', degrees: 180, painAtEndRange: true }]);
        assert.equal(deficit.deficitPercent, 0);
        assert.equal(deficit.painAtEndRange, true);
    });

    test('catches an extension lag against a zero-degree normative range', () => {
        const [deficit] = analyseRangeOfMotion([{ joint: 'knee', movement: 'extension', side: 'left', degrees: -5, painAtEndRange: false }]);
        assert.equal(deficit.expectedDegrees, 0);
        assert.equal(deficit.measuredDegrees, -5);
        assert.equal(deficit.deficitPercent, 0, 'a lag has no meaningful percentage');
    });

    test('skips a joint and movement pair with no normative value', () => {
        assert.deepEqual(analyseRangeOfMotion([{ joint: 'shoulder', movement: 'adduction', side: 'right', degrees: 10, painAtEndRange: false }]), []);
    });

    test('orders deficits worst first', () => {
        const deficits = analyseRangeOfMotion([
            { joint: 'shoulder', movement: 'flexion', side: 'right', degrees: 120, painAtEndRange: false },
            { joint: 'shoulder', movement: 'abduction', side: 'right', degrees: 95, painAtEndRange: false }
        ]);
        assert.deepEqual(
            deficits.map((deficit) => deficit.movement),
            ['abduction', 'flexion']
        );
    });
});

describe('irritability grading', () => {
    test('high at or above 7 out of 10', () => {
        assert.equal(gradeIrritability(7, 'chronic', []), 'high');
    });

    test('moderate between 4 and 6', () => {
        assert.equal(gradeIrritability(4, 'chronic', []), 'moderate');
        assert.equal(gradeIrritability(6, 'chronic', []), 'moderate');
    });

    test('low below 4 with no painful end range', () => {
        assert.equal(gradeIrritability(3, 'chronic', []), 'low');
    });

    test('a single painful end range lifts a low score to moderate', () => {
        const deficits = analyseRangeOfMotion([{ joint: 'shoulder', movement: 'abduction', side: 'right', degrees: 95, painAtEndRange: true }]);
        assert.equal(gradeIrritability(2, 'chronic', deficits), 'moderate');
    });

    test('acute with two painful end ranges is high regardless of score', () => {
        const deficits = analyseRangeOfMotion([
            { joint: 'shoulder', movement: 'flexion', side: 'right', degrees: 120, painAtEndRange: true },
            { joint: 'shoulder', movement: 'abduction', side: 'right', degrees: 95, painAtEndRange: true }
        ]);
        assert.equal(gradeIrritability(2, 'acute', deficits), 'high');
    });
});

describe('the assessment module', () => {
    test('writes a draft record for a clean screen', async () => {
        const harness = createHarness();
        await harness.store.patients.put(testPatient());

        const outcome = await harness.jarvis.dispatch<AssessmentRecord>('assessment', shoulderAssessment());
        assert.equal(outcome.status, 'ok');
        if (outcome.status !== 'ok') return;

        assert.equal(outcome.data.status, 'draft');
        assert.equal(outcome.data.findings.irritability, 'moderate');
        assert.ok(await harness.store.assessments.get(outcome.data.id), 'record was persisted');
    });

    test('escalates and does not sign when a red flag fires', async () => {
        const harness = createHarness();
        await harness.store.patients.put(testPatient());

        const outcome = await harness.jarvis.dispatch<AssessmentRecord>(
            'assessment',
            shoulderAssessment({ history: { screening: { 'cauda-equina': true } } as never })
        );
        assert.equal(outcome.status, 'escalated');
        if (outcome.status !== 'escalated') return;

        assert.equal(outcome.redFlags[0].urgency, 'same-day');
        assert.equal(outcome.data?.status, 'escalated');
    });

    test('refuses to store anything without processing consent', async () => {
        const harness = createHarness();
        await harness.store.patients.put(testPatient({ consent: { ...testPatient().consent, dataProcessing: false } }));

        const outcome = await harness.jarvis.dispatch('assessment', shoulderAssessment());
        assert.equal(outcome.status, 'rejected');
        assert.equal((await harness.store.assessments.list()).length, 0);
    });

    test('refuses an unknown patient', async () => {
        const harness = createHarness();
        const outcome = await harness.jarvis.dispatch('assessment', shoulderAssessment({ patientId: 'pat_nobody' }));
        assert.equal(outcome.status, 'rejected');
    });

    test('refuses input with no screening block', async () => {
        const harness = createHarness();
        await harness.store.patients.put(testPatient());

        const input = shoulderAssessment();
        delete (input.history as { screening?: unknown }).screening;

        const outcome = await harness.jarvis.dispatch('assessment', input);
        assert.equal(outcome.status, 'rejected');
        if (outcome.status !== 'rejected') return;
        assert.match(outcome.errors[0], /screening/);
    });

    test('refuses a pain score outside 0 to 10', async () => {
        const harness = createHarness();
        await harness.store.patients.put(testPatient());

        const outcome = await harness.jarvis.dispatch('assessment', shoulderAssessment({ history: { painScore: 12 } as never }));
        assert.equal(outcome.status, 'rejected');
    });
});

describe('clinician sign-off', () => {
    test('signing records who and when', async () => {
        const harness = createHarness();
        const signed = await seedSignedAssessment(harness);
        assert.equal(signed.status, 'signed');
        assert.equal(signed.signedBy, 'clin_test');
        assert.ok(signed.signedAt);
    });

    test('an escalated assessment cannot be signed', async () => {
        const harness = createHarness();
        await harness.store.patients.put(testPatient());
        const outcome = await harness.jarvis.dispatch<AssessmentRecord>(
            'assessment',
            shoulderAssessment({ history: { screening: { 'infection-signs': true } } as never })
        );
        assert.equal(outcome.status, 'escalated');
        if (outcome.status !== 'escalated' || !outcome.data) return;

        await assert.rejects(() => signAssessment(harness.jarvis.context('assessment'), outcome.data!.id, 'clin_test'), /red flags/);
    });
});
