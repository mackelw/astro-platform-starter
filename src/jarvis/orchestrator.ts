import { InputValidationError } from './agents/assessment';
import { MODULES, PLANNED_MODULES } from './registry';
import type { AgentContext, AgentId, AgentOutcome, ApprovalRequest, JarvisStore, Scope } from './types';

/**
 * The main brain.
 *
 * It is the only component that knows the module list. Agents do not call each other: work enters
 * here, the orchestrator checks scopes, runs one module, records what happened, and routes the
 * outcome. Three rules hold for every dispatch:
 *
 *   1. A module runs only with scopes the deployment has granted it.
 *   2. Input is validated at the module boundary before any side effect.
 *   3. Anything leaving the system — a patient message, a published post — stops at an approval
 *      queue and waits for a named human.
 */

export interface JarvisOptions {
    store: JarvisStore;
    /** Scopes this deployment grants each module. A module asking for more than it is granted cannot run. */
    grants: Partial<Record<AgentId, readonly Scope[]>>;
    now?: () => Date;
    newId?: (prefix: string) => string;
}

export interface Jarvis {
    dispatch<T>(agentId: AgentId, input: unknown): Promise<AgentOutcome<T>>;
    pendingApprovals(): Promise<ApprovalRequest[]>;
    decideApproval(approvalId: string, decision: { approved: boolean; decidedBy: string; note?: string }): Promise<ApprovalRequest>;
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

    function context(agentId: AgentId, taskId = newId('task')): AgentContext {
        return {
            taskId,
            now,
            newId,
            store,
            audit(action, detail = {}) {
                void store.audit.append({ at: now().toISOString(), taskId, agentId, action, detail });
            }
        };
    }

    function missingScopes(agentId: AgentId, required: readonly Scope[]): Scope[] {
        const granted = grants[agentId] ?? [];
        return required.filter((scope) => !granted.includes(scope));
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

            if (outcome.status === 'ok' && module.requiresApproval) {
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
            context(approval.agentId).audit('approval.decided', { approvalId, approved: decision.approved, decidedBy: decision.decidedBy });
            return decided;
        },

        async auditTrail() {
            return store.audit.all();
        }
    };
}

/** Scope grants for the phase 1 deployment: the assessment module and nothing else. */
export const PHASE_1_GRANTS: JarvisOptions['grants'] = {
    assessment: ['phi:read', 'phi:write']
};
