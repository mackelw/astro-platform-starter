import type {
    ApprovalRequest,
    AssessmentRecord,
    AuditEvent,
    Collection,
    ContentDraft,
    EvidenceQueryRecord,
    HomeExerciseProgramme,
    JarvisStore,
    OutboundMessage,
    OutcomeMeasure,
    PatientRecord,
    TreatmentPlan
} from '../types';

/**
 * The clinical database.
 *
 * The in-memory implementation lets the whole pipeline be developed and tested without standing up
 * infrastructure. The `JarvisStore` interface is the seam: a Postgres or Netlify Blobs adapter
 * implements the same collections and nothing upstream changes.
 *
 * Key layout expected of any persistent adapter:
 *
 *   patients/{patientId}
 *   assessments/{patientId}/{assessmentId}
 *   plans/{patientId}/{planId}
 *   programmes/{patientId}/{programmeId}
 *   messages/{patientId}/{messageId}
 *   outcomes/{patientId}/{outcomeId}
 *   content/{draftId}                     — no patient dimension; Agent 6 never touches one
 *   evidence-queries/{queryId}            — de-identified questions and what came back
 *   approvals/{approvalId}
 *   audit/{yyyy-mm-dd}/{taskId}
 *
 * Clinical records are keyed under the patient so that "everything for this patient" is a prefix
 * scan and an erasure request is a prefix delete.
 */

function matches<T extends Record<string, unknown>>(record: T, filter?: Partial<Record<string, string>>): boolean {
    if (!filter) return true;
    return Object.entries(filter).every(([key, value]) => value === undefined || record[key] === value);
}

function createCollection<T extends { id: string }>(): Collection<T> {
    const rows = new Map<string, T>();
    return {
        async get(id) {
            return rows.get(id) ?? null;
        },
        async put(record) {
            rows.set(record.id, record);
            return record;
        },
        async list(filter) {
            return [...rows.values()].filter((row) => matches(row as unknown as Record<string, unknown>, filter));
        }
    };
}

export function createInMemoryStore(): JarvisStore {
    const events: AuditEvent[] = [];
    return {
        patients: createCollection<PatientRecord>(),
        assessments: createCollection<AssessmentRecord>(),
        plans: createCollection<TreatmentPlan>(),
        programmes: createCollection<HomeExerciseProgramme>(),
        messages: createCollection<OutboundMessage>(),
        outcomes: createCollection<OutcomeMeasure>(),
        content: createCollection<ContentDraft>(),
        evidenceQueries: createCollection<EvidenceQueryRecord>(),
        approvals: createCollection<ApprovalRequest>(),
        audit: {
            async append(event) {
                events.push(event);
            },
            async all() {
                return [...events];
            }
        }
    };
}
