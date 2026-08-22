import { assessmentAgent } from './agents/assessment';
import { exerciseEducationAgent } from './agents/exerciseEducation';
import { followUpAgent } from './agents/followUp';
import { knowledgeBaseAgent } from './agents/knowledgeBase';
import { marketingAgent } from './agents/marketing';
import { treatmentPlanningAgent } from './agents/treatmentPlanning';
import type { AgentId, AgentModule, PlannedModule } from './types';

/** Modules that exist and can be dispatched. */
export const MODULES: Partial<Record<AgentId, AgentModule<any, any>>> = {
    assessment: assessmentAgent,
    'treatment-planning': treatmentPlanningAgent,
    'knowledge-base': knowledgeBaseAgent,
    'exercise-education': exerciseEducationAgent,
    'follow-up': followUpAgent,
    marketing: marketingAgent
};

/** The phase each module shipped in — used for reporting, not for gating. */
export const MODULE_PHASE: Record<AgentId, number> = {
    assessment: 1,
    'treatment-planning': 2,
    'knowledge-base': 2,
    'exercise-education': 3,
    'follow-up': 4,
    marketing: 5
};

/**
 * Modules that are designed but not built. All six of the original blueprint are now implemented,
 * so this is empty — the mechanism stays because the next module (outcome analytics, triage,
 * scheduling) should be declared here first, with its scopes and dependencies fixed, before any of
 * it is written.
 */
export const PLANNED_MODULES: Readonly<Record<string, PlannedModule>> = {};

export function describeModule(id: AgentId): { built: boolean; title: string; phase?: number } {
    const built = MODULES[id];
    if (built) return { built: true, title: built.title, phase: MODULE_PHASE[id] };
    const planned = PLANNED_MODULES[id];
    if (planned) return { built: false, title: planned.title, phase: planned.phase };
    return { built: false, title: 'unknown module' };
}
