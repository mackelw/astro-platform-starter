#!/usr/bin/env python3
"""Jarvis Physio — main brain (orchestrator CLI).

Phase 1: routes intake to the assessment agent and manages the clinician
review queue. Future agents (planning, education, follow-up, content) plug in
here as new commands.
"""
import argparse
import json
import sys

import database as db
import assessment


def cmd_init(_args):
    db.init_db()
    print("✔ Database ready.")


def cmd_patient(args):
    db.init_db()
    pid = db.create_patient(args.name, mrn=args.mrn, dob=args.dob,
                            phone=args.phone, consent=args.consent)
    print(f"✔ Patient created: {pid} ({args.name})")
    if not args.consent:
        print("  ⚠ No consent recorded — do not enter real clinical data yet.")


def cmd_patients(_args):
    db.init_db()
    rows = db.list_patients()
    if not rows:
        print("No patients yet.")
        return
    for r in rows:
        print(f"{r['id']}  {r['name']:<30} mrn={r['mrn'] or '-'}  added {r['created_at']}")


def cmd_assess(args):
    """Assess a patient from a JSON intake file."""
    db.init_db()
    try:
        with open(args.intake_file) as f:
            intake = json.load(f)
    except (OSError, json.JSONDecodeError) as exc:
        sys.exit(f"✘ Cannot read intake file: {exc}")
    if not db.get_patient(args.patient_id):
        sys.exit(f"✘ Unknown patient: {args.patient_id}")
    result = assessment.submit_assessment(args.patient_id, intake)
    print(f"  Assessment ID: {result['assessment_id']}")


def cmd_review(_args):
    db.init_db()
    pending = db.pending_assessments()
    escalated = [a for a in _all_assessments() if a["status"] == "escalated"]
    if not pending and not escalated:
        print("Nothing waiting for review.")
        return
    if escalated:
        print("ESCALATED (red flags — review immediately):")
        for a in escalated:
            flags = ", ".join(f["finding"] for f in json.loads(a["red_flags_json"]))
            print(f"  {a['id']}  {a['patient_name']} — {flags}")
    if pending:
        print("\nPending your approval:")
        for a in pending:
            print(f"  {a['id']}  {a['patient_name']}  — {a['chief_complaint']}")
    print("\nApprove/escalate with: python brain.py approve <id> [--note '...']")


def _all_assessments():
    conn = db.get_conn()
    rows = conn.execute(
        "SELECT a.id, a.status, a.red_flags_json, p.name AS patient_name "
        "FROM assessments a JOIN patients p ON p.id = a.patient_id"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def cmd_approve(args):
    db.init_db()
    existing = db.get_assessment(args.assessment_id)
    if not existing:
        sys.exit(f"✘ Unknown assessment: {args.assessment_id}")
    red_flags = existing.get("red_flags") or []
    if red_flags and not args.note.strip():
        # Approval is recorded, but planning stays locked until the clinician
        # documents what was done about the red flags.
        db.approve_assessment(args.assessment_id, args.note)
        flags = ", ".join(f["finding"] for f in red_flags)
        sys.exit(
            f"⚠ {args.assessment_id} approved, but it carries red flags "
            f"({flags}) and no note. Treatment planning stays BLOCKED until you "
            f"re-approve with a note documenting medical clearance:\n"
            f"  python3 brain.py approve {args.assessment_id} --note '...'"
        )
    db.approve_assessment(args.assessment_id, args.note)
    # Phase 2 hook: treatment planning reads only APPROVED assessments.
    print(f"✔ {args.assessment_id} approved — eligible for treatment planning.")
    if red_flags:
        print(f"  ⚠ {len(red_flags)} red flag(s) carried forward into the plan's "
              f"precautions.")


def _refuse(exc: Exception):
    """Gate failures are expected outcomes, not crashes — report them cleanly."""
    sys.exit(f"✘ {exc}")


def cmd_plan(args):
    """Draft a treatment plan from an APPROVED assessment."""
    import planning
    db.init_db()
    try:
        result = planning.submit_plan(args.assessment_id)
    except (PermissionError, ValueError) as exc:
        _refuse(exc)
    print(f"  Plan ID: {result['plan_id']}")
    print("\n--- Draft ---\n" + result["summary"])


def cmd_plans(_args):
    db.init_db()
    pending = db.pending_plans()
    if not pending:
        print("No plans awaiting approval.")
        return
    for p in pending:
        print(f"  {p['id']}  {p['patient_name']}  — {p['chief_complaint']}")
    print("\nApprove with: python brain.py approve-plan <id> [--note '...']")


def cmd_approve_plan(args):
    db.init_db()
    plan = db.get_treatment_plan(args.plan_id)
    if not plan:
        sys.exit(f"✘ Unknown plan: {args.plan_id}")
    if not plan.get("evidence"):
        sys.exit("✘ Refusing to approve: plan has no cited evidence. "
                 "Add evidence or override in code deliberately.")
    ok = db.approve_plan(args.plan_id, args.note)
    if ok:
        # Phase 3 hook: exercise programming reads only APPROVED plans.
        print(f"✔ {args.plan_id} approved — eligible for exercise programming.")
    else:
        sys.exit(f"✘ Could not approve: {args.plan_id}")


def cmd_programme(args):
    """Draft a home exercise programme from an APPROVED plan."""
    import education
    db.init_db()
    try:
        result = education.submit_programme(args.plan_id)
    except (PermissionError, ValueError, KeyError) as exc:
        _refuse(exc)
    print(f"  Programme ID: {result['programme_id']}")
    print("\n--- Draft ---\n" + result["summary"])


def cmd_programmes(_args):
    db.init_db()
    pending = db.pending_programmes()
    if not pending:
        print("No programmes awaiting release.")
        return
    for p in pending:
        print(f"  {p['id']}  {p['patient_name']}  (plan {p['plan_id']})  — {p['chief_complaint']}")
    print("\nRelease with: python brain.py release <id> [--note '...']")


def cmd_release(args):
    db.init_db()
    prog = db.get_programme(args.programme_id)
    if not prog:
        sys.exit(f"✘ Unknown programme: {args.programme_id}")
    missing_media = [i["exercise_id"] for i in prog.get("items", []) if not i.get("media")]
    if missing_media:
        print(f"⚠ Note: no media for {', '.join(missing_media)} — releasing anyway, "
              f"patient gets written cues only.")
    ok = db.approve_programme(args.programme_id, args.note)
    if ok:
        # Phase 5 hook: follow-up automation sends only RELEASED programmes.
        print(f"✔ {args.programme_id} released to patient — eligible for follow-up (Phase 5).")
    else:
        sys.exit(f"✘ Could not release: {args.programme_id}")


def cmd_draft_post(args):
    """Agent 6: draft marketing content (never publishes)."""
    import content
    db.init_db()
    result = content.submit_post(args.topic, platform=args.platform)
    print(f"  Post ID: {result['post_id']}")
    print("\n--- Draft ---\n" + result["body"])


def cmd_posts(_args):
    db.init_db()
    pending = db.pending_posts()
    if not pending:
        print("No posts awaiting review.")
        return
    for p in pending:
        print(f"  {p['id']}  [{p['platform']}]  {p['topic']}  ({p['created_at']})")
    print("\nApprove: python brain.py approve-post <id> | Reject: ... reject-post <id>")


def cmd_approve_post(args):
    db.init_db()
    post = db.get_post(args.post_id)
    if not post:
        sys.exit(f"✘ Unknown post: {args.post_id}")
    if not post.get("claims"):
        sys.exit("✘ Refusing to approve: post contains no cited claims. "
                 "Edit the draft or reject it.")
    ok = db.set_post_status(args.post_id, "approved", args.note)
    if ok:
        # NOTE: v1 has no platform connection BY DESIGN. Approval records
        # sign-off; a human copies/publishes manually via their own accounts.
        print(f"✔ {args.post_id} approved. No auto-publish exists in this system — "
              f"publish manually from the clinic's own account.")
    else:
        sys.exit(f"✘ Could not approve: {args.post_id}")


def cmd_reject_post(args):
    db.init_db()
    ok = db.set_post_status(args.post_id, "rejected", args.note)
    if ok:
        print(f"✘ {args.post_id} rejected — back to drafts.")
    else:
        sys.exit(f"✘ Unknown post: {args.post_id}")


def cmd_draft_checkin(args):
    """Agent 5: draft a follow-up check-in (consent-gated, no auto-send)."""
    import followup
    db.init_db()
    try:
        result = followup.schedule_checkin(args.patient_id,
                                           programme_id=args.programme_id or None,
                                           days_after=args.days,
                                           kind=args.kind)
    except (PermissionError, ValueError) as exc:
        _refuse(exc)
    print(f"  Follow-up ID: {result['followup_id']}")
    print("\n--- Message draft ---\n" + result["message"])


def cmd_followups(_args):
    db.init_db()
    pending = db.pending_followups()
    queued = db.queued_followups()
    escalated = db.escalated_followups()
    blocked = db.blocked_followups()
    if escalated:
        print("ESCALATED replies (concerning keywords — review now):")
        for f in escalated:
            print(f"  {f['id']}  {f['patient_name']}: \"{f['reply_text']}\"")
    if pending:
        print("\nDrafts awaiting your approval:")
        for f in pending:
            print(f"  {f['id']}  [{f['kind']}]  {f['patient_name']}  (send in {f['scheduled_for']})")
    if queued:
        print("\nQueued in outbox (no transport connected yet):")
        for f in queued:
            print(f"  {f['id']}  [{f['kind']}]  {f['patient_name']}")
    if blocked:
        print("\nBLOCKED — no recorded consent to contact (record consent first):")
        for f in blocked:
            print(f"  {f['id']}  [{f['kind']}]  {f['patient_name']}")
    if not (pending or queued or escalated or blocked):
        print("No follow-ups pending.")
        return
    print("\nApprove+queue: python brain.py approve-followup <id> | "
          "Cancel: ... cancel-followup <id> | "
          "Reply: ... reply <id> \"text\"")


def cmd_approve_followup(args):
    db.init_db()
    try:
        ok = db.approve_followup(args.followup_id, args.note)
    except PermissionError as exc:
        _refuse(exc)
    if ok:
        import followup
        print(f"✔ {args.followup_id} queued. {followup.TRANSPORT_NAME} — "
              f"nothing sends until a transport adapter is configured.")
    else:
        sys.exit(f"✘ Unknown follow-up: {args.followup_id}")


def cmd_cancel_followup(args):
    db.init_db()
    ok = db.cancel_followup(args.followup_id, args.note)
    if ok:
        print(f"✘ {args.followup_id} cancelled.")
    else:
        sys.exit(f"✘ Unknown follow-up: {args.followup_id}")


def cmd_reply(args):
    """Simulate/record an incoming patient reply; auto-escalates on red flags."""
    db.init_db()
    result = db.record_reply(args.followup_id, " ".join(args.text))
    if result["status"] == "escalated":
        print(f"⚠ REPLY ESCALATED — flags: {', '.join(result['flags'])}. Review immediately.")
    else:
        print("✔ Reply recorded.")
    fu = db.get_followup(args.followup_id)
    print(f"  Status: {fu['status']}")


def cmd_outcome(args):
    """Record standardised outcome scores against a follow-up."""
    db.init_db()
    try:
        scores = json.loads(args.scores)
    except json.JSONDecodeError as exc:
        sys.exit(f"✘ Scores must be JSON, e.g. '{{\"NPRS\": 4}}': {exc}")
    try:
        result = db.record_outcome(args.followup_id, scores)
    except ValueError as exc:
        _refuse(exc)
    print(f"✔ Outcome recorded ({result['measures_recorded']} result set(s) "
          f"on file for this follow-up).")


def main():
    parser = argparse.ArgumentParser(description="Jarvis Physio orchestrator")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("init", help="Initialise database").set_defaults(func=cmd_init)

    p = sub.add_parser("patient", help="Register a patient")
    p.add_argument("name"); p.add_argument("--mrn"); p.add_argument("--dob")
    p.add_argument("--phone"); p.add_argument("--consent", action="store_true")
    p.set_defaults(func=cmd_patient)

    sub.add_parser("patients", help="List patients").set_defaults(func=cmd_patients)

    p = sub.add_parser("assess", help="Run assessment from JSON intake file")
    p.add_argument("patient_id"); p.add_argument("intake_file")
    p.set_defaults(func=cmd_assess)

    sub.add_parser("review", help="Show assessments awaiting sign-off").set_defaults(func=cmd_review)

    p = sub.add_parser("approve", help="Clinician approves an assessment")
    p.add_argument("assessment_id"); p.add_argument("--note", default="")
    p.set_defaults(func=cmd_approve)

    p = sub.add_parser("plan", help="Draft treatment plan from an approved assessment")
    p.add_argument("assessment_id")
    p.set_defaults(func=cmd_plan)

    sub.add_parser("plans", help="List plans awaiting approval").set_defaults(func=cmd_plans)

    p = sub.add_parser("approve-plan", help="Clinician approves a treatment plan")
    p.add_argument("plan_id"); p.add_argument("--note", default="")
    p.set_defaults(func=cmd_approve_plan)

    p = sub.add_parser("programme", help="Draft home exercise programme from an approved plan")
    p.add_argument("plan_id")
    p.set_defaults(func=cmd_programme)

    sub.add_parser("programmes", help="List programmes awaiting release").set_defaults(func=cmd_programmes)

    p = sub.add_parser("release", help="Clinician releases a programme to the patient")
    p.add_argument("programme_id"); p.add_argument("--note", default="")
    p.set_defaults(func=cmd_release)

    p = sub.add_parser("draft-post", help="Agent 6 drafts marketing content (never publishes)")
    p.add_argument("topic"); p.add_argument("--platform", default="generic")
    p.set_defaults(func=cmd_draft_post)

    sub.add_parser("posts", help="List posts awaiting review").set_defaults(func=cmd_posts)

    p = sub.add_parser("approve-post", help="Clinician approves a post (manual publish)")
    p.add_argument("post_id"); p.add_argument("--note", default="")
    p.set_defaults(func=cmd_approve_post)

    p = sub.add_parser("reject-post", help="Clinician rejects a post")
    p.add_argument("post_id"); p.add_argument("--note", default="")
    p.set_defaults(func=cmd_reject_post)

    p = sub.add_parser("draft-checkin", help="Agent 5 drafts a patient check-in (consent-gated)")
    p.add_argument("patient_id")
    p.add_argument("--programme", dest="programme_id", default=None)
    p.add_argument("--days", type=int, default=7)
    p.add_argument("--kind", choices=("checkin", "outcome"), default="checkin")
    p.set_defaults(func=cmd_draft_checkin)

    sub.add_parser("followups", help="Follow-ups: drafts, outbox, escalations").set_defaults(func=cmd_followups)

    p = sub.add_parser("approve-followup", help="Approve + queue a check-in")
    p.add_argument("followup_id"); p.add_argument("--note", default="")
    p.set_defaults(func=cmd_approve_followup)

    p = sub.add_parser("cancel-followup", help="Cancel a follow-up")
    p.add_argument("followup_id"); p.add_argument("--note", default="")
    p.set_defaults(func=cmd_cancel_followup)

    p = sub.add_parser("reply", help="Record an incoming patient reply (auto-escalates)")
    p.add_argument("followup_id"); p.add_argument("text", nargs="+")
    p.set_defaults(func=cmd_reply)

    p = sub.add_parser("outcome", help="Record outcome scores, e.g. '{\"NPRS\": 4}'")
    p.add_argument("followup_id"); p.add_argument("scores")
    p.set_defaults(func=cmd_outcome)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
