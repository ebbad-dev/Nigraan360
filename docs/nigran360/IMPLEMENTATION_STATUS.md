# Nigran 360 — Implementation status

Last updated: 27 Nov 2026, 16:25 PKT. Submission repository: `ebbad-dev/Nigraan360` (`main`).

Evidence key:
- **API-live**: `scripts/nigran_live_e2e.py`, 73 checks against a real SQL Server.
- **UI**: Playwright in installed Chrome (`frontend/e2e/*.spec.ts`, 8 tests).
- **Unit**: `pytest tests` (85 tests).

## Core requirements

| Requirement | Status | Implementation | Tests | Remaining work |
|---|---|---|---|---|
| 3.1 Authentication & roles | Existing and verified | JWT auth with hashed passwords (`core/security.py`). Backend role guards (`require_roles`). Admin user and role management (`/admin`). Roles: admin = Administrator, instructor = Examiner, student = Candidate. | API-live: role denials, cross-candidate writes and reads refused. UI: candidate redirected away from `/bank`; admin user management renders. | Examiner scope is per institution (tenant), not per examiner. |
| 3.2 Examination management | Implemented and verified | Title, instructions, schedule, duration, marks and randomization settings. Draft → published. Lifecycle shown as upcoming, ongoing or completed. Status transitions validated on the server (`EXAM_STATUS_TRANSITIONS`). Publishing requires questions and matching marks. Sandbox preview before publishing. | API-live: empty-publish refusal, illegal transition (409). Unit: transition map. | — |
| 3.3 Question management | Implemented and verified | Reusable bank with categories and difficulty. Single-answer MCQ, multiple-select (all-or-nothing or partial) and written questions. Copying from the bank detaches the exam's copy. Per-attempt seeded question/option shuffle. Write-once attempt snapshot. Answer keys are removed from candidate responses. | Unit: grading rules, snapshot isolation, key stripping. API-live: invalid MCQ refused, all 3 types. UI: bank authoring and validation. | — |
| 3.4 Candidate management | Implemented and verified | Enrolment by email or bulk import. Candidate dashboard groups exams as available, in progress, upcoming, completed or closed. Eligibility and availability window enforced on the server. | API-live: unenrolled candidate cannot start; the exam is invisible to other candidates. | — |
| 3.5 Examination interface | Implemented and verified | Question navigator with distinct saved, pending, failed, unanswered and flagged states. Mark-for-review. All three answer types. Timer anchored to server time on a monotonic clock. Autosave. Refresh recovery. Review dialog before submit, then a receipt. Expiry is finalized on the server (background sweep plus on access). | UI: full 5.3 flow and refresh recovery. API-live: deadline unchanged by refresh; saves refused after submission or the deadline. | — |
| 3.6 Monitoring & announcements | Implemented and verified | Live monitor: progress, time left, last save, signals. Event list labelled "for human review". Proctoring signals from browser, camera and audio reused from ProctorAI. Announcements (title, priority, withdraw) reach enrolled candidates only. | API-live: monitor progress, candidate refused, announcement isolation. UI: monitor and announcements tabs. | Camera/audio engine runs locally only, not on the cloud host. |
| 3.7 Grading | Implemented and verified | Objective answers graded automatically on save against the snapshot. Written answers graded manually with whole marks from 0 to the maximum, plus feedback. Totals recomputed. | Unit: rules. API-live: 8/11 total, out-of-range and fractional marks refused. UI: grading validation. | No full grading-history table (only the latest grade and the dispute record). |
| 3.8 Results & analytics | Implemented and verified | Publishing is blocked while written grading is pending. Candidates see only their own published results. Exam summary (average, median, high, low, pass rate, distribution). Disputes with traceable original and revised scores. | API-live: hidden before publish, privacy, disputes (11 checks). UI: publish, candidate result, dispute round trip. | — |

## Secondary requirements

| Requirement | Status | Implementation | Tests | Remaining work |
|---|---|---|---|---|
| 4.1 Network-aware interface | Implemented and verified | Browser online/offline and API reachability tracked separately (`lib/connection.ts`). Banner states: online, offline, unreachable, reconnected. Per-question save state. | UI: offline and reconnect banner and states. | — |
| 4.2 PDF reports | Implemented and verified | ReportLab academic PDF from real attempt data (`reporting/academic_pdf.py`). The candidate can download only their own report, and only after publication. The examiner can download it once grading is complete. | API-live: PDF bytes; other candidate refused. | — |
| 4.3 Sandbox | Implemented and verified | "Preview as candidate" creates `attempt_type='sandbox'`, labelled in the UI and excluded from results, analytics, monitor and grading. | API-live: excluded from results and analytics. | — |
| 4.4 Bulk import | Implemented and verified | CSV/JSON for candidates (per exam) and questions (bank). Preview, row-level errors, duplicate detection within the file and against the database. All-or-nothing commit. | API-live: bad rows block the commit; duplicates flagged. UI: question import errors. | — |
| 4.5 Question analytics | Implemented and verified | Skipped, incorrect, facility index, observed vs configured difficulty, and common wrong options, from real submitted attempts only. | Unit: analytics counts. API-live: sample size. UI: analytics tab. | — |
| 4.6 Verifiable reports | Implemented and verified | `secrets.token_urlsafe(24)` token printed on the PDF. Public `/verify/<token>` shows validity, exam and issue date only (no name, roll number or marks). Revocable. | API-live: valid, forged and privacy checks. | — |
| 4.7 Customizable workspace | Implemented and verified | Text size, high contrast and focus layout, stored per user in this browser. Display only. | UI: preference persists across reload. | — |
| 4.8 Digital scratchpad | Implemented and verified | Per-attempt scratchpad, browser-local, never sent to the server, cleared on sign-out. | UI: persists across reload; never in network traffic or attempt data. | — |

## Innovation 5.3: failure-resilient examinations

**Status: Implemented and verified.**

**How it works:**
- Every change is written to a durable localStorage outbox (`lib/attempt-sync.ts`) before it is sent.
- Each change carries a unique `mutation_id` and a monotonically increasing `client_seq` for the attempt.
- The server is the only authority:
  - a duplicate change is replayed, not applied twice;
  - an older change is rejected as stale, so newer server state is never overwritten;
  - anything that arrives after the stored `deadline_at` is refused, and the attempt is finalized with the answers received in time.
- The timer uses server time, so being offline or changing the device clock never adds time.
- A refresh restores the confirmed answers from the server and the pending ones from the device.
- A network failure no longer signs the candidate out.

**Tests:**
- UI:
  - offline edit shown as pending, then saved after reconnect;
  - deadline unchanged;
  - post-deadline change not counted;
  - session kept during a network failure.
- API-live: duplicate, stale, deadline and finalization checks.

**Trade-off:** answers made offline that never reach the server before the deadline do not count. This is deliberate, to keep the exam fair, and the UI says so.

## Known limitations
- The camera, microphone and phone-detection engine (`run_proctor_engine.py`) needs a local machine. Browser-side monitoring works when deployed.
- Free Render instances sleep when idle, so the first request after a pause is slow.
- Saving an answer and submitting the attempt are separate database statements, not one transaction. A save landing in the same instant as a submit is resolved by the attempt-status check, not by database locking.
