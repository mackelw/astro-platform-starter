"""Agent 2 — Treatment Planning.

Turns an APPROVED assessment into a draft treatment plan: condition profile,
measurable goals, interventions, precautions, and the evidence behind each
choice. Two hard gates:

  1. The assessment must be clinician-approved. Draft, pending and unreviewed
     assessments are refused outright.
  2. If the assessment carried red flags, the clinician must have recorded a
     note when approving it (documenting clearance). Silent approval of a
     red-flagged assessment does not unlock planning.

Plans are drafts. They are saved as 'pending_review' and cannot progress to
exercise programming until a clinician approves them, and brain.py refuses to
approve any plan that carries no cited evidence.
"""
import database as db
import knowledge_base as kb

# Chief-complaint keywords -> condition profile. First match wins.
_PROFILE_RULES = [
    (("low back", "lower back", "lumbar", "lbp"), "low back pain"),
    (("neck", "cervical"), "neck pain"),
]

# Signals that the presentation has a nerve-related (radicular) component.
_RADICULAR_SIGNALS = (
    "radiat", "sciatic", "leg pain", "down the leg", "into the leg",
    "slr positive", "positive slr", "dermatom", "pins and needles",
    "shooting", "calf", "buttock to",
)

# Signals that the patient is provoked by lumbar flexion.
_FLEXION_SIGNALS = (
    "flexion bias", "sitting", "car trip", "bending", "bend forward",
    "stooping", "driving", "desk",
)

# Interventions per profile. Each carries the evidence it rests on.
_INTERVENTIONS = {
    "low back pain": [
        {
            "modality": "Graded exercise therapy",
            "detail": "Progressive motor-control and hip/trunk strengthening, "
                      "prescribed as a home programme and reviewed each session.",
            "dose": "Daily home programme, 2-3 clinic reviews over 6 weeks",
            "evidence_ref": "NICE-NG59-exercise",
        },
        {
            "modality": "Graded activity",
            "detail": "Structured return to walking and normal loading, progressed "
                      "by tolerance rather than by symptom-free days.",
            "dose": "Daily, ~10% weekly progression",
            "evidence_ref": "Cochrane-graded-activity",
        },
        {
            "modality": "Education and reassurance",
            "detail": "Explain the benign natural history, the role of load and "
                      "activity, and the specific signs that warrant urgent review.",
            "dose": "Every session, reinforced in written form",
            "evidence_ref": "NICE-NG59-education",
        },
        {
            "modality": "Manual therapy (adjunct)",
            "detail": "Optional short-term symptom relief to enable exercise. Never "
                      "prescribed as a standalone course of treatment.",
            "dose": "As required, alongside exercise only",
            "evidence_ref": "NICE-NG59-manual-therapy",
        },
    ],
}

# Extra interventions when nerve involvement is present.
_RADICULAR_INTERVENTIONS = [
    {
        "modality": "Neural mobilisation",
        "detail": "Sciatic nerve gliding within a symptom-easing range, with "
                  "explicit stop rules if leg symptoms peripheralise.",
        "dose": "Twice daily, discontinue if symptoms spread distally",
        "evidence_ref": "Nerve-glide-sciatica",
    },
]


def create_plan(assessment_id: str) -> dict:
    """Draft a treatment plan from an approved assessment. Raises on gate failure."""
    db.init_db()
    a = db.get_assessment(assessment_id)
    if not a:
        raise ValueError(f"Unknown assessment: {assessment_id}")

    # HARD GATE 1: clinician approval.
    if a["status"] != "approved":
        raise PermissionError(
            f"{assessment_id} has status '{a['status']}' — treatment planning "
            f"requires a clinician-approved assessment. Nothing drafted."
        )

    # HARD GATE 2: a red-flagged assessment needs documented clearance.
    red_flags = a.get("red_flags") or []
    if red_flags and not (a.get("clinician_note") or "").strip():
        findings = ", ".join(f["finding"] for f in red_flags)
        raise PermissionError(
            f"{assessment_id} was approved but carries red flags ({findings}) and "
            f"no clinician note. Re-approve with a note documenting medical "
            f"clearance before planning:\n"
            f"  python3 brain.py approve {assessment_id} --note '...'"
        )

    profile, radicular = _profile(a)
    interventions = list(_INTERVENTIONS.get(profile, []))
    if radicular:
        interventions += _RADICULAR_INTERVENTIONS
    if not interventions:
        raise ValueError(
            f"No planning rules for condition profile '{profile}'. Add them to "
            f"planning._INTERVENTIONS before drafting."
        )

    precautions = _precautions(a, radicular)
    goals = _goals(a, profile, radicular)
    evidence = _evidence(interventions)
    condition_profile = profile + (" with radicular leg pain" if radicular else "")
    plan = {
        "condition_profile": condition_profile,
        "goals": goals,
        "interventions": interventions,
        "evidence": evidence,
        "precautions": precautions,
    }
    plan["summary"] = _summary(a, plan)
    return plan


def submit_plan(assessment_id: str) -> dict:
    """Draft a plan and persist it as pending_review."""
    plan = create_plan(assessment_id)
    plan_id = db.save_treatment_plan(assessment_id, plan)
    print(f"[planning] Saved {plan_id} from {assessment_id} — pending_review.")
    if plan["precautions"]:
        print(f"[planning] {len(plan['precautions'])} precaution(s) attached — "
              f"read them before approving.")
    print("[planning] Requires clinician approval before exercise programming.")
    return {"plan_id": plan_id, **plan}


# ------------------------------------------------------------------ helpers

def _text(a: dict) -> str:
    """Flatten an assessment into one lowercase blob for keyword matching."""
    parts = [str(a.get("chief_complaint", ""))]
    for section in ("history", "posture_gait_rom"):
        value = a.get(section) or {}
        if isinstance(value, dict):
            parts.extend(str(v) for v in value.values())
    return " ".join(parts).lower()


def _profile(a: dict) -> tuple[str, bool]:
    """Return (condition profile, radicular involvement)."""
    blob = _text(a)
    profile = next(
        (name for keys, name in _PROFILE_RULES if any(k in blob for k in keys)),
        "unclassified",
    )
    radicular = any(s in blob for s in _RADICULAR_SIGNALS)
    return profile, radicular


def _precautions(a: dict, radicular: bool) -> list[str]:
    """Precautions the education agent and clinician must honour."""
    out = []
    for rf in a.get("red_flags") or []:
        out.append(
            f"RED FLAG CARRIED FORWARD — {rf['finding']}: {rf['action']}. "
            f"Re-screen at every session."
        )
    blob = _text(a)
    if radicular:
        out.append(
            "Neurological involvement: check myotomes and dermatomes each session. "
            "Stop treatment and refer for medical review if weakness progresses, "
            "symptoms spread distally, or saddle/bladder symptoms appear."
        )
    if any(s in blob for s in _FLEXION_SIGNALS):
        out.append(
            "Flexion-sensitive presentation: avoid sustained and end-range lumbar "
            "flexion for the first two weeks; prescribe sitting breaks."
        )
    if "4/5" in blob or "weak" in blob:
        out.append(
            "Documented strength deficit: re-test motor levels at each review and "
            "escalate on any decline."
        )
    return out


def _goals(a: dict, profile: str, radicular: bool) -> list[dict]:
    """Measurable goals with explicit timeframes."""
    pg = a.get("posture_gait_rom") or {}
    rom = pg.get("rom") or {}
    goals = [
        {
            "horizon": "2 weeks",
            "goal": "Reduce worst-pain NPRS by at least 2 points from baseline and "
                    "complete the daily home programme on 5+ days per week.",
            "measure": "NPRS, home-programme adherence log",
        },
        {
            "horizon": "6 weeks",
            "goal": "Walk 30 continuous minutes without a next-day symptom flare.",
            "measure": "Walking duration, next-day NPRS",
        },
        {
            "horizon": "12 weeks",
            "goal": "Return to full work and recreational activity with a "
                    "self-managed maintenance programme in place.",
            "measure": "Roland-Morris Disability Questionnaire, patient-reported "
                       "return to activity",
        },
    ]
    flexion = rom.get("lumbar flexion")
    if isinstance(flexion, (int, float)) and not isinstance(flexion, bool):
        goals.insert(1, {
            "horizon": "6 weeks",
            "goal": f"Increase lumbar flexion from {flexion}° toward a pain-free "
                    f"functional range (target {min(int(flexion) + 20, 80)}°).",
            "measure": "Goniometry / fingertip-to-floor distance",
        })
    if radicular:
        goals.insert(0, {
            "horizon": "2 weeks",
            "goal": "Centralise symptoms — leg pain retreats toward the back and "
                    "does not spread further distally.",
            "measure": "Pain location mapping, SLR angle",
        })
    return goals


def _evidence(interventions: list[dict]) -> list[dict]:
    """Resolve each intervention's evidence_ref into a full citation."""
    evidence = []
    seen = set()
    for iv in interventions:
        ref = iv["evidence_ref"]
        if ref in seen:
            continue
        seen.add(ref)
        entry = kb.get(ref)
        if not entry:
            # A missing ref must be visible, never silently dropped.
            evidence.append({"ref": ref, "claim": "[UNCITED]",
                             "citation": kb.cite(ref)})
            continue
        evidence.append({"ref": ref, "claim": entry["claim"],
                         "citation": entry["citation"]})
    return evidence


def _summary(a: dict, plan: dict) -> str:
    lines = [
        f"DRAFT treatment plan for assessment {a['id']} (requires clinician "
        f"sign-off):",
        f"Condition profile: {plan['condition_profile']}.",
        f"Presenting complaint: {a.get('chief_complaint') or 'not stated'}.",
        "",
        "Goals:",
    ]
    lines += [f"  • [{g['horizon']}] {g['goal']} (measure: {g['measure']})"
              for g in plan["goals"]]
    lines += ["", "Interventions:"]
    lines += [f"  • {iv['modality']} — {iv['dose']}. {iv['detail']}"
              for iv in plan["interventions"]]
    if plan["precautions"]:
        lines += ["", "PRECAUTIONS:"]
        lines += [f"  ! {p}" for p in plan["precautions"]]
    lines += ["", "Evidence:"]
    lines += [f"  [{e['ref']}] {e['citation']}" for e in plan["evidence"]]
    lines += ["", "Not a clinical record until approved by a clinician."]
    return "\n".join(lines)


if __name__ == "__main__":
    import sys
    if len(sys.argv) != 2:
        sys.exit("Usage: python3 planning.py <assessment_id>")
    result = submit_plan(sys.argv[1])
    print("\n--- Draft ---\n" + result["summary"])
