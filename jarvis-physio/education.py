"""Agent 4 — Exercise & Patient Education.

Builds a home exercise programme (HEP) from an APPROVED treatment plan only
(hard gate). Selects exercises from the clinic library, tailors dosage to the
plan's precautions, and attaches patient-education points, each traceable to
cited evidence. Programmes require clinician release before they would be
sent anywhere (Phase 5 follow-up agent).
"""
import database as db
import exercise_library as lib


# Selection rules: condition profile -> ordered candidate list.
_SELECTION: dict[str, list[str]] = {
    "low back pain": ["bird-dog", "glute-bridge", "walking-programme"],
}

# Precaution-driven additions: exercises added when a precaution applies.
_NEURO_EXTRAS = ["nerve-glider"]


def create_programme(plan_id: str) -> dict:
    db.init_db()
    plan = db.get_treatment_plan(plan_id)
    if not plan:
        raise ValueError(f"Unknown plan: {plan_id}")

    # HARD GATE: only approved plans enter the education pipeline.
    if plan["status"] != "approved":
        raise PermissionError(
            f"{plan_id} has status '{plan['status']}' — programme building "
            f"requires clinician approval of the plan first. Nothing drafted."
        )

    precautions = plan.get("precautions") or []
    profile = plan.get("condition_profile") or ""
    candidates = _select_exercises(profile, precautions)
    if not candidates:
        raise ValueError(
            f"No library coverage for condition '{profile}'. "
            f"Add exercises to the clinic library before drafting."
        )

    items = [_build_item(eid, precautions) for eid in candidates]

    education = {
        "condition_brief": (
            "Your back pain is real but rarely dangerous. Staying active and "
            "gradually rebuilding strength is the fastest route to recovery. "
            "Sharp worsening pain, spreading numbness, or bladder/bowel changes "
            "mean contact the clinic immediately."),
        "points": [lib.get_exercise(eid)["education_point"] for eid in candidates],
        "evidence_refs": sorted({i["evidence_ref"] for i in items}),
        "precautions": precautions,
        "media_note": _media_note(candidates),
    }
    summary = _summary(plan, items)

    return {"items": items, "education": education, "summary": summary}


def submit_programme(plan_id: str) -> dict:
    prog = create_programme(plan_id)
    prog_id = db.save_programme(plan_id, prog)
    print(f"[education] Saved {prog_id} for plan {plan_id} — awaiting clinician release.")
    return {"programme_id": prog_id, **prog}


# ------------------------------------------------------------------ helpers

def _select_exercises(profile: str, precautions: list[str]) -> list[str]:
    """Base selection for the condition, plus any precaution-driven additions."""
    key = next((k for k in _SELECTION if k in profile.lower()), None)
    selected = list(_SELECTION.get(key, []))
    if not selected:
        return selected
    # Nerve involvement -> add neural mobilisation, which carries its own
    # stop rules in the exercise library.
    if any("neurological" in p.lower() for p in precautions):
        selected += [eid for eid in _NEURO_EXTRAS if eid not in selected]
    return selected


def _build_item(exercise_id: str, precautions: list[str]) -> dict:
    ex = lib.get_exercise(exercise_id)
    dosage = dict(ex["dosage_default"])
    notes = []
    if any("flexion" in p.lower() for p in precautions):
        notes.append("Avoid end-range lumbar flexion during this exercise.")
    if dosage.get("caution"):
        notes.append(dosage.pop("caution"))
    return {
        "exercise_id": exercise_id,
        "name": ex["name"],
        "cues": ex["cues"],
        "dosage": dosage,
        "safety_notes": notes,
        "media": ex["media"],
        "evidence_ref": ex["evidence_ref"],
    }


def _media_note(candidate_ids: list[str]) -> str:
    missing = [eid for eid in candidate_ids if not lib._media_for(eid)]
    if not missing:
        return "All exercises include clinic media."
    names = ", ".join(lib.get_exercise(m)["name"] for m in missing)
    return (f"No video/image yet for: {names}. Add files under "
            f"library/media/<exercise-id>/ and re-release.")


def _dose_label(dosage: dict) -> str:
    """Human-readable dose: rep-based and time-based exercises read differently."""
    if dosage.get("sets") and dosage.get("reps"):
        label = f"{dosage['sets']}x{dosage['reps']}"
    elif dosage.get("minutes"):
        label = f"{dosage['minutes']} min"
    elif dosage.get("reps"):
        label = f"{dosage['reps']} reps"
    else:
        label = "see cues"
    if dosage.get("frequency"):
        label += f", {dosage['frequency']}"
    return label


def _summary(plan: dict, items: list[dict]) -> str:
    lines = [
        f"DRAFT home exercise programme based on approved plan {plan['id']} "
        f"— {len(items)} exercises.",
    ]
    for it in items:
        lines.append(f"  • {it['name']} ({_dose_label(it['dosage'])})")
    n_media = sum(1 for i in items if i["media"])
    lines.append(f"Media attached: {n_media}/{len(items)}.")
    lines.append("Requires clinician release before sending to patient (Phase 5).")
    return "\n".join(lines)


if __name__ == "__main__":
    import sys
    if len(sys.argv) != 2:
        sys.exit("Usage: python3 education.py <treatment_plan_id>")
    result = submit_programme(sys.argv[1])
    print("\n--- Programme draft ---\n" + result["summary"])
