import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { acceptPlan, proposeCandidates, treatmentPlanningAgent } from './treatmentPlanning';
import { inferRegion } from './clinicalReference';
import { createHarness, seedSignedAssessment, shoulderAssessment, testPatient } from '../testing/fixtures';
import type { AssessmentRecord, TreatmentPlan } from '../types';

describe('region inference', () => {
    test('takes the region from the largest measured restriction', async () => {
        const harness = createHarness();
        const assessment = await seedSignedAssessment(harness);
        assert.equal(inferRegion(assessment), 'shoulder');
    });

    test('falls back to the complaint text when nothing was measured', async () => {
        const harness = createHarness();
        const assessment = await seedSignedAssessment(
            harness,
            shoulderAssessment({ history: { presentingComplaint: 'Low back pain after lifting' } as never, rangeOfMotion: [] })
        );
        assert.equal(inferRegion(assessment), 'lumbar-spine');
    });

    test('returns general when neither says anything', async () => {
        const harness = createHarness();
        const assessment = await seedSignedAssessment(
            harness,
            shoulderAssessment({ history: { presentingComplaint: 'Feeling stiff all over' } as never, rangeOfMotion: [] })
        );
        assert.equal(inferRegion(assessment), 'general');
    });
});

describe('candidate selection', () => {
    test('a high-irritability presentation gets a pain-modulation entry point', async () => {
        const harness = createHarness();
        const assessment = await seedSignedAssessment(harness, shoulderAssessment({ history: { painScore: 9 } as never }));
        const families = proposeCandidates(assessment, 'shoulder').map((candidate) => candidate.family);
        assert.ok(families.includes('pain-modulation'));
    });

    test('a low-irritability presentation gets neither pain modulation nor manual therapy', async () => {
        const harness = createHarness();
        const assessment = await seedSignedAssessment(
            harness,
            shoulderAssessment({ history: { painScore: 2, aggravatingFactors: [], onset: 'chronic' } as never, rangeOfMotion: [] })
        );
        const families = proposeCandidates(assessment, 'shoulder').map((candidate) => candidate.family);
        assert.ok(!families.includes('pain-modulation'));
        assert.ok(!families.includes('manual-therapy'));
    });

    test('education is always proposed', async () => {
        const harness = createHarness();
        const assessment = await seedSignedAssessment(harness);
        assert.ok(proposeCandidates(assessment, 'shoulder').some((candidate) => candidate.family === 'education'));
    });
});

describe('the planning module', () => {
    test('every intervention in a plan carries at least one citation', async () => {
        const harness = createHarness();
        const assessment = await seedSignedAssessment(harness);

        const outcome = await harness.jarvis.dispatch<TreatmentPlan>('treatment-planning', { assessmentId: assessment.id, clinicianId: 'clin_test' });
        assert.equal(outcome.status, 'ok');
        if (outcome.status !== 'ok') return;

        assert.ok(outcome.data.interventions.length > 0);
        for (const intervention of outcome.data.interventions) {
            assert.ok(intervention.citations.length > 0, `${intervention.title} is uncited`);
        }
    });

    test('cites nothing from the wrong body region', async () => {
        const harness = createHarness();
        const assessment = await seedSignedAssessment(harness);

        const outcome = await harness.jarvis.dispatch<TreatmentPlan>('treatment-planning', { assessmentId: assessment.id, clinicianId: 'clin_test' });
        assert.equal(outcome.status, 'ok');
        if (outcome.status !== 'ok') return;

        const regions = outcome.data.interventions.flatMap((intervention) => intervention.citations.map((citation) => citation.region));
        assert.ok(
            regions.every((region) => region === 'shoulder' || region === 'general'),
            `plan cited ${regions.join(', ')}`
        );
    });

    test('warns in its precautions that the corpus is placeholder data', async () => {
        const harness = createHarness();
        const assessment = await seedSignedAssessment(harness);
        const outcome = await harness.jarvis.dispatch<TreatmentPlan>('treatment-planning', { assessmentId: assessment.id, clinicianId: 'clin_test' });
        assert.equal(outcome.status, 'ok');
        if (outcome.status !== 'ok') return;
        assert.ok(outcome.data.precautions.some((precaution) => /placeholder/i.test(precaution)));
    });

    test('shortens the review interval for a high-irritability presentation', async () => {
        const harness = createHarness();
        const assessment = await seedSignedAssessment(harness, shoulderAssessment({ history: { painScore: 9 } as never }));
        const outcome = await harness.jarvis.dispatch<TreatmentPlan>('treatment-planning', { assessmentId: assessment.id, clinicianId: 'clin_test' });
        assert.equal(outcome.status, 'ok');
        if (outcome.status !== 'ok') return;
        assert.equal(outcome.data.reviewInDays, 7);
    });

    test('carries the patient goals through as long-term goals', async () => {
        const harness = createHarness();
        const assessment = await seedSignedAssessment(harness);
        const outcome = await harness.jarvis.dispatch<TreatmentPlan>('treatment-planning', { assessmentId: assessment.id, clinicianId: 'clin_test' });
        assert.equal(outcome.status, 'ok');
        if (outcome.status !== 'ok') return;
        assert.ok(outcome.data.goals.some((goal) => goal.horizon === 'long-term' && goal.statement === 'return to swimming'));
    });

    test('refuses a draft assessment', async () => {
        const harness = createHarness();
        await harness.store.patients.put(testPatient());
        const assessed = await harness.jarvis.dispatch<AssessmentRecord>('assessment', shoulderAssessment());
        assert.equal(assessed.status, 'ok');
        if (assessed.status !== 'ok') return;

        const outcome = await harness.jarvis.dispatch('treatment-planning', { assessmentId: assessed.data.id, clinicianId: 'clin_test' });
        assert.equal(outcome.status, 'rejected');
        if (outcome.status !== 'rejected') return;
        assert.match(outcome.errors[0], /signed assessments only/);
    });

    test('refuses an escalated assessment', async () => {
        const harness = createHarness();
        await harness.store.patients.put(testPatient());
        const assessed = await harness.jarvis.dispatch<AssessmentRecord>(
            'assessment',
            shoulderAssessment({ history: { screening: { 'cauda-equina': true } } as never })
        );
        assert.equal(assessed.status, 'escalated');
        if (assessed.status !== 'escalated' || !assessed.data) return;

        const outcome = await harness.jarvis.dispatch('treatment-planning', { assessmentId: assessed.data.id, clinicianId: 'clin_test' });
        assert.equal(outcome.status, 'rejected');
    });

    test('refuses an unknown assessment', async () => {
        const harness = createHarness();
        const outcome = await harness.jarvis.dispatch('treatment-planning', { assessmentId: 'asm_nothing', clinicianId: 'clin_test' });
        assert.equal(outcome.status, 'rejected');
    });

    test('will not plan without the evidence service', async () => {
        const harness = createHarness();
        const assessment = await seedSignedAssessment(harness);
        const context = { ...harness.jarvis.context('treatment-planning'), services: {} };

        const outcome = await treatmentPlanningAgent.run({ assessmentId: assessment.id, clinicianId: 'clin_test' }, context);
        assert.equal(outcome.status, 'rejected');
        if (outcome.status !== 'rejected') return;
        assert.match(outcome.errors[0], /uncited/);
    });
});

describe('clinician acceptance', () => {
    test('accepting records who and when', async () => {
        const harness = createHarness();
        const assessment = await seedSignedAssessment(harness);
        const outcome = await harness.jarvis.dispatch<TreatmentPlan>('treatment-planning', { assessmentId: assessment.id, clinicianId: 'clin_test' });
        assert.equal(outcome.status, 'ok');
        if (outcome.status !== 'ok') return;

        const accepted = await acceptPlan(harness.jarvis.context('treatment-planning'), outcome.data.id, 'clin_test');
        assert.equal(accepted.status, 'accepted');
        assert.equal(accepted.acceptedBy, 'clin_test');
    });

    test('an unknown plan cannot be accepted', async () => {
        const harness = createHarness();
        await assert.rejects(() => acceptPlan(harness.jarvis.context('treatment-planning'), 'plan_nothing', 'clin_test'), /unknown plan/);
    });
});
