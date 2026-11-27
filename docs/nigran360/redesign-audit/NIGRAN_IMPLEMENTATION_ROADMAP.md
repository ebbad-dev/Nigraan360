# نگران 360: implementation roadmap

> **Competition constraint:** the official cutoff is **20:00 PKT, 27 Nov 2026**. The rulebook disqualifies any commit, push, build or deployment after it.
>
> At the time of writing (17:05 PKT), only **Phase 0** can be completed for the submission. Phases P0–P3 are a post-competition product plan unless you approve specific items before the cutoff. Nothing below has been implemented in this audit.

## Phase 0: submission readiness (before 20:00 PKT, the only time-critical work)

| Item | Detail |
|---|---|
| Objective | A deployed, demonstrable app; README URLs filled in |
| Scope | Run `docs/DEPLOYMENT.md` (hosted MSSQL → Render API → Netlify SPA → `scripts/seed_demo.py` against the hosted DB → CORS/FRONTEND_URL), then smoke-test the 5.3 demo on the deployed URL |
| Files | `README.md` (URLs only) |
| Risks | Render build takes 10–15 minutes; free instances sleep; changing CORS triggers a redeploy, so it must also finish before 20:00 |
| Acceptance | `/health` healthy; the three demo accounts log in; DEMO360 runs end to end on the deployed site |
| Rollback | None needed (additive) |

## P0: critical (security, data integrity, timing)

Estimate: 1–1.5 days.

| # | Objective | Scope | Files likely affected | Dependencies | Risks | Acceptance | Tests |
|---|---|---|---|---|---|---|---|
| P0-1 | Login throttling (S1) | Per-IP and per-account sliding window; audit event; 429 with retry-after | `services/identity_service.py`, `routers/identity.py`, new `LoginAttempts` table or in-memory store plus migration | Migration `0004` | Locking out legitimate users behind NAT | 6th failure in 5 minutes returns 429; success resets | Unit + API |
| P0-2 | Close the save/submit/deadline windows (R1, R2) | Conditional UPSERT with the deadline and status checked in SQL; `UPDLOCK` in submit | `database/assessment_repository.py`, `platform_repository.submit_attempt` | — | Deadlocks; keep transactions short | No response written after `submitted_at` or `deadline_at` in 50 interleavings | Concurrency test (threads against SQL Server) |
| P0-3 | Grading consistency (S4, R3) | `GradeHistory` table; optimistic precondition; "amend published result" flow with reason and candidate notice | `assessment_service.grade_response`, repository, migration `0005`, grading UI | P1 UI for the amend dialog | Breaking the current grading UX | Post-publish regrade without amend returns 409; history row written; concurrent stale grade returns 409 | Unit + API + Playwright |
| P0-4 | Owner scope for legacy sessions and reports (S3) | Join sessions to exam ownership | `fastapi_app._require_session_access`, `/sessions` list query | — | Hiding sessions admins need | Examiner B gets 403 on A's sessions, evidence and reports | API |
| P0-5 | Token lifecycle (S2) | 30-minute access token plus refresh; `jti` denylist on logout | `core/security.py`, identity router, `lib/api.ts` (refresh on 401) | P0-1 | **Mid-exam expiry must refresh silently. The outbox already survives 401 retries.** | Reused token after logout returns 401; a 3-hour exam never logs out | API + Playwright long-session test with a fake clock |

## P1: core completeness and IA

Estimate: 2–3 days. The **design system lands first** so new screens use it.

| # | Objective | Scope | Files | Acceptance |
|---|---|---|---|---|
| P1-1 | **Design system foundation** | Tokens (both appearances), self-hosted fonts, `public/` with favicon and SVG lockup, base components (Button, Field, Table, Tabs, Dialog, Badge, Toast, Empty/Loading/Error) | `src/styles.css`, `components/ui/*`, new `components/brand/*`, `public/fonts`, `public/brand` | Storybook-free visual check page `/__design` (development only); axe 0 on it |
| P1-2 | Dedicated **exam layout** (U-1, U-2, M9) | Exam route uses `ExamShell` (no sidebar); sticky timer bar; navigator sheet; skip link | `routes/exam.tsx`, new `components/exam/*` | axe 0; first Tab lands on "Skip to question"; timer visible at 390 px throughout |
| P1-3 | Examiner **Exams index plus Exam workspace tabs** (U-6, U-8, U-9) | Split `/instructor`; nest results, monitor and grading as tabs; "review before publish" overview | `routes/instructor.tsx` → `routes/exams.*`, `exam-results.$examId.tsx` | axe 0 (nested-interactive resolved); all existing Playwright flows pass after selector updates |
| P1-4 | Admin paging and IA (M5, U-13, U-14) | Server pagination (`limit`, `cursor`), filters, audit-log filters | `/admin/users`, `/audit-logs`, `routes/admin.tsx` | 1,000 seeded users render in under 1 s; page size 25 |
| P1-5 | Profile and account page (M8) | Change password, appearance, sign out | New route, identity endpoint (exists for reset) | User changes own password; old password required |
| P1-6 | Monitoring IA (M3, U-7) | Per-exam monitor as the single entry point; legacy camera view becomes "Session detail"; neutral wording | `routes/monitor.tsx`, `sessions.$sessionId.tsx` | No "risk story" headline; indicators labelled "for review" |

## P2: secondary and innovation hardening

| # | Item | Acceptance |
|---|---|---|
| P2-1 | Save request timeout and backoff (R5, M7) | Hung route: change stays pending, syncs after release, never shows "saved" early |
| P2-2 | Clear the outbox after finalization (L9); clear on sign-out after a final flush attempt | No `n360:outbox` keys remain after receipt |
| P2-3 | Transactional import commit (R7); claim-then-apply disputes (R6) | Failure injection persists 0 rows; concurrent decisions apply marks once |
| P2-4 | Candidate result detail (L3) | Breakdown and feedback match the PDF |
| P2-5 | Optional server-side preferences (L4) | Preferences follow the user across devices |
| P2-6 | PDF brand lockup (outlined SVG drawn with `svglib` or as a ReportLab path) | Urdu wordmark renders correctly in the PDF |
| P2-7 | Proctored-exam flag per exam (I1, I2) | Exam setting "Require proctored check" routes candidates through the stepper |

## P3: product polish

1. Apply the design system to every remaining legacy screen (L6, L7).
2. Graphite appearance plus the appearance preference.
3. Motion pass with reduced-motion support.
4. Mobile pass for examiner and admin tables.
5. Copy pass: labels, empty states, errors.
6. Future Urdu UI groundwork: logical properties.

## Sequencing rationale

1. **Phase 0 first:** it is the only work that affects the competition outcome.
2. **P0 next:** it fixes integrity and security before any visual work.
3. **P1-1 (design system) before any redesigned screen,** so nothing is restyled twice.
4. **P1-2 (exam layout) before the examiner screens,** because the candidate workspace is the most judged and most sensitive surface.

**Rollback:** each item is a separate PR behind its own migration. The design system is additive until the old CSS variables are removed in P3.

## Testing gate for every phase

All of the following must pass before a phase is accepted:
- `pytest` + `nigran_live_e2e.py` + Playwright (full suite);
- typecheck + build;
- axe on changed screens.

New tests are listed per item above. No test may be deleted to make a phase pass.
