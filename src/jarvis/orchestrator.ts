import { createExerciseLibrary } from './agents/exerciseLibrary';
import { createRecordingMessagingAdapter, createRecordingPublishingAdapter } from './adapters';
import { MODULES } from './registry';
import { PLANNED_MODULES } from './registry';
import { InputValidationError } from './validation';
import type {
    AgentContext,
    AgentId,
    AgentOutcome,
    AgentServices,
    ApprovalRequest,
    EvidenceService,
    ExerciseLibraryService,
    JarvisStore,
    MessagingAdapter,
    PublishingAdapter,
    Scope
} from './types';

/**
 * The main brain.
 *
 * It is the only component that knows the module list. Modules do not call each other: work enters
 * here, the orchestrator checks scopes, runs one module, records what happened, and routes the
 * outcome. Four rules hold for every dispatch:
 *
 *   1. A module runs only with scopes the deployment has granted it.
 *   2. Input is validated at the module boundary before any side effect.
 *   3. A module reaches another module's capability only through a brokered service, and only if
 *      its own scopes entitle it to that capability.
 *   4. Anything leaving the system — a patient message, a published post — stops at an approval
 *      queue and is delivered by the orchestrator only after a named human approves it.
 */

export interface JarvisOptions {
    store: JarvisStore;
    /** Scopes this deployment grants each module. A module asking for more than it is granted cannot run. */
    grants: Partial<Record<AgentId, readonly Scope[]>>;
    now?: () => Date;
    newId?: (prefix: string) => string;
    /** Swap these for the clinic's real catalogue, WhatsApp client and publishing client. */
    library?: ExerciseLibraryService;
    messaging?: MessagingAdapter;
    publishing?: PublishingAdapter;
}

export interface ApprovalDecision {
    approved: boolean;
    decidedBy: string;
    note?: string;
}

export interface ApprovalOutcome {
    approval: ApprovalRequest;
    /** What the module actually did once approved — the sent message, the published draft. */
    delivered?: unknown;
    deliveryError?: string;
}

export interface Jarvis {
    dispatch<T>(agentId: AgentId, input: unknown): Promise<AgentOutcome<T>>;
    pendingApprovals(): Promise<ApprovalRequest[]>;
    decideApproval(approvalId: string, decision: ApprovalDecision): Promise<ApprovalOutcome>;
    context(agentId: AgentId, taskId?: string): AgentContext;
    auditTrail(): Promise<Awaited<ReturnType<JarvisStore['audit']['all']>>>;
}

function defaultIdFactory(prefix: string): string {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createJarvis(options: JarvisOptions): Jarvis {
    const { store, grants } = options;
    const now = options.now ?? (() => new Date());
    const newId = options.newId ?? defaultIdFactory;
    const library = options.library ?? createExerciseLibrary();
    const messaging = options.messaging ?? createRecordingMessagingAdapter();
    const publishing = options.publishing ?? createRecordingPublishingAdapter();

    function granted(agentId: AgentId): readonly Scope[] {
        return grants[agentId] ?? [];
    }

    function missingScopes(agentId: AgentId, required: readonly Scope[]): Scope[] {
        return required.filter((scope) => !granted(agentId).includes(scope));
    }

    /**
     * Planning needs evidence, but the two modules never meet. The orchestrator runs the knowledge
     * base on the caller's behalf, under the caller's task id, and only for a caller holding
     * `evidence:read` — and the knowledge base still has to hold its own grant to answer.
     */
    function brokerEvidence(taskId: string): EvidenceService {
        return {
            async query(query) {
                const knowledgeBase = MODULES['knowledge-base'];
                if (!knowledgeBase) throw new Error('knowledge base module is not registered');
                if (missingScopes('knowledge-base', knowledgeBase.scopes).length)
                    throw new Error('knowledge base is not granted evidence:read in this deployment');

                const outcome = await knowledgeBase.run(knowledgeBase.parse(query), context('knowledge-base', taskId));
                if (outcome.status !== 'ok') throw new Error(`evidence query failed: ${outcome.status}`);
                return outcome.data;
            }
        };
    }

    function servicesFor(agentId: AgentId, taskId: string): AgentServices {
        const scopes = granted(agentId);
        return {
            evidence: scopes.includes('evidence:read') && agentId !== 'knowledge-base' ? brokerEvidence(taskId) : undefined,
            library: scopes.includes('library:read') ? library : undefined,
            messaging: scopes.includes('messaging:send') ? messaging : undefined,
            publishing: scopes.includes('publish:draft') ? publishing : undefined
        };
    }

    function context(agentId: AgentId, taskId = newId('task')): AgentContext {
        return {
            taskId,
            now,
            newId,
            store,
            services: servicesFor(agentId, taskId),
            audit(action, detail = {}) {
                void store.audit.append({ at: now().toISOString(), taskId, agentId, action, detail });
            }
        };
    }

    return {
        context,

        async dispatch(agentId, input) {
            const taskId = newId('task');
            const ctx = context(agentId, taskId);
            const module = MODULES[agentId];

            if (!module) {
                const planned = PLANNED_MODULES[agentId];
                const reason = planned ? `module '${agentId}' is planned for phase ${planned.phase} and is not built yet` : `unknown module '${agentId}'`;
                ctx.audit('dispatch.unavailable', { agentId });
                return { status: 'rejected', errors: [reason] };
            }

            const denied = missingScopes(agentId, module.scopes);
            if (denied.length) {
                ctx.audit('dispatch.denied', { agentId, missing: denied.join(',') });
                return { status: 'rejected', errors: [`module '${agentId}' is not granted: ${denied.join(', ')}`] };
            }

            let parsed: unknown;
            try {
                parsed = module.parse(input);
            } catch (error) {
                const errors = error instanceof InputValidationError ? error.errors : [(error as Error).message];
                ctx.audit('dispatch.invalid-input', { agentId, errorCount: errors.length });
                return { status: 'rejected', errors };
            }

            ctx.audit('dispatch.start', { agentId });
            const outcome = await module.run(parsed, ctx);

            if (outcome.status === 'ok' && module.requiresApproval && (module.needsApproval?.(outcome.data) ?? true)) {
                const approval: ApprovalRequest = {
                    id: newId('apr'),
                    agentId,
                    createdAt: now().toISOString(),
                    summary: `${module.title} output awaiting approval`,
                    payload: outcome.data,
                    status: 'pending'
                };
                await store.approvals.put(approval);
                ctx.audit('approval.requested', { agentId, approvalId: approval.id });
                return { status: 'needs-approval', approvalId: approval.id, draft: outcome.data };
            }

            ctx.audit('dispatch.end', { agentId, outcome: outcome.status });
            return outcome as AgentOutcome<never>;
        },

        async pendingApprovals() {
            return store.approvals.list({ status: 'pending' });
        },

        async decideApproval(approvalId, decision) {
            const approval = await store.approvals.get(approvalId);
            if (!approval) throw new Error(`unknown approval ${approvalId}`);
            if (approval.status !== 'pending') throw new Error(`approval ${approvalId} is already ${approval.status}`);

            const decided: ApprovalRequest = {
                ...approval,
                status: decision.approved ? 'approved' : 'rejected',
                decidedBy: decision.decidedBy,
                decidedAt: now().toISOString(),
                note: decision.note
            };
            await store.approvals.put(decided);

            const ctx = context(approval.agentId);
            ctx.audit('approval.decided', { approvalId, approved: decision.approved, decidedBy: decision.decidedBy });

            const module = MODULES[approval.agentId];
            if (!decision.approved || !module?.deliver) return { approval: decided };

            try {
                const delivered = await module.deliver(approval.payload, ctx);
                return { approval: decided, delivered };
            } catch (error) {
                ctx.audit('delivery.failed', { approvalId, agentId: approval.agentId });
                return { approval: decided, deliveryError: (error as Error).message };
            }
        },

        async auditTrail() {
            return store.audit.all();
        }
    };
}

/** Grants for a phase 1 deployment: the assessment module and nothing else. */
export const PHASE_1_GRANTS: JarvisOptions['grants'] = {
    assessment: ['phi:read', 'phi:write']
};

/**
 * Grants every registered module exactly the scopes it declares. Convenient for development and
 * for the demo; a real deployment should narrow it — staging, for instance, has no business
 * holding `messaging:send`.
 */
export const ALL_MODULE_GRANTS: JarvisOptions['grants'] = Object.fromEntries(
    Object.entries(MODULES).map(([agentId, module]) => [agentId, module.scopes])
) as JarvisOptions['grants'];
