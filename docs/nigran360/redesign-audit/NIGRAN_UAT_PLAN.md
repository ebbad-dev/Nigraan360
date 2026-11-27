# نگران 360: UAT plan

## Accounts and data

All data is synthetic, created by `scripts/seed_demo.py`.

| Role | Account | Password |
|---|---|---|
| Administrator | `admin@nigran360.demo` | `Nigran360!Admin` |
| Examiner | `examiner@nigran360.demo` | `Nigran360!Examiner` |
| Candidate | `candidate@nigran360.demo` | `Nigran360!Candidate` |
| Candidate (second) | `candidate2@nigran360.demo` | `Nigran360!Candidate` |

A second examiner, "Examiner B", is created during the run by the admin.

## Browsers and devices

| Environment | Setup |
|---|---|
| Desktop | Chrome (latest) at 1440×900 and 1024×768; Edge at 1440×900 |
| Mobile | iPhone-size emulation 390×844; one real Android phone, for the QR scan |

## Pass criteria

- Every step's expected result is observed.
- No console errors.
- No 5xx responses in the API log.
- Data-integrity checks hold.

## Automation already covering these cases

- `scripts/nigran_live_e2e.py`: 84 API checks.
- `frontend/e2e/*.spec.ts`: 9 browser tests.

The **manual** rows below are what automation cannot prove: perception, devices, real networks and deployment.

## A. Administrator

| ID | Preconditions | Steps | Expected | Negative / security check |
|---|---|---|---|---|
| A1 | Seeded DB | Sign in as admin | Lands on `/admin`; brand visible | Wrong password shows an inline error and no account hint |
| A2 | A1 | Create "Examiner B" (role Examiner) | Appears in the user list; audit-log entry | Duplicate email shows a clear error |
| A3 | A2 | Change the candidate's role to Examiner and back; deactivate, then reactivate | Changes persist; a deactivated user cannot sign in (401) | — |
| A4 | A1 | Open the audit log | Recent actions listed with actor and time | Examiner opening `/admin` is redirected; API returns 403 |

## B. Examiner: authoring and lifecycle

| ID | Steps | Expected | Negative |
|---|---|---|---|
| B1 | Create an exam (title, instructions, start in 2 minutes, 15-minute duration, randomize options) | Draft listed; lifecycle "draft" | Missing title: Create is disabled or a validation message appears |
| B2 | Add an MCQ, a multiple-select with partial marking, and a written question; add 1 question from the bank | Question count and marks total update | MCQ with two correct options is refused; marks above 100 are refused |
| B3 | Publish with declared total marks ≠ the question total | Refused with a "marks mismatch" message | — |
| B4 | Fix the marks and publish | Status published; questions locked | Editing a question while published is refused |
| B5 | Preview as candidate (sandbox) | SANDBOX banner; submission shows "Sandbox preview finished" | Results and analytics are unchanged afterwards |
| B6 | Enrol a candidate by email; bulk-import 3 candidates where 1 row is invalid | Invalid row reported; nothing saved until fixed; then all are enrolled | Importing a non-candidate email is refused |
| B7 | Sign in as Examiner B | DEMO360 and B1 are **not** listed; a direct URL to `/exam-results/<id>` shows a 403 error state | — |

## C. Candidate: delivery and 5.3 (run on the **deployed** site and locally)

| ID | Steps | Expected | Integrity check |
|---|---|---|---|
| C1 | Sign in before the B1 window opens | Exam under "Upcoming"; no Start button | `POST /attempts/start` returns 422 or 409 |
| C2 | After it opens: Start, enter roll number | Timer shows about 15:00; announcement area visible | `deadline_at` = start + 15 minutes (API) |
| C3 | Answer the MCQ | "Saved on server" | Response present via the examiner monitor |
| C4 | DevTools → Network → Offline. Answer the multiple-select, type in the written answer | Red "offline" banner; questions show "Pending sync"; timer keeps counting | No server write while offline |
| C5 | Reload the page while offline (if the browser allows) or close and reopen the tab, then go online | Pending changes restored from the device and synced: "Reconnected" banner, then "Saved on server" | Server copies match the screen |
| C6 | Mark question 2 for review; open the scratchpad and type notes; set text size to 125% | Flag icon in the navigator; notes and setting persist after reload | Notes never appear in the Network tab |
| C7 | Examiner posts an "Urgent" announcement | Appears in the candidate's exam within 30 s, marked New | Non-enrolled candidate never receives it |
| C8 | Change the device clock +30 minutes and reload | Timer still shows the server-based remaining time | Deadline unchanged in the API |
| C9 | Go offline, change an answer, wait past the deadline (use a 2-minute exam), go online | Attempt shows as submitted; message says the changes made offline were not counted | Server keeps the last answer received in time |
| C10 | Review & submit on a normal attempt | Dialog lists unanswered, flagged and unsynced counts; receipt with server time | A second submit (double click, retry) creates no duplicate; same `submitted_at` |

## D. Examiner: monitoring, grading, results

| ID | Steps | Expected | Negative |
|---|---|---|---|
| D1 | Monitor tab during C3–C6 | Progress, time left, last save, tab-switch events listed "for human review" | Candidate GET `/exams/{id}/monitor` returns 403 |
| D2 | Results before grading | "Not published"; publish disabled; pending count shown | Candidate sees "Awaiting result publication" |
| D3 | Grade the written answer with 9 marks on a 5-mark question, then 2.5, then 4 | First two refused with messages; 4 accepted; total updates | — |
| D4 | View answers for the candidate | Chosen vs correct options; written text and feedback | Examiner B gets 403 |
| D5 | Publish | Confirmation dialog states the effect; then "Published" | — |
| D6 | Analytics tab | Skipped, incorrect, facility and common wrong options match the actual answers; small-sample note | Sandbox attempt not counted |

## E. Results, disputes, reports

| ID | Steps | Expected | Integrity check |
|---|---|---|---|
| E1 | Candidate opens My Results | Own score and percentage only | Other candidate's `/attempts/{id}` returns 403 |
| E2 | Dispute the written question | Recorded; status "open" | Duplicate open dispute refused |
| E3 | Examiner upholds with revised marks | Candidate total changes; dispute shows original → revised | Second decision refused |
| E4 | Download the PDF | Readable; correct marks and total; QR present | Other candidate cannot download it |
| E5 | Scan the QR with a phone (deployed URL) | Verify page shows "Report verified", exam and issue date only | A random token shows "Report not found"; no name, roll number or marks |

## F. Cross-cutting checks

| ID | Check | Expected |
|---|---|---|
| F1 | Keyboard-only run of C2–C10 | Every control reachable; visible focus; no traps |
| F2 | 390 px mobile run of C2–C10 | No horizontal scroll; timer and submit reachable |
| F3 | axe-core on each changed screen | 0 serious or critical violations |
| F4 | Restart the API mid-attempt (`Ctrl+C`, then start again) | Banner shows "unreachable", then "reconnected"; no answers lost; deadline unchanged |
| F5 | Free-tier cold start (deployed) | First request within about 60 s; app shows "checking", then online |

## Known demo limitations (state them to judges)

- The camera, audio and phone engine needs a local machine; the cloud deployment shows browser-side signals only.
- Monitoring indicators are for review, not evidence.
- Answers that never reach the server before the deadline do not count. This is deliberate fairness.
