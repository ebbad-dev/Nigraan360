# Nigran 360: requirement traceability

**Audit date:** 27 Nov 2026, 16:53–17:05 PKT
**Repository:** `ebbad-dev/Nigraan360`, branch `main`, HEAD `d6f81f3`. The working tree was clean before these audit documents were added.
**Source of truth:** *Web-e-Thon Problem Statement.pdf* (7 pages) and *Web-e-Thon Rulebook.pdf* (3 pages).

## Evidence keys

| Key | What it is | Result at audit time |
|---|---|---|
| **U** | `pytest tests` (unit and service tests) | 85 passed |
| **L** | `scripts/nigran_live_e2e.py`, run against the local SQL Server with synthetic accounts | 84/84 passed |
| **B** | Playwright tests in installed Chrome (`frontend/e2e/*.spec.ts`), dev server on `:8090` and API on `:5071` | 9/9 passed |
| **AX** | axe-core run in this audit against the WCAG 2.0/2.1/2.2 A and AA rule sets | see 3.5 and the UX audit |
| **RT** | Manual runtime inspection and screenshots in `baseline/` | — |

## Status values

Each requirement gets exactly one status:
- VERIFIED COMPLETE
- PARTIALLY IMPLEMENTED
- IMPLEMENTED BUT BROKEN
- NOT IMPLEMENTED
- NOT VERIFIED

"NOT VERIFIED" items inside a row are named explicitly.

## Summary

| ID | Requirement | Status |
|---|---|---|
| 3.1 | Authentication & authorization | **PARTIALLY IMPLEMENTED** |
| 3.2 | Examination management | **VERIFIED COMPLETE** |
| 3.3 | Question management | **VERIFIED COMPLETE** |
| 3.4 | Candidate management | **VERIFIED COMPLETE** |
| 3.5 | Examination interface | **VERIFIED COMPLETE** (UX gaps listed separately) |
| 3.6 | Examination monitoring | **VERIFIED COMPLETE** (since `d6f81f3`) |
| 3.7 | Evaluation & grading | **PARTIALLY IMPLEMENTED** |
| 3.8 | Results & analytics | **VERIFIED COMPLETE** |
| 4.1 | Network-aware interface | **VERIFIED COMPLETE** |
| 4.2 | PDF report generation | **VERIFIED COMPLETE** |
| 4.3 | Examination sandbox | **VERIFIED COMPLETE** |
| 4.4 | Bulk data import | **VERIFIED COMPLETE** (commit is not transactional) |
| 4.5 | Question analytics | **VERIFIED COMPLETE** |
| 4.6 | Verifiable reports | **VERIFIED COMPLETE** (scanning the QR with a phone is NOT VERIFIED) |
| 4.7 | Customizable workspace | **VERIFIED COMPLETE** |
| 4.8 | Digital scratchpad | **VERIFIED COMPLETE** |
| 5.3 | Failure-resilient examinations | **VERIFIED COMPLETE** for core invariants (sub-scenarios listed below) |
| 07 | Deployed working application (submission rule) | **NOT IMPLEMENTED**: the app is not deployed yet |

---

## 3.1 Authentication & authorization: PARTIALLY IMPLEMENTED

| Field | Detail |
|---|---|
| Official requirement | Secure authentication for all roles. Administrators manage accounts and roles. Permissions enforced on the backend. Users reach only authorized exams, records and actions. |
| Implementation | JWT bearer tokens (`core/security.py`, HS256, 480-minute lifetime). PBKDF2-SHA256 with 240,000 rounds. Role guard `require_roles()`. Exam ownership check `ExamService.require_management_access` (by institution, and since `d6f81f3` by `Exams.created_by` for examiners). |
| Frontend | `/login`, `/register` (candidates only), `/admin` (users, roles, activation, passwords), `AppShell` route guard plus `roleCanAccess` (`lib/auth.ts`) |
| Backend | `infrastructure/api/routers/identity.py`, `/admin/users*`, `_current_user`, `_require_roles` (`fastapi_app.py`) |
| Database | `Users`, `Tenants`, `AuditLogs` |
| Authorization | Role checks on every router. Exam-owner check for examiners. Candidates are limited to their own attempts and results. |
| Validation | `validate_password` on create and reset. Roles restricted to `student`, `instructor` or `admin`. |
| Error handling | Structured `{error, message}`. A 401 signs the user out, but only when the rejected token is the stored one (fixed in `fe62b83`). |
| Automated evidence | **L**: candidate blocked from examiner API; examiner blocked from admin API; other candidate's attempt, report and dispute access refused; another examiner cannot list, edit or read results of an exam, or open its answer sheet. **B**: candidate redirected away from `/bank`. |
| Runtime evidence | **RT**: admin console lists users with role and status controls (`baseline/02-admin-desktop.png`). |
| Missing behavior | **(a)** Legacy ProctorAI endpoints (`/sessions`, `/sessions/{id}/*`, `/reports`, legacy `/monitor`) scope examiners **per institution, not per exam owner**. An examiner can open proctoring sessions of another examiner's candidates. **(b)** No login throttling or lockout. **(c)** Logout does not revoke the stateless JWT server-side. **(d)** The token is stored in `localStorage`. |
| Severity | (a) Medium: cross-examiner data visibility inside one institution. (b) High for production, Medium for the demo. (c, d) Medium. |
| Recommended fix | Scope legacy session queries through `Sessions → ExamAttempts → Exams.created_by`. Throttle logins per IP and per account. Add a short-lived token plus a revocation list (`jti`) on logout. Consider httpOnly cookies with a CSRF token. |
| Acceptance criteria | Examiner B gets 403 on every legacy session or report of examiner A's exam. A sixth failed login within 5 minutes returns 429. A token used after logout returns 401. |

## 3.2 Examination management: VERIFIED COMPLETE

| Field | Detail |
|---|---|
| Implementation | Fields: title, code, description, instructions, schedule, duration, total marks, rules JSON, randomization flags. Stored statuses: draft, scheduled, published, closed, archived. Derived lifecycle (`rules.exam_lifecycle`): upcoming, ongoing, completed. `EXAM_STATUS_TRANSITIONS` enforced server-side (`exam_service.update_exam`). Publishing requires at least one question and matching marks, and refuses a window that has already ended. Questions are locked while the exam is published or scheduled. |
| Frontend | `/instructor` (exam form, lifecycle toolbar, sandbox preview, question builder, enrolment) |
| Backend | `POST/PUT /exams`, `POST /exams/{id}/publish` |
| Database | `Exams` |
| Evidence | **L**: empty exam publish refused (422); published to archived refused (409); candidate cannot start before enrolment. **U**: transition map. |
| Notes | "Ongoing" and "completed" are derived from the stored status and the schedule rather than stored. This is acceptable because it is deterministic, shown in the examiner toolbar, and drives candidate grouping. |

## 3.3 Question management: VERIFIED COMPLETE

| Field | Detail |
|---|---|
| Implementation | Reusable institution bank (`BankQuestions`, `BankOptions`) with category and difficulty. Assigning a bank question **copies** it into `ExamQuestions` (`source_question_id`), so later bank edits never change an exam. Question types: single-answer MCQ, multiple-select (all-or-nothing or partial: `floor(marks × max(0, right − wrong) ÷ total_correct)`), written (manual). Per-attempt seeded question and option shuffle. Write-once `ExamAttempts.snapshot_json` freezes content, order, answer key and marking scheme. |
| Frontend | `/bank` (create, edit, archive, filter, import, assign), `/instructor` question builder (all 3 types) |
| Backend | `/bank/questions*`, `/exams/{id}/bank/assign`, `/exams/{id}/questions*`, `services/assessment.py` |
| Evidence | **U**: grading rules for each type, snapshot independence from later edits, answer-key stripping, stable shuffle. **L**: invalid MCQ refused; all 3 types graded (8/11 total). **B**: bank authoring of every type plus a validation error. |

## 3.4 Candidate management: VERIFIED COMPLETE

| Field | Detail |
|---|---|
| Implementation | Enrolment by email, bulk CSV/JSON import, or join-by-code. Candidate dashboard groups: in progress, available, upcoming, completed, closed (`candidate_availability`), with instructions, schedule and attempt state. Start is refused without assignment, outside the window, or when unpublished. |
| Frontend | `/candidate`; enrolment panel and import in `/instructor` |
| Backend | `/exams/{id}/assignments*`, `/student/dashboard`, `/attempts/start` |
| Evidence | **L**: unenrolled start refused; exam invisible to a non-enrolled candidate. **B**: start from the dashboard. |

## 3.5 Examination interface: VERIFIED COMPLETE

| Field | Detail |
|---|---|
| Implementation | `/exam` workspace. Navigator distinguishes Saved on server, Pending sync, Save failed, Not answered and Marked for review (colour, icon and an aria-label per state). Radio, checkbox and textarea inputs. Timer = server `deadline_at` minus server time anchored to `performance.now()`. Durable outbox autosave. Refresh restores answers from the server and the device. Review dialog with unanswered, flagged and unsynced counts. Receipt screen. Server finalizes at expiry (60-second sweep plus on access). |
| Evidence | **B**: full flow, refresh recovery, submit plus receipt. **L**: refresh does not move the deadline; saves after submit or deadline refused; idempotent submit. **AX**: 0 automated violations on the workspace. |
| UX gaps (not functional failures) | Full app sidebar and global search stay visible during an attempt. No skip link (six Tab presses land in the sidebar). The timer is not sticky on mobile. See the UX audit. |
| NOT VERIFIED | Screen-reader walkthrough (only automated rules were run). |

## 3.6 Examination monitoring: VERIFIED COMPLETE

| Field | Detail |
|---|---|
| Implementation | Exam monitor tab: in progress, submitted and enrolled counts; per-attempt progress, time left, last save and signal count; recent events labelled "for human review" with the notice "not conclusive evidence of misconduct". Announcements (title, priority, withdraw) on the candidate dashboard **and, since `d6f81f3`, inside the exam workspace** (20-second poll, "New" highlight). Browser incidents are recorded per candidate session (fixed in `d6f81f3`; before that only one session server-wide was accepted). |
| Evidence | **L**: incident recorded for the candidate's own open session; refused for another candidate's session; monitor counts it; announcement isolation by enrolment. **B**: monitor and announcement tabs; announcement shown inside the exam within 30 seconds. |
| Gaps | There are still two monitoring concepts: the legacy per-session camera "Live Monitor" (`/monitor`) and the per-exam monitor. The legacy view frames output as a "risk score / LOW-RISK story", which mixes observed events with inferred risk. See the UX audit. |

## 3.7 Evaluation & grading: PARTIALLY IMPLEMENTED

| Field | Detail |
|---|---|
| Implementation | Objective answers are graded at save time against the snapshot. Written answers are graded manually: whole marks from 0 to the maximum, feedback, `graded_by`, `graded_at`. Totals are recomputed (`finalize_scores`). Publishing is blocked while any written answer is pending. |
| Evidence | **U**: grading rules. **L**: marks above the maximum and fractional marks refused; 8/11 total; publication blocked while pending. **B**: grading validation in the UI. |
| Missing behavior | **(a)** Regrading **after publication** silently changes a published score. There is no warning, re-publication step or audit trail beyond the latest grade. Disputes do record original and revised scores. **(b)** No optimistic concurrency, so two examiners grading the same response means the last write wins. **(c)** No grading-history table. |
| Severity | Medium. The requirement asks for "a consistent grading state". |
| Recommended fix | Require an explicit "amend published result" action that writes a `GradeHistory` row, plus an `expected_previous_marks` / `updated_at` precondition on grade writes. |
| Acceptance criteria | A post-publication regrade without the amend flag returns 409. A concurrent grade with a stale precondition returns 409. A history row exists for every change. |

## 3.8 Results & analytics: VERIFIED COMPLETE

| Field | Detail |
|---|---|
| Implementation | Controlled publish and unpublish. Candidates see only their own published scores (scores are hidden before publication). Exam summary: average, median, high, low, pass rate at 50%, distribution. Candidate table. Answer-sheet review for examiners (`d6f81f3`). Disputes with original and revised totals. Attempts are retained (no deletion path). |
| Evidence | **L**: score hidden before publish; other candidate refused; disputes (11 checks); answer sheet visible to the owning examiner only. **B**: publish flow, candidate result, dispute round trip, answer-sheet view. |

## 4.1 Network-aware interface: VERIFIED COMPLETE

Browser `navigator.onLine` and API reachability (`/health` ping, 5-second timeout) are tracked separately. Banner states: checking, online, offline, unreachable, reconnected. Each question shows its own save state, and "Saved on server" appears only after the server acknowledges.

**Evidence:**
- **B**: offline banner and "Pending sync", then "Saved on server" after reconnecting; a network failure during the session check does not sign the user out.

**Gap:**
- Save requests themselves have no client timeout. A hung request delays the outbox until the browser gives up. This never produces a false "Saved".

## 4.2 PDF report generation: VERIFIED COMPLETE

ReportLab academic PDF (`reporting/academic_pdf.py`) built from the attempt snapshot and responses. Candidates can download only their own report and only after publication; examiners can download once grading is complete.

**Evidence:**
- **L**: PDF bytes returned; another candidate refused.

**Gap:**
- The PDF uses the English "Nigran 360" text heading. It needs the Urdu wordmark lockup from the brand identity document.

## 4.3 Examination sandbox: VERIFIED COMPLETE

`POST /exams/{id}/sandbox` creates an `attempt_type='sandbox'` attempt, shown with a SANDBOX banner. It is excluded from results, analytics, the monitor and grading through the `REAL` filter.

**Evidence:**
- **L**: results and analytics are unchanged after a sandbox submission.

## 4.4 Bulk data import: VERIFIED COMPLETE

CSV or JSON import for candidates (per exam) and questions (bank). Limits: 1 MB and 500 rows. Validation runs per row and checks:
- required fields and email format;
- duplicates in the file;
- account role or institution conflicts;
- duplicate question text against the bank.

**Flow:** preview first, then commit. The commit runs only when there are zero invalid rows.

**Evidence:**
- **L**: invalid rows block the commit; duplicates are flagged.
- **B**: row errors shown in the bank UI.

**Gap:**
- The commit is row-by-row, not in a single transaction. A database failure part-way through could leave a partial import.

## 4.5 Question analytics: VERIFIED COMPLETE

Per-question figures, computed from submitted real attempts only, with a small-sample warning:
- skipped count and rate;
- incorrect count and rate;
- facility index;
- observed vs configured difficulty;
- top wrong options.

**Evidence:**
- **U**: counts and wrong options.
- **L**: sample size.
- **B**: analytics tab.

## 4.6 Verifiable reports: VERIFIED COMPLETE

`secrets.token_urlsafe(24)` token stored in `IssuedReports`. The public `/verify/<token>` returns validity, exam title, report ID and issue time only. Reports can be revoked. Since `d6f81f3` the PDF also carries a QR code of the verification URL (built on `FRONTEND_URL`).

**Evidence:**
- **L**: valid token accepted; forged token rejected; response contains no name, roll number or marks.
- **RT**: QR rendered in a sample PDF.

**NOT VERIFIED:**
- Scanning the QR with a phone against a deployed URL.

## 4.7 Customizable workspace: VERIFIED COMPLETE

Text size (100, 112, 125 or 140%), high contrast and a focus layout. Stored per user in `localStorage` and display-only.

**Evidence:**
- **B**: the setting persists across a reload.

**Gap:**
- Preferences do not follow the user to another device (by design, since nothing is stored server-side).

## 4.8 Digital scratchpad: VERIFIED COMPLETE

Per-attempt, browser-local notes. The text is never sent over the network and is cleared on sign-out.

**Evidence:**
- **B**: notes persist across a reload; the note text does not appear in network traffic or in the attempt data.

## 5.3 Failure-resilient examinations: VERIFIED COMPLETE (core invariants)

| Scenario | Result | Evidence |
|---|---|---|
| Internet outage while answering | Change stays "Pending sync" in the durable outbox; timer keeps running | B |
| Reconnect | Outbox flushes in `client_seq` order; "Saved on server" | B |
| Duplicate request | `mutation_id` replay returns `duplicate` with no second write | L |
| Late older change | Rejected as `stale`; newer server state kept | L |
| Refresh during attempt | Server answers plus device outbox restored; deadline unchanged | B, L |
| Server deadline passes while offline | Late change refused (`attempt_expired`); attempt finalized with answers received in time; UI reports changes not counted | B, L |
| Session check fails due to network | User stays signed in | B |
| Device clock changed | Not tested directly. Mitigated by design: the timer uses server time plus `performance.now()` | **NOT VERIFIED** |
| Browser crash and reopen with pending outbox | `localStorage` survives by design; not tested | **NOT VERIFIED** |
| Tab suspension (background throttling) | Not tested | **NOT VERIFIED** |
| API timeout (hung save) | No client timeout on saves; sync is delayed, never falsely saved | **PARTIALLY IMPLEMENTED** |
| Submission while offline | Submit first flushes, then calls the API. When offline the submit fails with a visible error and answers stay pending. | Behavior read from code; not browser-tested |

**Invariant:** recovery never extends the server deadline. The browser clock is never authoritative. A local change is never shown as server-saved.

## Submission requirement 07: NOT IMPLEMENTED (deployment)

The Git repository and README (with per-role credentials and the innovation description) exist. The application is **not deployed**. The step-by-step checklist is in `docs/DEPLOYMENT.md`. The rulebook forbids builds and deployments after the 20:00 PKT deadline.
