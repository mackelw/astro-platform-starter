# Jarvis Physio

A human-in-the-loop assistant for a physiotherapy clinic. Six agents draft
clinical and marketing work; **a clinician approves every step**, and nothing
reaches a patient or the public without a recorded sign-off.

The system is deliberately boring where it matters: plain SQLite, plain
rule-based logic, no network calls, no auto-send, no auto-publish.

## The pipeline

```
intake ─▶ 1 assess ─▶ [APPROVE] ─▶ 2 plan ─▶ [APPROVE] ─▶ 4 programme ─▶ [RELEASE] ─▶ 5 follow-up ─▶ [APPROVE] ─▶ outbox
                                                                                                  (no transport — stops here)
         6 content ─▶ [APPROVE] ─▶ manual publish by a human, from the clinic's own account
```

Each `[BRACKET]` is a hard gate: the next agent refuses to run until a
clinician has acted. Agents never call each other — they communicate only
through the database, so the audit log is the whole story.

## Safety gates

| Gate | Enforced in | Behaviour |
| --- | --- | --- |
| Red-flag screening runs before anything else | `assessment.py` | Cauda equina, malignancy, infection, fracture and progressive neuro signs escalate the assessment and block planning |
| Planning needs an approved assessment | `planning.py` | Refuses any status other than `approved` |
| Red-flagged assessments need documented clearance | `planning.py` | Approval alone is not enough — the clinician must record a note |
| Programmes need an approved plan | `education.py` | Refuses unapproved plans |
| Plans need cited evidence to be approved | `brain.py` | Approval is refused if `evidence` is empty |
| Posts need cited claims to be approved | `brain.py` | Approval is refused if `claims` is empty |
| Follow-ups need recorded patient consent | `followup.py`, `database.py` | Drafts for non-consenting patients are saved as `blocked_no_consent`; approving one raises rather than overriding |
| Follow-ups reference released programmes only | `followup.py` | Refuses unreleased programmes |
| Nothing sends | `followup.py` | Approval queues to an outbox. `send_queued()` refuses by design; only a real transport adapter may call `db.mark_sent()` |
| Nothing publishes | `content.py` | The content agent has no publish path. Approval records sign-off; a human publishes manually |
| Every health claim is cited | `knowledge_base.py` | Claims are assembled *from* cited entries, never written around them. Uncited drafts are flagged and cannot be approved |

## Modules

| File | Role |
| --- | --- |
| `brain.py` | Orchestrator CLI and the clinician review queues |
| `database.py` | SQLite layer + audit log — the only channel between agents |
| `assessment.py` | Agent 1 — intake → draft assessment, red-flag screening |
| `planning.py` | Agent 2 — approved assessment → treatment plan with goals, precautions, evidence |
| `education.py` | Agent 4 — approved plan → home exercise programme |
| `followup.py` | Agent 5 — check-ins, outcome measures, reply escalation |
| `content.py` | Agent 6 — marketing drafts, cited claims only |
| `knowledge_base.py` | Curated evidence store; every claim traces here |
| `exercise_library.py` | Clinic exercise definitions, cues, dosage, media |
| `test_pipeline.py` | Regression tests — one per safety gate |

## Usage

```bash
cd jarvis-physio
python3 brain.py init
python3 brain.py patient "Jane Doe" --mrn MRN-0001 --consent

# 1. Assess
python3 brain.py assess PT-XXXX intake.json
python3 brain.py review
python3 brain.py approve AS-XXXX --note "No red flags; safe for conservative care."

# 2. Plan
python3 brain.py plan AS-XXXX
python3 brain.py approve-plan TP-XXXX --note "Agreed."

# 3. Exercise programme
python3 brain.py programme TP-XXXX
python3 brain.py release EP-XXXX

# 4. Follow-up (consent-gated, queues only)
python3 brain.py draft-checkin PT-XXXX --programme EP-XXXX --days 7
python3 brain.py approve-followup FU-XXXX
python3 brain.py reply FU-XXXX "leg feels worse and numbness spread"   # auto-escalates
python3 brain.py outcome FU-XXXX '{"NPRS": 4, "ADHERENCE": 6}'

# 5. Content (drafts only)
python3 brain.py draft-post "back pain" --platform instagram
python3 brain.py approve-post CP-XXXX
```

`intake.json` takes the shape of the demo block at the bottom of
`assessment.py`.

## Tests

```bash
cd jarvis-physio
python3 -m unittest -b
```

32 tests, each mapping to a gate above. They run against a throwaway database
in a temp directory — they never touch `jarvis.db`.

## Adding to the clinic library

- **Exercises** — add an entry to `exercise_library._EXERCISES`. Every exercise
  needs cues, a default dosage, an education point, and an `evidence_ref` that
  resolves in the knowledge base; `python3 exercise_library.py` validates this
  and lists what has no media yet.
- **Media** — drop files into `library/media/<exercise-id>/`. They are picked up
  at read time; no code change needed.
- **Evidence** — add to `knowledge_base._ENTRIES`. Guideline or
  systematic-review level sources only.
- **Conditions** — planning covers low back pain (± radicular involvement).
  Anything else is refused with a clear message rather than guessed at; add
  rules to `planning._INTERVENTIONS` and `education._SELECTION` to extend it.

## Scope and limits

This is a drafting and workflow tool, not a medical device and not a clinical
decision-maker. It does not diagnose, does not treat, and does not contact
patients. Red-flag screening is keyword-based on the intake text — it is a
safety net under a clinician, never a replacement for one. Before any real
patient data goes in, the database needs encryption at rest, access control and
a retention policy; none of that exists yet.
