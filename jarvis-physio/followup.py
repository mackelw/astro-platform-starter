"""Agent 5 — Follow-up & Outcomes.

Drafts patient check-in messages and outcome-measure requests. Three rules
this agent does not bend:

  1. CONSENT GATE. No message is drafted for a patient who has not recorded
     consent to be contacted. Such requests are saved as 'blocked_no_consent'
     so the refusal is visible in the queue rather than silently dropped.
  2. NO AUTO-SEND. Approval moves a draft into an outbox, nothing more. There
     is no transport adapter wired in — send_queued() refuses by design, and
     only a real adapter may call db.mark_sent().
  3. SAFETY NETTING. Every patient-facing message states what to do if things
     get worse and makes clear the channel is not monitored in an emergency.

Incoming replies are screened for concerning keywords by db.record_reply(),
which escalates them to the clinician queue automatically.
"""
from datetime import date, timedelta

import database as db

# Displayed wherever the system might be mistaken for something that sends.
TRANSPORT_NAME = "Transport: none configured (outbox only)"

# Standardised measures requested at each check-in.
_OUTCOME_MEASURES = [
    {"code": "NPRS", "name": "Numeric Pain Rating Scale",
     "prompt": "On a scale of 0-10, what is your worst pain in the last 24 hours? "
               "(0 = no pain, 10 = worst imaginable)"},
    {"code": "ADHERENCE", "name": "Home programme adherence",
     "prompt": "On how many of the last 7 days did you do your exercises?"},
    {"code": "GROC", "name": "Global Rating of Change",
     "prompt": "Compared with when we started, are you: much better, a little "
               "better, about the same, a little worse, or much worse?"},
]

_SAFETY_NETTING = (
    "If you develop any of these, do not wait for your next appointment — "
    "contact your GP or attend A&E: numbness around the groin or inner thighs, "
    "loss of bladder or bowel control, worsening weakness in a leg, or severe "
    "pain that will not settle."
)

_CHANNEL_NOTICE = (
    "Please note: replies to this message are read during clinic hours only and "
    "are not monitored in an emergency."
)


def schedule_checkin(patient_id: str, programme_id: str | None = None,
                     days_after: int = 7, kind: str = "checkin") -> dict:
    """Draft a check-in for clinician approval. Consent-gated, never sent."""
    db.init_db()
    if kind not in ("checkin", "outcome"):
        raise ValueError(f"kind must be 'checkin' or 'outcome', got '{kind}'")
    patient = db.get_patient(patient_id)
    if not patient:
        raise ValueError(f"Unknown patient: {patient_id}")

    programme = db.get_programme(programme_id) if programme_id else None
    if programme_id and not programme:
        raise ValueError(f"Unknown programme: {programme_id}")
    # Only a released programme may be referenced in patient-facing text.
    if programme and programme["status"] != "released":
        raise PermissionError(
            f"{programme_id} has status '{programme['status']}' — a programme must "
            f"be released to the patient before it can be followed up on."
        )

    scheduled_for = (date.today() + timedelta(days=max(days_after, 0))).isoformat()
    message = _compose(patient, programme, kind)

    # CONSENT GATE: draft is recorded but blocked, not queued.
    if not patient.get("consent_given"):
        fu_id = db.save_followup(
            patient_id, programme_id, kind, message,
            scheduled_for=scheduled_for, outcome_measures=[],
            status="blocked_no_consent",
        )
        print(f"[followup] ⚠ {fu_id} BLOCKED — {patient['name']} has no recorded "
              f"consent to be contacted. Record consent before approving.")
        return {"followup_id": fu_id, "message": message,
                "status": "blocked_no_consent", "scheduled_for": scheduled_for}

    # outcome_measures holds recorded RESULTS, not the questions asked — the
    # questions are in the message text. Starting non-empty would inflate every
    # later count of how many results came back.
    fu_id = db.save_followup(
        patient_id, programme_id, kind, message,
        scheduled_for=scheduled_for, outcome_measures=[],
    )
    print(f"[followup] Saved {fu_id} — pending_review, scheduled for "
          f"{scheduled_for}. {TRANSPORT_NAME}.")
    return {"followup_id": fu_id, "message": message,
            "status": "pending_review", "scheduled_for": scheduled_for}


def send_queued() -> dict:
    """Deliberate no-op: there is no transport adapter in this build.

    A real adapter would take each queued follow-up, deliver it over its own
    channel, and call db.mark_sent(followup_id, transport). Until one exists
    this refuses rather than pretending to send.
    """
    queued = db.queued_followups()
    print(f"[followup] {len(queued)} follow-up(s) in the outbox. {TRANSPORT_NAME} "
          f"— nothing was sent. Wire a transport adapter and have it call "
          f"db.mark_sent() after real delivery.")
    return {"queued": len(queued), "sent": 0, "transport": None}


# ------------------------------------------------------------------ helpers

def _compose(patient: dict, programme: dict | None, kind: str) -> str:
    first_name = (patient.get("name") or "there").split()[0]
    lines = [f"Hi {first_name},", ""]

    if kind == "outcome":
        lines.append(
            "It's time for your progress review. Answering these three questions "
            "takes a minute and tells us whether your plan is working or needs "
            "changing:"
        )
    else:
        lines.append(
            "Just checking in on how you're getting on since your last "
            "appointment."
        )

    if programme:
        n_items = len(programme.get("items") or [])
        lines.append("")
        lines.append(
            f"You have {n_items} exercise{'s' if n_items != 1 else ''} in your home "
            f"programme. A quick reminder that some days will feel harder than "
            f"others — that's normal, and it isn't a sign of damage."
        )

    lines += ["", "When you have a moment:"]
    lines += [f"  {i}. {m['prompt']}" for i, m in enumerate(_OUTCOME_MEASURES, 1)]
    lines += ["", _SAFETY_NETTING, "", _CHANNEL_NOTICE, "",
              "Thanks,", "The clinic team"]
    return "\n".join(lines)


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        sys.exit("Usage: python3 followup.py <patient_id> [programme_id] [days]")
    pid = sys.argv[1]
    prog = sys.argv[2] if len(sys.argv) > 2 else None
    days = int(sys.argv[3]) if len(sys.argv) > 3 else 7
    result = schedule_checkin(pid, programme_id=prog, days_after=days)
    print("\n--- Message draft ---\n" + result["message"])
