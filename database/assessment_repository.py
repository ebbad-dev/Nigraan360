"""SQL Server persistence for Nigran 360 assessment features.

Complements PlatformRepository (exams, assignments, attempts) with the question bank,
attempt snapshots/deadlines, typed responses with idempotent saves, grading, result
publication, announcements, issued (verifiable) reports, live progress and analytics data.
All official/aggregate queries filter `attempt_type = 'real'` so sandbox attempts never
contaminate results, attendance or statistics.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from core.security import new_id

DEFAULT_TENANT_ID = "tenant_default"
REAL = "COALESCE(a.attempt_type, 'real') = 'real'"


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _ids(value: Any) -> list[str]:
    if not value:
        return []
    try:
        data = json.loads(value) if isinstance(value, str) else list(value)
    except (TypeError, ValueError):
        return []
    return [str(item) for item in data if item]


class AssessmentRepository:
    def __init__(self, db):
        self.db = db

    # ── Question bank ────────────────────────────────────────────────────────

    def list_bank_questions(self, tenant_id: str, *, category: str = "", difficulty: str = "", question_type: str = "", search: str = "") -> list[dict]:
        sql = """
            SELECT question_id, tenant_id, owner_user_id, question_text, question_type, category,
                   difficulty, marks, marking_scheme, status, created_at, updated_at
            FROM BankQuestions
            WHERE tenant_id = ? AND status = 'active'
        """
        params: list[Any] = [tenant_id]
        if category:
            sql += " AND category = ?"
            params.append(category)
        if difficulty:
            sql += " AND difficulty = ?"
            params.append(difficulty)
        if question_type:
            sql += " AND question_type = ?"
            params.append(question_type)
        if search:
            sql += " AND question_text LIKE ?"
            params.append(f"%{search}%")
        sql += " ORDER BY COALESCE(updated_at, created_at) DESC"
        rows = self.db.query(sql, tuple(params))
        for row in rows:
            row["options"] = self.bank_options(row["question_id"])
        return rows

    def bank_options(self, question_id: str) -> list[dict]:
        return self.db.query(
            "SELECT option_id, question_id, option_text, is_correct, sort_order FROM BankOptions WHERE question_id = ? ORDER BY sort_order",
            (question_id,),
        )

    def get_bank_question(self, question_id: str) -> dict | None:
        rows = self.db.query(
            """
            SELECT question_id, tenant_id, owner_user_id, question_text, question_type, category,
                   difficulty, marks, marking_scheme, status, created_at, updated_at
            FROM BankQuestions WHERE question_id = ?
            """,
            (question_id,),
        )
        if not rows:
            return None
        rows[0]["options"] = self.bank_options(question_id)
        return rows[0]

    def upsert_bank_question(self, data: dict, tenant_id: str, owner_user_id: str, question_id: str = "") -> dict:
        question_id = question_id or new_id("bnk")
        if self.get_bank_question(question_id):
            self.db.execute(
                """
                UPDATE BankQuestions
                SET question_text = ?, question_type = ?, category = ?, difficulty = ?, marks = ?,
                    marking_scheme = ?, updated_at = ?
                WHERE question_id = ?
                """,
                (data["question_text"], data["question_type"], data.get("category") or None, data["difficulty"], data["marks"], data.get("marking_scheme"), utc_now(), question_id),
            )
        else:
            self.db.execute(
                """
                INSERT INTO BankQuestions (question_id, tenant_id, owner_user_id, question_text, question_type,
                    category, difficulty, marks, marking_scheme, status, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
                """,
                (question_id, tenant_id, owner_user_id, data["question_text"], data["question_type"], data.get("category") or None, data["difficulty"], data["marks"], data.get("marking_scheme"), utc_now()),
            )
        self.db.execute("DELETE FROM BankOptions WHERE question_id = ?", (question_id,))
        for index, option in enumerate(data.get("options") or []):
            self.db.execute(
                "INSERT INTO BankOptions (option_id, question_id, option_text, is_correct, sort_order) VALUES (?, ?, ?, ?, ?)",
                (new_id("bop"), question_id, option["option_text"], 1 if option.get("is_correct") else 0, index),
            )
        return self.get_bank_question(question_id) or {}

    def archive_bank_question(self, question_id: str) -> None:
        self.db.execute("UPDATE BankQuestions SET status = 'archived', updated_at = ? WHERE question_id = ?", (utc_now(), question_id))

    def bank_categories(self, tenant_id: str) -> list[str]:
        rows = self.db.query(
            "SELECT DISTINCT category FROM BankQuestions WHERE tenant_id = ? AND status = 'active' AND category IS NOT NULL AND category <> '' ORDER BY category",
            (tenant_id,),
        )
        return [row["category"] for row in rows]

    # ── Exam extras ──────────────────────────────────────────────────────────

    def exam_extras(self, exam_id: str) -> dict:
        rows = self.db.query(
            """
            SELECT instructions, shuffle_questions, shuffle_options, results_published_at, results_published_by
            FROM Exams WHERE exam_id = ?
            """,
            (exam_id,),
        )
        return rows[0] if rows else {}

    def update_exam_extras(self, exam_id: str, *, instructions: str, shuffle_questions: bool, shuffle_options: bool) -> None:
        self.db.execute(
            "UPDATE Exams SET instructions = ?, shuffle_questions = ?, shuffle_options = ?, updated_at = ? WHERE exam_id = ?",
            (instructions or None, 1 if shuffle_questions else 0, 1 if shuffle_options else 0, utc_now(), exam_id),
        )

    def set_question_meta(self, question_id: str, *, category: str = "", difficulty: str = "medium", marking_scheme: str = "", source_question_id: str = "") -> None:
        self.db.execute(
            """
            UPDATE ExamQuestions SET category = ?, difficulty = ?, marking_scheme = ?,
                source_question_id = COALESCE(?, source_question_id)
            WHERE question_id = ?
            """,
            (category or None, difficulty or "medium", marking_scheme or None, source_question_id or None, question_id),
        )

    def question_meta(self, exam_id: str) -> dict[str, dict]:
        rows = self.db.query(
            "SELECT question_id, category, difficulty, marking_scheme, source_question_id FROM ExamQuestions WHERE exam_id = ?",
            (exam_id,),
        )
        return {row["question_id"]: row for row in rows}

    def set_results_published(self, exam_id: str, published_by: str | None) -> None:
        if published_by:
            self.db.execute(
                "UPDATE Exams SET results_published_at = COALESCE(results_published_at, ?), results_published_by = ? WHERE exam_id = ?",
                (utc_now(), published_by, exam_id),
            )
        else:
            self.db.execute("UPDATE Exams SET results_published_at = NULL, results_published_by = NULL WHERE exam_id = ?", (exam_id,))

    # ── Attempts ─────────────────────────────────────────────────────────────

    def attempt_extras(self, attempt_id: str) -> dict:
        rows = self.db.query(
            "SELECT deadline_at, attempt_type, snapshot_json, grading_status FROM ExamAttempts WHERE attempt_id = ?",
            (attempt_id,),
        )
        return rows[0] if rows else {}

    def initialize_attempt(self, attempt_id: str, *, deadline_at: datetime, snapshot: dict, attempt_type: str, max_score: int) -> None:
        # Only fills an attempt that has no snapshot yet, so the frozen paper is never rewritten.
        self.db.execute(
            """
            UPDATE ExamAttempts
            SET deadline_at = ?, snapshot_json = ?, attempt_type = ?, max_score = ?, updated_at = ?
            WHERE attempt_id = ? AND snapshot_json IS NULL
            """,
            (deadline_at, json.dumps(snapshot), attempt_type, max_score, utc_now(), attempt_id),
        )

    def expired_active_attempts(self, now: datetime) -> list[dict]:
        return self.db.query(
            """
            SELECT a.attempt_id, a.session_id
            FROM ExamAttempts a
            JOIN Exams e ON e.exam_id = a.exam_id
            WHERE a.status = 'in_progress'
              AND COALESCE(a.deadline_at, DATEADD(minute, COALESCE(e.duration_minutes, 60), a.started_at)) <= ?
            """,
            (now,),
        )

    def finalize_scores(self, attempt_id: str, *, max_score: int | None = None) -> dict:
        """Recompute total and grading state from stored (already graded) responses."""
        rows = self.db.query(
            "SELECT COALESCE(SUM(awarded_marks), 0) AS score, SUM(CASE WHEN grading_status = 'pending_manual' THEN 1 ELSE 0 END) AS pending FROM StudentResponses WHERE attempt_id = ?",
            (attempt_id,),
        )
        score = int(rows[0].get("score") or 0) if rows else 0
        pending = int(rows[0].get("pending") or 0) if rows else 0
        status = "pending_manual" if pending else "graded"
        if max_score is None:
            self.db.execute(
                "UPDATE ExamAttempts SET score = ?, grading_status = ?, updated_at = ? WHERE attempt_id = ?",
                (score, status, utc_now(), attempt_id),
            )
        else:
            self.db.execute(
                "UPDATE ExamAttempts SET score = ?, max_score = ?, grading_status = ?, updated_at = ? WHERE attempt_id = ?",
                (score, max_score, status, utc_now(), attempt_id),
            )
        return {"score": score, "pending": pending, "grading_status": status}

    # ── Responses ────────────────────────────────────────────────────────────

    def get_response(self, attempt_id: str, question_id: str) -> dict | None:
        rows = self.db.query(
            """
            SELECT response_id, tenant_id, attempt_id, question_id, selected_option_id, selected_option_ids_json,
                   response_text, is_correct, awarded_marks, flagged, client_seq, last_mutation_id,
                   grading_status, feedback, graded_by, graded_at, answered_at, updated_at
            FROM StudentResponses WHERE attempt_id = ? AND question_id = ?
            """,
            (attempt_id, question_id),
        )
        return self._response(rows[0]) if rows else None

    def list_responses(self, attempt_id: str) -> list[dict]:
        rows = self.db.query(
            """
            SELECT response_id, tenant_id, attempt_id, question_id, selected_option_id, selected_option_ids_json,
                   response_text, is_correct, awarded_marks, flagged, client_seq, last_mutation_id,
                   grading_status, feedback, graded_by, graded_at, answered_at, updated_at
            FROM StudentResponses WHERE attempt_id = ?
            """,
            (attempt_id,),
        )
        return [self._response(row) for row in rows]

    @staticmethod
    def _response(row: dict) -> dict:
        row["selected_option_ids"] = _ids(row.pop("selected_option_ids_json", None)) or ([row["selected_option_id"]] if row.get("selected_option_id") else [])
        row["flagged"] = bool(row.get("flagged"))
        return row

    def upsert_response(
        self,
        *,
        attempt_id: str,
        question_id: str,
        tenant_id: str,
        answer: dict | None,
        grade: dict | None,
        flagged: bool | None,
        client_seq: int | None,
        mutation_id: str,
    ) -> dict:
        """Insert or update one response row; answer/grade None means 'flag only'."""
        existing = self.get_response(attempt_id, question_id)
        now = utc_now()
        if existing:
            sets = ["updated_at = ?", "client_seq = ?", "last_mutation_id = ?"]
            params: list[Any] = [now, client_seq, mutation_id or None]
            if answer is not None and grade is not None:
                sets += ["selected_option_id = ?", "selected_option_ids_json = ?", "response_text = ?", "is_correct = ?", "awarded_marks = ?", "grading_status = ?"]
                params += [
                    answer.get("selected_option_id") or None,
                    json.dumps(answer.get("selected_option_ids") or []),
                    answer.get("response_text") or "",
                    None if grade.get("is_correct") is None else (1 if grade["is_correct"] else 0),
                    int(grade.get("awarded_marks") or 0),
                    grade.get("grading_status"),
                ]
            if flagged is not None:
                sets.append("flagged = ?")
                params.append(1 if flagged else 0)
            params.append(existing["response_id"])
            self.db.execute(f"UPDATE StudentResponses SET {', '.join(sets)} WHERE response_id = ?", tuple(params))
        else:
            answer = answer or {"selected_option_id": "", "selected_option_ids": [], "response_text": ""}
            grade = grade or {"is_correct": None, "awarded_marks": 0, "grading_status": "auto_graded"}
            try:
                self.db.execute(
                    """
                    INSERT INTO StudentResponses (
                        response_id, tenant_id, attempt_id, question_id, selected_option_id, selected_option_ids_json,
                        response_text, is_correct, awarded_marks, grading_status, flagged, client_seq, last_mutation_id, answered_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        new_id("rsp"), tenant_id, attempt_id, question_id,
                        answer.get("selected_option_id") or None,
                        json.dumps(answer.get("selected_option_ids") or []),
                        answer.get("response_text") or "",
                        None if grade.get("is_correct") is None else (1 if grade["is_correct"] else 0),
                        int(grade.get("awarded_marks") or 0),
                        grade.get("grading_status"),
                        1 if flagged else 0,
                        client_seq,
                        mutation_id or None,
                        now,
                    ),
                )
            except Exception:
                # A concurrent first save won the unique (attempt, question) index; apply as an update.
                if not self.get_response(attempt_id, question_id):
                    raise
                return self.upsert_response(
                    attempt_id=attempt_id, question_id=question_id, tenant_id=tenant_id, answer=answer,
                    grade=grade, flagged=flagged, client_seq=client_seq, mutation_id=mutation_id,
                )
        return self.get_response(attempt_id, question_id) or {}

    def grade_written(self, response_id: str, *, awarded_marks: int, feedback: str, graded_by: str) -> None:
        self.db.execute(
            """
            UPDATE StudentResponses
            SET awarded_marks = ?, feedback = ?, graded_by = ?, graded_at = ?, grading_status = 'manually_graded',
                is_correct = NULL, updated_at = ?
            WHERE response_id = ?
            """,
            (awarded_marks, feedback or None, graded_by, utc_now(), utc_now(), response_id),
        )

    def get_response_by_id(self, response_id: str) -> dict | None:
        rows = self.db.query(
            """
            SELECT r.response_id, r.attempt_id, r.question_id, r.response_text, r.awarded_marks, r.grading_status,
                   r.feedback, a.exam_id, a.status AS attempt_status, a.tenant_id, a.snapshot_json,
                   COALESCE(a.attempt_type, 'real') AS attempt_type
            FROM StudentResponses r JOIN ExamAttempts a ON a.attempt_id = r.attempt_id
            WHERE r.response_id = ?
            """,
            (response_id,),
        )
        return rows[0] if rows else None

    # ── Grading and results ──────────────────────────────────────────────────

    def grading_queue(self, exam_id: str) -> list[dict]:
        return self.db.query(
            f"""
            SELECT r.response_id, r.attempt_id, r.question_id, r.response_text, r.awarded_marks, r.grading_status,
                   r.feedback, r.graded_at, a.snapshot_json, u.full_name AS student_name, a.roll_number
            FROM StudentResponses r
            JOIN ExamAttempts a ON a.attempt_id = r.attempt_id
            JOIN Users u ON u.user_id = a.user_id
            WHERE a.exam_id = ? AND a.status = 'submitted' AND {REAL}
              AND r.grading_status IN ('pending_manual', 'manually_graded')
            ORDER BY CASE WHEN r.grading_status = 'pending_manual' THEN 0 ELSE 1 END, a.submitted_at
            """,
            (exam_id,),
        )

    def exam_results(self, exam_id: str) -> list[dict]:
        return self.db.query(
            f"""
            SELECT a.attempt_id, a.user_id, a.roll_number, a.status, a.started_at, a.submitted_at, a.score,
                   a.max_score, COALESCE(a.grading_status, 'graded') AS grading_status,
                   u.full_name AS student_name, u.email AS student_email
            FROM ExamAttempts a JOIN Users u ON u.user_id = a.user_id
            WHERE a.exam_id = ? AND a.status = 'submitted' AND {REAL}
            ORDER BY a.score DESC, a.submitted_at
            """,
            (exam_id,),
        )

    def submitted_real_attempts(self, exam_id: str) -> list[dict]:
        return self.db.query(
            f"SELECT a.attempt_id, a.score, a.max_score, a.snapshot_json FROM ExamAttempts a WHERE a.exam_id = ? AND a.status = 'submitted' AND {REAL}",
            (exam_id,),
        )

    def candidate_results(self, user_id: str) -> list[dict]:
        return self.db.query(
            f"""
            SELECT a.attempt_id, a.exam_id, a.submitted_at, a.score, a.max_score,
                   COALESCE(a.grading_status, 'graded') AS grading_status,
                   e.title AS exam_title, e.exam_code, e.results_published_at
            FROM ExamAttempts a JOIN Exams e ON e.exam_id = a.exam_id
            WHERE a.user_id = ? AND a.status = 'submitted' AND {REAL}
            ORDER BY a.submitted_at DESC
            """,
            (user_id,),
        )

    # ── Announcements ────────────────────────────────────────────────────────

    def create_announcement(self, *, exam_id: str, tenant_id: str, title: str, body: str, priority: str, created_by: str) -> dict:
        announcement_id = new_id("ann")
        self.db.execute(
            "INSERT INTO Announcements (announcement_id, tenant_id, exam_id, title, body, priority, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (announcement_id, tenant_id, exam_id, title, body, priority, created_by, utc_now()),
        )
        return self.get_announcement(announcement_id) or {}

    def get_announcement(self, announcement_id: str) -> dict | None:
        rows = self.db.query(
            "SELECT announcement_id, tenant_id, exam_id, title, body, priority, created_by, created_at, withdrawn_at FROM Announcements WHERE announcement_id = ?",
            (announcement_id,),
        )
        return rows[0] if rows else None

    def list_announcements(self, exam_id: str, *, include_withdrawn: bool) -> list[dict]:
        sql = "SELECT announcement_id, tenant_id, exam_id, title, body, priority, created_by, created_at, withdrawn_at FROM Announcements WHERE exam_id = ?"
        if not include_withdrawn:
            sql += " AND withdrawn_at IS NULL"
        return self.db.query(sql + " ORDER BY created_at DESC", (exam_id,))

    def withdraw_announcement(self, announcement_id: str) -> None:
        self.db.execute("UPDATE Announcements SET withdrawn_at = COALESCE(withdrawn_at, ?) WHERE announcement_id = ?", (utc_now(), announcement_id))

    def candidate_announcements(self, user_id: str) -> list[dict]:
        return self.db.query(
            """
            SELECT n.announcement_id, n.exam_id, n.title, n.body, n.priority, n.created_at, e.title AS exam_title
            FROM Announcements n
            JOIN ExamAssignments s ON s.exam_id = n.exam_id AND s.student_user_id = ? AND s.status <> 'revoked'
            JOIN Exams e ON e.exam_id = n.exam_id
            WHERE n.withdrawn_at IS NULL
            ORDER BY n.created_at DESC
            """,
            (user_id,),
        )

    # ── Dashboards, monitoring, analytics ────────────────────────────────────

    def latest_real_attempts_for_user(self, user_id: str) -> dict[str, dict]:
        rows = self.db.query(
            f"""
            SELECT a.attempt_id, a.exam_id, a.status, a.started_at, a.submitted_at, a.deadline_at, a.score, a.max_score,
                   COALESCE(a.grading_status, 'graded') AS grading_status
            FROM ExamAttempts a
            WHERE a.user_id = ? AND {REAL} AND a.status IN ('in_progress', 'submitted')
            ORDER BY COALESCE(a.submitted_at, a.started_at) DESC
            """,
            (user_id,),
        )
        latest: dict[str, dict] = {}
        for row in rows:
            latest.setdefault(row["exam_id"], row)
        return latest

    def live_progress(self, exam_id: str) -> list[dict]:
        return self.db.query(
            f"""
            SELECT a.attempt_id, a.user_id, a.roll_number, a.status, a.started_at, a.submitted_at, a.deadline_at,
                   a.session_id, a.snapshot_json, u.full_name AS student_name,
                   (SELECT COUNT(*) FROM StudentResponses r WHERE r.attempt_id = a.attempt_id
                        AND (r.selected_option_id IS NOT NULL OR (r.selected_option_ids_json IS NOT NULL AND r.selected_option_ids_json <> '[]')
                             OR LEN(COALESCE(r.response_text, '')) > 0)) AS answered,
                   (SELECT COUNT(*) FROM StudentResponses r WHERE r.attempt_id = a.attempt_id AND r.flagged = 1) AS flagged,
                   (SELECT MAX(COALESCE(r.updated_at, r.answered_at)) FROM StudentResponses r WHERE r.attempt_id = a.attempt_id) AS last_saved_at,
                   (SELECT COUNT(*) FROM Events ev WHERE ev.session_id = a.session_id AND COALESCE(ev.risk_points, 0) > 0) AS incidents,
                   (SELECT COALESCE(SUM(ev.risk_points), 0) FROM Events ev WHERE ev.session_id = a.session_id) AS risk_score
            FROM ExamAttempts a JOIN Users u ON u.user_id = a.user_id
            WHERE a.exam_id = ? AND {REAL} AND a.status IN ('in_progress', 'submitted')
            ORDER BY CASE WHEN a.status = 'in_progress' THEN 0 ELSE 1 END, a.started_at DESC
            """,
            (exam_id,),
        )

    def recent_incidents(self, exam_id: str, limit: int = 25) -> list[dict]:
        return self.db.query(
            f"""
            SELECT TOP {int(limit)} ev.event_type, ev.risk_points, ev.event_time, ev.notes AS details, a.attempt_id,
                   a.session_id, u.full_name AS student_name
            FROM Events ev
            JOIN ExamAttempts a ON a.session_id = ev.session_id
            JOIN Users u ON u.user_id = a.user_id
            WHERE a.exam_id = ? AND {REAL} AND COALESCE(ev.risk_points, 0) > 0
            ORDER BY ev.event_time DESC
            """,
            (exam_id,),
        )

    # ── Issued (verifiable) reports ──────────────────────────────────────────

    def issue_report(self, *, tenant_id: str, attempt_id: str, exam_id: str, issued_by: str, token: str, report_type: str = "academic_result") -> dict:
        report_id = new_id("rpt")
        self.db.execute(
            "INSERT INTO IssuedReports (report_id, tenant_id, verify_token, report_type, attempt_id, exam_id, issued_by, issued_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (report_id, tenant_id, token, report_type, attempt_id, exam_id, issued_by, utc_now()),
        )
        return self.get_report(report_id) or {}

    def get_report(self, report_id: str) -> dict | None:
        rows = self.db.query("SELECT * FROM IssuedReports WHERE report_id = ?", (report_id,))
        return rows[0] if rows else None

    def report_by_token(self, token: str) -> dict | None:
        rows = self.db.query("SELECT * FROM IssuedReports WHERE verify_token = ?", (token,))
        return rows[0] if rows else None

    def active_report_for_attempt(self, attempt_id: str) -> dict | None:
        rows = self.db.query(
            "SELECT TOP 1 * FROM IssuedReports WHERE attempt_id = ? AND revoked_at IS NULL ORDER BY issued_at DESC",
            (attempt_id,),
        )
        return rows[0] if rows else None

    def revoke_report(self, report_id: str) -> None:
        self.db.execute("UPDATE IssuedReports SET revoked_at = COALESCE(revoked_at, ?) WHERE report_id = ?", (utc_now(), report_id))
