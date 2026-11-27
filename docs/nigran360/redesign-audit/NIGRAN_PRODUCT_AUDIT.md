# Nigran 360: product audit (baseline)

**Audit window:** 27 Nov 2026, 16:53–17:05 PKT. The audit was read-only apart from these documents and screenshots. Test data was synthetic and limited to the local development database.

## 1. Repository identity

| Item | Value |
|---|---|
| Repository | `ebbad-dev/Nigraan360` (local `C:\Users\HP\Projects\Nigraan360`) |
| Branch / HEAD | `main` / `d6f81f3` ("fix: per-candidate incident capture, examiner isolation, in-exam announcements, QR reports") |
| Working tree | Clean before the audit; only `docs/nigran360/redesign-audit/` was added |
| Origin | Evolved from the ProctorAI codebase (FastAPI + SQL Server + React). Matches the Nigran 360 project; no mismatch |
| Related repository | `ebbad-dev/Web-Wizards` (Postgres/Vite, Person 2). Used only as a donor of frontend modules (scratchpad pattern, connection pattern). Not the submission |

## 2. Architecture

| Layer | Implementation |
|---|---|
| Frontend | React 19, TanStack Router/Start (file routes in `frontend/src/routes`, SSR with client-side auth), TanStack Query, Tailwind CSS v4, shadcn/Radix primitives (`components/ui`), lucide-react icons, Recharts, framer-motion |
| Backend | FastAPI (`infrastructure/api/fastapi_app.py` plus routers: `identity`, `exams`, `attempts`, `assessment`, `system`). Service layer: `services/exam_service.py`, `assessment_service.py`, `identity_service.py`. Pure rules: `services/assessment.py` |
| Data access | Raw parameterized SQL through `pyodbc` (`database/db_connection.py`, `platform_repository.py`, `assessment_repository.py`). No ORM |
| Database | Microsoft SQL Server. Versioned, guarded migrations in a `SchemaMigrations` registry: baseline, `20261127_0002_nigran360`, `20261127_0003_disputes` |
| Auth | HS256 JWT bearer (480 minutes), PBKDF2-SHA256 passwords, roles `admin`, `instructor` (Examiner) and `student` (Candidate); optional Google OAuth |
| Background work | In-process expiry-sweep thread (60 seconds). Optional local camera/audio engine (`run_proctor_engine.py`, port 5050) and Browser Guard extension |
| Reports | ReportLab: academic result PDF with QR verification (`reporting/academic_pdf.py`); legacy session integrity PDF (`reporting/report_generator.py`) |
| Deployment configuration | `Dockerfile.api` and `render.yaml` (API), `frontend/netlify.toml` and `vercel.json` (SPA), `docs/DEPLOYMENT.md`. **Not deployed** |
| Tests | Backend: unittest/pytest (`tests/`, 85). Live API journey: `scripts/nigran_live_e2e.py` (84 checks). Browser: Playwright (`frontend/e2e`, 9 specs, uses installed Chrome). Frontend "lint" equals `tsc --noEmit`; no ESLint run is configured |

## 3. Runtime baseline

Local stack: API on `:5071` and Vite dev server on `:8090`. Ports were chosen to avoid the user's separate Proctor-Ai app on 5051/8080 and Chrome's unsafe port 5061.

| Check | Result |
|---|---|
| `pytest tests -q` | 85 passed |
| `scripts/nigran_live_e2e.py` | 84 passed, 0 failed |
| `npx playwright test` | 9 passed |
| `npm run typecheck` | 0 errors |
| `npm run build` | Success (client and server bundles) |
| axe-core (WCAG A/AA rules), 6 screens | Login 0, candidate dashboard 0, exam workspace 0, exam results 0, question bank 0, **examiner dashboard 2 violations** (nested-interactive ×62, select-name ×1) |

Screenshots of the baseline are in `baseline/`, numbered 01–10.

## 4. Existing functionality (must not be broken)

The following work end to end:
- core exam lifecycle;
- three question types with snapshots;
- server deadlines;
- durable outbox sync;
- grading and publication;
- disputes;
- analytics;
- sandbox;
- imports;
- PDF and QR verification;
- announcements, including inside the exam;
- per-candidate incident capture;
- examiner isolation for exam features;
- scratchpad;
- display preferences.

Legacy capabilities to preserve:
- camera, audio and phone detection via the local engine;
- Browser Guard extension;
- evidence capture;
- session reports;
- audit log;
- tenant administration.

## 5. Existing visual state

The product uses the ProctorAI dark "glass" aesthetic:
- navy background `oklch(0.16 0.03 260)`;
- cyan primary `oklch(0.78 0.16 215)` with a violet gradient;
- glow shadows;
- blurred glass cards;
- system font stack.

Branding is English only ("Nigran 360 · INTEGRITY OS") with a shield icon. The new Nigran screens (candidate, exam, results, bank) are consistent with each other. The legacy screens (live monitor, reports, settings) have heavier decoration: gradient text, raw session IDs as headings, and a cramped assistant panel. Details are in the UX audit.

## 6. Technical risks (summary)

The full list is in the security and reliability audit:
- S1 login throttling;
- S2 token lifetime and revocation;
- S3 legacy examiner scope;
- S4 and R3 grading consistency;
- R1 and R2 save-vs-submit and deadline windows;
- R5 hung save request.

## 7. Unknowns and limitations

See "NOT VERIFIED" in the gap analysis. The most important ones:
- the hosted deployment;
- QR scan on a device;
- a screen-reader pass;
- load beyond a single developer machine.
