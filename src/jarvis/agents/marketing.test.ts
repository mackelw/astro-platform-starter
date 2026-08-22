import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { APPROVED_TOPICS } from './marketing';
import { createHarness } from '../testing/fixtures';
import type { ContentDraft } from '../types';

const topic = APPROVED_TOPICS[1];

describe('the content module', () => {
    test('drafts from an approved topic and waits for approval', async () => {
        const harness = createHarness();
        const outcome = await harness.jarvis.dispatch<ContentDraft>('marketing', { topic, channel: 'instagram', audience: 'people mid-flare' });

        assert.equal(outcome.status, 'needs-approval');
        if (outcome.status !== 'needs-approval') return;
        assert.equal(outcome.draft.status, 'draft');
        assert.equal(harness.publishing.published.length, 0);
    });

    test('every draft carries the disclaimer', async () => {
        const harness = createHarness();
        const outcome = await harness.jarvis.dispatch<ContentDraft>('marketing', { topic, channel: 'linkedin', audience: 'local employers' });
        assert.equal(outcome.status, 'needs-approval');
        if (outcome.status !== 'needs-approval') return;
        assert.match(outcome.draft.disclaimer, /not a substitute for individual assessment/);
    });

    test('hashtags follow the channel', async () => {
        const harness = createHarness();
        const social = await harness.jarvis.dispatch<ContentDraft>('marketing', { topic, channel: 'instagram', audience: 'runners' });
        const longForm = await harness.jarvis.dispatch<ContentDraft>('marketing', { topic, channel: 'blog', audience: 'runners' });

        assert.equal(social.status, 'needs-approval');
        assert.equal(longForm.status, 'needs-approval');
        if (social.status !== 'needs-approval' || longForm.status !== 'needs-approval') return;

        assert.equal(social.draft.hashtags.length, 5);
        assert.equal(longForm.draft.hashtags.length, 0);
    });

    test('approval publishes, and only then', async () => {
        const harness = createHarness();
        const outcome = await harness.jarvis.dispatch<ContentDraft>('marketing', { topic, channel: 'instagram', audience: 'runners' });
        assert.equal(outcome.status, 'needs-approval');
        if (outcome.status !== 'needs-approval') return;

        const decision = await harness.jarvis.decideApproval(outcome.approvalId, { approved: true, decidedBy: 'clin_test' });
        assert.equal(harness.publishing.published.length, 1);
        assert.equal((decision.delivered as ContentDraft).status, 'published');
        assert.equal((await harness.store.content.get(outcome.draft.id))?.status, 'published');
    });

    test('rejection leaves the draft unpublished', async () => {
        const harness = createHarness();
        const outcome = await harness.jarvis.dispatch<ContentDraft>('marketing', { topic, channel: 'instagram', audience: 'runners' });
        assert.equal(outcome.status, 'needs-approval');
        if (outcome.status !== 'needs-approval') return;

        await harness.jarvis.decideApproval(outcome.approvalId, { approved: false, decidedBy: 'clin_test', note: 'reword' });
        assert.equal(harness.publishing.published.length, 0);
        assert.equal((await harness.store.content.get(outcome.draft.id))?.status, 'draft');
    });

    test('refuses a topic outside the approved list', async () => {
        const harness = createHarness();
        const outcome = await harness.jarvis.dispatch('marketing', {
            topic: 'five stretches that fix sciatica overnight',
            channel: 'instagram',
            audience: 'runners'
        });
        assert.equal(outcome.status, 'rejected');
    });

    test('refuses a prohibited claim', async () => {
        const harness = createHarness();
        const outcome = await harness.jarvis.dispatch('marketing', {
            topic,
            channel: 'instagram',
            audience: 'runners',
            callToAction: 'Book now — guaranteed results.'
        });
        assert.equal(outcome.status, 'rejected');
        if (outcome.status !== 'rejected') return;
        assert.ok(outcome.errors.some((error) => /must not claim/.test(error)));
    });

    test('refuses a payload carrying patient data', async () => {
        const harness = createHarness();
        const outcome = await harness.jarvis.dispatch('marketing', { topic, channel: 'instagram', audience: 'runners', patientId: 'pat_test' });
        assert.equal(outcome.status, 'rejected');
        if (outcome.status !== 'rejected') return;
        assert.ok(outcome.errors.some((error) => /must not reach the content module/.test(error)));
    });

    test('refuses a clinical record identifier in the copy', async () => {
        const harness = createHarness();
        const outcome = await harness.jarvis.dispatch('marketing', {
            topic,
            channel: 'instagram',
            audience: 'runners',
            keyPoints: ['This is how we handled asm_4 last week']
        });
        assert.equal(outcome.status, 'rejected');
    });

    test('refuses an unknown channel', async () => {
        const harness = createHarness();
        const outcome = await harness.jarvis.dispatch('marketing', { topic, channel: 'billboard', audience: 'runners' });
        assert.equal(outcome.status, 'rejected');
    });

    test('holds no patient scope at all', async () => {
        const { marketingAgent } = await import('./marketing');
        assert.ok(!marketingAgent.scopes.some((scope) => scope.startsWith('phi:')));
    });
});
