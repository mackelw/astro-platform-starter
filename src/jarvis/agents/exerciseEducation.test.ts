import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { deriveTargets } from './exerciseEducation';
import { createExerciseLibrary, SAMPLE_EXERCISE_ASSETS } from './exerciseLibrary';
import { createHarness, seedAcceptedPlan, seedSignedAssessment, shoulderAssessment } from '../testing/fixtures';
import type { HomeExerciseProgramme, TreatmentPlan } from '../types';

describe('the exercise library', () => {
    test('prefers a clinic asset over a catalogue asset for the same target', async () => {
        const library = createExerciseLibrary();
        const results = await library.search({ region: 'shoulder', targets: ['rotator-cuff-strength'], maxDifficulty: 5 });
        assert.equal(results[0].source, 'clinic-library');
    });

    test('never returns an asset above the difficulty cap', async () => {
        const library = createExerciseLibrary();
        const results = await library.search({ region: 'shoulder', targets: ['shoulder-strength', 'rotator-cuff-strength'], maxDifficulty: 2 });
        assert.ok(results.every((asset) => asset.difficulty <= 2));
    });

    test('excludes assets contraindicated for the patient', async () => {
        const library = createExerciseLibrary();
        const results = await library.search({ region: 'shoulder', targets: ['shoulder-range'], maxDifficulty: 5, exclude: ['acute-fracture'] });
        assert.ok(!results.some((asset) => asset.id === 'ex-sh-pendulum'));
    });

    test('returns nothing for a region it has no assets for', async () => {
        const library = createExerciseLibrary();
        assert.deepEqual(await library.search({ region: 'elbow', targets: ['elbow-strength'], maxDifficulty: 5 }), []);
    });

    test('every sample asset declares how it is dosed', () => {
        assert.ok(SAMPLE_EXERCISE_ASSETS.every((asset) => asset.dosing === 'sets-reps' || asset.dosing === 'duration'));
    });
});

describe('target derivation', () => {
    test('reads targets from the restrictions and the plan, not the catalogue', async () => {
        const harness = createHarness();
        const plan = await seedAcceptedPlan(harness);
        const assessment = await harness.store.assessments.get(plan.assessmentId);
        assert.ok(assessment);

        const targets = deriveTargets(assessment, plan);
        assert.ok(targets.includes('shoulder-range'));
        assert.ok(targets.includes('shoulder-strength'));
        assert.ok(targets.includes('motor-control'), 'a relevant posture finding asks for motor control');
    });
});

describe('the programme module', () => {
    test('issues a programme from an accepted plan', async () => {
        const harness = createHarness();
        const plan = await seedAcceptedPlan(harness);

        const outcome = await harness.jarvis.dispatch<HomeExerciseProgramme>('exercise-education', { planId: plan.id });
        assert.equal(outcome.status, 'ok');
        if (outcome.status !== 'ok') return;

        assert.ok(outcome.data.exercises.length > 0);
        assert.ok(outcome.data.exercises.length <= 4, 'programmes stay short enough to be done');
        assert.equal(outcome.data.status, 'issued');
    });

    test('caps difficulty by irritability', async () => {
        const harness = createHarness();
        const plan = await seedAcceptedPlan(harness, shoulderAssessment({ history: { painScore: 9 } as never }));

        const outcome = await harness.jarvis.dispatch<HomeExerciseProgramme>('exercise-education', { planId: plan.id });
        assert.equal(outcome.status, 'ok');
        if (outcome.status !== 'ok') return;

        assert.equal(outcome.data.difficultyCap, 2);
        const prescribed = new Set(outcome.data.exercises.map((exercise) => exercise.exerciseId));
        assert.ok(!prescribed.has('ex-sh-band-row'), 'a difficulty-3 asset must not appear under a cap of 2');
    });

    test('doses a continuous asset in minutes, not sets and reps', async () => {
        const harness = createHarness();
        const plan = await seedAcceptedPlan(harness);

        const outcome = await harness.jarvis.dispatch<HomeExerciseProgramme>('exercise-education', { planId: plan.id });
        assert.equal(outcome.status, 'ok');
        if (outcome.status !== 'ok') return;

        const walking = outcome.data.exercises.find((exercise) => exercise.exerciseId === 'cat-general-walking');
        assert.ok(walking, 'the walking programme was prescribed');
        assert.ok(walking.durationMinutes);
        assert.equal(walking.sets, undefined);
        assert.equal(walking.reps, undefined);
    });

    test('reports a catalogue fallback as a coverage gap', async () => {
        const harness = createHarness();
        const plan = await seedAcceptedPlan(harness);

        const outcome = await harness.jarvis.dispatch<HomeExerciseProgramme>('exercise-education', { planId: plan.id });
        assert.equal(outcome.status, 'ok');
        if (outcome.status !== 'ok') return;

        assert.ok(outcome.data.coverageGaps.some((gap) => /licensed catalogue/.test(gap)));
    });

    test('reports a target the library cannot serve at all', async () => {
        const harness = createHarness();
        const plan = await seedAcceptedPlan(harness);

        const outcome = await harness.jarvis.dispatch<HomeExerciseProgramme>('exercise-education', { planId: plan.id });
        assert.equal(outcome.status, 'ok');
        if (outcome.status !== 'ok') return;

        assert.ok(outcome.data.coverageGaps.some((gap) => /^motor-control:/.test(gap)));
    });

    test('always includes flare-up education', async () => {
        const harness = createHarness();
        const plan = await seedAcceptedPlan(harness);

        const outcome = await harness.jarvis.dispatch<HomeExerciseProgramme>('exercise-education', { planId: plan.id });
        assert.equal(outcome.status, 'ok');
        if (outcome.status !== 'ok') return;
        assert.ok(outcome.data.education.some((item) => /flare-up/i.test(item.topic)));
    });

    test('refuses a plan the clinician has not accepted', async () => {
        const harness = createHarness();
        const assessment = await seedSignedAssessment(harness);
        const planned = await harness.jarvis.dispatch<TreatmentPlan>('treatment-planning', { assessmentId: assessment.id, clinicianId: 'clin_test' });
        assert.equal(planned.status, 'ok');
        if (planned.status !== 'ok') return;

        const outcome = await harness.jarvis.dispatch('exercise-education', { planId: planned.data.id });
        assert.equal(outcome.status, 'rejected');
        if (outcome.status !== 'rejected') return;
        assert.match(outcome.errors[0], /accepted plans only/);
    });

    test('refuses an unknown plan', async () => {
        const harness = createHarness();
        const outcome = await harness.jarvis.dispatch('exercise-education', { planId: 'plan_nothing' });
        assert.equal(outcome.status, 'rejected');
    });

    test('covers what it can and reports the rest when the library has no assets for the region', async () => {
        const harness = createHarness();
        const plan = await seedAcceptedPlan(
            harness,
            shoulderAssessment({
                history: { presentingComplaint: 'Right elbow pain gripping' } as never,
                posture: [],
                rangeOfMotion: [{ joint: 'elbow', movement: 'flexion', side: 'right', degrees: 100, painAtEndRange: true }]
            })
        );

        const outcome = await harness.jarvis.dispatch<HomeExerciseProgramme>('exercise-education', { planId: plan.id });
        assert.equal(outcome.status, 'ok');
        if (outcome.status !== 'ok') return;

        assert.ok(
            outcome.data.exercises.every((exercise) => !exercise.exerciseId.startsWith('ex-el')),
            'no elbow-specific asset exists to prescribe'
        );
        assert.ok(
            outcome.data.coverageGaps.some((gap) => /^elbow-strength:/.test(gap)),
            'the unserved elbow target is reported'
        );
    });

    test('refuses rather than improvising when nothing matches at all', async () => {
        const harness = createHarness(undefined, { library: createExerciseLibrary([]) });
        const plan = await seedAcceptedPlan(harness);

        const outcome = await harness.jarvis.dispatch('exercise-education', { planId: plan.id });
        assert.equal(outcome.status, 'rejected');
        if (outcome.status !== 'rejected') return;
        assert.match(outcome.errors[0], /prescribe manually/);
    });
});
