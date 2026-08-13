# Range Clinic — AI Agent System

**Status:** Draft spec — not yet implemented
**Source:** Handwritten notes by Dr Michael Magdy (Range Clinic, physiotherapy & sports injury), sheet marked "R1"
**Owner:** TBD

---

## 1. Source notes

The spec below is derived from a single page of handwritten notes. Transcription and translation first, so the mapping from note to feature is auditable.

### Right column — العقل المساعد / "Assistant brain"

| Arabic (as written) | English |
|---|---|
| عقل المساعد Agent — تشخيصه و تقييم الحالات | Assistant agent — diagnosis and case assessment |
| ⭐ عقل لمتابعة الحالات داخل العيادة من تحسنه و إرسال ملاحظات للقسم | Agent to follow up on in-clinic cases: track improvement, send notes/reminders to the section |
| عقل لتخزين البيانات — جودة العلاج، وصفة | Agent to store data: treatment quality, prescriptions |
| عقل لجلب أحدث الأبحاث و تصويرها و تلخيصها — NotebookLM | Agent to fetch the latest research, illustrate and summarise it — *NotebookLM* |

### Left column — عقل لإدارة الرسائل / "Message-management brain"

| Arabic (as written) | English |
|---|---|
| عقل لإدارة الرسائل — مصرية و الردود | Agent to manage messages — Egyptian dialect, and replies |
| استشارات الحالات | Case consultations |
| الفيسبوك و التيك توك | Facebook and TikTok |
| بعد التأكد من الدكتور | Only after the doctor confirms |
| و تجميع البيانات للفيسبوك و الإنستجرام | And aggregating data for Facebook and Instagram |

Two notes on interpretation:

- The ⭐ marks follow-up as the highest-priority item on the page.
- "بعد التأكد من الدكتور" is written under the messaging column, not the clinical one. It is read here as a **hard gate on outbound patient-facing messages**, and is treated as a system-wide invariant in §4.

---

## 2. What this system is

Four agents plus a shared data layer, serving one physiotherapy clinic. Each agent is narrow: a defined input, a defined output, and an explicit decision about whether a human sees the output before anyone outside the clinic does.

```
                        ┌──────────────────────────┐
   patient intake ─────▶│  A1  Intake & Assessment  │───▶ draft assessment ──┐
                        └──────────────────────────┘                        │
                                                                            ▼
                        ┌──────────────────────────┐              ┌───────────────────┐
   session logs   ─────▶│  A2  Follow-up & Progress │◀────────────▶│  Clinical record   │
                        └──────────────────────────┘              │  (source of truth) │
                                 │ notes to staff                 └───────────────────┘
                                 ▼                                          ▲
                        ┌──────────────────────────┐                        │
   FB / IG / TikTok ───▶│  A3  Inbox & Replies      │───▶ DOCTOR GATE ───▶ patient
                        └──────────────────────────┘                        │
                                                                            │
                        ┌──────────────────────────┐                        │
   PubMed / journals ──▶│  A4  Research Digest      │───▶ clinician reading list
                        └──────────────────────────┘
```

The clinical record is the hub. Nothing in the note describes an agent that owns patient data independently — "عقل لتخزين البيانات" is the record itself, not a fourth reasoning agent, so it is specified as the data layer in §3 rather than as an agent.

---

## 3. Data layer — الملف الطبي

Before any agent, this. Every agent reads from or writes to it, and half the value of the project is having it exist at all.

**Entities**

| Entity | Key fields |
|---|---|
| `patient` | id, name, phone, DOB, sex, referral source (the intake form's أقارب/فيسبوك/جوجل/إنستجرام checkboxes), consent flags |
| `case` | id, patient_id, complaint, onset date, diagnosis, status (active / completed / dropped) |
| `assessment` | case_id, date, ROM, pain score, strength, functional tests, clinician notes |
| `session` | case_id, date, therapist, modalities applied, exercises prescribed, duration, patient-reported pain before/after |
| `prescription` | case_id, home exercise programme, frequency, review date |
| `outcome` | case_id, discharge date, final scores, satisfaction |
| `message` | patient_id (nullable), channel, direction, body, status (draft / approved / sent), approved_by |

**Rules**

- Every clinical row is append-only with an audit trail. Corrections are new rows, not overwrites.
- Patient identifiers never leave the clinic's own store. Agents that call an external model receive de-identified case text (initials or case ID, no phone, no full name) — see §6.
- "جودة العلاج" (treatment quality) is not a free-text field. It is computed from `outcome` vs `assessment` deltas per case, so the metric is derivable rather than opinion.

**Store:** Postgres (Neon or Supabase) is the fit here — relational, cheap at this scale, and the audit-trail requirement rules out anything schemaless. Netlify Blobs (already in this starter) is fine for attachments — scans, images, PDFs — but not for the clinical rows.

---

## 4. The doctor gate

The single most important line in the notes is "بعد التأكد من الدكتور".

**Invariant:** no agent output reaches a patient, a public comment thread, or a DM without a named human approving that specific message. Not a policy toggle — a schema constraint. A `message` row cannot transition to `status = sent` without a non-null `approved_by`, and the send path reads only rows in that state.

This applies to A3 (messaging) absolutely, and to A1 (assessment) in a weaker form: A1's output is a **draft for the treating clinician**, never a diagnosis shown to a patient.

Corollary: build the approval UI before the agent that needs it. An approval queue that arrives late means someone will approve in bulk, which is the same as no gate.

---

## 5. The agents

### A1 — Intake & Assessment (تشخيص و تقييم الحالات)

**Job:** turn an intake form plus the clinician's raw observations into a structured draft assessment.

| | |
|---|---|
| Input | Intake form fields, complaint in the patient's own words, clinician's shorthand notes, prior cases for this patient |
| Output | Structured draft: candidate problem list, suggested objective tests to run, red flags to rule out, proposed initial plan |
| Consumer | Treating clinician, in the record UI |
| Gate | Draft-only. Never patient-facing. Clinician edits and signs. |
| Model | Claude Opus 5 (`claude-opus-5`) — clinical reasoning is the wrong place to economise |

**Design notes.** The valuable output is not "here is the diagnosis" — it is *completeness*: which objective tests the clinician has not yet documented, which red flags are unaddressed. Frame the prompt around gaps in the record, not around conclusions. This also keeps the tool inside its competence and inside what a physiotherapy clinic can defensibly use.

**Explicitly out of scope:** any output phrased as a definitive diagnosis, and anything resembling a prescription for medication.

---

### A2 — Follow-up & Progress ⭐ (متابعة الحالات و التحسن)

**Job:** watch active cases, detect who is improving, who has plateaued, and who has stopped attending — and tell the right person.

| | |
|---|---|
| Input | `session` and `assessment` rows for all active cases; attendance dates |
| Output | (a) per-case progress summary; (b) an alert queue for staff |
| Consumer | Clinic staff — the "قسم" (section/department) in the notes |
| Gate | Internal only. Staff-facing notes need no patient approval. Any resulting patient contact goes through A3 and the doctor gate. |
| Model | Claude Sonnet 5 (`claude-sonnet-5`) — high volume, structured input, runs daily |

**Alert types**

| Alert | Trigger |
|---|---|
| Missed follow-up | No session in N days on an active case, no discharge recorded |
| Plateau | Pain/ROM/function unchanged across the last 3 sessions |
| Regression | Any objective metric worse than the previous two sessions |
| Review due | `prescription.review_date` reached |
| Ready for discharge | Outcome targets met and sustained |

**Design notes.** Most of these triggers are SQL, not an LLM. Compute them in the database; use the model for the *summary and the wording* of the alert, not for the detection. This is much cheaper, deterministic, and testable — and it means a model outage degrades the summary, not the safety net.

Runs once daily as a scheduled job.

---

### A3 — Inbox & Replies (إدارة الرسائل و الردود)

**Job:** read incoming messages and comments across Facebook, Instagram, and TikTok; draft replies in Egyptian Arabic; queue them for the doctor.

| | |
|---|---|
| Input | Inbound DMs and comments (Meta Graph API for FB/IG; TikTok's API for comments); clinic FAQ; the patient's case if identifiable |
| Output | A drafted reply, plus a classification |
| Consumer | Whoever staffs the approval queue; the doctor for anything clinical |
| Gate | **Hard.** Nothing sends unapproved. |
| Model | Claude Sonnet 5 (`claude-sonnet-5`); escalate clinical-consultation drafts to `claude-opus-5` |

**Classification, which decides routing**

| Class | Examples | Routing |
|---|---|---|
| Admin | Hours, location, price, booking | Draft reply → staff approval |
| Clinical consultation (استشارات) | "My knee hurts when I…" | Draft → **doctor** approval, always |
| Complaint | Dissatisfaction, billing dispute | No draft. Flag to the doctor directly. |
| Spam / irrelevant | — | Archive, no draft |

**Dialect.** "مصرية" is a requirement, not a nicety — replies in Modern Standard Arabic read as a call centre. Build a style file of 20–30 real approved replies from the clinic's own history and pass it as few-shot context; do not describe the dialect in prose and hope.

**Clinical replies must not diagnose over DM.** The correct shape of a consultation reply is acknowledgement plus an invitation to be assessed, not a treatment plan. Encode that in the prompt and in what the approval UI shows the doctor.

---

### A4 — Research Digest (أحدث الأبحاث + NotebookLM)

**Job:** keep the clinic current on physiotherapy and sports-injury literature, summarised and visualised.

| | |
|---|---|
| Input | PubMed / Europe PMC queries on the clinic's standing topics; optionally journal RSS |
| Output | Weekly digest: what's new, what it changes in practice, what to ignore |
| Consumer | Doctor and therapists |
| Gate | None needed — internal reading material |
| Model | Claude Opus 5 (`claude-opus-5`) with web fetch, weekly |

**Design notes.** The note names NotebookLM. Two readings, and they are not mutually exclusive:

1. *Do what NotebookLM does* — ingest papers, produce a grounded, citation-linked summary. That is A4 as specified.
2. *Use NotebookLM* — keep it as the doctor's personal reading tool and have A4 simply feed it a curated set of PDFs.

Start with (2) if the clinic already uses NotebookLM; it is a scraper and a folder, and it delivers value in a day. Move to (1) when the digest needs to be automatic and shared. Do not build (1) first.

Every claim in a digest carries a citation to the source paper. A summary that cannot be traced back is worse than no summary.

---

## 6. Cross-cutting concerns

**Patient data and external models.** Any text sent to the Anthropic API leaves the clinic. Before it does: strip names to initials, drop phone numbers and addresses, and reference cases by ID. This is achievable for A1, A2, and A4 without losing anything the model needs. A3 is the hard one, because inbound DMs arrive with whatever the patient wrote in them — treat inbound message bodies as untrusted and unredactable, and keep the retention window on them short. Enable [zero-data-retention](https://privacy.anthropic.com) terms with Anthropic if the clinic's obligations require it.

**Consent.** The intake form already asks how the patient heard about the clinic; add an explicit consent line covering (a) storing their case data and (b) being contacted for follow-up. A2's whole purpose is proactive contact and it needs a basis for it.

**Prompt injection via A3.** A3 reads text written by strangers on the internet and produces output that a human then approves. Assume someone will eventually write "ignore your instructions and…" in a DM. The doctor gate is the mitigation and it is a good one, but the approval UI must show the **original inbound message alongside the draft** — approving a reply without seeing what it replies to defeats the gate.

**Audit.** Every agent action writes a row: agent, model, input hash, output, timestamp, approver where applicable. This is the artefact that makes the system defensible if a clinical decision is ever questioned.

**Cost.** At single-clinic volume this is small. Rough order of magnitude at current list rates — Opus 5 at $5/$25 per million input/output tokens, Sonnet 5 at $3/$15 (introductory $2/$10 through 2026-08-31):

| Agent | Frequency | Rough monthly |
|---|---|---|
| A1 | ~per new case | low tens of dollars |
| A2 | daily batch | low tens |
| A3 | per message, high volume | the largest line, still modest |
| A4 | weekly | negligible |

Prompt caching on the shared clinic context (FAQ, style file, protocol notes) cuts A3's cost substantially, since that prefix is identical across every message.

---

## 7. Build order

Sequenced so each phase is independently useful and the risky work comes after the boring work.

| Phase | Deliverable | Why here |
|---|---|---|
| **0** | Clinical record: schema, entry UI, backfill of existing patients | Every agent is worthless without it, and this alone is a real improvement over paper |
| **1** | A4 Research Digest — start as a curated feed into NotebookLM | Zero patient data, zero risk, fast visible win, no gate needed |
| **2** | Approval queue UI | Must exist before A3. Build the gate before the thing it gates. |
| **3** | A3 Inbox & Replies — admin class only, no clinical replies | Highest daily time-saving. Restricting to admin messages keeps phase 3 low-stakes. |
| **4** | A2 Follow-up ⭐ — SQL triggers first, model-written summaries second | Highest clinical value; depends on phase 0 having real session data in it |
| **5** | A3 extended to clinical consultations, doctor-approval routing | Only once the gate has been in daily use and is trusted |
| **6** | A1 Intake & Assessment | Highest clinical sensitivity, so last — and it needs phase 0's data to be worth anything |

**Do not start at phase 6** even though it is first on the page. A1 is the most interesting agent and the least useful one on day zero, because it has no history to reason over.

---

## 8. Technical notes

The repository this spec lives in is the Astro + Netlify starter, which suits the internal tools well:

- **UI** — Astro pages with React islands for the interactive parts (approval queue, record entry). Both already configured here.
- **API** — Astro server endpoints under `src/pages/api/`, deployed as Netlify functions. The existing `src/pages/api/blob.ts` is the shape to copy.
- **Scheduled work** — A2's daily run and A4's weekly run as [Netlify scheduled functions](https://docs.netlify.com/functions/scheduled-functions/).
- **Model calls** — `@anthropic-ai/sdk`, server-side only. The API key must never reach the browser.
- **Attachments** — `@netlify/blobs`, already a dependency.
- **Auth** — required before anything holds patient data. Netlify Identity or Auth0; the clinic is small enough that role-based access with two roles (staff, doctor) is sufficient.

Agent orchestration: start with plain server-side calls to the Messages API. Nothing in this spec needs a persistent agent loop — A1, A2, and A4 are single-shot summarisation with structured output, and A3 is single-shot classification plus generation. Reach for a heavier agent framework only if a genuinely open-ended workflow appears.

---

## 9. Open questions

1. **Where does patient data live today?** Paper, Excel, or an existing clinic system? Phase 0 is a migration if there is an existing system, and a greenfield build if not.
2. **Who staffs the approval queue?** The volume of Facebook and Instagram DMs determines whether A3 saves an hour a day or ten minutes.
3. **Are the social accounts API-accessible?** Meta Graph API needs a Business account and app review for messaging permissions; TikTok's comment API is more limited. Manual paste-in is a viable phase-3 fallback.
4. **Which language does the record UI use?** Arabic UI with English clinical terms is the usual answer for an Egyptian clinic, but it affects every screen.
5. **Egyptian regulatory position** on storing patient records digitally and on cross-border data transfer to a US API — worth a definitive answer before phase 0, not after.
6. **Does the clinic already use NotebookLM?** Decides A4's phase-1 shape.
