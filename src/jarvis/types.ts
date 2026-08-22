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
// Agent 3 — knowledge base
// ---------------------------------------------------------------------------

export type BodyRegion = Joint | 'general';

export type InterventionFamily = 'exercise-therapy' | 'manual-therapy' | 'education' | 'load-management' | 'pain-modulation';

export type EvidenceSourceType = 'clinical-guideline' | 'systematic-review' | 'randomised-trial' | 'clinic-protocol';

export type EvidenceStrength = 'strong' | 'moderate' | 'limited';

export interface EvidenceCitation {
    id: string;
    title: string;
    /** Publisher or body responsible for the source. */
    source: string;
    year: number;
    sourceType: EvidenceSourceType;
    strength: EvidenceStrength;
    /** One-line statement of what the source supports. */
    summary: string;
    url?: string;
    region: BodyRegion;
    families: InterventionFamily[];
    keywords: string[];
    /**
     * True for seed entries shipped with the repository. A placeholder is a stand-in for a real
     * source the clinic has licensed, and any plan built on one is marked accordingly.
     */
    isPlaceholder: boolean;
}

export interface EvidenceQuery {
    /** De-identified clinical question. Patient identifiers are rejected at the boundary. */
    question: string;
    region?: BodyRegion;
    family?: InterventionFamily;
    keywords?: string[];
    limit?: number;
}

export interface EvidenceResult {
    query: EvidenceQuery;
    citations: EvidenceCitation[];
    /** True when every returned citation is seed data rather than a licensed source. */
    placeholderOnly: boolean;
}

export interface EvidenceQueryRecord {
    id: string;
    at: Iso8601;
    taskId: string;
    question: string;
    region?: BodyRegion;
    family?: InterventionFamily;
    citationIds: string[];
}

// ---------------------------------------------------------------------------
// Agent 2 — treatment planning
// ---------------------------------------------------------------------------

export interface TreatmentGoal {
    horizon: 'short-term' | 'long-term';
    statement: string;
    /** How the goal will be measured at review. */
    measure: string;
    targetDays: number;
}

export interface PlannedIntervention {
    id: string;
    family: InterventionFamily;
    title: string;
    detail: string;
    dosage: string;
    /** Never empty. An intervention with no citation does not enter the plan. */
    citations: EvidenceCitation[];
}

export interface TreatmentPlan {
    id: string;
    patientId: string;
    assessmentId: string;
    clinicianId: string;
    createdAt: Iso8601;
    goals: TreatmentGoal[];
    interventions: PlannedIntervention[];
    precautions: string[];
    reviewInDays: number;
    /** Candidate interventions dropped because the knowledge base had nothing to support them. */
    unsupported: string[];
    /** 'proposed' until a clinician accepts it; only accepted plans feed Agent 4. */
    status: 'proposed' | 'accepted' | 'rejected';
    acceptedBy?: string;
    acceptedAt?: Iso8601;
}

// ---------------------------------------------------------------------------
// Agent 4 — exercise and patient education
// ---------------------------------------------------------------------------

export type ExerciseSource = 'clinic-library' | 'licensed-catalogue';

export interface ExerciseAsset {
    id: string;
    name: string;
    region: BodyRegion;
    /** Treatment targets this asset serves, matched against the plan's targets. */
    targets: string[];
    equipment: string[];
    /** 1 (unloaded, pain-free range) to 5 (high load / plyometric). */
    difficulty: 1 | 2 | 3 | 4 | 5;
    /** Continuous assets — walking, cycling — are dosed in minutes, not sets and reps. */
    dosing: 'sets-reps' | 'duration';
    videoUrl: string;
    source: ExerciseSource;
    contraindications: string[];
}

export interface PrescribedExercise {
    exerciseId: string;
    name: string;
    source: ExerciseSource;
    videoUrl: string;
    /** Present for sets-and-reps assets. */
    sets?: number;
    reps?: number;
    holdSeconds?: number;
    /** Present for continuous assets. */
    durationMinutes?: number;
    frequencyPerWeek: number;
    progression: string;
    rationale: string;
}

export interface EducationItem {
    topic: string;
    summary: string;
}

export interface HomeExerciseProgramme {
    id: string;
    patientId: string;
    planId: string;
    createdAt: Iso8601;
    exercises: PrescribedExercise[];
    education: EducationItem[];
    reviewInDays: number;
    /** Ceiling on difficulty derived from the assessment's irritability grade. */
    difficultyCap: 1 | 2 | 3 | 4 | 5;
    /** Targets with no clinic asset, reported rather than silently substituted. */
    coverageGaps: string[];
    status: 'issued' | 'superseded';
}

// ---------------------------------------------------------------------------
// Agent 5 — follow-up automation
// ---------------------------------------------------------------------------

export type Checkpoint = 'day-3' | 'week-1' | 'week-2' | 'week-6';

export interface OutboundMessage {
    id: string;
    patientId: string;
    programmeId: string;
    checkpoint: Checkpoint;
    channel: 'whatsapp';
    /** Provider-approved template this message was rendered from. Free-form sends are not possible. */
    templateId: string;
    body: string;
    createdAt: Iso8601;
    scheduledFor: Iso8601;
    status: 'draft' | 'approved' | 'sent' | 'suppressed';
    suppressedReason?: string;
    providerId?: string;
    sentAt?: Iso8601;
}

export interface OutcomeMeasure {
    id: string;
    patientId: string;
    programmeId: string;
    checkpoint: Checkpoint;
    recordedAt: Iso8601;
    painScore: number;
    adherence: 'none' | 'partial' | 'full';
    freeText: string;
    /** Phrases in the reply that triggered clinician review. */
    concerns: string[];
    escalated: boolean;
}

// ---------------------------------------------------------------------------
// Agent 6 — marketing and content
// ---------------------------------------------------------------------------

export type ContentChannel = 'instagram' | 'linkedin' | 'blog' | 'newsletter';

export interface ContentDraft {
    id: string;
    createdAt: Iso8601;
    channel: ContentChannel;
    topic: string;
    audience: string;
    headline: string;
    body: string;
    hashtags: string[];
    disclaimer: string;
    status: 'draft' | 'published';
    publishedAt?: Iso8601;
    publishedUrl?: string;
}

// ---------------------------------------------------------------------------
// Services the orchestrator brokers to modules
// ---------------------------------------------------------------------------

export interface EvidenceService {
    query(query: EvidenceQuery): Promise<EvidenceResult>;
}

export interface ExerciseLibraryService {
    search(criteria: { region: BodyRegion; targets: string[]; maxDifficulty: number; exclude?: string[] }): Promise<ExerciseAsset[]>;
}

export interface MessagingAdapter {
    send(message: OutboundMessage): Promise<{ providerId: string; sentAt: Iso8601 }>;
}

export interface PublishingAdapter {
    publish(draft: ContentDraft): Promise<{ publishedAt: Iso8601; url?: string }>;
}

/**
 * Modules do not import each other. Where one needs another's capability — planning needs
 * evidence — the orchestrator brokers it here, and only for modules granted the matching scope.
 */
export interface AgentServices {
    evidence?: EvidenceService;
    library?: ExerciseLibraryService;
    messaging?: MessagingAdapter;
    publishing?: PublishingAdapter;
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
    /** Only the services this module's granted scopes entitle it to. */
    services: AgentServices;
    audit(action: string, detail?: Record<string, string | number | boolean>): void;
}

export interface AgentModule<TInput, TOutput> {
    id: AgentId;
    title: string;
    scopes: readonly Scope[];
    /** True when output must be approved by a human before it leaves the system. */
    requiresApproval: boolean;
    /**
     * Narrows `requiresApproval` per output: a module that sometimes produces nothing outbound —
     * a suppressed check-in — returns false so the approval queue stays a queue of real decisions.
     */
    needsApproval?(output: TOutput): boolean;
    /** Validate and narrow untrusted input at the module boundary. Throws on invalid input. */
    parse(input: unknown): TInput;
    run(input: TInput, ctx: AgentContext): Promise<AgentOutcome<TOutput>>;
    /**
     * Performs the outward-facing act — sending, publishing. The orchestrator calls this only
     * after a named human has approved the draft, and never from `dispatch`.
     */
    deliver?(payload: TOutput, ctx: AgentContext): Promise<TOutput>;
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

export type CollectionFilter = Partial<Record<'patientId' | 'status' | 'assessmentId' | 'planId' | 'programmeId', string>>;

export interface Collection<T extends { id: string }> {
    get(id: string): Promise<T | null>;
    put(record: T): Promise<T>;
    list(filter?: CollectionFilter): Promise<T[]>;
}

export interface JarvisStore {
    patients: Collection<PatientRecord>;
    assessments: Collection<AssessmentRecord>;
    plans: Collection<TreatmentPlan>;
    programmes: Collection<HomeExerciseProgramme>;
    messages: Collection<OutboundMessage>;
    outcomes: Collection<OutcomeMeasure>;
    content: Collection<ContentDraft>;
    evidenceQueries: Collection<EvidenceQueryRecord>;
    approvals: Collection<ApprovalRequest>;
    audit: { append(event: AuditEvent): Promise<void>; all(): Promise<AuditEvent[]> };
}
