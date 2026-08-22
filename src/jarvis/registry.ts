import { assessmentAgent } from './agents/assessment';
import type { AgentId, AgentModule, PlannedModule } from './types';

/** Modules that exist and can be dispatched today. */
export const MODULES: Partial<Record<AgentId, AgentModule<any, any>>> = {
    assessment: assessmentAgent
};

/**
 * Modules that are designed but not built. They are declared here — with their scopes, their
 * inputs and outputs, and what they depend on — so the contract is fixed before the code exists
 * and so dispatching one fails with a useful message instead of `undefined`.
 */
export const PLANNED_MODULES: Readonly<Record<string, PlannedModule>> = {
    'treatment-planning': {
        id: 'treatment-planning',
        title: 'Treatment planning',
        phase: 2,
        scopes: ['phi:read', 'phi:write', 'evidence:read'],
        requiresApproval: false,
        reads: ['assessments (status=signed only)'],
        writes: ['treatment_plans'],
        dependsOn: ['assessment', 'knowledge-base'],
        notes: 'Builds an evidence-informed plan from a signed assessment. Requests evidence from the knowledge base rather than holding its own; every recommendation carries a citation, and the plan is a proposal until the clinician accepts it.'
    },
    'knowledge-base': {
        id: 'knowledge-base',
        title: 'Evidence knowledge base',
        phase: 2,
        scopes: ['evidence:read'],
        requiresApproval: false,
        reads: ['guidelines, systematic reviews, clinic protocols'],
        writes: ['evidence_queries (audit of what was asked and returned)'],
        dependsOn: [],
        notes: 'Receives a de-identified clinical question — never a patient id. Returns ranked evidence with source, date and strength. Read-only with respect to patient data by construction: it holds no phi scope.'
    },
    'exercise-education': {
        id: 'exercise-education',
        title: 'Exercise and patient education',
        phase: 3,
        scopes: ['phi:read', 'library:read'],
        requiresApproval: false,
        reads: ['treatment_plans', 'clinic exercise library'],
        writes: ['home_exercise_programmes'],
        dependsOn: ['treatment-planning'],
        notes: "Prefers the clinic's own video library; falls back to a licensed catalogue only when the clinic has no equivalent, and records which source was used. Starting dose is bounded by the assessment's irritability grade."
    },
    'follow-up': {
        id: 'follow-up',
        title: 'Follow-up automation',
        phase: 4,
        scopes: ['phi:read', 'phi:write', 'messaging:send'],
        requiresApproval: true,
        reads: ['home_exercise_programmes', 'patients (consent.automatedFollowUp)'],
        writes: ['outcome_measures', 'message_log'],
        dependsOn: ['exercise-education'],
        notes: 'WhatsApp check-ins and outcome capture. Sends only to patients who consented to automated follow-up, only inside messaging-window rules, and never sends clinical advice. A worsening or red-flag reply routes to a human immediately and suspends the sequence.'
    },
    marketing: {
        id: 'marketing',
        title: 'Marketing and content',
        phase: 5,
        scopes: ['publish:draft'],
        requiresApproval: true,
        reads: ['clinic content calendar, approved topic list'],
        writes: ['content_drafts'],
        dependsOn: [],
        notes: 'Holds no phi scope, so it cannot read patient data at all — patient stories reach it only as material a human has already de-identified and cleared. Every draft goes to a human approval queue; nothing publishes without a recorded approval.'
    }
};

export function describeModule(id: AgentId): { built: boolean; title: string; phase?: number } {
    const built = MODULES[id];
    if (built) return { built: true, title: built.title, phase: 1 };
    const planned = PLANNED_MODULES[id];
    if (planned) return { built: false, title: planned.title, phase: planned.phase };
    return { built: false, title: 'unknown module' };
}
