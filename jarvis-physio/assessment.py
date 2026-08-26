"""Agent 1 — Physiotherapy Assessment.

Takes a structured patient intake, runs red-flag screening FIRST (hard stop,
not a suggestion), then produces a draft assessment that always requires
clinician approval before it becomes a clinical record.
"""
import database as db

# Red flags that require immediate escalation to a clinician / emergency care.
# Sources: clinical guidelines (e.g. cauda equina, fracture, malignancy screens).
RED_FLAG_RULES = {
    "saddle anaesthesia": "Possible cauda equina syndrome — EMERGENCY referral",
    "loss of bladder control": "Possible cauda equina syndrome — EMERGENCY referral",
    "loss of bowel control": "Possible cauda equina syndrome — EMERGENCY referral",
    "saddle numbness": "Possible cauda equina syndrome — EMERGENCY referral",
    "unexplained weight loss": "Possible malignancy — urgent medical review",
    "night pain": "Possible malignancy or inflammatory pathology — medical review",
    "fever": "Possible infection (e.g. discitis) — urgent medical review",
    "recent trauma": "Fracture risk — imaging before any manual therapy",
    "history of cancer": "Malignancy recurrence risk — medical clearance first",
    "progressive neurological deficit": "Worsening neuro signs — urgent review",
    "leg weakness": "Neurological involvement — assess motor levels urgently",
    "unrelenting pain": "Serious pathology screen needed — medical review",
}


def run_assessment(patient_id: str, intake: dict) -> dict:
    """Process an intake dict into a draft assessment + red-flag verdict.

    intake keys: chief_complaint, history, posture_gait_rom
      history: onset, mechanism, pmh, medications, previous_treatment
      posture_gait_rom: posture, gait, rom {joint: degrees}, strength, special_tests
    """
    db.log("assessment", "run_assessment", patient_id)

    # 1. Red-flag screening — hard gate.
    text_blob = _intake_to_text(intake)
    red_flags = [
        {"finding": finding, "action": action}
        for finding, action in RED_FLAG_RULES.items()
        if finding in text_blob
    ]

    # 2. Draft summary (rule-based for v1; LLM-backed later).
    summary = _draft_summary(patient_id, intake, red_flags)

    assessment = {
        "chief_complaint": intake.get("chief_complaint", ""),
        "history": intake.get("history", {}),
        "posture_gait_rom": intake.get("posture_gait_rom", {}),
        "red_flags": red_flags,
        "summary": summary,
    }
    return assessment


def submit_assessment(patient_id: str, intake: dict) -> dict:
    """Run assessment and persist it. Escalated ones are flagged for clinician."""
    assessment = run_assessment(patient_id, intake)
    assessment_id = db.save_assessment(patient_id, assessment)
    status = "escalated" if assessment["red_flags"] else "pending_review"
    print(f"[assessment] Saved {assessment_id} — status: {status}")
    if status == "escalated":
        print("[assessment] ⚠ RED FLAGS DETECTED — do NOT proceed to treatment planning.")
        for rf in assessment["red_flags"]:
            print(f"  - {rf['finding']}: {rf['action']}")
    else:
        print("[assessment] Awaiting clinician approval before planning.")
    return {"assessment_id": assessment_id, **assessment}


def _intake_to_text(intake: dict) -> str:
    parts = [str(intake.get("chief_complaint", ""))]
    for section in ("history", "posture_gait_rom"):
        value = intake.get(section, {})
        parts.extend(str(v) for v in value.values())
    return " ".join(parts).lower()


def _draft_summary(patient_id: str, intake: dict, red_flags: list) -> str:
    patient = db.get_patient(patient_id)
    lines = [
        f"DRAFT assessment for {patient['name'] if patient else patient_id} "
        f"(requires clinician sign-off):",
        f"Chief complaint: {intake.get('chief_complaint', 'not stated')}.",
    ]
    hist = intake.get("history", {})
    if hist:
        bits = [f"{k.replace('_', ' ')}: {v}" for k, v in hist.items() if v]
        if bits:
            lines.append("History — " + "; ".join(bits) + ".")
    pg = intake.get("posture_gait_rom", {})
    rom = pg.get("rom", {})
    if rom:
        rom_bits = [f"{joint} {deg}°" for joint, deg in rom.items()]
        lines.append("ROM — " + ", ".join(rom_bits) + ".")
    tests = pg.get("special_tests", [])
    if tests:
        lines.append(f"Special tests: {', '.join(tests)}.")
    if red_flags:
        lines.append(f"{len(red_flags)} red flag(s) present — ESCALATED.")
    return "\n".join(lines)


if __name__ == "__main__":
    demo = {
        "chief_complaint": "Low back pain radiating to right leg, 3 weeks",
        "history": {
            "onset": "gradual, 3 weeks ago",
            "mechanism": "no specific injury; started after long car trip",
            "pmh": "none significant",
            "medications": "ibuprofen PRN",
            "previous_treatment": "none yet",
        },
        "posture_gait_rom": {
            "posture": "mild lumbar flexion bias standing",
            "gait": "antalgic on right",
            "rom": {"lumbar flexion": 55, "lumbar extension": 15,
                    "right SLR": 60},
            "strength": "5/5 all lower limb groups except R ankle dorsiflexion 4/5",
            "special_tests": ["SLR positive right at 60°"],
        },
    }
    db.init_db()
    pid = db.create_patient("Test Patient", mrn="MRN-0001")
    result = submit_assessment(pid, demo)
    print("\n--- Summary ---\n" + result["summary"])
