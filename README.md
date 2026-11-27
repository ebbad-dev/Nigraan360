# Nigran 360

**Secure Examination Management System** — Technoverse 5.0 Web-e-Thon submission.

Nigran 360 is a full-stack exam platform built on FastAPI + SQL Server (backend) and React 19 + TanStack Router/Start (frontend). It supports three roles — Administrator, Examiner, and Candidate — and delivers verifiable academic results, a reusable question bank, live attempt monitoring, manual grading, and server-enforced deadline safety.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TanStack Router/Start, TanStack Query, Tailwind CSS, Recharts |
| Backend | FastAPI, Pydantic v2, Uvicorn |
| Database | SQL Server via `pyodbc` (SQLAlchemy-style service layer) |
| PDF Reports | ReportLab — verifiable academic result certificates with QR token |
| Proctoring | OpenCV camera capture, Flask MJPEG stream, sounddevice microphone |

---

## Innovation Challenge 5.3 — Failure-Resilient Examinations

The core differentiator is **immutable attempt snapshots with server-side deadline enforcement**:

1. **Snapshot on start** — when a candidate begins, the exact question paper (with all options) is frozen into `snapshot_json` on the attempt row. If an examiner later edits the exam, in-progress candidates see the original paper they started with. No question drift mid-exam.

2. **Idempotent submit** — a double-submit (network retry, tab crash) replays the existing result instead of overwriting it. The service detects the concurrent write race and returns the winning attempt to both callers.

3. **Server-side expiry sweep** — a background thread runs every 60 seconds and auto-finalises any attempt whose `started_at + duration` has passed, even if the browser tab was closed or the network dropped. Candidates cannot extend time by disconnecting.

4. **Verifiable PDF certificates** — results are signed with a unique token. Anyone can visit `/verify/<token>` to confirm the certificate is genuine and has not been revoked.

---

## Roles

| Role | Access |
|---|---|
| **Administrator** | Tenant management, user creation/role assignment, audit log, all instructor privileges |
| **Examiner** | Create/edit exams, question bank, assign candidates, live monitor, grading queue, publish results, analytics |
| **Candidate** | View assigned exams, take exams, download verified result PDFs, read announcements |

---

## Setup (Local Development)

1. Install **Python 3.12** and **Node.js 24**.
2. Create `.env` from `.env.example` — never commit `.env`.
3. Configure SQL Server:
   ```
   PROCTORAI_DB_SERVER=localhost
   PROCTORAI_DB_NAME=Nigran360
   PROCTORAI_DB_TRUSTED=true
   PROCTORAI_DB_DRIVER=ODBC Driver 17 for SQL Server
   ```
4. Set `AUTH_SECRET` to a random string of at least 32 characters.
5. Bootstrap the first admin:
   ```
   PROCTORAI_BOOTSTRAP_ADMIN_EMAIL=admin@example.com
   PROCTORAI_BOOTSTRAP_ADMIN_PASSWORD=AdminPass123!
   ```
6. Install dependencies and start:
   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts/setup_dev.ps1
   npm run dev
   ```

Services:
- Frontend: `http://127.0.0.1:8080`
- API: `http://127.0.0.1:5051`
- Proctor sidecar: `http://127.0.0.1:5050`

---

## Demo Data (Quick Start)

After the first run the bootstrap admin is created automatically. Use these credentials to explore every role:

| Role | Email | Password |
|---|---|---|
| Administrator | `admin@nigran360.test` | set via `PROCTORAI_BOOTSTRAP_ADMIN_EMAIL/PASSWORD` |
| Examiner | create from `/admin` → Users → New User, role = instructor | any password |
| Candidate | register from the sign-up page (auto-assigned student role) | any password |

**Suggested walkthrough:**
1. Sign in as Examiner → create an exam, add questions from the Question Bank.
2. Assign the Candidate user to the exam.
3. Sign in as Candidate → take the exam (the timer enforces the deadline server-side).
4. Back as Examiner → grade any written answers → publish results.
5. Candidate downloads their PDF certificate; paste the token at `/verify/<token>` to confirm it.

---

## Tests

```powershell
# Backend (71 tests)
powershell -ExecutionPolicy Bypass -File scripts/setup_dev.ps1
.venv\Scripts\pytest tests\ -v

# Frontend type-check
cd frontend
npm run typecheck

# Frontend production build
npm run build
```

---

## Deployment

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the free-tier topology:
- **Database**: MonsterASP free MSSQL
- **API**: Render free web service (Docker, `render.yaml`)
- **Frontend**: Netlify / Vercel (static, `netlify.toml`)

---

## Project Structure

```
.
├── frontend/               # React 19 + TanStack Start SPA
│   └── src/
│       ├── routes/         # File-based routes (candidate, bank, exam-results, verify…)
│       ├── lib/            # api.ts, queries.ts, types.ts
│       └── components/     # AppShell, GlassCard, GlowButton…
├── services/               # Business logic (ExamService, AssessmentService)
├── infrastructure/api/     # FastAPI app + routers
│   └── routers/            # auth, exam, attempt, session, assessment…
├── reporting/              # academic_pdf.py — ReportLab PDF builder
├── tests/                  # pytest suite (71 tests)
├── docs/                   # DEPLOYMENT.md, DATA_RETENTION.md
└── scripts/                # setup_dev.ps1, run_quality_checks.ps1…
```

---

## Security Notes

- Always set `AUTH_SECRET`, SMTP credentials, and restrict `CORS_ORIGINS` before deploying.
- Use HTTPS in production.
- Rotate all bootstrap credentials after first deploy.
- Review automated risk scores before academic decisions; they are advisory, not conclusive.
