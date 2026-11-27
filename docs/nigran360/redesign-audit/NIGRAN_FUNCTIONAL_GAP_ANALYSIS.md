# Nigran 360: functional gap analysis

Ranked by severity, as of HEAD `d6f81f3`. Statuses follow the traceability document.

**Already fixed during this review:** five gaps found while reviewing against the problem statement were fixed in commit `d6f81f3`, which was pushed after verification (live API 84/84, browser 9/9):
- incidents were recorded for only one candidate server-wide;
- announcements did not appear in the exam workspace;
- examiners were not isolated from each other's exams;
- the PDF had no QR code;
- examiners could not review an answer sheet.

## Critical (blocks the competition submission)

| # | Gap | Area | Impact | Fix |
|---|---|---|---|---|
| C1 | **Application not deployed.** Section 07 requires "a deployed, functional web application"; the rulebook requires a live demo of the deployed site and forbids deployments after 20:00 PKT | Delivery | Submission is non-compliant until it is deployed | Follow `docs/DEPLOYMENT.md` (hosted MSSQL → Render → Netlify → `seed_demo.py` → CORS). Fill in the README URLs before 20:00 |

## High

| # | Gap | Area | Impact | Fix |
|---|---|---|---|---|
| H1 | No login throttling (S1) | Security / backend | Online password guessing | Rate limiter plus audit event |
| H2 | Exam workspace still shows the full app chrome during an attempt: sidebar, global search, command palette, links to other pages | UX / frontend | Distraction; candidates can navigate away; keyboard users tab through the sidebar first: measured, the 6th Tab press is still on the "Browser Guard" sidebar link (no skip link) | A dedicated focused exam layout: top bar with brand, timer, connection and save state, submit; navigator; no global navigation |
| H3 | Brand identity missing: English "Nigran 360 · INTEGRITY OS", no Urdu wordmark `نگران 360`, no favicon (no `public/` directory), system font stack only | Brand / frontend | Product does not read as Nigran 360; judges penalize template-looking UI | Brand and design-system phase (P3, but start early) |

## Medium

| # | Gap | Area | Impact | Fix |
|---|---|---|---|---|
| M1 | Regrade after publication is silent; no grading history; last write wins (S4, R3) | Backend grading | "Consistent grading state" (3.7) only partially met | Amend flow plus `GradeHistory` plus optimistic precondition |
| M2 | Legacy session, report and monitor views are institution-scoped for examiners (S3) | Security | Cross-examiner visibility inside one institution | Owner-scoped joins |
| M3 | Two monitoring concepts (`/monitor` legacy camera session vs `/exam-results/:id` monitor) and two report concepts (session integrity PDF vs academic result PDF) with similar names | Information architecture | Confusing navigation; "Live Monitor" in the nav opens a single-session camera view | Rename the legacy items ("Proctoring session", "Integrity report"), nest them under the exam, or hide them for examiners without the local engine |
| M4 | Examiner dashboard leads with legacy proctoring KPIs (total sessions, high-risk, risk donut). Exam lifecycle, pending grading and disputes are not summarised | UX | The examiner's primary jobs are not surfaced | New examiner home: My exams by lifecycle, grading queue count, open disputes, live attempts |
| M5 | Admin console renders every user and audit-log row: no pagination or server paging (page about 11,600 px tall with test data) | Admin UX / API | Unusable at scale; slow | Paginated API (`limit`, `cursor`) plus table paging and filters |
| M6 | axe-core on the examiner dashboard: **nested-interactive (62 nodes)**, caused by the "Results & Analytics" link inside each exam-list button; **select-name (1, critical)** | Accessibility | Fails WCAG 4.1.2 | Turn the list rows into non-button containers with separate actions; label the select |
| M7 | Save requests have no client timeout (R5) | 5.3 resilience | A hung request delays sync | AbortController with a 10-second timeout |
| M8 | No user profile or account page: users cannot change their own password in-app. Forgot-password depends on SMTP (not configured locally) | Account | Users without SMTP cannot recover access | Profile page with change password |
| M9 | Mobile exam workspace: timer and submit scroll off-screen; navigator and two info panels push the question below the fold | Responsive UX | Mobile candidates lose time awareness | Sticky top timer bar; navigator in a bottom sheet; info panels collapsed |

## Low

| # | Gap | Area | Fix |
|---|---|---|---|
| L1 | Bulk import commit is not transactional (R7) | Backend | Single transaction |
| L2 | Dispute decision ordering (R6) | Backend | Claim, then apply |
| L3 | Candidate result view shows only the total. The per-question breakdown is only in the PDF; feedback is not shown in the UI | Candidate UX | Result detail page |
| L4 | Display preferences are device-local only | 4.7 | Optional server persistence |
| L5 | PBKDF2 round count (S5); temporary-password change not enforced (S6) | Security | Raise rounds; force change |
| L6 | 55 usages of 10–11 px text (`text-[10px]` ×14, `text-[11px]` ×41) | Typography | Minimum 12 px; 13 px for helper text |
| L7 | Decorative effects: `bg-gradient-primary` ×12, `shadow-glow` ×9, glass surfaces ×6, gradient text ×2 | Visual design | Replace with design-system tokens |
| L8 | Guide-assistant panel in the legacy monitor squeezes its header into a 60 px column (text wraps one word per line) | Layout bug | Fix the panel layout or drop it from the monitor |
| L9 | The outbox is not cleared when an attempt is finalized, so unsynced data stays on shared devices | Privacy | Clear after finalization |

## NOT VERIFIED

- Screen-reader walkthrough (only automated axe rules were run).
- Browser crash and reopen with a pending outbox.
- Tab suspension.
- Device-clock manipulation in a browser.
- Production 500-error format.
- QR scan on a phone.
- Behavior on the hosted MSSQL and Render (not deployed).
- Google OAuth sign-in.
- SMTP password reset.
- Behavior with more than about 100 concurrent candidates (no load test).

## Integration gaps (features that work alone but not together)

| # | Gap |
|---|---|
| I1 | The optional proctored setup (`/setup`) and the dashboard start are two different entry paths, with different checks (camera, ID, room scan vs roll number only). Examiners cannot choose per exam which path is required. |
| I2 | Global proctoring "Strictness & policies" (`/settings`) is not linked to the Nigran exam settings (exam `rules` JSON), so it is unclear which one governs an exam. |
| I3 | Legacy session reports and academic result reports are generated separately, with no single "exam record" page per candidate. |
