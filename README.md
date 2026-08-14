# Kartos — Physiotherapy Management System

An integrated management platform for physiotherapy clinics: reception, clinicians, HR/payroll,
a research center, and a patient-facing home exercise portal. Built on Astro + React + Tailwind,
deployed on Netlify.

Bilingual throughout (English / Arabic with full RTL), toggled per user from any screen.

## Roles and screens

| Route             | Who it's for            | What it does                                                                              |
| ----------------- | ----------------------- | ----------------------------------------------------------------------------------------- |
| `/`               | Everyone                | Landing page                                                                              |
| `/register`       | Clinic owner            | Registers a clinic and its first owner account                                            |
| `/login`          | All staff               | Signs in and routes each role to its own dashboard                                        |
| `/app/owner`      | Clinic owner            | Clinic-wide overview: patients, sessions, cash collected, payroll totals, per-clinician load |
| `/app/reception`  | Secretary / reception   | Patient registration, live waiting queue, appointments, fee collection, WhatsApp reminders |
| `/app/doctor`     | Senior doctor / physio  | Patient file, session notes, treatment program, home program, research center, session history |
| `/app/hr`         | Owner / HR              | Team management, attendance & shifts, payroll engine with CSV export                      |
| `/portal`         | Patients (no login)     | Home exercise program with video demos, looked up by patient code or phone                |

## Feature notes

**Live queue.** Reception adds a patient; the clinician's board picks it up within 10 seconds.
Opening a file moves the entry to "with the doctor", and saving the session or collecting the fee
clears it.

**Sessions.** Each session records which program items were executed, free-text clinical
observations and progress notes, and arbitrary assessment metrics (VAS, ROM, MMT). The patient
file shows them as a numbered timeline.

**Payroll.** `net = base salary + (shifts × shift rate) + commission − deductions + bonuses`, where
commission is a percentage of the fees on sessions that clinician personally ran. A session
inherits its fee from the queue entry, so what reception charges is what commission is calculated
on. Exportable as CSV per month.

**Research center.** Searches Semantic Scholar (with PubMed as a fallback) by diagnosis, then turns
the evidence into a draft exercise list you can push into either the in-clinic treatment program or
the patient's home program. Suggestions are labelled and meant for clinician review.

**Patient portal.** No account required — a patient enters their code (`PAT-1234`) or registered
phone number and sees their exercises with embedded YouTube demos. The clinician can copy a direct
link from the HEP builder.

## Configuration

Everything runs with no configuration. Two optional environment variables:

| Variable            | Effect                                                                                       |
| ------------------- | -------------------------------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY` | Enables Claude-generated, patient-specific exercise suggestions in the research center, grounded in the retrieved abstracts and respecting recorded contraindications. Without it, the built-in protocol library is used instead. |
| `CLINIC_TIMEZONE`   | Timezone used for queue days, attendance and payroll months. Defaults to `Africa/Cairo`.       |

## Storage

Data is stored via `src/lib/store.ts`, which writes to Netlify Blobs when available and falls back
to JSON files under `.data/` so a plain `astro dev` works with no extra setup. Every collection is
read and written behind that one interface, so swapping in Postgres is a single-file change.

## Security

Passwords are hashed with scrypt and a per-user salt; sessions are opaque server-side tokens in an
HttpOnly cookie. Every API request is scoped to the caller's clinic, and compensation figures and
the payroll engine are restricted to the owner and HR roles. Before handling real patient data,
add MFA, rate limiting, audit logging, and encryption at rest appropriate to your jurisdiction.

## Local development

```bash
npm install
npm run dev      # http://localhost:4321
npm run build
```

Register a clinic at `/register`, then create an account for each role from the HR screen to
explore the system from every angle.
