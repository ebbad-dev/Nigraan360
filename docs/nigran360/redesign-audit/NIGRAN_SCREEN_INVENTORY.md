# نگران 360: screen inventory

Routes are from `frontend/src/routes`. The "States" column lists what exists today: L = loading, E = empty, Er = error, S = success, D = permission denied.

Every redesign must deliver all five states plus the WCAG requirements in the design system.

## Authentication

| Route | Purpose | States today | Redesign requirements |
|---|---|---|---|
| `/login` | Email and password sign-in; Google sign-in | L, Er (inline banner) | Paper split layout: brand lockup and tagline on a navy panel; form on paper. Labels always visible. "Show password" button. Rate-limit message (after S1). |
| `/register` | Candidate self-registration | L, Er | Same frame. Password rules shown up front. Explicitly "candidate accounts only". |
| `/forgot-password`, `/reset-password` | Email reset (needs SMTP) | L, Er, S | State plainly when email delivery is unavailable. |
| `/oauth-callback` | Google return | L, Er | Progress text plus a fallback link. |
| `/verify/$token` (public) | Report authenticity | L, S (valid), Er (not found / revoked) | Brand lockup, large verdict icon and text, minimal fields, "what this proves" note. No navigation chrome. |

## Candidate

| Route | Purpose | States today | Redesign requirements |
|---|---|---|---|
| `/candidate` | Exams by state (in progress, available, upcoming, completed, closed), results, announcements, disputes | L, E, Er, S | Paper appearance. "Up next" hero for the nearest exam. Roll-number confirm sheet. Result detail view (L3). |
| `/exam?attempt_id=` | Exam workspace | L, Er (attempt failed), receipt, expired | **Dedicated exam layout (U-1).** Sticky top bar. Navigator drawer on mobile. Question column max 720 px. Scratchpad and display preferences in the top bar. Announcement strip. No global navigation. |
| `/setup`, `/checklist`, `/id-verification`, `/room-scan`, `/browser-guard` | Legacy proctored pre-exam flow (camera, ID, room) | Mixed | Combine into one stepper, "Proctored exam check", shown only when the exam's rules require it (I1). Remove from the top-level nav. |
| `/assistant` | Help assistant | — | Help panel opened from the "?" in the top bar; never during an active attempt. |
| `/reports` (candidate) | Legacy session report view | L, E | Replace with result detail + PDF (merge I3). |

## Examiner

| Route | Purpose | States today | Redesign requirements |
|---|---|---|---|
| `/instructor` | Legacy KPIs plus exam list and single long editor | L, E, Er | Split into an **Exams index** (lifecycle groups, "Needs attention") and an **Exam workspace** with tabs: Overview · Questions · Candidates · Settings · Monitor · Results (U-6, U-8). Fix nested-interactive (U-9). |
| `/bank` | Question bank: filter, create, edit, archive, import, assign | L, E, Er, S | Table view with type, difficulty and topic columns. Side-panel editor instead of a modal. Import as a 3-step dialog (upload, review errors, confirm). |
| `/exam-results/$examId` | Results, grading, disputes, analytics, monitor, announcements, answer sheet | L, E, Er, S | Becomes tabs of the exam workspace. The grading queue uses split view (answer on the left, marks and feedback on the right) with keyboard next/previous. |
| `/monitor` | Legacy single-session camera monitor | L, E | Re-home as "Session detail" opened from a monitor row (U-7). Neutral "Observed events" language. Fix the assistant panel (U-12). |
| `/sessions/$sessionId` | Legacy session review (events, evidence) | L, E | Same "Session detail" surface; candidate name as the title, not the raw ID (U-11). |
| `/reports` | Legacy integrity report generation | L, E | Rename "Integrity report". Link it from the attempt row. |
| `/browser-guard`, `/assistant` | Utilities | — | Move under Help. |

## Administrator

| Route | Purpose | States today | Redesign requirements |
|---|---|---|---|
| `/admin` | Users (create, role, activate, password), institutions, audit log | L, Er; **no paging** | **Overview** (counts, recent security events) · **Users** (paginated, filterable, bulk activate) · **Institutions** · **Audit log** (filters, export) (U-13, U-14). |
| `/settings` | Global proctoring policy | L, S | Rename "Default proctoring policy" and explain the per-exam override (U-15). |
| (all examiner routes) | Admin can act as examiner | — | Reachable from Overview, not duplicated in the admin nav. |

## Shared

| Element | Today | Redesign |
|---|---|---|
| `AppShell` sidebar and top bar | English "Nigran 360 · INTEGRITY OS" with a shield icon; "Mode / Live API" card; ⌘K search; Logout | Urdu lockup `نگران 360`. Role-grouped nav. Connection status moves into the top bar as a chip. Account menu (profile, appearance, sign out). Skip link. |
| `CommandPalette` | Global search | Keep for staff; hide during exams. |
| Toasts (`sonner`) | Present | Use for confirmations; never for exam save state. |
| Favicon / app icon | **Missing** | Open-noon mark (16, 32, 180, 512 px plus SVG). |

## Missing screens

| Screen | Why |
|---|---|
| **Profile and account** (change password, appearance, sessions) | M8 |
| **Candidate result detail** (per-question marks, feedback, dispute entry) | L3 |
| **Exam overview / review-before-publish** (a single read-only summary of settings, questions, marks and enrolment) | Strengthens 3.2 "review before publication" |
| **Grading history / amendments** | M1 |
| **Admin overview** | U-14 |
