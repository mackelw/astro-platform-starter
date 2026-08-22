import type { ApprovalRequest, AssessmentRecord, AuditEvent, Collection, JarvisStore, PatientRecord } from '../types';

/**
 * The assessment database.
 *
 * Phase 1 ships an in-memory implementation so the main brain and Agent 1 can be developed and
 * tested end to end without standing up infrastructure. The `JarvisStore` interface is the seam:
 * a Postgres or Netlify Blobs adapter implements the same four collections and nothing upstream
 * changes.
 *
 * Key layout expected of any persistent adapter:
 *
 *   patients/{patientId}
 *   assessments/{patientId}/{assessmentId}
 *   approvals/{approvalId}
 *   audit/{yyyy-mm-dd}/{taskId}
 *
 * Assessments are keyed under the patient so that "everything for this patient" is a prefix scan
 * and a deletion request is a prefix delete.
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
