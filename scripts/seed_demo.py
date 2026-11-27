"""Seed synthetic Nigran 360 demo accounts and a demo examination (idempotent).

    .venv\\Scripts\\python scripts\\seed_demo.py

Creates (or resets the password of) one account per role plus a second candidate, a small
question bank, and a published demo exam enrolled to the demo candidates. All data is fictional.
Works against whichever SQL Server the PROCTORAI_DB_* variables point at (local or hosted).
"""
from __future__ import annotations

import os
import secrets
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

DEMO_USERS = [
    ("admin@nigran360.demo", "Demo Administrator", "admin", "Nigran360!Admin"),
    ("examiner@nigran360.demo", "Dr. Sana Malik (Examiner)", "instructor", "Nigran360!Examiner"),
    ("candidate@nigran360.demo", "Ali Hassan (Candidate)", "student", "Nigran360!Candidate"),
    ("candidate2@nigran360.demo", "Fatima Noor (Candidate)", "student", "Nigran360!Candidate"),
]
DEMO_EXAM_CODE = "DEMO360"


def load_env() -> None:
    env_file = ROOT / ".env"
    if env_file.exists():
        for raw in env_file.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                os.environ.setdefault(key.strip(), value.strip().strip("'\""))


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
        print("SQL Server is not reachable; configure PROCTORAI_DB_* first.")
        return 2
    repo = PlatformRepository(db)
    for email, name, role, password in DEMO_USERS:
        existing = repo.get_user_by_email(email)
        if existing:
            repo.update_password(existing["user_id"], hash_password(password))
            repo.update_user(existing["user_id"], {"role": role, "is_active": True})
            print(f"reset   {role:<10} {email}")
        else:
            repo.create_user(email, name, role, hash_password(password))
            print(f"created {role:<10} {email}")

    with TestClient(fastapi_app.app) as client:
        token = client.post("/auth/login", json={"email": DEMO_USERS[1][0], "password": DEMO_USERS[1][3]}).json()["access_token"]
        h = {"Authorization": f"Bearer {token}"}
        exams = client.get("/exams", headers=h).json()
        if any(exam.get("exam_code") == DEMO_EXAM_CODE for exam in exams):
            print(f"exists  demo exam {DEMO_EXAM_CODE}")
            return 0
        now = datetime.now(timezone.utc)
        exam = client.post(
            "/exams",
            headers=h,
            json={
                "exam_code": DEMO_EXAM_CODE,
                "title": "Programming Fundamentals — Demo Quiz",
                "description": "A short demonstration exam with every question type.",
                "instructions": "Answer all five questions. Your answers save automatically; the timer is enforced by the server.",
                "subject": "Programming Fundamentals",
                "department": "Computer Science",
                "duration_minutes": 20,
                "total_marks": 0,
                "start_time": (now - timedelta(minutes=5)).isoformat(),
                "end_time": (now + timedelta(days=7)).isoformat(),
                "status": "draft",
                "shuffle_options": True,
            },
        ).json()
        bank = [
            {"question_text": "Which keyword defines a function in Python?", "question_type": "mcq", "marks": 1, "difficulty": "easy", "category": "Python",
             "options": [{"option_text": "func", "is_correct": False}, {"option_text": "def", "is_correct": True}, {"option_text": "function", "is_correct": False}, {"option_text": "lambda", "is_correct": False}]},
            {"question_text": "What is the time complexity of binary search on a sorted array?", "question_type": "mcq", "marks": 2, "difficulty": "medium", "category": "Algorithms",
             "options": [{"option_text": "O(n)", "is_correct": False}, {"option_text": "O(log n)", "is_correct": True}, {"option_text": "O(n log n)", "is_correct": False}, {"option_text": "O(1)", "is_correct": False}]},
            {"question_text": "Select all mutable built-in types in Python.", "question_type": "multiple_select", "marks": 3, "difficulty": "medium", "category": "Python", "marking_scheme": "partial",
             "options": [{"option_text": "list", "is_correct": True}, {"option_text": "tuple", "is_correct": False}, {"option_text": "dict", "is_correct": True}, {"option_text": "str", "is_correct": False}, {"option_text": "set", "is_correct": True}]},
            {"question_text": "Select every sorting algorithm with O(n log n) worst-case time.", "question_type": "multiple_select", "marks": 2, "difficulty": "hard", "category": "Algorithms", "marking_scheme": "all_or_nothing",
             "options": [{"option_text": "Merge sort", "is_correct": True}, {"option_text": "Quick sort", "is_correct": False}, {"option_text": "Heap sort", "is_correct": True}, {"option_text": "Bubble sort", "is_correct": False}]},
            {"question_text": "Explain the difference between a stack and a queue, with one real-world example of each.", "question_type": "written", "marks": 4, "difficulty": "medium", "category": "Data structures"},
        ]
        ids = [client.post("/bank/questions", headers=h, json=item).json()["question_id"] for item in bank]
        client.post(f"/exams/{exam['id']}/bank/assign", headers=h, json={"question_ids": ids})
        published = client.post(f"/exams/{exam['id']}/publish", headers=h)
        print(f"created demo exam {DEMO_EXAM_CODE}: {published.status_code}")
        for email, _, role, _ in DEMO_USERS:
            if role == "student":
                client.post(f"/exams/{exam['id']}/assignments", headers=h, json={"student_email": email})
                print(f"enrolled {email}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
