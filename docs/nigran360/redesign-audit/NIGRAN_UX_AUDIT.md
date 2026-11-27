# Nigran 360: UX audit

Sources: screenshots in `baseline/`, plus earlier run screenshots (candidate dashboard, exam workspace, examiner dashboard, bank, exam monitor), axe-core results, and code inspection. Target standard: WCAG 2.2 AA.

## Findings by role

### Candidate
| ID | Finding | Severity | Recommendation |
|---|---|---|---|
| U-1 | The exam workspace keeps the full app shell: sidebar with 9 links, global search ⌘K, "Mode / Live API" card, Logout. Measured: the first 6 Tab presses stay in the sidebar. No skip link. | High | A dedicated **Exam layout** with no global navigation. The top bar holds the wordmark, exam title, timer, connection and save state, and **Review & submit**. Add "Skip to question" as the first focusable element. |
| U-2 | Mobile (390 px): the timer and the submit button scroll away. The navigator plus the two explanatory panels push the question 600 px down (`baseline/09`). | High | Sticky timer bar. Navigator as a bottom sheet ("Questions 3/12"). Explanatory panels collapsed behind an "i" button. Sticky bottom bar with Previous / Mark / Next. |
| U-3 | The candidate's first screen after login is good: clear groups and one primary action (`baseline/08`). But the old proctoring steps (Exam Setup, Checklist, ID Verification, Room Scan, Browser Guard) sit as top-level nav items next to "My Exams" with no explanation of when they apply. | Medium | Collapse them into a "Proctored exam setup" flow that opens only when the exam requires it. |
| U-4 | The result card shows only the total. The per-question breakdown and examiner feedback live only in the PDF. | Low | Result detail view with breakdown, feedback and dispute entry. |
| U-5 | The connection banner is always visible, even when everything is fine. That is useful for the demo but noisy for a long exam. | Low | When healthy, show a compact chip ("All saved · 14:02"); expand to the banner only on a problem. |

### Examiner
| ID | Finding | Severity | Recommendation |
|---|---|---|---|
| U-6 | The examiner home leads with legacy proctoring KPIs (Total sessions, High-risk, Pending review, risk donut, event histogram). Exam lifecycle, the grading queue and disputes are not on the home screen. | Medium | New home: "My exams" grouped Draft / Scheduled / Live now / Grading / Published, plus "Needs attention" (pending grades, open disputes, active incidents). |
| U-7 | Two "monitors": the nav "Live Monitor" (a legacy single-session camera view with a "Risk story: LOW-RISK" headline) and the per-exam Monitor tab. The legacy view leads with an *inferred* risk score. | Medium | One monitoring model per exam. Legacy camera detail becomes "Session detail" opened from an attempt row. Rename "risk" to "Observed events", and show computed scores only as secondary, labelled "Indicator, not evidence". |
| U-8 | The exam management page stacks the exam form, toolbar, question builder, enrolment and attendance in one very long column next to a 50-item exam list. Saving and publishing are far from the content. | Medium | Exam workspace with tabs: Overview · Questions · Candidates · Settings · Monitor · Results. Sticky header with status and the primary action (Publish / Preview / View results). |
| U-9 | axe: **nested-interactive ×62**. The "Results & Analytics" link sits inside each exam-list `<button>`. **select-name ×1**: an unlabelled select. | Medium (WCAG 4.1.2) | Rows become non-interactive containers with a primary link and separate actions; label every select. |
| U-10 | The status select shows "Published (use Pu…)", which is truncated. | Low | Replace with a status badge plus explicit lifecycle buttons. |
| U-11 | Report headings show raw IDs ("Session session_c42f…") in gradient text (`baseline/06`). | Low | Title: candidate name · exam. Show the ID as secondary monospace metadata. |
| U-12 | The guide-assistant panel in the legacy monitor wraps its title one word per line inside a 60 px column (`baseline/05`). | Low (layout bug) | Fix the layout or remove the panel from monitoring screens. |

### Administrator
| ID | Finding | Severity | Recommendation |
|---|---|---|---|
| U-13 | User management and the audit log render every row; the page is about 11,600 px tall with test data (`baseline/02`). No paging, sorting or bulk actions. | Medium | Paginated tables (25 per page) with search, role and status filters, sorting, and a sticky header. Audit log filtered by actor, action and date. |
| U-14 | The admin sees examiner-oriented navigation (Live Monitor, Examiner Dashboard, Question Bank, Exam Setup…) mixed with admin items. | Low | Admin nav: Overview · Users · Institutions · Audit log · Platform settings. Exam pages are reachable from Overview. |
| U-15 | "Settings → Strictness & policies" (global proctoring policy) has no stated relationship to per-exam rules. | Low | Rename to "Default proctoring policy", and state "applies to new exams; each exam can override". |

## Cross-cutting

| Area | Finding |
|---|---|
| Typography | System font stack only. 55 uses of 10–11 px text (`text-[10px]` ×14, `text-[11px]` ×41). Headings and body share one family, so there is little hierarchy. Some headings are oversized (e.g. the report title at about 26 px bold with gradient). |
| Colour and effects | Gradient buttons (×12), glow shadows (×9), glass blur cards (×6) and gradient text (×2). Cyan is used for actions, focus, links, charts and status, so it carries too many meanings. |
| Surfaces | Almost every element is a rounded glass card. Hierarchy comes from borders and boxes rather than spacing and typography. |
| Labels | Mostly specific ("Review & submit", "Save grade", "Confirm & start"). Some weak ones remain: "Overview" header fallback (now fixed for exam pages), "Mode" card, "Integrity OS". |
| States | New screens have loading, empty and error states and inline errors with `role="alert"`. Legacy screens show empty panels without an explanation (e.g. "Event timeline" and "Browser activity" are blank). |
| Contrast | No axe colour-contrast violations on the audited screens. Muted text on glass measures about 6.8:1 (`#A3A9B8` on `#1A2133`). |
| Motion | framer-motion hover lift on cards. The exam workspace has no distracting animation. `prefers-reduced-motion` is not honoured globally (NOT VERIFIED for every component). |
| Keyboard | Radios and checkboxes in the exam are real inputs (visually hidden, labelled). Focus rings exist (`focus-visible:ring`). There is no skip link anywhere. |
| Responsive | Candidate dashboard and exam stack correctly at 390 px, but they are long (U-2). Examiner and admin screens were not designed for mobile; they are acceptable at 1024 px or wider (screenshot only at 1440 px). |
| Brand | English only, shield icon, "INTEGRITY OS" tagline. The Urdu wordmark `نگران 360` is absent everywhere, including the favicon (none exists) and the PDF. |
