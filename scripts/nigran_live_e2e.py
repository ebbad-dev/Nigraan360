"""Live end-to-end verification of the Nigran 360 examination workflow against SQL Server.

Drives the real FastAPI app in-process (TestClient) with synthetic accounts and prints a
PASS/FAIL line per step. Requires the SQL Server configured in .env.

    .venv\\Scripts\\python scripts\\nigran_live_e2e.py
"""
from __future__ import annotations

import os
import secrets
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

RESULTS: list[tuple[str, bool, str]] = []


def load_env() -> None:
    env_file = ROOT / ".env"
    if env_file.exists():
        for raw in env_file.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                os.environ.setdefault(key.strip(), value.strip().strip("'\""))


def step(name: str, condition: bool, detail: str = "") -> None:
    RESULTS.append((name, bool(condition), detail))
    print(f"{'PASS' if condition else 'FAIL'}  {name}{'  -- ' + detail if detail and not condition else ''}", flush=True)
    if not condition:
        raise AssertionError(f"{name}: {detail}")


def body(response) -> dict:
    try:
        return response.json()
    except Exception:
        return {}


def main() -> int:
    load_env()
    if len(os.environ.get("AUTH_SECRET", "")) < 32:
        os.environ["AUTH_SECRET"] = secrets.token_urlsafe(48)

    from fastapi.testclient import TestClient
    import infrastructure.api.fastapi_app as fastapi_app
    from core.security import hash_password
    from database.platform_repository import PlatformRepository

    db = fastapi_app._get_db()
    if not db or not db.is_active:
        print("FAIL  SQL Server is not reachable; configure PROCTORAI_DB_* in .env")
        return 2

    tag = secrets.token_hex(3)
    pw = f"E2e!{secrets.token_urlsafe(12)}"
    repo = PlatformRepository(db)
    admin_email = f"e2e-admin-{tag}@nigran360.test"
    repo.create_user(admin_email, "E2E Administrator", "admin", hash_password(pw))

    def h(token: str) -> dict:
        return {"Authorization": f"Bearer {token}"}

    with TestClient(fastapi_app.app) as c:
        try:
            admin = body(c.post("/auth/login", json={"email": admin_email, "password": pw}))
            step("3.1 admin signs in", "access_token" in admin)
            at = admin["access_token"]
            tenant = admin["user"].get("tenant_id") or "tenant_default"

            users = {}
            for key, role, name in [("examiner", "instructor", "E2E Examiner"), ("cand", "student", "E2E Candidate A"), ("other", "student", "E2E Candidate B")]:
                email = f"e2e-{key}-{tag}@nigran360.test"
                r = c.post("/admin/users", headers=h(at), json={"email": email, "full_name": name, "role": role, "tenant_id": tenant, "password": pw})
                step(f"3.1 admin creates {role} account", r.status_code == 200, r.text[:200])
                login = body(c.post("/auth/login", json={"email": email, "password": pw}))
                users[key] = {"email": email, "token": login["access_token"], "id": login["user"]["user_id"]}
            ex, ca, ot = users["examiner"]["token"], users["cand"]["token"], users["other"]["token"]

            step("3.1 candidate blocked from examiner API", c.get("/exams", headers=h(ca)).status_code == 403)
            step("3.1 examiner blocked from admin API", c.get("/admin/users", headers=h(ex)).status_code == 403)

            now = datetime.now(timezone.utc)
            exam_payload = {
                "exam_code": f"E2E{tag.upper()}",
                "title": f"E2E Resilience Exam {tag}",
                "description": "Synthetic exam for automated verification.",
                "instructions": "Answer all questions. The timer is enforced by the server.",
                "total_marks": 0,
                "duration_minutes": 30,
                "start_time": (now - timedelta(minutes=5)).isoformat(),
                "end_time": (now + timedelta(hours=2)).isoformat(),
                "status": "draft",
            }
            exam = body(c.post("/exams", headers=h(ex), json=exam_payload))
            exam_id = exam.get("id")
            step("3.2 examiner creates draft exam", bool(exam_id) and exam.get("status") == "draft", str(exam)[:200])

            step("3.2 empty exam cannot be published", c.post(f"/exams/{exam_id}/publish", headers=h(ex)).status_code == 422)

            bank_items = [
                {"question_text": f"E2E {tag}: 2 + 2 = ?", "question_type": "mcq", "marks": 2, "difficulty": "easy", "category": "Arithmetic",
                 "options": [{"option_text": "3", "is_correct": False}, {"option_text": "4", "is_correct": True}, {"option_text": "5", "is_correct": False}]},
                {"question_text": f"E2E {tag}: select the primes", "question_type": "multiple_select", "marks": 4, "difficulty": "medium", "category": "Number theory",
                 "marking_scheme": "partial",
                 "options": [{"option_text": "2", "is_correct": True}, {"option_text": "4", "is_correct": False}, {"option_text": "5", "is_correct": True}, {"option_text": "9", "is_correct": False}]},
                {"question_text": f"E2E {tag}: explain recursion", "question_type": "written", "marks": 5, "difficulty": "hard", "category": "Programming"},
            ]
            bad = c.post("/bank/questions", headers=h(ex), json={"question_text": "Broken MCQ", "question_type": "mcq", "marks": 1,
                                                                  "options": [{"option_text": "a", "is_correct": True}, {"option_text": "b", "is_correct": True}]})
            step("3.3 MCQ with two correct options rejected", bad.status_code == 422)
            bank_ids = []
            for item in bank_items:
                r = c.post("/bank/questions", headers=h(ex), json=item)
                step(f"3.3 bank question created ({item['question_type']})", r.status_code == 200, r.text[:200])
                bank_ids.append(body(r)["question_id"])
            r = c.post(f"/exams/{exam_id}/bank/assign", headers=h(ex), json={"question_ids": bank_ids})
            step("3.3 bank questions assigned to exam", r.status_code == 200 and body(r).get("added") == 3, r.text[:200])

            r = c.post(f"/exams/{exam_id}/publish", headers=h(ex))
            step("3.2 examiner publishes exam", r.status_code == 200 and body(r).get("status") == "published", r.text[:200])
            step("3.2 published -> archived transition refused", c.put(f"/exams/{exam_id}", headers=h(ex), json={**exam_payload, "status": "archived"}).status_code == 409)

            step("3.4 unenrolled candidate cannot start", c.post("/attempts/start", headers=h(ca), json={"exam_id": exam_id, "roll_number": "E2E-001"}).status_code in (403, 404))
            r = c.post(f"/exams/{exam_id}/assignments", headers=h(ex), json={"student_email": users["cand"]["email"]})
            step("3.4 examiner enrols candidate", r.status_code == 200, r.text[:200])
            dash = body(c.get("/student/dashboard", headers=h(ca)))
            step("3.4 candidate sees exam as available", any(e["exam_id"] == exam_id for e in dash.get("groups", {}).get("available", [])))
            other_dash = body(c.get("/student/dashboard", headers=h(ot)))
            step("3.4 other candidate does not see it", not any(e["exam_id"] == exam_id for g in other_dash.get("groups", {}).values() for e in g))

            attempt = body(c.post("/attempts/start", headers=h(ca), json={"exam_id": exam_id, "roll_number": "E2E-001"}))
            attempt_id = attempt.get("attempt_id")
            step("3.5 candidate starts attempt with server deadline", bool(attempt_id) and bool(attempt.get("deadline_at")) and bool(attempt.get("server_now")), str(attempt)[:200])
            deadline = attempt["deadline_at"]
            leaked = [o for q in attempt["questions"] for o in q.get("options", []) if "is_correct" in o and o["is_correct"] is not None]
            step("3.3 answer key not exposed to candidate", not leaked, str(leaked)[:200])
            qs = {q["question_type"]: q for q in attempt["questions"]}
            mcq, multi, written = qs["mcq"], qs["multiple_select"], qs["written"]
            right_mcq = next(o["option_id"] for o in mcq["options"] if o["option_text"] == "4")
            wrong_mcq = next(o["option_id"] for o in mcq["options"] if o["option_text"] == "3")
            primes = [o["option_id"] for o in multi["options"] if o["option_text"] in ("2", "5")]
            four = next(o["option_id"] for o in multi["options"] if o["option_text"] == "4")

            def save(token, payload):
                return c.post(f"/attempts/{attempt_id}/responses", headers=h(token), json=payload)

            m1 = str(uuid.uuid4())
            r = save(ca, {"question_id": mcq["question_id"], "selected_option_id": wrong_mcq, "mutation_id": m1, "client_seq": 1})
            step("5.3 first answer saved", body(r).get("status") == "saved", r.text[:200])
            r = save(ca, {"question_id": mcq["question_id"], "selected_option_id": wrong_mcq, "mutation_id": m1, "client_seq": 1})
            step("5.3 retried request (same mutation_id) is a duplicate, not a second write", body(r).get("status") == "duplicate", r.text[:200])
            r = save(ca, {"question_id": mcq["question_id"], "selected_option_id": right_mcq, "mutation_id": str(uuid.uuid4()), "client_seq": 3})
            step("5.3 newer offline change synced", body(r).get("status") == "saved")
            r = save(ca, {"question_id": mcq["question_id"], "selected_option_id": wrong_mcq, "mutation_id": str(uuid.uuid4()), "client_seq": 2})
            step("5.3 late-arriving older change rejected as stale", body(r).get("status") == "stale" and body(r).get("selected_option_id") == right_mcq, r.text[:200])
            r = save(ca, {"question_id": mcq["question_id"], "kind": "flag", "flagged": True, "mutation_id": str(uuid.uuid4())})
            step("5.3 save without client_seq keeps stored sequence", body(r).get("client_seq") == 3, r.text[:200])
            step("3.5 mark-for-review flag stored", body(r).get("flagged") is True)
            r = save(ca, {"question_id": multi["question_id"], "selected_option_ids": primes + [four], "mutation_id": str(uuid.uuid4()), "client_seq": 4})
            step("3.5 multiple-select answer saved", body(r).get("status") == "saved")
            r = save(ca, {"question_id": written["question_id"], "response_text": "Recursion is when a function calls itself, e.g. factorial(n) = n * factorial(n-1).", "mutation_id": str(uuid.uuid4()), "client_seq": 5})
            step("3.5 written answer saved", body(r).get("status") == "saved")
            step("3.1 other candidate cannot write to this attempt", save(ot, {"question_id": mcq["question_id"], "selected_option_id": wrong_mcq}).status_code in (403, 404))

            reloaded = body(c.get(f"/attempts/{attempt_id}", headers=h(ca)))
            rows = {row["question_id"]: row for row in reloaded["responses"]}
            step("3.5 refresh restores server-confirmed answers", rows[mcq["question_id"]]["selected_option_id"] == right_mcq and len(rows) == 3)
            step("5.3 refresh does not move the deadline", reloaded["deadline_at"] == deadline)

            r = c.post(f"/attempts/{attempt_id}/submit", headers=h(ca), json={"generate_report": False})
            step("3.5 candidate submits", r.status_code == 200 and body(r).get("status") == "submitted", r.text[:200])
            r2 = c.post(f"/attempts/{attempt_id}/submit", headers=h(ca), json={"generate_report": False})
            step("3.5 repeated submit is idempotent", r2.status_code == 200 and body(r2).get("submitted_at") == body(r).get("submitted_at"), r2.text[:200])
            r = save(ca, {"question_id": mcq["question_id"], "selected_option_id": wrong_mcq, "mutation_id": str(uuid.uuid4()), "client_seq": 9})
            step("3.5 answers locked after submission", r.status_code == 409)
            step("3.8 score hidden before publication", body(c.get(f"/attempts/{attempt_id}", headers=h(ca))).get("score") is None)

            results = body(c.get(f"/exams/{exam_id}/results", headers=h(ex)))
            step("3.7 written answer keeps attempt pending", results.get("pending_manual") == 1 and results.get("can_publish") is False, str(results)[:200])
            step("3.8 publication blocked while grading incomplete", c.post(f"/exams/{exam_id}/results/publish", headers=h(ex), json={"publish": True}).status_code == 409)
            queue = body(c.get(f"/exams/{exam_id}/grading", headers=h(ex)))
            item = queue[0]
            step("3.7 marks above maximum rejected", c.post(f"/responses/{item['response_id']}/grade", headers=h(ex), json={"awarded_marks": 9}).status_code == 422)
            step("3.7 fractional marks rejected", c.post(f"/responses/{item['response_id']}/grade", headers=h(ex), json={"awarded_marks": 2.5}).status_code == 422)
            r = c.post(f"/responses/{item['response_id']}/grade", headers=h(ex), json={"awarded_marks": 4, "feedback": "Good example."})
            step("3.7 examiner grades written answer", r.status_code == 200, r.text[:200])
            results = body(c.get(f"/exams/{exam_id}/results", headers=h(ex)))
            cand_row = results["candidates"][0]
            # mcq 2 (correct) + partial multi floor(4*(2-1)/2)=2 + written 4 = 8
            step("3.7 total = auto MCQ + partial multi-select + manual written (8/11)", cand_row["score"] == 8 and cand_row["max_score"] == 11, str(cand_row))
            r = c.post(f"/exams/{exam_id}/results/publish", headers=h(ex), json={"publish": True})
            step("3.8 examiner publishes results", r.status_code == 200 and body(r).get("published") is True, r.text[:200])
            mine = body(c.get("/student/results", headers=h(ca)))
            step("3.8 candidate sees own published result", any(x["attempt_id"] == attempt_id and x["score"] == 8 for x in mine))
            step("3.8 other candidate cannot read the attempt", c.get(f"/attempts/{attempt_id}", headers=h(ot)).status_code in (403, 404))
            step("3.8 other candidate cannot download the report", c.get(f"/attempts/{attempt_id}/report", headers=h(ot)).status_code in (403, 404))

            analytics = body(c.get(f"/exams/{exam_id}/analytics", headers=h(ex)))
            step("4.5 question analytics from real attempts", analytics.get("sample_size") == 1 and len(analytics.get("questions", [])) == 3)

            pdf = c.get(f"/attempts/{attempt_id}/report", headers=h(ca))
            step("4.2 candidate downloads PDF report", pdf.status_code == 200 and pdf.content[:4] == b"%PDF", str(pdf.status_code))
            token_row = db.query("SELECT TOP 1 verify_token FROM IssuedReports WHERE attempt_id = ? AND revoked_at IS NULL", (attempt_id,))
            token = token_row[0]["verify_token"]
            verify = body(c.get(f"/reports/verify/{token}"))
            step("4.6 public verification confirms report", verify.get("valid") is True)
            step("4.6 verification reveals no name, roll number or marks", not any(k in verify for k in ("candidate_name", "roll_number", "score", "student_email")))
            step("4.6 forged token is not valid", body(c.get("/reports/verify/" + "x" * 32)).get("valid") is False)

            sandbox = c.post(f"/exams/{exam_id}/sandbox", headers=h(ex))
            sb = body(sandbox)
            step("4.3 examiner starts sandbox preview", sandbox.status_code == 200 and sb.get("attempt_type") == "sandbox", sandbox.text[:200])
            sq = next(q for q in sb["questions"] if q["question_type"] == "mcq")
            c.post(f"/attempts/{sb['attempt_id']}/responses", headers=h(ex), json={"question_id": sq["question_id"], "selected_option_id": sq["options"][0]["option_id"]})
            c.post(f"/attempts/{sb['attempt_id']}/submit", headers=h(ex), json={"generate_report": False})
            results_after = body(c.get(f"/exams/{exam_id}/results", headers=h(ex)))
            analytics_after = body(c.get(f"/exams/{exam_id}/analytics", headers=h(ex)))
            step("4.3 sandbox attempt excluded from results and analytics", results_after["summary"]["submitted"] == 1 and analytics_after["sample_size"] == 1)

            csv = "full_name,email\nValid Person,e2e-imp-%s@nigran360.test\nBad Row,not-an-email\nValid Person,e2e-imp-%s@nigran360.test\n" % (tag, tag)
            imp = body(c.post(f"/exams/{exam_id}/import/candidates", headers=h(ex), json={"content": csv, "file_format": "csv", "commit": True}))
            step("4.4 candidate import reports row-level errors and saves nothing", imp["summary"]["invalid"] == 2 and imp["summary"]["committed"] is False, str(imp)[:300])
            qcsv = f"question_text,question_type,options,correct,marks\nE2E {tag}: 2 + 2 = ?,mcq,3|4,B,1\nNew {tag} q,mcq,a|b,A,1\nNew {tag} q,mcq,a|b,A,1\n"
            qimp = body(c.post("/bank/import/questions", headers=h(ex), json={"content": qcsv, "file_format": "csv", "commit": False}))
            step("4.4 question import flags existing and in-file duplicates", qimp["summary"]["invalid"] == 2, str(qimp)[:300])

            r = c.post(f"/exams/{exam_id}/announcements", headers=h(ex), json={"title": "Room change", "body": "Candidates please note the update.", "priority": "important"})
            step("3.6 examiner posts announcement", r.status_code == 200, r.text[:200])
            step("3.6 enrolled candidate receives announcement", any(a["title"] == "Room change" for a in body(c.get("/student/announcements", headers=h(ca)))))
            step("3.6 non-enrolled candidate does not", not any(a["title"] == "Room change" for a in body(c.get("/student/announcements", headers=h(ot)))))
            monitor = body(c.get(f"/exams/{exam_id}/monitor", headers=h(ex)))
            step("3.6 live monitor shows real attempt progress", monitor["summary"]["submitted"] == 1 and monitor["attempts"][0]["answered"] == 3)
            step("3.6 candidate cannot open monitor", c.get(f"/exams/{exam_id}/monitor", headers=h(ca)).status_code == 403)

            # Deadline enforcement: a second exam whose attempt deadline is already past on the server.
            exam2 = body(c.post("/exams", headers=h(ex), json={**exam_payload, "exam_code": f"E2X{tag.upper()}", "title": f"E2E Expiry {tag}"}))
            c.post(f"/exams/{exam2['id']}/bank/assign", headers=h(ex), json={"question_ids": bank_ids[:1]})
            c.post(f"/exams/{exam2['id']}/publish", headers=h(ex))
            c.post(f"/exams/{exam2['id']}/assignments", headers=h(ex), json={"student_email": users["other"]["email"]})
            a2 = body(c.post("/attempts/start", headers=h(ot), json={"exam_id": exam2["id"], "roll_number": "E2E-002"}))
            q2 = a2["questions"][0]
            c.post(f"/attempts/{a2['attempt_id']}/responses", headers=h(ot), json={"question_id": q2["question_id"], "selected_option_id": q2["options"][0]["option_id"], "client_seq": 1, "mutation_id": str(uuid.uuid4())})
            db.execute("UPDATE ExamAttempts SET deadline_at = DATEADD(second, -5, SYSUTCDATETIME()) WHERE attempt_id = ?", (a2["attempt_id"],))
            late = c.post(f"/attempts/{a2['attempt_id']}/responses", headers=h(ot), json={"question_id": q2["question_id"], "selected_option_id": q2["options"][1]["option_id"], "client_seq": 2, "mutation_id": str(uuid.uuid4())})
            step("5.3 answer arriving after the server deadline is refused", late.status_code == 409 and body(late).get("error") == "attempt_expired", late.text[:200])
            final2 = body(c.get(f"/attempts/{a2['attempt_id']}", headers=h(ot)))
            kept = final2["responses"][0]["selected_option_id"] == q2["options"][0]["option_id"]
            step("5.3 expired attempt finalized with the answer saved in time", final2["status"] == "submitted" and kept, str(final2)[:200])
        except AssertionError:
            pass

    passed = sum(1 for _, ok, _ in RESULTS if ok)
    failed = [name for name, ok, _ in RESULTS if not ok]
    print(f"\n{passed} passed, {len(failed)} failed")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
