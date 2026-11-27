# نگران 360: redesign audit and plan (index and executive summary)

**Baseline:** `main` @ `d6f81f3`, audited 27 Nov 2026, 16:53–17:05 PKT.
**Scope:** inspection, testing and planning only. No application source, schema, configuration or deployment was changed during the audit, and nothing in this folder is committed.

## Documents

| File | Contents |
|---|---|
| [NIGRAN_PRODUCT_AUDIT.md](NIGRAN_PRODUCT_AUDIT.md) | Repository, architecture, runtime and test baseline |
| [NIGRAN_REQUIREMENT_TRACEABILITY.md](NIGRAN_REQUIREMENT_TRACEABILITY.md) | 3.1–3.8, 4.1–4.8, 5.3 and 07: status and evidence |
| [NIGRAN_FUNCTIONAL_GAP_ANALYSIS.md](NIGRAN_FUNCTIONAL_GAP_ANALYSIS.md) | Ranked gaps, NOT VERIFIED items, integration gaps |
| [NIGRAN_SECURITY_RELIABILITY_AUDIT.md](NIGRAN_SECURITY_RELIABILITY_AUDIT.md) | Security findings, exam guarantees, race conditions |
| [NIGRAN_UX_AUDIT.md](NIGRAN_UX_AUDIT.md) | Role-by-role and cross-cutting UX and accessibility findings |
| [NIGRAN_SCREEN_INVENTORY.md](NIGRAN_SCREEN_INVENTORY.md) | Every route, its states, redesign requirements, missing screens |
| [NIGRAN_BRAND_IDENTITY.md](NIGRAN_BRAND_IDENTITY.md) | Urdu wordmark `نگران 360`, mark, variants, bidi rules |
| [NIGRAN_DESIGN_DIRECTION.md](NIGRAN_DESIGN_DIRECTION.md) | Directions A, B and C, scoring, recommendation |
| [NIGRAN_DESIGN_SYSTEM.md](NIGRAN_DESIGN_SYSTEM.md) | Tokens (HEX values plus measured contrast), type, spacing, components |
| [NIGRAN_IMPLEMENTATION_ROADMAP.md](NIGRAN_IMPLEMENTATION_ROADMAP.md) | Phase 0 and P0–P3 with acceptance criteria and tests |
| [NIGRAN_UAT_PLAN.md](NIGRAN_UAT_PLAN.md) | Manual acceptance cases for all roles |
| [NIGRAN_REDESIGN_DECISION_LOG.md](NIGRAN_REDESIGN_DECISION_LOG.md) | Decisions, alternatives, trade-offs |
| `baseline/` | 10 screenshots of the current product (synthetic data) |

## Executive summary

1. **Is the product genuinely complete?** It is functionally complete against the problem statement, with two requirements only partially met (3.1, 3.7). As a **competition submission it is not complete**, because it is **not deployed**.
2. **Verified complete:** 3.2, 3.3, 3.4, 3.5, 3.6, 3.8, 4.1–4.8, and 5.3 (core invariants).
3. **Partially implemented:**
   - **3.1:** legacy session and report views are scoped per institution, not per examiner; no login throttling.
   - **3.7:** regrading after publication is silent; no grading history or concurrency guard.
4. **Broken:** none known at `d6f81f3`. Five gaps were found and fixed during the review, then verified before the audit started: single-candidate incident capture, announcements missing in the exam, examiner isolation, QR code, answer-sheet review.
5. **Missing:** deployment (submission requirement 07); profile and change-password page; candidate result detail view; admin paging.
6. **Not verifiable here:**
   - the hosted deployment;
   - QR scan on a phone;
   - a screen-reader pass;
   - browser crash and reopen with pending sync;
   - tab suspension;
   - device-clock manipulation in a browser;
   - production 500-error format;
   - Google OAuth and SMTP;
   - load testing.
7. **Critical security or integrity risks:** none critical. High: no login throttling (S1). Medium: token lifetime and revocation (S2), legacy cross-examiner visibility (S3), silent post-publication regrade (S4). Narrow race windows: save vs submit (R1) and the deadline boundary (R2).
8. **Is 5.3 working?** Yes, for outage, reconnect, duplicate, stale, refresh, deadline and session survival. All are verified by automated browser and API tests, and the deadline is never extended. Remaining gap: no client timeout on hung saves (R5).
9. **Does the UI look like a distinct Nigran 360 product?** Not yet:
   - English-only "Nigran 360 · INTEGRITY OS" with a shield icon;
   - ProctorAI glass, glow and gradient styling;
   - system fonts and 55 uses of 10–11 px text;
   - no favicon;
   - no Urdu wordmark.
10. **Recommended direction:** C, "Paper & Graphite", an adaptive system (weighted 119/130 vs B 109 and A 95):
    - a warm paper appearance for reading;
    - a graphite appearance for monitoring;
    - one token set;
    - lapis, teal and gold palette;
    - Source Serif 4, IBM Plex Sans and IBM Plex Mono.
11. **Brand identity:** an outlined-SVG lockup `نگران 360`:
    - Gulzar Nastaliq letters with Source Serif 4 numerals;
    - fixed RTL visual order (360 to the left of نگران);
    - icon: the "open noon", a ن bowl as a near-closed 360° ring with the nuqta in the gap.
12. **Highest-priority changes:**
    - Phase 0: deploy before 20:00 PKT.
    - P0: login throttling, atomic save/submit, grading history and amend flow, owner-scoped sessions, token lifecycle.
    - P1: design-system foundation, a dedicated exam layout, examiner exam workspace, admin paging.
13. **Safest sequence:** deploy → integrity and security fixes → design-system foundation → exam workspace → examiner → admin → remaining screens and polish. Each step is gated by the full automated suite plus axe.
14. **Must be tested manually:** QR scan on a phone; a real-network offline test on the deployed site; device-clock change; keyboard-only and screen-reader runs; mobile on a real device; free-tier cold start. See the UAT plan.
15. **Limitations to state before the demo:**
    - The camera, audio and phone engine is local-only (the cloud shows browser signals only).
    - Monitoring indicators are not evidence.
    - Answers not received by the server before the deadline do not count, by design.

**Update (18:10 PKT):** the P0 items S1, S3, S4, R1–R3 and R5, plus the exam layout, brand, accessibility fixes, account page, admin paging, and candidate question breakdown (L3), are implemented and verified. See the update table in the traceability document. 3.1 and 3.7 are now VERIFIED COMPLETE. All 11 Playwright tests pass.

**Overall readiness:** **FUNCTIONALLY READY WITH KNOWN GAPS**, as a product. As a competition submission it is **NOT READY until it is deployed**, and deployment must finish before 20:00 PKT.

## Testing plan (Part 14)

**Existing tests:**

| Suite | Count | Covers |
|---|---|---|
| Backend `pytest` | 85 | Rules, services, security regressions, migrations |
| Live API journey | 84 checks | All roles, lifecycle, privacy, 5.3, disputes, isolation |
| Playwright (Chrome) | 9 | 5.3 offline and deadline, session survival, scratchpad and preferences, grading and publish, bank, roles, disputes, in-exam announcements and answer sheet |
| Typecheck and build | — | Passing |

**To add** (each is tied to a roadmap item):
- **Backend:** login throttling; post-logout token reuse; concurrency for save vs submit and for grading; transactional import; owner-scoped legacy sessions.
- **Frontend:** axe in CI for every route; a 390 px responsive run of the exam; a hung-save route test; a skip-link and focus-order test; a theme-contrast snapshot.
- **End-to-end:** the same Playwright suite against the deployed URL (smoke subset); a long-session token refresh with a fake clock.

No ESLint configuration is run today (`npm run lint` = `tsc --noEmit`); adding ESLint with `jsx-a11y` is recommended in P1-1.
