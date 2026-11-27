# Nigran 360: security, data-integrity and reliability audit

**Scope:** code inspection of HEAD `d6f81f3`, plus runtime checks against the local stack (synthetic data only). No code was changed during this audit.

## Overall assessment

There are no critical findings: nothing lets a candidate read answer keys, alter another candidate's data, gain time, or see unpublished results.

The core exam guarantees are implemented and tested:
- server-authoritative timing;
- idempotent submit;
- write-once snapshots;
- stale and duplicate save handling;
- sandbox isolation.

The open items are:
- three access-control and session hardening gaps;
- two grading-consistency gaps;
- three narrow race windows.

## Findings

| ID | Severity | Finding | Evidence | Recommended control | Test to add |
|---|---|---|---|---|---|
| S1 | **High** (production) / Medium (demo) | No throttling or lockout on `POST /auth/login`, so passwords can be brute-forced online | No rate limiter in `identity.py`, `identity_service.py` or `fastapi_app.py` | Per-IP and per-account sliding window (for example 5 failures in 5 minutes returns 429), with an audit event | 6th failed login returns 429; a successful login resets the window |
| S2 | Medium | JWT access token lasts 480 minutes and lives in `localStorage`. Logout clears it on the client only and nothing revokes it on the server | `config/settings.py:118`, `lib/auth.ts`, `api.logout()` | Short access token (15–30 minutes) plus a refresh token, or a `jti` denylist checked in `_current_user`. Optionally httpOnly cookie plus a CSRF token | A token reused after logout returns 401 |
| S3 | Medium | Legacy ProctorAI session, report and monitor endpoints authorize examiners **per institution**, not per exam owner. Examiner B can open examiner A's candidates' proctoring sessions and evidence | `_require_session_access` (`fastapi_app.py:464`) checks `tenant_id` only for instructors | Join `Sessions → ExamAttempts → Exams.created_by` in the access check and in `/sessions` listings | Examiner B gets 403 on A's `/sessions/{id}`, `/events`, `/evidence` and `/report` |
| S4 | Medium | Regrading after publication silently changes a published result (`grade_response` has no publication guard and no history) | `assessment_service.grade_response` | "Amend published result" flow with a mandatory reason, a `GradeHistory` table and a candidate-visible change note | A post-publish regrade without the amend flag returns 409; a history row is written |
| S5 | Low | PBKDF2-SHA256 with 240,000 rounds is below current OWASP guidance (600,000) | `core/security.py:60` | Raise the round count; rehash on next login | Hash format test |
| S6 | Low | Bulk candidate import returns one-time temporary passwords in the API response and UI. No forced password change on first login was found | `import_candidates` | `must_change_password` flag; show the credentials once and mask them in audit logs | First login with a temporary password forces a change |
| S7 | Low | The public verification endpoint has no rate limit. Tokens are 192-bit, so enumeration is infeasible, but it can be used for load | `verify_report` | Light per-IP limit | — |
| S8 | Info | CORS uses an explicit allowlist with credentials; `AUTH_SECRET` of at least 32 characters is enforced in production; no `dangerouslySetInnerHTML` in application code (React escaping protects rendered user text); SQL is always parameterized (`?` placeholders) | Code inspection | Keep | Keep the regression tests |
| S9 | Info | Answer-key exposure: candidates get `GET /exams/{id}/questions` → 403; attempt payloads use `candidate_questions(include_correct=False)`; grading fields are hidden until publication | **U** test `test_candidate_projection_strips_answer_keys`; **L** step "answer key not exposed" | Keep | — |
| S10 | NOT VERIFIED | Behavior of unhandled 500 errors (stack-trace leakage) in production mode | Not exercised | Confirm the generic handler returns `{error, message}` only | Force an exception in a test route |

## Exam-integrity guarantees

| # | Guarantee | Status | How it is enforced |
|---|---|---|---|
| 1 | Server-authoritative timing | Holds | `deadline_at` is stored at start (start + duration, capped by the exam end). Saves after the deadline return 409 `attempt_expired`. A 60-second sweep plus on-access finalization. The client timer is anchored to `server_now` and `performance.now()`. |
| 2 | Idempotent submission | Holds | `submit_attempt` replays an already-submitted attempt (`idempotent_replay`). A filtered unique index allows one in-progress attempt per user. |
| 3 | Duplicate request handling | Holds | `mutation_id` equal to `last_mutation_id` returns `duplicate`. |
| 4 | Concurrent answer saves | Holds, with a caveat | Per-question `client_seq` rejects older writes. Writes in the same instant from two devices rely on seeding `client_seq` from the server maximum (see R4). |
| 5 | Concurrent submission | Holds | Tested in `test_concurrent_submit_loser_is_returned_as_an_idempotent_replay`. |
| 6 | Immutable question assignment | Holds | `snapshot_json` is written once (`WHERE snapshot_json IS NULL`). Bank edits never reach exams (copy on assign). |
| 7 | Protected marking scheme | Holds | The marking scheme lives in the snapshot; grading uses the snapshot. |
| 8 | Consistent grading | **Partial** | See S4 and R3. |
| 9 | Result publication integrity | Holds | Publishing is refused while grading is pending; candidates see scores only after publication. |
| 10 | Sandbox isolation | Holds | `attempt_type='sandbox'` is excluded by the `REAL` filter in every aggregate query. |
| 11 | Reliable answer synchronization | Holds, with a caveat | Durable outbox. No client timeout on saves (R5). |
| 12 | Recovery without deadline extension | Holds | Verified in **B** and **L**. |

## Race conditions

| ID | Trigger | Current behavior | Potential failure | Integrity impact | Proposed fix | Required test |
|---|---|---|---|---|---|---|
| R1 | An answer save and a submit for the same attempt arrive at the same moment | `save_response` checks `status='in_progress'`, then runs a separate UPSERT. `submit_attempt` reads responses, then updates the status. | A save can commit after submit has read the responses. `finalize_scores` runs after submit, so the score usually still includes it, but the answer was accepted after the official submission time. | Low–Medium | Make the UPSERT conditional in one statement: `... WHERE EXISTS (SELECT 1 FROM ExamAttempts WHERE attempt_id=? AND status='in_progress' AND deadline_at > SYSUTCDATETIME())`. Or take `UPDLOCK` on the attempt row inside a transaction in both paths. | Thread-based test: 50 interleavings of save and submit; no response `updated_at` later than `submitted_at` |
| R2 | A save starts just before the deadline and commits just after it | The deadline is checked before the write | A write lands a few milliseconds after the deadline | Low | Same conditional write as R1 (check the deadline inside the SQL) | Unit test with a fake clock on the boundary |
| R3 | Two examiners grade the same written response, or regrade after publication | Last write wins; no history | Silent overwrite of a grade | Medium | Optimistic precondition (`expected_previous_marks` or `updated_at`) plus `GradeHistory` | Concurrent grade where one call returns 409 |
| R4 | The same candidate answers on two devices | Each device seeds `client_seq` from the server maximum at load time | Device A's newer change can be rejected as `stale` if device B already used a higher sequence number; the candidate sees the server copy, so nothing is silently lost | Low (the UI adopts the server value) | Server-issued monotonic sequence on read, or a per-question vector | Two-context Playwright test |
| R5 | A save request hangs (no response, no network error) | No `AbortController` timeout on save `fetch` | Outbox flushing stalls until the browser's own timeout; the banner keeps showing "pending" | Low (UX) | 10-second timeout per save, treated as a network error and retried with backoff | Playwright route that never answers; the change stays pending and syncs after the route is released |
| R6 | Dispute decided twice at once | Marks are applied **before** the conditional `UPDATE ... WHERE status='open'` | Both requests can change marks; only one closes the dispute | Low | Claim the dispute first (`status='deciding' WHERE status='open'`), then apply the marks | Concurrent decision test |
| R7 | Bulk import commit fails part-way | Row-by-row inserts, no transaction | Partial import | Low | Wrap the commit in one transaction | Inject a failure at row N; zero rows persisted |
| R8 | Several API workers each run the expiry sweep | Finalization is idempotent | Duplicate work only | None | Keep | — |
| R9 | Schema migration interrupted | Each statement auto-commits; migration not atomic | Half-applied migration | Low (statements are guarded `IF NOT EXISTS`) | Keep the guards; add a re-run test | Run the migrations twice |

## Privacy

- **Public verification:** reveals validity, exam title, report ID and issue time only. Verified by **L**.
- **Monitoring copy:** the UI states that signals are for human review only.
- **Legacy risk score:** the old monitor's "risk score / risk story" presents an inferred risk as a headline. Recommend relabelling it as "observed events" with neutral language (UX audit U-7).
- **Device data:** stays on the device: scratchpad, preferences, and the outbox until it syncs. The scratchpad is cleared on sign-out. The outbox is **not** cleared on sign-out, so unsynced answers on a shared device stay in that browser's storage until they sync. Recommend clearing it after the attempt is finalized.
