"""SQLite database layer for Jarvis Physio.

All agents read/write through this module — they never talk to each other
directly. Keeps the system debuggable and makes the audit trail explicit.
"""
import json
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path

DB_PATH = Path(__file__).parent / "jarvis.db"


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    conn = get_conn()
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS patients (
            id TEXT PRIMARY KEY,
            mrn TEXT UNIQUE,
            name TEXT NOT NULL,
            dob TEXT,
            phone TEXT,
            consent_given INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS assessments (
            id TEXT PRIMARY KEY,
            patient_id TEXT NOT NULL REFERENCES patients(id),
            status TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'pending_review', 'approved', 'escalated')),
            chief_complaint TEXT,
            history_json TEXT,
            posture_gait_rom_json TEXT,
            red_flags_json TEXT,
            summary TEXT,
            clinician_note TEXT,
            created_at TEXT NOT NULL,
            reviewed_at TEXT
        );

        CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            agent TEXT NOT NULL,
            action TEXT NOT NULL,
            entity_id TEXT,
            details_json TEXT
        );

        CREATE TABLE IF NOT EXISTS treatment_plans (
            id TEXT PRIMARY KEY,
            assessment_id TEXT NOT NULL REFERENCES assessments(id),
            status TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'pending_review', 'approved')),
            condition_profile TEXT,
            goals_json TEXT,
            interventions_json TEXT,
            evidence_json TEXT,
            precautions_json TEXT,
            summary TEXT,
            clinician_note TEXT,
            created_at TEXT NOT NULL,
            reviewed_at TEXT
        );

        CREATE TABLE IF NOT EXISTS exercise_programmes (
            id TEXT PRIMARY KEY,
            plan_id TEXT NOT NULL REFERENCES treatment_plans(id),
            status TEXT NOT NULL DEFAULT 'pending_review'
                CHECK (status IN ('draft', 'pending_review', 'approved', 'released')),
            items_json TEXT,
            education_json TEXT,
            summary TEXT,
            clinician_note TEXT,
            created_at TEXT NOT NULL,
            reviewed_at TEXT
        );

        CREATE TABLE IF NOT EXISTS content_posts (
            id TEXT PRIMARY KEY,
            topic TEXT NOT NULL,
            platform TEXT NOT NULL DEFAULT 'generic',
            status TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'pending_review', 'approved', 'published', 'rejected')),
            body TEXT,
            claims_json TEXT,
            clinician_note TEXT,
            created_at TEXT NOT NULL,
            reviewed_at TEXT
        );

        CREATE TABLE IF NOT EXISTS followups (
            id TEXT PRIMARY KEY,
            patient_id TEXT NOT NULL REFERENCES patients(id),
            programme_id TEXT REFERENCES exercise_programmes(id),
            kind TEXT NOT NULL DEFAULT 'checkin'
                CHECK (kind IN ('checkin', 'outcome')),
            status TEXT NOT NULL DEFAULT 'pending_review'
                CHECK (status IN ('draft', 'pending_review', 'approved',
                                  'queued', 'sent', 'blocked_no_consent',
                                  'received', 'escalated', 'cancelled')),
            scheduled_for TEXT,
            message_text TEXT,
            outcome_measures_json TEXT,
            reply_text TEXT,
            clinician_note TEXT,
            created_at TEXT NOT NULL,
            reviewed_at TEXT
        );
        """
    )
    conn.commit()
    conn.close()


# ---------------------------------------------------------------- patients

def create_patient(name: str, mrn: str | None = None, dob: str | None = None,
                   phone: str | None = None, consent: bool = False) -> str:
    pid = f"PT-{uuid.uuid4().hex[:8].upper()}"
    conn = get_conn()
    conn.execute(
        "INSERT INTO patients (id, mrn, name, dob, phone, consent_given, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (pid, mrn, name, dob, phone, int(consent), _now()),
    )
    conn.commit()
    conn.close()
    log("database", "create_patient", pid, {"name": name})
    return pid


def get_patient(patient_id: str) -> dict | None:
    conn = get_conn()
    row = conn.execute("SELECT * FROM patients WHERE id = ?", (patient_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def list_patients() -> list[dict]:
    conn = get_conn()
    rows = conn.execute(
        "SELECT id, name, mrn, created_at FROM patients ORDER BY created_at DESC"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ------------------------------------------------------------- assessments

def save_assessment(patient_id: str, data: dict) -> str:
    aid = f"AS-{uuid.uuid4().hex[:8].upper()}"
    status = "escalated" if data.get("red_flags") else "pending_review"
    conn = get_conn()
    conn.execute(
        "INSERT INTO assessments (id, patient_id, status, chief_complaint, history_json, "
        "posture_gait_rom_json, red_flags_json, summary, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            aid,
            patient_id,
            status,
            data.get("chief_complaint"),
            json.dumps(data.get("history", {})),
            json.dumps(data.get("posture_gait_rom", {})),
            json.dumps(data.get("red_flags", [])),
            data.get("summary"),
            _now(),
        ),
    )
    conn.commit()
    conn.close()
    log("assessment", "save_assessment", aid, {"status": status})
    return aid


def get_assessment(assessment_id: str) -> dict | None:
    conn = get_conn()
    row = conn.execute("SELECT * FROM assessments WHERE id = ?", (assessment_id,)).fetchone()
    if not row:
        conn.close()
        return None
    a = dict(row)
    for key in ("history", "posture_gait_rom", "red_flags"):
        raw = a.pop(f"{key}_json" if key != "history" else "history_json", None)
        a[key] = json.loads(raw) if raw else ({} if key != "red_flags" else [])
    a.pop("history_json", None)
    conn.close()
    return a


def approve_assessment(assessment_id: str, clinician_note: str = "") -> bool:
    return _set_status(assessment_id, "approved", clinician_note)


def escalate_assessment(assessment_id: str, clinician_note: str = "") -> bool:
    return _set_status(assessment_id, "escalated", clinician_note)


def _set_status(assessment_id: str, status: str, note: str) -> bool:
    conn = get_conn()
    cur = conn.execute(
        "UPDATE assessments SET status = ?, clinician_note = ?, reviewed_at = ? WHERE id = ?",
        (status, note, _now(), assessment_id),
    )
    conn.commit()
    conn.close()
    log("clinician", f"set_status_{status}", assessment_id, {"note": note})
    return cur.rowcount > 0


def pending_assessments() -> list[dict]:
    conn = get_conn()
    rows = conn.execute(
        "SELECT a.id, a.status, a.chief_complaint, a.created_at, p.name AS patient_name "
        "FROM assessments a JOIN patients p ON p.id = a.patient_id "
        "WHERE a.status = 'pending_review' ORDER BY a.created_at"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ---------------------------------------------------------- treatment plans

def save_treatment_plan(assessment_id: str, data: dict) -> str:
    tpid = f"TP-{uuid.uuid4().hex[:8].upper()}"
    conn = get_conn()
    conn.execute(
        "INSERT INTO treatment_plans (id, assessment_id, status, condition_profile, "
        "goals_json, interventions_json, evidence_json, precautions_json, summary, created_at) "
        "VALUES (?, ?, 'pending_review', ?, ?, ?, ?, ?, ?, ?)",
        (
            tpid,
            assessment_id,
            data.get("condition_profile"),
            json.dumps(data.get("goals", [])),
            json.dumps(data.get("interventions", [])),
            json.dumps(data.get("evidence", [])),
            json.dumps(data.get("precautions", [])),
            data.get("summary"),
            _now(),
        ),
    )
    conn.commit()
    conn.close()
    log("planning", "save_treatment_plan", tpid, {"assessment_id": assessment_id})
    return tpid


def get_treatment_plan(plan_id: str) -> dict | None:
    conn = get_conn()
    row = conn.execute("SELECT * FROM treatment_plans WHERE id = ?", (plan_id,)).fetchone()
    if not row:
        conn.close()
        return None
    p = dict(row)
    for key in ("goals", "interventions", "evidence", "precautions"):
        p[key] = json.loads(p.pop(f"{key}_json") or "null")
    conn.close()
    return p


def approve_plan(plan_id: str, clinician_note: str = "") -> bool:
    conn = get_conn()
    cur = conn.execute(
        "UPDATE treatment_plans SET status = 'approved', clinician_note = ?, "
        "reviewed_at = ? WHERE id = ?",
        (clinician_note, _now(), plan_id),
    )
    conn.commit()
    conn.close()
    log("clinician", "approve_plan", plan_id, {"note": clinician_note})
    return cur.rowcount > 0


def pending_plans() -> list[dict]:
    conn = get_conn()
    rows = conn.execute(
        "SELECT tp.id, tp.created_at, a.chief_complaint, p.name AS patient_name "
        "FROM treatment_plans tp "
        "JOIN assessments a ON a.id = tp.assessment_id "
        "JOIN patients p ON p.id = a.patient_id "
        "WHERE tp.status = 'pending_review' ORDER BY tp.created_at"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ------------------------------------------------------- exercise programmes

def save_programme(plan_id: str, data: dict) -> str:
    epid = f"EP-{uuid.uuid4().hex[:8].upper()}"
    conn = get_conn()
    conn.execute(
        "INSERT INTO exercise_programmes (id, plan_id, status, items_json, "
        "education_json, summary, created_at) VALUES (?, ?, 'pending_review', ?, ?, ?, ?)",
        (epid, plan_id, json.dumps(data.get("items", [])),
         json.dumps(data.get("education", {})), data.get("summary"), _now()),
    )
    conn.commit()
    conn.close()
    log("education", "save_programme", epid, {"plan_id": plan_id})
    return epid


def get_programme(programme_id: str) -> dict | None:
    conn = get_conn()
    row = conn.execute(
        "SELECT * FROM exercise_programmes WHERE id = ?", (programme_id,)
    ).fetchone()
    if not row:
        conn.close()
        return None
    p = dict(row)
    p["items"] = json.loads(p.pop("items_json") or "[]")
    p["education"] = json.loads(p.pop("education_json") or "{}")
    conn.close()
    return p


def approve_programme(programme_id: str, clinician_note: str = "") -> bool:
    conn = get_conn()
    cur = conn.execute(
        "UPDATE exercise_programmes SET status = 'released', clinician_note = ?, "
        "reviewed_at = ? WHERE id = ?",
        (clinician_note, _now(), programme_id),
    )
    conn.commit()
    conn.close()
    log("clinician", "release_programme", programme_id, {"note": clinician_note})
    return cur.rowcount > 0


def pending_programmes() -> list[dict]:
    conn = get_conn()
    rows = conn.execute(
        "SELECT ep.id, ep.created_at, tp.id AS plan_id, a.chief_complaint, "
        "p.name AS patient_name "
        "FROM exercise_programmes ep "
        "JOIN treatment_plans tp ON tp.id = ep.plan_id "
        "JOIN assessments a ON a.id = tp.assessment_id "
        "JOIN patients p ON p.id = a.patient_id "
        "WHERE ep.status = 'pending_review' ORDER BY ep.created_at"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ------------------------------------------------------------- content posts

def save_post(topic: str, data: dict, platform: str = "generic") -> str:
    cpid = f"CP-{uuid.uuid4().hex[:8].upper()}"
    conn = get_conn()
    conn.execute(
        "INSERT INTO content_posts (id, topic, platform, status, body, claims_json, "
        "created_at) VALUES (?, ?, ?, 'pending_review', ?, ?, ?)",
        (cpid, topic, platform, data.get("body"),
         json.dumps(data.get("claims", [])), _now()),
    )
    conn.commit()
    conn.close()
    log("content", "save_post", cpid, {"topic": topic})
    return cpid


def get_post(post_id: str) -> dict | None:
    conn = get_conn()
    row = conn.execute("SELECT * FROM content_posts WHERE id = ?", (post_id,)).fetchone()
    if not row:
        conn.close()
        return None
    p = dict(row)
    p["claims"] = json.loads(p.pop("claims_json") or "[]")
    conn.close()
    return p


def set_post_status(post_id: str, status: str, clinician_note: str = "") -> bool:
    conn = get_conn()
    cur = conn.execute(
        "UPDATE content_posts SET status = ?, clinician_note = ?, reviewed_at = ? "
        "WHERE id = ?",
        (status, clinician_note, _now(), post_id),
    )
    conn.commit()
    conn.close()
    log("clinician", f"post_{status}", post_id, {"note": clinician_note})
    return cur.rowcount > 0


def pending_posts() -> list[dict]:
    conn = get_conn()
    rows = conn.execute(
        "SELECT id, topic, platform, created_at FROM content_posts "
        "WHERE status = 'pending_review' ORDER BY created_at"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ----------------------------------------------------------------- followups

# Statuses a follow-up may be created with. Anything further along the
# lifecycle ('queued', 'sent', ...) must be reached through an explicit action.
_FOLLOWUP_INITIAL_STATUSES = ("draft", "pending_review", "blocked_no_consent")


def save_followup(patient_id: str, programme_id: str | None, kind: str,
                  message_text: str, scheduled_for: str | None = None,
                  outcome_measures: list | None = None,
                  status: str = "pending_review") -> str:
    if status not in _FOLLOWUP_INITIAL_STATUSES:
        raise ValueError(
            f"save_followup cannot create status '{status}'. Allowed: "
            f"{', '.join(_FOLLOWUP_INITIAL_STATUSES)}."
        )
    fuid = f"FU-{uuid.uuid4().hex[:8].upper()}"
    conn = get_conn()
    conn.execute(
        "INSERT INTO followups (id, patient_id, programme_id, kind, status, "
        "scheduled_for, message_text, outcome_measures_json, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (fuid, patient_id, programme_id, kind, status, scheduled_for,
         message_text, json.dumps(outcome_measures or []), _now()),
    )
    conn.commit()
    conn.close()
    log("followup", "save_followup", fuid,
        {"patient_id": patient_id, "kind": kind, "status": status})
    return fuid


def get_followup(followup_id: str) -> dict | None:
    conn = get_conn()
    row = conn.execute("SELECT * FROM followups WHERE id = ?", (followup_id,)).fetchone()
    if not row:
        conn.close()
        return None
    f = dict(row)
    f["outcome_measures"] = json.loads(f.pop("outcome_measures_json") or "[]")
    conn.close()
    return f


def approve_followup(followup_id: str, clinician_note: str = "") -> bool:
    """Approve AND queue in one step — approval means it enters the outbox.

    Refuses consent-blocked drafts: approval is not a consent override.
    """
    current = get_followup(followup_id)
    if current and current["status"] == "blocked_no_consent":
        raise PermissionError(
            f"{followup_id} is blocked: no recorded consent to contact this "
            f"patient. Record consent on the patient record first — approving a "
            f"follow-up does not override it."
        )
    conn = get_conn()
    cur = conn.execute(
        "UPDATE followups SET status = 'queued', clinician_note = ?, reviewed_at = ? "
        "WHERE id = ?",
        (clinician_note, _now(), followup_id),
    )
    conn.commit()
    conn.close()
    log("clinician", "queue_followup", followup_id, {"note": clinician_note})
    return cur.rowcount > 0


def cancel_followup(followup_id: str, clinician_note: str = "") -> bool:
    return _fu_status(followup_id, "cancelled", clinician_note)


def mark_sent(followup_id: str, transport: str) -> bool:
    """Called ONLY by a transport adapter after real delivery."""
    ok = _fu_status(followup_id, "sent", f"sent via {transport}")
    if ok:
        log(transport, "deliver_followup", followup_id)
    return ok


def record_reply(followup_id: str, reply_text: str) -> dict:
    """Store an incoming reply; auto-escalate on concerning keywords."""
    flags = [kw for kw in _REPLY_ESCALATION_KEYWORDS if kw in reply_text.lower()]
    status = "escalated" if flags else "received"
    conn = get_conn()
    conn.execute(
        "UPDATE followups SET status = ?, reply_text = ?, reviewed_at = ? WHERE id = ?",
        (status, reply_text, _now(), followup_id),
    )
    conn.commit()
    conn.close()
    log("followup", "record_reply", followup_id, {"escalated": bool(flags)})
    return {"status": status, "flags": flags}


_REPLY_ESCALATION_KEYWORDS = [
    "worse", "worsening", "numbness", "can't walk", "cant walk", "fell",
    "emergency", "bladder", "incontinence", "tingling", "weakness",
    "night pain", "fever", "dizzy",
]


def record_outcome(followup_id: str, scores: dict) -> dict:
    """Append a set of outcome scores to a follow-up's result history."""
    if not isinstance(scores, dict) or not scores:
        raise ValueError(
            "Outcome scores must be a non-empty mapping of measure to value, "
            'e.g. {"NPRS": 4, "ADHERENCE": 6}.'
        )
    conn = get_conn()
    row = conn.execute(
        "SELECT outcome_measures_json FROM followups WHERE id = ?", (followup_id,)
    ).fetchone()
    if not row:
        conn.close()
        raise ValueError(f"Unknown follow-up: {followup_id}")
    existing = json.loads(row["outcome_measures_json"] or "[]")
    existing.append({"scores": scores, "recorded_at": _now()})
    conn.execute(
        "UPDATE followups SET outcome_measures_json = ? WHERE id = ?",
        (json.dumps(existing), followup_id),
    )
    conn.commit()
    conn.close()
    log("followup", "record_outcome", followup_id, scores)
    return {"measures_recorded": len(existing)}


def pending_followups() -> list[dict]:
    conn = get_conn()
    rows = conn.execute(
        "SELECT fu.id, fu.kind, fu.scheduled_for, p.name AS patient_name "
        "FROM followups fu JOIN patients p ON p.id = fu.patient_id "
        "WHERE fu.status = 'pending_review' ORDER BY fu.created_at"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def queued_followups() -> list[dict]:
    conn = get_conn()
    rows = conn.execute(
        "SELECT fu.id, fu.kind, fu.scheduled_for, p.name AS patient_name "
        "FROM followups fu JOIN patients p ON p.id = fu.patient_id "
        "WHERE fu.status = 'queued' ORDER BY fu.scheduled_for"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def blocked_followups() -> list[dict]:
    """Follow-ups refused by the consent gate — visible, never silently dropped."""
    conn = get_conn()
    rows = conn.execute(
        "SELECT fu.id, fu.kind, fu.scheduled_for, p.name AS patient_name "
        "FROM followups fu JOIN patients p ON p.id = fu.patient_id "
        "WHERE fu.status = 'blocked_no_consent' ORDER BY fu.created_at"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def escalated_followups() -> list[dict]:
    conn = get_conn()
    rows = conn.execute(
        "SELECT fu.id, fu.reply_text, p.name AS patient_name "
        "FROM followups fu JOIN patients p ON p.id = fu.patient_id "
        "WHERE fu.status = 'escalated' ORDER BY fu.reviewed_at"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def _fu_status(followup_id: str, status: str, note: str = "") -> bool:
    conn = get_conn()
    cur = conn.execute(
        "UPDATE followups SET status = ?, clinician_note = ?, reviewed_at = ? "
        "WHERE id = ?",
        (status, note, _now(), followup_id),
    )
    conn.commit()
    conn.close()
    return cur.rowcount > 0


# --------------------------------------------------------------- audit log

def log(agent: str, action: str, entity_id: str | None = None,
        details: dict | None = None) -> None:
    conn = get_conn()
    conn.execute(
        "INSERT INTO audit_log (timestamp, agent, action, entity_id, details_json) "
        "VALUES (?, ?, ?, ?, ?)",
        (_now(), agent, action, entity_id, json.dumps(details or {})),
    )
    conn.commit()
    conn.close()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


if __name__ == "__main__":
    init_db()
    print(f"Database initialised at {DB_PATH}")
