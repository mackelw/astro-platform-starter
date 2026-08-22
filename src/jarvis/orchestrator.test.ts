import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_MODULE_GRANTS, PHASE_1_GRANTS } from './orchestrator';
import { MODULES } from './registry';
import { createHarness, seedProgramme, seedSignedAssessment, shoulderAssessment, testPatient } from './testing/fixtures';
import type { AgentId, ContentDraft, OutboundMessage, Scope, TreatmentPlan } from './types';

const MODULE_IDS = Object.keys(MODULES) as AgentId[];

describe('scope enforcement', () => {
    for (const agentId of MODULE_IDS) {
        test(`${agentId} cannot run with a scope withheld`, async () => {
            const module = MODULES[agentId]!;
            const [withheld, ...rest] = module.scopes;
            const harness = createHarness({ ...ALL_MODULE_GRANTS, [agentId]: rest as Scope[] });

            const outcome = await harness.jarvis.dispatch(agentId, {});
            assert.equal(outcome.status, 'rejected');
            if (outcome.status !== 'rejected') return;
            assert.match(outcome.errors[0], new RegExp(withheld));
        });
    }

    test('a module granted nothing cannot run', async () => {
        const harness = createHarness({});
        const outcome = await harness.jarvis.dispatch('assessment', shoulderAssessment());
        assert.equal(outcome.status, 'rejected');
    });

    test('the scope check happens before input is even parsed', async () => {
        const harness = createHarness({ assessment: [] });
        const outcome = await harness.jarvis.dispatch('assessment', { total: 'nonsense' });
        assert.equal(outcome.status, 'rejected');
        if (outcome.status !== 'rejected') return;
        assert.match(outcome.errors[0], /not granted/, 'scope denial, not a validation error');
    });

    test('phase 1 grants reach the assessment module and nothing else', async () => {
        const harness = createHarness(PHASE_1_GRANTS);
        await harness.store.patients.put(testPatient());

        assert.equal((await harness.jarvis.dispatch('assessment', shoulderAssessment())).status, 'ok');
        for (const agentId of MODULE_IDS.filter((id) => id !== 'assessment')) {
            assert.equal((await harness.jarvis.dispatch(agentId, {})).status, 'rejected', `${agentId} should be unreachable`);
        }
    });

    test('every registered module has a grant in ALL_MODULE_GRANTS', () => {
        for (const agentId of MODULE_IDS) {
            assert.deepEqual(ALL_MODULE_GRANTS[agentId], MODULES[agentId]!.scopes);
        }
    });
});

describe('brokered capabilities', () => {
    test('planning gets evidence without either module knowing the other', async () => {
        const harness = createHarness();
        const assessment = await seedSignedAssessment(harness);
        await harness.jarvis.dispatch<TreatmentPlan>('treatment-planning', { assessmentId: assessment.id, clinicianId: 'clin_test' });

        const trail = await harness.jarvis.auditTrail();
        const brokered = trail.filter((event) => event.agentId === 'knowledge-base' && event.action === 'evidence.answered');
        assert.ok(brokered.length > 0, 'the knowledge base ran');

        const planningTask = trail.find((event) => event.agentId === 'treatment-planning' && event.action === 'dispatch.start');
        assert.equal(brokered[0].taskId, planningTask?.taskId, 'brokered work is logged under the caller task');
    });

    test('planning fails cleanly when the knowledge base is ungranted', async () => {
        const harness = createHarness({ ...ALL_MODULE_GRANTS, 'knowledge-base': [] });
        const assessment = await seedSignedAssessment(harness);

        const outcome = await harness.jarvis.dispatch('treatment-planning', { assessmentId: assessment.id, clinicianId: 'clin_test' });
        assert.equal(outcome.status, 'rejected', 'a broker failure is a rejection, not an exception');
        if (outcome.status !== 'rejected') return;
        assert.match(outcome.errors[0], /not granted evidence:read/);
    });

    test('a module gets no service its scopes do not entitle it to', () => {
        const harness = createHarness();
        assert.equal(harness.jarvis.context('marketing').services.messaging, undefined);
        assert.equal(harness.jarvis.context('marketing').services.evidence, undefined);
        assert.equal(harness.jarvis.context('assessment').services.library, undefined);
        assert.ok(harness.jarvis.context('exercise-education').services.library);
    });

    test('the knowledge base is not handed an evidence service of its own', () => {
        const harness = createHarness();
        assert.equal(harness.jarvis.context('knowledge-base').services.evidence, undefined);
    });
});

describe('dispatch', () => {
    test('an unknown module is rejected, not thrown', async () => {
        const harness = createHarness();
        const outcome = await harness.jarvis.dispatch('scheduling' as AgentId, {});
        assert.equal(outcome.status, 'rejected');
        if (outcome.status !== 'rejected') return;
        assert.match(outcome.errors[0], /unknown module/);
    });

    test('invalid input is rejected with every reason at once', async () => {
        const harness = createHarness();
        const outcome = await harness.jarvis.dispatch('assessment', { patientId: '', clinicianId: '' });
        assert.equal(outcome.status, 'rejected');
        if (outcome.status !== 'rejected') return;
        assert.ok(outcome.errors.length > 1);
    });

    test('a run that throws becomes a rejection and is audited', async () => {
        const harness = createHarness();
        const broken = {
            ...MODULES.assessment!,
            run: async () => {
                throw new Error('store exploded');
            }
        };
        const original = MODULES.assessment;
        MODULES.assessment = broken;

        try {
            await harness.store.patients.put(testPatient());
            const outcome = await harness.jarvis.dispatch('assessment', shoulderAssessment());
            assert.equal(outcome.status, 'rejected');
            if (outcome.status !== 'rejected') return;
            assert.match(outcome.errors[0], /store exploded/);
            assert.ok((await harness.jarvis.auditTrail()).some((event) => event.action === 'dispatch.error'));
        } finally {
            MODULES.assessment = original;
        }
    });
});

describe('the approval gate', () => {
    test('an approval names who decided and when', async () => {
        const harness = createHarness();
        const outcome = await harness.jarvis.dispatch<ContentDraft>('marketing', {
            topic: 'returning to sport after injury',
            channel: 'blog',
            audience: 'club athletes'
        });
        assert.equal(outcome.status, 'needs-approval');
        if (outcome.status !== 'needs-approval') return;

        const decision = await harness.jarvis.decideApproval(outcome.approvalId, { approved: true, decidedBy: 'clin_test', note: 'good to go' });
        assert.equal(decision.approval.decidedBy, 'clin_test');
        assert.equal(decision.approval.note, 'good to go');
        assert.ok(decision.approval.decidedAt);
    });

    test('an approval cannot be decided twice', async () => {
        const harness = createHarness();
        const programme = await seedProgramme(harness);
        const outcome = await harness.jarvis.dispatch<OutboundMessage>('follow-up', { programmeId: programme.id, checkpoint: 'week-1' });
        assert.equal(outcome.status, 'needs-approval');
        if (outcome.status !== 'needs-approval') return;

        await harness.jarvis.decideApproval(outcome.approvalId, { approved: true, decidedBy: 'clin_test' });
        await assert.rejects(() => harness.jarvis.decideApproval(outcome.approvalId, { approved: true, decidedBy: 'clin_test' }), /already approved/);
        assert.equal(harness.messaging.sent.length, 1, 'the second attempt sent nothing');
    });

    test('an unknown approval cannot be decided', async () => {
        const harness = createHarness();
        await assert.rejects(() => harness.jarvis.decideApproval('apr_nothing', { approved: true, decidedBy: 'clin_test' }), /unknown approval/);
    });

    test('a delivery failure is reported without losing the decision', async () => {
        const harness = createHarness();
        const programme = await seedProgramme(harness);
        const outcome = await harness.jarvis.dispatch<OutboundMessage>('follow-up', { programmeId: programme.id, checkpoint: 'week-1' });
        assert.equal(outcome.status, 'needs-approval');
        if (outcome.status !== 'needs-approval') return;

        harness.messaging.send = async () => {
            throw new Error('provider down');
        };

        const decision = await harness.jarvis.decideApproval(outcome.approvalId, { approved: true, decidedBy: 'clin_test' });
        assert.equal(decision.approval.status, 'approved');
        assert.match(decision.deliveryError ?? '', /provider down/);
        assert.equal((await harness.store.messages.get(outcome.draft.id))?.status, 'draft', 'the record does not claim it was sent');
    });

    test('modules that reach outside the system are the ones that require approval', () => {
        for (const agentId of MODULE_IDS) {
            const module = MODULES[agentId]!;
            const outbound = module.scopes.includes('messaging:send') || module.scopes.includes('publish:draft');
            assert.equal(module.requiresApproval, outbound, `${agentId} approval flag does not match its reach`);
        }
    });
});

describe('the audit trail', () => {
    test('records the start and end of a dispatch', async () => {
        const harness = createHarness();
        await harness.store.patients.put(testPatient());
        await harness.jarvis.dispatch('assessment', shoulderAssessment());

        const actions = (await harness.jarvis.auditTrail()).map((event) => event.action);
        assert.ok(actions.includes('dispatch.start'));
        assert.ok(actions.includes('dispatch.end'));
    });

    test('records a denial', async () => {
        const harness = createHarness({ assessment: [] });
        await harness.jarvis.dispatch('assessment', shoulderAssessment());
        assert.ok((await harness.jarvis.auditTrail()).some((event) => event.action === 'dispatch.denied'));
    });

    test('carries no free-text clinical content', async () => {
        const harness = createHarness();
        await seedProgramme(harness);

        for (const event of await harness.jarvis.auditTrail()) {
            for (const [key, value] of Object.entries(event.detail)) {
                if (typeof value !== 'string') continue;
                assert.ok(!/overhead reach|swimming|Test Patient/.test(value), `${event.action}.${key} leaked clinical text`);
            }
        }
    });
});
