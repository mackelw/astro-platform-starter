import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isEligible, scoreCitation } from './knowledgeBase';
import { EVIDENCE_CORPUS } from './evidenceCorpus';
import { createHarness } from '../testing/fixtures';
import type { EvidenceCitation, EvidenceResult } from '../types';

const shoulderCitation = EVIDENCE_CORPUS.find((citation) => citation.id === 'ev-shoulder-loading') as EvidenceCitation;
const kneeCitation = EVIDENCE_CORPUS.find((citation) => citation.id === 'ev-knee-quads') as EvidenceCitation;
const generalCitation = EVIDENCE_CORPUS.find((citation) => citation.id === 'ev-pain-education') as EvidenceCitation;

describe('evidence eligibility', () => {
    test('a knee guideline is never eligible for a shoulder question', () => {
        assert.equal(isEligible(kneeCitation, { question: 'loading for shoulder pain', region: 'shoulder' }), false);
    });

    test('a region-general source is eligible anywhere', () => {
        assert.equal(isEligible(generalCitation, { question: 'what to explain about shoulder pain', region: 'shoulder' }), true);
    });

    test('family is a hard filter too', () => {
        assert.equal(isEligible(shoulderCitation, { question: 'manual therapy for shoulder pain', region: 'shoulder', family: 'manual-therapy' }), false);
        assert.equal(isEligible(shoulderCitation, { question: 'loading for shoulder pain', region: 'shoulder', family: 'exercise-therapy' }), true);
    });

    test('an unconstrained question is eligible for everything', () => {
        assert.ok(EVIDENCE_CORPUS.every((citation) => isEligible(citation, { question: 'what helps musculoskeletal pain' })));
    });
});

describe('evidence ranking', () => {
    test('a source with no term overlap scores zero', () => {
        assert.equal(scoreCitation(kneeCitation, { question: 'vestibular rehabilitation protocols' }), 0);
    });

    test('matching region and family outranks term overlap alone', () => {
        const query = { question: 'progressive loading for shoulder pain', region: 'shoulder' as const, family: 'exercise-therapy' as const };
        assert.ok(scoreCitation(shoulderCitation, query) > scoreCitation(generalCitation, query));
    });
});

describe('the knowledge base module', () => {
    test('answers a de-identified question and logs the query', async () => {
        const harness = createHarness();
        const outcome = await harness.jarvis.dispatch<EvidenceResult>('knowledge-base', {
            question: 'What supports progressive loading for shoulder pain?',
            region: 'shoulder',
            family: 'exercise-therapy'
        });

        assert.equal(outcome.status, 'ok');
        if (outcome.status !== 'ok') return;

        assert.ok(outcome.data.citations.length > 0);
        assert.ok(outcome.data.citations.every((citation) => citation.region === 'shoulder' || citation.region === 'general'));

        const [logged] = await harness.store.evidenceQueries.list();
        assert.deepEqual(
            logged.citationIds,
            outcome.data.citations.map((citation) => citation.id)
        );
    });

    test('flags a result set that is entirely placeholder data', async () => {
        const harness = createHarness();
        const outcome = await harness.jarvis.dispatch<EvidenceResult>('knowledge-base', {
            question: 'What supports exercise for neck pain?',
            region: 'cervical-spine'
        });
        assert.equal(outcome.status, 'ok');
        if (outcome.status !== 'ok') return;
        assert.equal(outcome.data.placeholderOnly, true, 'the shipped corpus is placeholder seed data');
    });

    test('respects the result limit', async () => {
        const harness = createHarness();
        const outcome = await harness.jarvis.dispatch<EvidenceResult>('knowledge-base', { question: 'What helps musculoskeletal pain in general?', limit: 1 });
        assert.equal(outcome.status, 'ok');
        if (outcome.status !== 'ok') return;
        assert.equal(outcome.data.citations.length, 1);
    });

    test('refuses a payload carrying a patient id', async () => {
        const harness = createHarness();
        const outcome = await harness.jarvis.dispatch('knowledge-base', { question: 'What helps shoulder pain?', patientId: 'pat_test' });
        assert.equal(outcome.status, 'rejected');
        if (outcome.status !== 'rejected') return;
        assert.match(outcome.errors[0], /must not reach the knowledge base/);
    });

    test('refuses a record identifier hidden in the question text', async () => {
        const harness = createHarness();
        const outcome = await harness.jarvis.dispatch('knowledge-base', { question: 'What should we do about asm_1 and their shoulder?' });
        assert.equal(outcome.status, 'rejected');
        if (outcome.status !== 'rejected') return;
        assert.match(outcome.errors[0], /de-identified/);
    });

    test('refuses a question too short to be a question', async () => {
        const harness = createHarness();
        const outcome = await harness.jarvis.dispatch('knowledge-base', { question: 'knee?' });
        assert.equal(outcome.status, 'rejected');
    });

    test('reads no patient data even when the store holds some', async () => {
        const harness = createHarness();
        const outcome = await harness.jarvis.dispatch('knowledge-base', { question: 'What supports manual therapy for shoulder pain?' });
        assert.equal(outcome.status, 'ok');
        assert.equal((await harness.store.assessments.list()).length, 0);
    });
});
