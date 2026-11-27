# Nigran 360

**Secure Examination Management System** — Technoverse 5.0 Web-e-Thon submission.

Nigran 360 runs the whole examination lifecycle for three roles (Administrator, Examiner, Candidate):
- reusable question bank;
- scheduled exams with server-enforced deadlines;
- a failure-resilient candidate workspace;
- automatic and manual grading;
- controlled result publication and disputes;
- analytics;
- verifiable PDF reports.

It evolved from the ProctorAI codebase and keeps that project's browser, camera and audio integrity monitoring.

## Live deployment

| | URL |
|---|---|
| Frontend | _add the Netlify URL here before the cutoff_ |
| API | _add the Render URL here before the cutoff_ (`/health` returns `healthy`) |

Deployment steps: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Test credentials (synthetic demo data)

Created by `scripts/seed_demo.py`. All people and data are fictional.

| Role | Email | Password |
|---|---|---|
| Administrator | `admin@nigran360.demo` | `Nigran360!Admin` |
| Examiner | `examiner@nigran360.demo` | `Nigran360!Examiner` |
| Candidate | `candidate@nigran360.demo` | `Nigran360!Candidate` |
| Candidate (second) | `candidate2@nigran360.demo` | `Nigran360!Candidate` |

The seed also publishes the exam **`DEMO360`** (five questions covering every type) and enrols both candidates. These credentials are for demonstration only; rotate them for any real use.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TanStack Router/Start, TanStack Query, Tailwind CSS, Recharts |
| Backend | FastAPI, Pydantic v2, Uvicorn |
| Database | Microsoft SQL Server via `pyodbc`; additive, versioned migrations applied on startup (`SchemaMigrations`) |
| Reports | ReportLab PDF with a public verification link |
| Tests | `unittest`/pytest, live API end-to-end script, Playwright (Chrome) |

No paid services are required.

## Innovation 5.3: failure-resilient examinations

Internet drops, device crashes and power cuts should not cost a candidate their work, and they must not buy anyone extra time.

| Disruption | What Nigran 360 does |
|---|---|
| Connection drops mid-exam | Every change is written to a durable on-device outbox first, then synced. The UI shows each question as **Saved on server**, **Pending sync** or **Save failed**. Never "saved" until the server confirms. |
| Retries and duplicate requests | Each change carries a unique `mutation_id` plus a per-attempt `client_seq`. The server replays duplicates and rejects older changes that arrive late, so newer answers are never overwritten. |
| Browser crash, refresh or device switch | Confirmed answers reload from the server; unsynced ones from the device outbox. The question paper is a write-once snapshot, so it never changes mid-attempt. |
| Server or API outage | Browser connectivity and API reachability are shown separately. A network failure no longer signs the candidate out. |
| "Offline means more time" | The deadline is stored on the server when the attempt starts. The timer runs on server time anchored to a monotonic clock, so going offline or changing the device clock changes nothing. Changes arriving after the deadline are refused, and the attempt is finalized with what the server received in time (background sweep). |

**Trade-off:** an answer that never reaches the server before the deadline does not count. Accepting device timestamps would let anyone claim extra time. The interface tells the candidate this in plain words.

### Demonstrating 5.3 (about 2 minutes)
1. Sign in as `candidate@nigran360.demo`. Open **My Exams** and start `DEMO360` with any roll number.
2. Answer question 1. The badge changes to **Saved on server**.
3. Open DevTools → Network → **Offline**. The red banner says you are offline and the timer keeps running.
4. Answer question 2. It shows **Pending sync**, amber in the navigator.
5. Refresh while offline (if the browser allows it) or simply go back **Online**. The banner says **Reconnected**, and question 2 turns **Saved on server**.
6. As the examiner, open **Monitor, grade & results** → **Monitor**. The progress comes from server data.

Automated proof: `frontend/e2e/resilience.spec.ts` and the `5.3` steps in `scripts/nigran_live_e2e.py`.

## Feature map

| Area | Where |
|---|---|
| Admin: users, roles, institutions, audit log | `/admin` |
| Examiner dashboard: exams, question builder (3 types), schedule, randomization, enrolment, bulk import, sandbox preview | `/instructor` |
| Question bank with categories, difficulty, CSV/JSON import | `/bank` |
| Results, grading queue, disputes, analytics, live monitor, announcements | `/exam-results/<examId>` |
| Candidate dashboard, results, PDF download, disputes, announcements | `/candidate` |
| Exam workspace (navigator, mark-for-review, scratchpad, display preferences) | `/exam?attempt_id=…` |
| Public report verification | `/verify/<token>` |

Full traceability with test evidence: [docs/nigran360/IMPLEMENTATION_STATUS.md](docs/nigran360/IMPLEMENTATION_STATUS.md).

## Local setup

Requirements: Python 3.12, Node.js 24, SQL Server (Express is fine) with ODBC Driver 17 or 18.

```powershell
powershell -ExecutionPolicy Bypass -File scripts/setup_dev.ps1   # .venv + npm ci
Copy-Item .env.example .env                                       # then edit; never commit .env
```

Minimum `.env` values:

```
PROCTORAI_DB_SERVER=localhost
PROCTORAI_DB_NAME=Nigran360
PROCTORAI_DB_TRUSTED=true
PROCTORAI_DB_DRIVER=ODBC Driver 17 for SQL Server
AUTH_SECRET=<random string, at least 32 characters>
```

Then:

```powershell
.venv\Scripts\python scripts\seed_demo.py   # demo accounts + DEMO360 exam (tables are created automatically)
npm run dev                                 # API :5051, frontend :8080, local proctor engine :5050
```

The `PROCTORAI_*` variable names are kept from the original codebase for deployment compatibility.

## Tests

```powershell
.venv\Scripts\python -m pytest tests -q               # 85 unit/service tests
.venv\Scripts\python scripts\nigran_live_e2e.py       # 73 live checks against SQL Server
cd frontend; npm run typecheck; npm run build
npx playwright test                                   # 8 browser tests (needs API + frontend running)
```

Playwright uses the installed Chrome. Point it at a running stack with `E2E_BASE_URL` and `E2E_API_URL`; the defaults are `http://127.0.0.1:8090` and `http://127.0.0.1:5071`.

## Limitations
- The camera, microphone and phone-detection engine needs a local machine. In the cloud deployment, browser-side monitoring (tab switches, clipboard, fullscreen) still works.
- Monitoring signals are indicators for human review, never proof of misconduct.
- Free Render instances sleep after about 15 idle minutes, so open `/health` before a demo.
