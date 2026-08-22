/**
 * Jarvis — shared domain and agent-contract types.
 *
 * Every module in the system speaks these types. Agents never import each other:
 * they exchange records through the store, and the main brain (orchestrator) routes.
 */

export type Iso8601 = string;

export type AgentId = 'assessment' | 'treatment-planning' | 'knowledge-base' | 'exercise-education' | 'follow-up' | 'marketing';

/**
 * Capability tokens. A module declares the scopes it needs; the orchestrator refuses to
 * run a module that asks for a scope the deployment has not granted it. This is what keeps
 * the marketing agent structurally unable to read patient data.
 */
export type Scope =
    | 'phi:read' // read identifiable or clinical patient data
    | 'phi:write' // create or amend clinical records
    | 'evidence:read' // query the knowledge base
    | 'library:read' // read the clinic's own exercise/video library
    | 'messaging:send' // send an outbound message to a patient (WhatsApp, SMS, email)
    | 'publish:draft'; // produce content destined for a public channel

// ---------------------------------------------------------------------------
// Patients and consent
// ---------------------------------------------------------------------------

export interface Consent {
    /** Consent to store and process clinical data. Without it, nothing is written. */
    dataProcessing: boolean;
    /** Consent to receive automated follow-up messages (Agent 5). */
    automatedFollowUp: boolean;
    /** Consent to use anonymised material in clinic content (Agent 6). Defaults to false. */
    contentUse: boolean;
    recordedAt: Iso8601;
}

export interface PatientRecord {
    id: string;
    /** Display name is kept out of every payload that leaves the clinical store. */
    displayName: string;
    dateOfBirth: string;
    contact: { whatsApp?: string; email?: string };
    consent: Consent;
    createdAt: Iso8601;
}

// ---------------------------------------------------------------------------
// Agent 1 — assessment
// ---------------------------------------------------------------------------

export type Joint = 'cervical-spine' | 'lumbar-spine' | 'shoulder' | 'elbow' | 'wrist' | 'hip' | 'knee' | 'ankle';

export type Movement = 'flexion' | 'extension' | 'abduction' | 'adduction' | 'internal-rotation' | 'external-rotation' | 'dorsiflexion' | 'plantarflexion';

export type Side = 'left' | 'right' | 'central';

export interface RomMeasurement {
    joint: Joint;
    movement: Movement;
    side: Side;
    /** Active range in degrees, as measured. */
    degrees: number;
    painAtEndRange: boolean;
}

export interface PostureObservation {
    region: string;
    finding: string;
    /** Clinician-rated significance; posture findings are context, never a diagnosis on their own. */
    significance: 'incidental' | 'relevant' | 'primary';
}

export interface GaitObservation {
    phase: 'stance' | 'swing' | 'overall';
    finding: string;
    /** Optional cadence/velocity if instrumented; free-text findings are fine without it. */
    metric?: { name: string; value: number; unit: string };
}

export interface PatientHistory {
    presentingComplaint: string;
    onset: 'acute' | 'subacute' | 'chronic';
    durationDays: number;
    /** 0–10 numeric pain rating scale. */
    painScore: number;
    aggravatingFactors: string[];
    easingFactors: string[];
    /** Free-text screening answers, plus the structured flags below. */
    medicalHistory: string[];
    /** Screening answers keyed by red-flag id — see agents/redFlags.ts. */
    screening: Record<string, boolean>;
    patientGoals: string[];
}

export interface AssessmentInput {
    patientId: string;
    clinicianId: string;
    history: PatientHistory;
    posture: PostureObservation[];
    gait: GaitObservation[];
    rangeOfMotion: RomMeasurement[];
}

export interface RomDeficit {
    joint: Joint;
    movement: Movement;
    side: Side;
    measuredDegrees: number;
    expectedDegrees: number;
    /** Percentage of the normative range that is missing, rounded to the nearest whole number. */
    deficitPercent: number;
    painAtEndRange: boolean;
}

export interface RedFlagHit {
    id: string;
    label: string;
    /** What the clinician should do about it. */
    action: string;
    urgency: 'same-day' | 'urgent-referral' | 'routine-referral';
}

export interface AssessmentRecord {
    id: string;
    patientId: string;
    clinicianId: string;
    createdAt: Iso8601;
    input: AssessmentInput;
    /** Derived, machine-generated summary. Advisory only — the clinician signs off. */
    findings: {
        problemList: string[];
        romDeficits: RomDeficit[];
        irritability: 'low' | 'moderate' | 'high';
        functionalSummary: string;
    };
    redFlags: RedFlagHit[];
    /** 'draft' until a clinician signs it; only signed assessments feed treatment planning. */
    status: 'draft' | 'signed' | 'escalated';
    signedBy?: string;
    signedAt?: Iso8601;
}

// ---------------------------------------------------------------------------
// Agent contracts
// ---------------------------------------------------------------------------

export interface AuditEvent {
    at: Iso8601;
    taskId: string;
    agentId: AgentId;
    action: string;
    /** Never contains free-text clinical content — ids and outcomes only. */
    detail: Record<string, string | number | boolean>;
}

export interface ApprovalRequest {
    id: string;
    agentId: AgentId;
    createdAt: Iso8601;
    /** What a human is being asked to approve, rendered for review. */
    summary: string;
    payload: unknown;
    status: 'pending' | 'approved' | 'rejected';
    decidedBy?: string;
    decidedAt?: Iso8601;
    note?: string;
}

export type AgentOutcome<T> =
    | { status: 'ok'; data: T }
    | { status: 'escalated'; reason: string; redFlags: RedFlagHit[]; data?: T }
    | { status: 'needs-approval'; approvalId: string; draft: T }
    | { status: 'rejected'; errors: string[] };

export interface AgentContext {
    taskId: string;
    now(): Date;
    newId(prefix: string): string;
    store: JarvisStore;
    audit(action: string, detail?: Record<string, string | number | boolean>): void;
}

export interface AgentModule<TInput, TOutput> {
    id: AgentId;
    title: string;
    scopes: readonly Scope[];
    /** True when output must be approved by a human before it leaves the system. */
    requiresApproval: boolean;
    /** Validate and narrow untrusted input at the module boundary. Throws on invalid input. */
    parse(input: unknown): TInput;
    run(input: TInput, ctx: AgentContext): Promise<AgentOutcome<TOutput>>;
}

/** Declaration of a module that is designed but not yet built. */
export interface PlannedModule {
    id: AgentId;
    title: string;
    phase: number;
    scopes: readonly Scope[];
    requiresApproval: boolean;
    reads: string[];
    writes: string[];
    dependsOn: AgentId[];
    notes: string;
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

export interface Collection<T extends { id: string }> {
    get(id: string): Promise<T | null>;
    put(record: T): Promise<T>;
    list(filter?: Partial<Record<'patientId' | 'status', string>>): Promise<T[]>;
}

export interface JarvisStore {
    patients: Collection<PatientRecord>;
    assessments: Collection<AssessmentRecord>;
    approvals: Collection<ApprovalRequest>;
    audit: { append(event: AuditEvent): Promise<void>; all(): Promise<AuditEvent[]> };
}
