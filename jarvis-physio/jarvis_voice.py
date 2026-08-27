"""J.A.R.V.I.S. — voice command router across all six agents.

One natural-language surface over the whole pipeline. This module is pure
logic: text in, structured response out. It does no audio, no HTTP and no
printing, so it can be tested directly.

WHAT VOICE MAY AND MAY NOT DO
-----------------------------
Voice can read anything and draft anything. Drafts are safe because every
one of them still lands in a queue behind a clinician gate.

Voice may NOT give clinical sign-off — approving an assessment or plan,
releasing a programme to a patient, queueing a message, or approving a post.
Those acts attribute clinical and legal responsibility to a named clinician,
and a speech-recognition transcript is not authentication: the room is shared,
the mic hears the radio, and "approve plan" and "approve plan for Jane" are
one mis-heard word apart. Sign-off stays on the typed CLI, where the operator
names the record and writes the note.

VOICE_SIGNOFF_ENABLED flips that. It is a deliberate governance decision, not
a convenience toggle — leave it False unless you have a way to authenticate
the speaker and you accept that a misrecognition can release a document to a
patient.
"""
import re
from datetime import date

import database as db

VOICE_SIGNOFF_ENABLED = False

WAKE_WORDS = ("jarvis", "hey jarvis", "ok jarvis", "yo jarvis")

# Spoken numbers — "in seven days" is far more natural than "in 7 days".
_NUMBER_WORDS = {
    "zero": 0, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
    "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10, "eleven": 11,
    "twelve": 12, "fourteen": 14, "twenty": 20, "twenty one": 21,
    "thirty": 30, "a": 1, "an": 1,
}

# Verbs that constitute clinical sign-off. Recognised precisely so they can be
# refused with a useful answer rather than falling through to "I didn't catch that".
_SIGNOFF_VERBS = (
    "approve", "approved", "approving", "sign off", "signoff", "sign-off",
    "authorise", "authorize", "release", "publish", "send", "dispatch",
    "green light", "greenlight", "okay it", "ok it",
)


class Response:
    """What Jarvis says, what the HUD shows, and how alarming it is."""

    def __init__(self, speech: str, title: str = "", lines: list | None = None,
                 level: str = "ok", intent: str = "unknown"):
        self.speech = speech
        self.title = title
        self.lines = lines or []
        self.level = level          # ok | warn | refuse | error
        self.intent = intent

    def as_dict(self) -> dict:
        return {"speech": self.speech, "title": self.title, "lines": self.lines,
                "level": self.level, "intent": self.intent}


def handle(utterance: str) -> dict:
    """Route one spoken utterance. Always returns a response — never raises."""
    try:
        return _route(_normalise(utterance)).as_dict()
    except Exception as exc:                      # a voice UI must never 500
        return Response(
            f"Something went wrong handling that. {exc}",
            title="ERROR", level="error", intent="error",
        ).as_dict()


# ---------------------------------------------------------------- normalising

def _normalise(text: str) -> str:
    t = (text or "").strip().lower()
    t = re.sub(r"[^\w\s\-\.]", " ", t)            # keep hyphens and file dots
    t = re.sub(r"\s+", " ", t).strip()
    for wake in sorted(WAKE_WORDS, key=len, reverse=True):
        if t.startswith(wake):
            t = t[len(wake):].strip()
            break
    # Dictation inserts punctuation ("Jarvis... system status"), so clear any
    # leading separators the wake word left behind.
    return t.lstrip(" ,.;:-").strip()


def _spoken_number(text: str, default: int) -> int:
    digits = re.search(r"\b(\d+)\b", text)
    if digits:
        return int(digits.group(1))
    for word, value in sorted(_NUMBER_WORDS.items(), key=lambda kv: -len(kv[0])):
        if re.search(rf"\b{re.escape(word)}\b", text):
            return value
    return default


# ------------------------------------------------------------------- routing

def _route(t: str) -> Response:
    if not t:
        return Response("Standing by.", title="STANDBY", intent="idle")

    # Sign-off is checked FIRST, before any other intent can match it.
    signoff = _detect_signoff(t)
    if signoff:
        return signoff

    for matcher, handler in _ROUTES:
        m = re.search(matcher, t)
        if m:
            return handler(t, m)

    return Response(
        "I didn't catch a command I recognise. Try: system status, review "
        "queue, draft a plan for a patient, or read me the precautions.",
        title="UNRECOGNISED", lines=[f'heard: "{t}"'],
        level="warn", intent="unknown",
    )


def _detect_signoff(t: str) -> Response | None:
    if not any(re.search(rf"\b{re.escape(v)}\b", t) for v in _SIGNOFF_VERBS):
        return None
    if VOICE_SIGNOFF_ENABLED:
        return None                                # routed on to normal handling
    return Response(
        "I can't sign that off by voice. Clinical approval has to be typed, so "
        "the record carries your note and not my transcription. I've left it in "
        "the queue for you.",
        title="SIGN-OFF WITHHELD",
        lines=[
            "Voice may read and draft. It may not approve, release, queue or",
            "publish — those attribute clinical responsibility to you.",
            "",
            "Use the terminal:",
            "  python3 brain.py approve <AS-ID>       --note '...'",
            "  python3 brain.py approve-plan <TP-ID>  --note '...'",
            "  python3 brain.py release <EP-ID>       --note '...'",
            "  python3 brain.py approve-followup <FU-ID>",
            "  python3 brain.py approve-post <CP-ID>",
        ],
        level="refuse", intent="signoff_refused",
    )


# ------------------------------------------------------------ patient lookup

def _resolve_patient(fragment: str):
    """Find one patient by spoken name or id. Returns (patient, Response|None).

    Voice never quotes a patient id reliably, so names are the primary key
    here and ambiguity is reported rather than guessed at.
    """
    frag = (fragment or "").strip()
    if not frag:
        return None, Response("Which patient?", title="NEED A NAME",
                              level="warn", intent="need_patient")

    id_match = re.search(r"\bpt[\s-]?([a-z0-9]{8})\b", frag)
    if id_match:
        patient = db.get_patient(f"PT-{id_match.group(1).upper()}")
        if patient:
            return patient, None

    rows = db.list_patients()
    hits = [r for r in rows if frag in (r["name"] or "").lower()]
    if not hits:                                   # try individual words
        words = [w for w in frag.split() if len(w) > 2]
        hits = [r for r in rows
                if any(w in (r["name"] or "").lower() for w in words)]

    if not hits:
        return None, Response(
            f"I have no patient matching {frag}.",
            title="NO MATCH", lines=[f"{len(rows)} patient(s) on file"],
            level="warn", intent="no_patient")
    if len(hits) > 1:
        return None, Response(
            f"{len(hits)} patients match {frag}. Which one?",
            title="AMBIGUOUS",
            lines=[f"  {h['name']}  ({h['id']})" for h in hits],
            level="warn", intent="ambiguous_patient")
    return db.get_patient(hits[0]["id"]), None


def _after(t: str, *keywords: str) -> str:
    """Text following the last of any keyword — the spoken patient name."""
    for kw in keywords:
        m = re.search(rf"\b{kw}\s+(.+)$", t)
        if m:
            tail = m.group(1)
            tail = re.sub(r"\b(please|now|thanks|thank you)\b", "", tail)
            tail = re.sub(r"\bin \w+ days?\b", "", tail)
            return tail.strip()
    return ""


# ------------------------------------------------------------------ handlers

def _h_status(t, m) -> Response:
    pending_a = db.pending_assessments()
    escalated = [a for a in _all_assessments() if a["status"] == "escalated"]
    plans = db.pending_plans()
    progs = db.pending_programmes()
    posts = db.pending_posts()
    fu_pending = db.pending_followups()
    fu_esc = db.escalated_followups()
    fu_blocked = db.blocked_followups()
    patients = db.list_patients()

    urgent = len(escalated) + len(fu_esc)
    if urgent:
        speech = (f"Attention. {urgent} item{'s' if urgent != 1 else ''} "
                  f"{'need' if urgent != 1 else 'needs'} "
                  f"you now: {len(escalated)} escalated assessment"
                  f"{'s' if len(escalated) != 1 else ''} and {len(fu_esc)} "
                  f"escalated repl{'ies' if len(fu_esc) != 1 else 'y'}.")
        level = "warn"
    else:
        waiting = len(pending_a) + len(plans) + len(progs) + len(posts) + len(fu_pending)
        speech = (f"All systems nominal. {len(patients)} patients on file, "
                  f"{waiting} item{'s' if waiting != 1 else ''} awaiting your "
                  f"sign-off." if waiting else
                  f"All systems nominal. {len(patients)} patients on file and "
                  f"nothing waiting on you.")
        level = "ok"

    return Response(
        speech, title="SYSTEM STATUS",
        lines=[
            f"  patients            {len(patients)}",
            f"  escalated           {len(escalated) + len(fu_esc)}",
            f"  assessments pending {len(pending_a)}",
            f"  plans pending       {len(plans)}",
            f"  programmes pending  {len(progs)}",
            f"  follow-ups pending  {len(fu_pending)}",
            f"  follow-ups blocked  {len(fu_blocked)}",
            f"  posts pending       {len(posts)}",
        ],
        level=level, intent="status")


def _h_escalations(t, m) -> Response:
    escalated = [a for a in _all_assessments() if a["status"] == "escalated"]
    replies = db.escalated_followups()
    if not escalated and not replies:
        return Response("Nothing escalated. You're clear.",
                        title="ESCALATIONS — CLEAR", intent="escalations")
    lines = []
    for a in escalated:
        import json
        flags = ", ".join(f["finding"] for f in json.loads(a["red_flags_json"]))
        lines.append(f"  {a['id']}  {a['patient_name']} — {flags}")
    for r in replies:
        lines.append(f"  {r['id']}  {r['patient_name']} replied: \"{r['reply_text']}\"")
    total = len(escalated) + len(replies)
    return Response(
        f"{total} escalation{'s' if total != 1 else ''}. Review immediately.",
        title="ESCALATIONS", lines=lines, level="warn", intent="escalations")


def _h_patients(t, m) -> Response:
    rows = db.list_patients()
    if not rows:
        return Response("No patients on file yet.", title="PATIENTS",
                        intent="patients")
    return Response(
        f"{len(rows)} patient{'s' if len(rows) != 1 else ''} on file.",
        title="PATIENTS",
        lines=[f"  {r['name']:<24} {r['id']}  mrn={r['mrn'] or '-'}" for r in rows],
        intent="patients")


def _h_queue(t, m) -> Response:
    pending = db.pending_assessments()
    plans = db.pending_plans()
    progs = db.pending_programmes()
    lines = []
    for a in pending:
        lines.append(f"  ASSESS  {a['id']}  {a['patient_name']} — {a['chief_complaint']}")
    for p in plans:
        lines.append(f"  PLAN    {p['id']}  {p['patient_name']}")
    for p in progs:
        lines.append(f"  PROG    {p['id']}  {p['patient_name']}")
    total = len(lines)
    if not total:
        return Response("Your review queue is empty.", title="REVIEW QUEUE",
                        intent="queue")
    return Response(
        f"{total} item{'s' if total != 1 else ''} waiting on your sign-off.",
        title="REVIEW QUEUE", lines=lines, intent="queue")


def _h_assess(t, m) -> Response:
    import json
    from pathlib import Path
    import assessment

    name = _after(t, "assess", "assessment for", "assessment on")
    name = re.sub(r"\b(from|using|with)\b.*$", "", name).strip()
    patient, err = _resolve_patient(name)
    if err:
        return err

    intake_dir = Path(__file__).parent / "intakes"
    files = sorted(intake_dir.glob("*.json")) if intake_dir.is_dir() else []
    if not files:
        return Response(
            "There are no intake files to work from. Intake is structured "
            "clinical data — it needs to be entered by hand, not dictated.",
            title="NO INTAKE", level="warn", intent="assess")

    surname = (patient["name"].split()[-1]).lower()
    match = next((f for f in files if surname in f.stem.lower()), None)
    spoken_file = re.search(r"\b(?:from|using)\s+(?:intake\s+)?([\w\-\.]+)", t)
    if spoken_file:
        token = spoken_file.group(1).replace(".json", "").lower()
        match = next((f for f in files if token in f.stem.lower()), match)
    if not match:
        return Response(
            f"I can't find an intake file for {patient['name']}.",
            title="NO INTAKE MATCH",
            lines=[f"  available: {f.name}" for f in files],
            level="warn", intent="assess")

    intake = json.loads(match.read_text())
    result = assessment.submit_assessment(patient["id"], intake)
    flags = result["red_flags"]
    if flags:
        return Response(
            f"Red flags on {patient['name']}. {len(flags)} finding"
            f"{'s' if len(flags) != 1 else ''}. This is escalated and treatment "
            f"planning is blocked. {flags[0]['action']}.",
            title="RED FLAGS — ESCALATED",
            lines=[f"  {f['finding']}: {f['action']}" for f in flags],
            level="warn", intent="assess")
    return Response(
        f"Assessment drafted for {patient['name']}. It's in your queue for "
        f"sign-off — I can't approve it myself.",
        title="ASSESSMENT DRAFTED",
        lines=[f"  {result['assessment_id']}  {patient['name']}", "",
               *result["summary"].splitlines()],
        intent="assess")


def _h_plan(t, m) -> Response:
    import planning
    name = _after(t, "plan for", "plan on", "planning for", "treatment plan for")
    patient, err = _resolve_patient(name)
    if err:
        return err
    aid = _latest_assessment(patient["id"], status="approved")
    if not aid:
        return Response(
            f"{patient['name']} has no approved assessment. I can't plan from "
            f"an unapproved one — that gate isn't mine to open.",
            title="GATE — NOT APPROVED", level="warn", intent="plan")
    try:
        result = planning.submit_plan(aid)
    except PermissionError as exc:
        return Response(f"Blocked. {exc}".split("\n")[0], title="GATE — BLOCKED",
                        lines=str(exc).splitlines(), level="refuse", intent="plan")
    except ValueError as exc:
        return Response(str(exc), title="CANNOT PLAN", level="warn", intent="plan")
    return Response(
        f"Treatment plan drafted for {patient['name']}: "
        f"{result['condition_profile']}, {len(result['interventions'])} "
        f"interventions, {len(result['precautions'])} precautions. Pending your "
        f"approval.",
        title="PLAN DRAFTED",
        lines=[f"  {result['plan_id']}", "", *result["summary"].splitlines()],
        intent="plan")


def _h_programme(t, m) -> Response:
    import education
    name = _after(t, "programme for", "program for", "exercises for",
                  "exercise programme for", "hep for")
    patient, err = _resolve_patient(name)
    if err:
        return err
    plan_id = _latest_plan(patient["id"], status="approved")
    if not plan_id:
        return Response(
            f"{patient['name']} has no approved treatment plan. Programme "
            f"building needs one first.",
            title="GATE — NO APPROVED PLAN", level="warn", intent="programme")
    try:
        result = education.submit_programme(plan_id)
    except (PermissionError, ValueError, KeyError) as exc:
        return Response(str(exc), title="CANNOT BUILD", level="warn",
                        intent="programme")
    names = ", ".join(i["name"] for i in result["items"])
    return Response(
        f"Programme drafted for {patient['name']}: {len(result['items'])} "
        f"exercises — {names}. It needs your release before the patient sees it.",
        title="PROGRAMME DRAFTED",
        lines=[f"  {result['programme_id']}", "", *result["summary"].splitlines()],
        intent="programme")


def _h_precautions(t, m) -> Response:
    name = _after(t, "precautions for", "precautions on", "cautions for",
                  "warnings for")
    patient, err = _resolve_patient(name)
    if err:
        return err
    plan_id = _latest_plan(patient["id"])
    if not plan_id:
        return Response(f"{patient['name']} has no treatment plan yet.",
                        title="NO PLAN", level="warn", intent="precautions")
    plan = db.get_treatment_plan(plan_id)
    precautions = plan.get("precautions") or []
    if not precautions:
        return Response(f"No precautions recorded for {patient['name']}.",
                        title="PRECAUTIONS — NONE", intent="precautions")
    return Response(
        f"{len(precautions)} precaution{'s' if len(precautions) != 1 else ''} "
        f"for {patient['name']}. " + " ".join(precautions),
        title="PRECAUTIONS",
        lines=[f"  ! {p}" for p in precautions],
        level="warn", intent="precautions")


def _h_checkin(t, m) -> Response:
    import followup
    name = _after(t, "check in on", "check-in on", "check in with", "follow up on",
                  "follow-up on", "checkin on", "check on")
    patient, err = _resolve_patient(name)
    if err:
        return err
    days = _spoken_number(t, 7)
    prog_id = _latest_programme(patient["id"], status="released")
    try:
        result = followup.schedule_checkin(patient["id"], programme_id=prog_id,
                                           days_after=days)
    except (PermissionError, ValueError) as exc:
        return Response(str(exc), title="CANNOT DRAFT", level="warn",
                        intent="checkin")
    if result["status"] == "blocked_no_consent":
        return Response(
            f"Blocked. {patient['name']} has no recorded consent to be "
            f"contacted, so I've drafted nothing that can be sent.",
            title="CONSENT — BLOCKED",
            lines=[f"  {result['followup_id']} held as blocked_no_consent"],
            level="refuse", intent="checkin")
    return Response(
        f"Check-in drafted for {patient['name']}, scheduled "
        f"{result['scheduled_for']}. It sits in your queue — nothing sends "
        f"until you approve it, and there's no transport wired in anyway.",
        title="CHECK-IN DRAFTED",
        lines=[f"  {result['followup_id']}  send {result['scheduled_for']}", "",
               *result["message"].splitlines()],
        intent="checkin")


def _h_post(t, m) -> Response:
    import content
    topic = _after(t, "post about", "post on", "content about", "write about",
                   "draft a post about", "social post about")
    if not topic:
        return Response("What topic?", title="NEED A TOPIC", level="warn",
                        intent="post")
    platform = "generic"
    for p in ("instagram", "facebook", "linkedin", "twitter", "tiktok"):
        if p in t:
            platform = p
            topic = topic.replace(f"for {p}", "").replace(p, "").strip()
    result = content.submit_post(topic, platform=platform)
    if result["_uncited_warning"]:
        return Response(
            f"I drafted something on {topic}, but no cited evidence matched it, "
            f"so every claim is unsupported. It can't be approved in that state.",
            title="POST — UNCITED",
            lines=[f"  {result['post_id']}", "", *result["body"].splitlines()],
            level="warn", intent="post")
    return Response(
        f"Post drafted on {topic} for {platform}, {len(result['claims'])} cited "
        f"claims. I have no way to publish it — that's yours to do manually.",
        title="POST DRAFTED",
        lines=[f"  {result['post_id']}  [{platform}]", "",
               *result["body"].splitlines()],
        intent="post")


def _h_read_plan(t, m) -> Response:
    name = _after(t, "plan for", "plan on", "read the plan for")
    patient, err = _resolve_patient(name)
    if err:
        return err
    plan_id = _latest_plan(patient["id"])
    if not plan_id:
        return Response(f"{patient['name']} has no plan yet.", title="NO PLAN",
                        level="warn", intent="read_plan")
    plan = db.get_treatment_plan(plan_id)
    goals = plan.get("goals") or []
    spoken = " ".join(f"By {g['horizon']}, {g['goal']}" for g in goals[:2])
    return Response(
        f"{patient['name']}, {plan['condition_profile']}, status "
        f"{plan['status']}. {spoken}",
        title=f"PLAN {plan_id}",
        lines=plan["summary"].splitlines(), intent="read_plan")


def _h_help(t, m) -> Response:
    return Response(
        "I can give you system status, escalations, your review queue, and "
        "patient records. I can draft assessments, treatment plans, exercise "
        "programmes, check-ins and posts. I cannot approve, release or send "
        "anything — that stays with you.",
        title="COMMANDS",
        lines=[
            "  system status                     overview of every queue",
            "  any escalations                   red flags and worrying replies",
            "  review queue                      what needs your sign-off",
            "  list patients                     who is on file",
            "  run assessment for <name>         draft from their intake file",
            "  draft a plan for <name>           needs an approved assessment",
            "  build the programme for <name>    needs an approved plan",
            "  read me the precautions for <name>",
            "  read me the plan for <name>",
            "  check in on <name> in seven days  consent-gated",
            "  draft a post about <topic>        cited claims only",
            "",
            "  sign-off is typed, never spoken:",
            "  python3 brain.py approve|approve-plan|release|approve-post ...",
        ],
        intent="help")


# Order matters: more specific patterns first.
_ROUTES = [
    (r"\b(help|what can you do|commands|options)\b", _h_help),
    (r"\b(status|sitrep|situation report|report|how are we|systems)\b", _h_status),
    (r"\b(escalation|escalated|urgent|red flag|anything wrong|emergenc)", _h_escalations),
    (r"\b(review queue|queue|pending|waiting|sign.?off list|to do|todo)\b", _h_queue),
    (r"\b(list |show |who).*(patient|on file|on the books)|^patients\b", _h_patients),
    (r"\b(precaution|caution|warning)s?\b", _h_precautions),
    (r"\bread (me )?the plan\b|\bwhat.?s the plan\b", _h_read_plan),
    (r"\b(assess|assessment)\b", _h_assess),
    (r"\b(plan|planning)\b", _h_plan),
    (r"\b(programme|program|exercises|hep)\b", _h_programme),
    (r"\b(check.?in|follow.?up|check on)\b", _h_checkin),
    (r"\b(post|content|social|marketing|write)\b", _h_post),
]


# ------------------------------------------------------------ db conveniences

def _all_assessments() -> list[dict]:
    conn = db.get_conn()
    rows = conn.execute(
        "SELECT a.id, a.status, a.red_flags_json, p.name AS patient_name "
        "FROM assessments a JOIN patients p ON p.id = a.patient_id"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def _latest_assessment(patient_id: str, status: str | None = None) -> str | None:
    conn = db.get_conn()
    sql = "SELECT id FROM assessments WHERE patient_id = ?"
    args = [patient_id]
    if status:
        sql += " AND status = ?"
        args.append(status)
    sql += " ORDER BY created_at DESC LIMIT 1"
    row = conn.execute(sql, args).fetchone()
    conn.close()
    return row["id"] if row else None


def _latest_plan(patient_id: str, status: str | None = None) -> str | None:
    conn = db.get_conn()
    sql = ("SELECT tp.id FROM treatment_plans tp "
           "JOIN assessments a ON a.id = tp.assessment_id "
           "WHERE a.patient_id = ?")
    args = [patient_id]
    if status:
        sql += " AND tp.status = ?"
        args.append(status)
    sql += " ORDER BY tp.created_at DESC LIMIT 1"
    row = conn.execute(sql, args).fetchone()
    conn.close()
    return row["id"] if row else None


def _latest_programme(patient_id: str, status: str | None = None) -> str | None:
    conn = db.get_conn()
    sql = ("SELECT ep.id FROM exercise_programmes ep "
           "JOIN treatment_plans tp ON tp.id = ep.plan_id "
           "JOIN assessments a ON a.id = tp.assessment_id "
           "WHERE a.patient_id = ?")
    args = [patient_id]
    if status:
        sql += " AND ep.status = ?"
        args.append(status)
    sql += " ORDER BY ep.created_at DESC LIMIT 1"
    row = conn.execute(sql, args).fetchone()
    conn.close()
    return row["id"] if row else None


def telemetry() -> dict:
    """Live counters for the HUD."""
    escalated = len([a for a in _all_assessments() if a["status"] == "escalated"])
    return {
        "patients": len(db.list_patients()),
        "escalated": escalated + len(db.escalated_followups()),
        "assessments": len(db.pending_assessments()),
        "plans": len(db.pending_plans()),
        "programmes": len(db.pending_programmes()),
        "followups": len(db.pending_followups()),
        "blocked": len(db.blocked_followups()),
        "posts": len(db.pending_posts()),
        "signoff_by_voice": VOICE_SIGNOFF_ENABLED,
        "date": date.today().isoformat(),
    }


if __name__ == "__main__":
    import sys
    db.init_db()
    if len(sys.argv) > 1:
        r = handle(" ".join(sys.argv[1:]))
        print(f"[{r['level'].upper()}] {r['title']}")
        print(f"JARVIS: {r['speech']}\n")
        for line in r["lines"]:
            print(line)
    else:
        print("J.A.R.V.I.S. text console. Ctrl-D to exit.\n")
        while True:
            try:
                said = input("you > ").strip()
            except EOFError:
                print()
                break
            if not said:
                continue
            r = handle(said)
            print(f"jarvis > {r['speech']}")
            for line in r["lines"]:
                print(f"         {line}")
            print()
