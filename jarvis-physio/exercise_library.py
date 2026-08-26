"""Clinic exercise library.

The single source of truth for what the education agent is allowed to
prescribe. Nothing may be handed to a patient that is not defined here:
every exercise carries its own cues, default dosage, safety caution and an
evidence_ref into knowledge_base.

Media (video/images) live on disk under library/media/<exercise-id>/ and are
resolved at read time — so adding a video is a file drop, not a code change.
"""
import copy
from pathlib import Path

import knowledge_base as kb

MEDIA_ROOT = Path(__file__).parent / "library" / "media"
_MEDIA_SUFFIXES = {".mp4", ".mov", ".webm", ".gif", ".jpg", ".jpeg", ".png", ".svg"}

# id -> definition. dosage_default may carry a "caution" key, which the
# education agent lifts out into the programme's safety notes.
#
# precaution_guidance maps a precaution keyword to what it means FOR THIS
# EXERCISE. An exercise a precaution does not affect simply omits the key, so
# a plan-level precaution never becomes a blanket note pasted onto everything.
_EXERCISES: dict[str, dict] = {
    "bird-dog": {
        "name": "Bird-dog",
        "category": "motor control",
        "cues": [
            "Start on hands and knees, hands under shoulders, knees under hips.",
            "Draw the lower ribs gently down — keep the spine still, not arched.",
            "Reach one arm forward and the opposite leg back, only as far as you "
            "can go without the hips rocking.",
            "Hold 3-5 seconds, return under control, then swap sides.",
        ],
        "dosage_default": {"sets": 2, "reps": 8, "frequency": "daily",
                           "tempo": "slow, 3-5s hold each side"},
        "education_point": "Control beats effort here — a small, steady reach with "
                           "a still spine does more than a big wobbly one.",
        "evidence_ref": "NICE-NG59-exercise",
        "precaution_guidance": {
            "flexion": "Keep the spine neutral throughout — do not let the back "
                       "round or sag as you reach.",
        },
        "tags": ["low back pain", "motor control", "core"],
    },
    "glute-bridge": {
        "name": "Glute bridge",
        "category": "strength",
        "cues": [
            "Lie on your back, knees bent, feet flat and hip-width apart.",
            "Push through your heels and lift your hips until your body makes a "
            "straight line from knee to shoulder.",
            "Squeeze the glutes at the top — don't arch the lower back to get higher.",
            "Lower slowly, one vertebra at a time.",
        ],
        "dosage_default": {"sets": 3, "reps": 10, "frequency": "daily",
                           "caution": "Stop if you feel pinching in the lower back "
                                      "rather than work in the buttocks."},
        "education_point": "Strong hips take load off the lower back — this is the "
                           "exercise most people under-do.",
        "evidence_ref": "NICE-NG59-exercise",
        "precaution_guidance": {},   # hip extension: a flexion precaution does not apply
        "tags": ["low back pain", "strength", "hip"],
    },
    "walking-programme": {
        "name": "Graded walking programme",
        "category": "graded activity",
        "cues": [
            "Walk at a comfortable pace on flat ground to start.",
            "Begin at a duration you know you can manage without a flare-up.",
            "Add roughly 10% per week — time first, then pace or terrain.",
            "A mild increase in symptoms that settles within an hour is acceptable; "
            "pain that lingers to the next day means you went too far.",
        ],
        "dosage_default": {"minutes": 10, "frequency": "daily",
                           "progression": "+10% duration per week"},
        "education_point": "Consistency beats intensity. A short daily walk builds "
                           "tolerance faster than one long walk a week.",
        "evidence_ref": "Cochrane-graded-activity",
        "precaution_guidance": {
            "flexion": "Break up long periods of sitting on either side of your "
                       "walk — sitting, not walking, is the flexion load here.",
        },
        "tags": ["low back pain", "graded activity", "aerobic"],
    },
    "nerve-glider": {
        "name": "Sciatic nerve glider (slump slider)",
        "category": "neural mobilisation",
        "cues": [
            "Sit tall on a chair, hands resting on your thighs.",
            "As you straighten the affected leg, look up and lift your chin.",
            "As you lower the leg, tuck the chin to the chest.",
            "Move slowly and rhythmically — this is a glide, not a stretch.",
        ],
        "dosage_default": {"sets": 2, "reps": 10, "frequency": "twice daily",
                           "caution": "Should ease symptoms, never provoke them. "
                                      "Stop immediately if leg pain, numbness or "
                                      "weakness increases or spreads further down "
                                      "the leg."},
        "education_point": "This is meant to feel like gentle movement of the nerve, "
                           "not a stretch. If it makes the leg worse, stop and tell "
                           "your physiotherapist.",
        "evidence_ref": "Nerve-glide-sciatica",
        "precaution_guidance": {
            # This movement uses spinal flexion by design — a blanket "avoid
            # flexion" note would contradict the exercise itself.
            "flexion": "This glide uses controlled spinal flexion deliberately. "
                       "Stay mid-range and pain-free rather than pushing into it.",
        },
        "tags": ["sciatica", "neural mobilisation", "leg pain"],
    },
}


def get_exercise(exercise_id: str) -> dict:
    """Return an exercise definition with live media attached.

    Raises KeyError for unknown ids — an unknown exercise must never silently
    become an empty prescription.
    """
    if exercise_id not in _EXERCISES:
        raise KeyError(
            f"Unknown exercise '{exercise_id}'. Known: {', '.join(sorted(_EXERCISES))}"
        )
    ex = copy.deepcopy(_EXERCISES[exercise_id])
    ex["id"] = exercise_id
    ex["media"] = _media_for(exercise_id)
    ex["citation"] = kb.cite(ex["evidence_ref"])
    return ex


def list_exercises(tag: str | None = None) -> list[dict]:
    """All exercises, optionally filtered by tag."""
    ids = sorted(_EXERCISES)
    if tag:
        t = tag.lower()
        ids = [i for i in ids if any(t in x for x in _EXERCISES[i]["tags"])]
    return [get_exercise(i) for i in ids]


def _media_for(exercise_id: str) -> list[str]:
    """Media files on disk for an exercise, as repo-relative paths."""
    folder = MEDIA_ROOT / exercise_id
    if not folder.is_dir():
        return []
    return sorted(
        str(f.relative_to(MEDIA_ROOT.parent.parent))
        for f in folder.iterdir()
        if f.is_file() and f.suffix.lower() in _MEDIA_SUFFIXES
    )


def missing_media() -> list[str]:
    """Exercise ids with no media on disk — a clinic to-do list."""
    return [eid for eid in sorted(_EXERCISES) if not _media_for(eid)]


def validate() -> list[str]:
    """Check every exercise cites a real knowledge_base entry."""
    problems = []
    for eid, ex in _EXERCISES.items():
        if not kb.get(ex["evidence_ref"]):
            problems.append(f"{eid}: evidence_ref '{ex['evidence_ref']}' not in knowledge base")
        if not ex.get("cues"):
            problems.append(f"{eid}: no cues")
        if not ex.get("education_point"):
            problems.append(f"{eid}: no education point")
        if "precaution_guidance" not in ex:
            problems.append(f"{eid}: no precaution_guidance mapping (use {{}} if "
                            f"no precaution changes this exercise)")
    return problems


if __name__ == "__main__":
    issues = validate()
    print(f"{len(_EXERCISES)} exercises. Validation: "
          f"{'OK' if not issues else chr(10).join(issues)}")
    for ex in list_exercises():
        media = f"{len(ex['media'])} file(s)" if ex["media"] else "NO MEDIA"
        print(f"  {ex['id']:<20} {ex['name']:<38} {media}")
    gaps = missing_media()
    if gaps:
        print(f"\nMedia to record: {', '.join(gaps)}")
