"""Nigran 360 examiner/candidate workflows built on top of ExamService.

Question bank, candidate dashboard, live monitoring, announcements, manual grading,
result publication, analytics, academic (verifiable) reports and bulk import.
Every method enforces role, tenant and ownership on the server.
"""

from __future__ import annotations

import csv
import io
import json
import secrets
from dataclasses import dataclass
from typing import Any, Callable

from database.assessment_repository import AssessmentRepository
from services import assessment as rules
from services.exam_service import ExamService, ExamServiceError, format_exam, iso, tenant_id

MAX_IMPORT_BYTES = 1_000_000
MAX_IMPORT_ROWS = 500


def _fail(status: int, error: str, message: str, details: Any = None) -> None:
    raise ExamServiceError(status, error, message, details)


@dataclass
class AssessmentService:
    exams: ExamService
    hash_password: Callable[[str], str]
    build_academic_pdf: Callable[[dict], bytes]

    # ── helpers ──────────────────────────────────────────────────────────────

    def _repo(self) -> AssessmentRepository:
        return AssessmentRepository(self.exams.database_provider())

    def _platform(self):
        return self.exams.repository_provider()

    def _require_staff_exam(self, exam_id: str, user: dict) -> dict:
        return self.exams.require_management_access(exam_id, user)

    # ── Question bank ────────────────────────────────────────────────────────

    @staticmethod
    def _format_bank(row: dict) -> dict:
        return {
            "question_id": row["question_id"],
            "question_text": row.get("question_text") or "",
            "question_type": row.get("question_type") or "mcq",
            "category": row.get("category") or "",
            "difficulty": row.get("difficulty") or "medium",
            "marks": int(row.get("marks") or 1),
            "marking_scheme": row.get("marking_scheme") or "",
            "updated_at": iso(row.get("updated_at") or row.get("created_at")),
            "options": [
                {"option_id": option["option_id"], "option_text": option["option_text"], "is_correct": bool(option.get("is_correct")), "sort_order": int(option.get("sort_order") or 0)}
                for option in row.get("options") or []
            ],
        }

    def list_bank(self, user: dict, filters: dict) -> dict:
        rows = self._repo().list_bank_questions(
            tenant_id(user),
            category=str(filters.get("category") or ""),
            difficulty=str(filters.get("difficulty") or ""),
            question_type=str(filters.get("question_type") or ""),
            search=str(filters.get("search") or "")[:100],
        )
        return {"questions": [self._format_bank(row) for row in rows], "categories": self._repo().bank_categories(tenant_id(user))}

    def _validated(self, data: dict) -> dict:
        try:
            return rules.validate_question(data)
        except rules.AssessmentError as exc:
            _fail(422, exc.error, exc.message)
        raise AssertionError

    def save_bank_question(self, data: dict, user: dict, question_id: str = "") -> dict:
        payload = self._validated(data)
        if question_id:
            existing = self._repo().get_bank_question(question_id)
            if not existing or existing.get("tenant_id") != tenant_id(user):
                _fail(404, "not_found", "Question not found in your question bank.")
        return self._format_bank(self._repo().upsert_bank_question(payload, tenant_id(user), user["user_id"], question_id))

    def archive_bank_question(self, question_id: str, user: dict) -> dict:
        existing = self._repo().get_bank_question(question_id)
        if not existing or existing.get("tenant_id") != tenant_id(user):
            _fail(404, "not_found", "Question not found in your question bank.")
        self._repo().archive_bank_question(question_id)
        return {"status": "archived", "question_id": question_id}

    def assign_bank_questions(self, exam_id: str, question_ids: list[str], user: dict) -> dict:
        """Copy bank questions into an exam (editing the bank later never changes the exam)."""
        exam = self._require_staff_exam(exam_id, user)
        self.exams.require_content_editable(exam)
        existing = self._platform().list_exam_questions(exam_id, include_correct=True)
        next_order = max([int(row.get("sort_order") or 0) for row in existing] or [-1]) + 1
        added = []
        for qid in list(dict.fromkeys(question_ids))[:100]:
            bank = self._repo().get_bank_question(qid)
            if not bank or bank.get("tenant_id") != tenant_id(user) or bank.get("status") != "active":
                _fail(404, "not_found", f"Bank question {qid} was not found.")
            payload = {**self._format_bank(bank), "sort_order": next_order, "source_question_id": qid}
            payload.pop("question_id", None)
            for option in payload["options"]:
                option["option_id"] = ""
            added.append(self.exams.create_question(exam_id, payload, user))
            next_order += 1
        return {"added": len(added), "questions": added}

    # ── Candidate dashboard and results ──────────────────────────────────────

    def candidate_dashboard(self, user: dict) -> dict:
        now = self.exams.now()
        latest = self._repo().latest_real_attempts_for_user(user["user_id"])
        groups: dict[str, list] = {"available": [], "upcoming": [], "in_progress": [], "completed": [], "closed": []}
        for exam in self.exams.list_exams(user):
            raw = self._platform().get_exam(exam["exam_id"]) or {}
            attempt = latest.get(exam["exam_id"])
            state = rules.candidate_availability({**raw, "status": exam["status"]}, {**attempt, "duration_minutes": raw.get("duration_minutes")} if attempt else None, now)
            item = {
                **exam,
                "access_state": state,
                "attempt": (
                    {
                        "attempt_id": attempt["attempt_id"],
                        "status": attempt["status"],
                        "submitted_at": iso(attempt.get("submitted_at")) if attempt.get("submitted_at") else None,
                        "deadline_at": iso(attempt.get("deadline_at")) if attempt.get("deadline_at") else None,
                    }
                    if attempt
                    else None
                ),
            }
            groups[state].append(item)
        return {
            "server_now": iso(now),
            "groups": groups,
            "announcements": self.candidate_announcements(user),
            "results": self.candidate_results(user),
        }

    def candidate_results(self, user: dict) -> list[dict]:
        results = []
        for row in self._repo().candidate_results(user["user_id"]):
            published = bool(row.get("results_published_at")) and row.get("grading_status") != rules.GRADE_PENDING
            results.append(
                {
                    "attempt_id": row["attempt_id"],
                    "exam_id": row["exam_id"],
                    "exam_title": row.get("exam_title") or "",
                    "submitted_at": iso(row.get("submitted_at")) if row.get("submitted_at") else None,
                    "published": published,
                    "score": int(row.get("score") or 0) if published else None,
                    "max_score": int(row.get("max_score") or 0) if published else None,
                    "percentage": round(100 * int(row.get("score") or 0) / int(row["max_score"]), 1) if published and row.get("max_score") else None,
                    "status_label": "Published" if published else "Awaiting result publication",
                }
            )
        return results

    # ── Announcements ────────────────────────────────────────────────────────

    @staticmethod
    def _format_announcement(row: dict) -> dict:
        return {
            "announcement_id": row["announcement_id"],
            "exam_id": row.get("exam_id"),
            "exam_title": row.get("exam_title"),
            "title": row.get("title") or "",
            "body": row.get("body") or "",
            "priority": row.get("priority") or "normal",
            "created_at": iso(row.get("created_at")),
            "withdrawn_at": iso(row.get("withdrawn_at")) if row.get("withdrawn_at") else None,
        }

    def create_announcement(self, exam_id: str, data: dict, user: dict) -> dict:
        exam = self._require_staff_exam(exam_id, user)
        title = str(data.get("title") or "").strip()
        body = str(data.get("body") or "").strip()
        priority = str(data.get("priority") or "normal").lower()
        if not (2 <= len(title) <= 200) or not (2 <= len(body) <= 2000):
            _fail(422, "validation_error", "Announcement needs a title (2–200 characters) and a message (2–2000 characters).")
        if priority not in {"normal", "important", "urgent"}:
            _fail(422, "validation_error", "Priority must be normal, important or urgent.")
        row = self._repo().create_announcement(
            exam_id=exam_id, tenant_id=exam.get("tenant_id") or tenant_id(user), title=title, body=body, priority=priority, created_by=user["user_id"]
        )
        return self._format_announcement(row)

    def list_exam_announcements(self, exam_id: str, user: dict) -> list[dict]:
        if user["role"] == "student":
            if not self._platform().exam_assigned_to_student(exam_id, user["user_id"]):
                _fail(403, "not_assigned", "This exam is not assigned to you.")
            return [self._format_announcement(row) for row in self._repo().list_announcements(exam_id, include_withdrawn=False)]
        self._require_staff_exam(exam_id, user)
        return [self._format_announcement(row) for row in self._repo().list_announcements(exam_id, include_withdrawn=True)]

    def withdraw_announcement(self, exam_id: str, announcement_id: str, user: dict) -> dict:
        self._require_staff_exam(exam_id, user)
        row = self._repo().get_announcement(announcement_id)
        if not row or row.get("exam_id") != exam_id:
            _fail(404, "not_found", "Announcement not found.")
        self._repo().withdraw_announcement(announcement_id)
        return self._format_announcement(self._repo().get_announcement(announcement_id) or row)

    def candidate_announcements(self, user: dict) -> list[dict]:
        return [self._format_announcement(row) for row in self._repo().candidate_announcements(user["user_id"])[:20]]

    # ── Live monitoring ──────────────────────────────────────────────────────

    def live_monitor(self, exam_id: str, user: dict) -> dict:
        exam = self._require_staff_exam(exam_id, user)
        self.exams.finalize_expired_attempts()
        now = self.exams.now()
        attempts = []
        for row in self._repo().live_progress(exam_id):
            snapshot = rules.load_snapshot(row.get("snapshot_json"))
            total = len(snapshot["questions"]) if snapshot else len(self._platform().list_exam_questions(exam_id))
            deadline = rules.attempt_deadline({**row, "duration_minutes": exam.get("duration_minutes")})
            attempts.append(
                {
                    "attempt_id": row["attempt_id"],
                    "student_name": row.get("student_name") or "",
                    "roll_number": row.get("roll_number") or "",
                    "status": row.get("status"),
                    "started_at": iso(row.get("started_at")),
                    "submitted_at": iso(row.get("submitted_at")) if row.get("submitted_at") else None,
                    "deadline_at": iso(deadline) if deadline else None,
                    "seconds_left": max(0, int((deadline - now).total_seconds())) if deadline and row.get("status") == "in_progress" else 0,
                    "answered": int(row.get("answered") or 0),
                    "flagged": int(row.get("flagged") or 0),
                    "total_questions": total,
                    "last_saved_at": iso(row.get("last_saved_at")) if row.get("last_saved_at") else None,
                    "incidents": int(row.get("incidents") or 0),
                    "risk_score": min(int(row.get("risk_score") or 0), 100),
                    "session_id": row.get("session_id"),
                }
            )
        incidents = [
            {
                "event_type": row.get("event_type"),
                "risk_points": int(row.get("risk_points") or 0),
                "event_time": iso(row.get("event_time")),
                "details": row.get("details") or "",
                "student_name": row.get("student_name") or "",
                "attempt_id": row.get("attempt_id"),
                "session_id": row.get("session_id"),
            }
            for row in self._repo().recent_incidents(exam_id)
        ]
        return {
            "exam": format_exam(self.exams._exam_with_extras(exam)),
            "server_now": iso(now),
            "summary": {
                "in_progress": sum(1 for row in attempts if row["status"] == "in_progress"),
                "submitted": sum(1 for row in attempts if row["status"] == "submitted"),
                "assigned": int(exam.get("assignment_count") or 0),
            },
            "attempts": attempts,
            "incidents": incidents,
            "notice": "Monitoring signals are indicators for human review, not conclusive evidence of misconduct.",
        }

    # ── Grading and results ──────────────────────────────────────────────────

    def grading_queue(self, exam_id: str, user: dict) -> list[dict]:
        self._require_staff_exam(exam_id, user)
        items = []
        for row in self._repo().grading_queue(exam_id):
            question = rules.snapshot_question(rules.load_snapshot(row.get("snapshot_json")) or {"questions": []}, row["question_id"]) or {}
            items.append(
                {
                    "response_id": row["response_id"],
                    "attempt_id": row["attempt_id"],
                    "student_name": row.get("student_name") or "",
                    "roll_number": row.get("roll_number") or "",
                    "question_id": row["question_id"],
                    "question_text": question.get("question_text") or "",
                    "max_marks": int(question.get("marks") or 0),
                    "response_text": row.get("response_text") or "",
                    "awarded_marks": int(row.get("awarded_marks") or 0),
                    "feedback": row.get("feedback") or "",
                    "grading_status": row.get("grading_status"),
                    "graded_at": iso(row.get("graded_at")) if row.get("graded_at") else None,
                }
            )
        return items

    def grade_response(self, response_id: str, data: dict, user: dict) -> dict:
        row = self._repo().get_response_by_id(response_id)
        if not row:
            _fail(404, "not_found", "Response not found.")
        self._require_staff_exam(row["exam_id"], user)
        if row.get("attempt_status") != "submitted":
            _fail(409, "attempt_not_submitted", "Only submitted attempts can be graded.")
        question = rules.snapshot_question(rules.load_snapshot(row.get("snapshot_json")) or {"questions": []}, row["question_id"])
        if not question or question.get("question_type") != "written":
            _fail(422, "validation_error", "Only written responses are graded manually.")
        try:
            raw_marks = float(data.get("awarded_marks"))
        except (TypeError, ValueError):
            _fail(422, "validation_error", "Awarded marks must be a whole number.")
        if not raw_marks.is_integer():
            _fail(422, "validation_error", "Awarded marks must be a whole number.")
        marks = int(raw_marks)
        if marks < 0 or marks > int(question.get("marks") or 0):
            _fail(422, "marks_out_of_range", f"Awarded marks must be between 0 and {int(question.get('marks') or 0)}.")
        feedback = str(data.get("feedback") or "").strip()[:2000]
        self._repo().grade_written(response_id, awarded_marks=marks, feedback=feedback, graded_by=user["user_id"])
        totals = self._repo().finalize_scores(row["attempt_id"])
        return {"response_id": response_id, "awarded_marks": marks, "feedback": feedback, "attempt_id": row["attempt_id"], "attempt_score": totals["score"], "attempt_grading_status": totals["grading_status"], "previous_marks": int(row.get("awarded_marks") or 0), "regraded": row.get("grading_status") == rules.GRADE_MANUAL}

    def exam_results(self, exam_id: str, user: dict) -> dict:
        exam = self._require_staff_exam(exam_id, user)
        self.exams.finalize_expired_attempts()
        extras = self._repo().exam_extras(exam_id)
        rows = self._repo().exam_results(exam_id)
        scores = [int(row.get("score") or 0) for row in rows]
        max_score = max([int(row.get("max_score") or 0) for row in rows] or [int(exam.get("total_marks") or 0)])
        pending = sum(1 for row in rows if row.get("grading_status") == rules.GRADE_PENDING)
        percentages = [100 * score / max_score for score in scores] if max_score else []
        bands = {"0-39": 0, "40-59": 0, "60-79": 0, "80-100": 0}
        for pct in percentages:
            key = "80-100" if pct >= 80 else "60-79" if pct >= 60 else "40-59" if pct >= 40 else "0-39"
            bands[key] += 1
        return {
            "exam": format_exam({**exam, **extras}),
            "published": bool(extras.get("results_published_at")),
            "published_at": iso(extras.get("results_published_at")) if extras.get("results_published_at") else None,
            "pending_manual": pending,
            "can_publish": bool(rows) and pending == 0,
            "summary": {
                "submitted": len(rows),
                "assigned": int(exam.get("assignment_count") or 0),
                "max_score": max_score,
                "average": round(sum(scores) / len(scores), 2) if scores else None,
                "highest": max(scores) if scores else None,
                "lowest": min(scores) if scores else None,
                "median": sorted(scores)[len(scores) // 2] if scores else None,
                "pass_rate": round(sum(1 for pct in percentages if pct >= 50) / len(percentages), 3) if percentages else None,
                "distribution": bands,
            },
            "candidates": [
                {
                    "attempt_id": row["attempt_id"],
                    "student_name": row.get("student_name") or "",
                    "student_email": row.get("student_email") or "",
                    "roll_number": row.get("roll_number") or "",
                    "submitted_at": iso(row.get("submitted_at")) if row.get("submitted_at") else None,
                    "score": int(row.get("score") or 0),
                    "max_score": int(row.get("max_score") or 0),
                    "grading_status": row.get("grading_status"),
                }
                for row in rows
            ],
        }

    def publish_results(self, exam_id: str, publish: bool, user: dict) -> dict:
        self._require_staff_exam(exam_id, user)
        results = self.exam_results(exam_id, user)
        if publish:
            if not results["summary"]["submitted"]:
                _fail(409, "no_submissions", "There are no submitted attempts to publish yet.")
            if results["pending_manual"]:
                _fail(409, "grading_incomplete", f"{results['pending_manual']} attempt(s) still have written answers awaiting grading.")
        self._repo().set_results_published(exam_id, user["user_id"] if publish else None)
        return self.exam_results(exam_id, user)

    def analytics(self, exam_id: str, user: dict) -> dict:
        self._require_staff_exam(exam_id, user)
        attempts = []
        reference: dict | None = None
        for row in self._repo().submitted_real_attempts(exam_id):
            snapshot = rules.load_snapshot(row.get("snapshot_json"))
            if snapshot and reference is None:
                reference = snapshot
            responses = {response["question_id"]: response for response in self._repo().list_responses(row["attempt_id"])}
            attempts.append({"responses": responses})
        if reference is None:
            reference = rules.build_snapshot(self.exams._questions_with_meta(exam_id, self._platform().list_exam_questions(exam_id, include_correct=True)))
        rows = rules.question_analytics(reference["questions"], attempts)
        return {
            "sample_size": len(attempts),
            "small_sample": len(attempts) < 5,
            "note": "Based only on submitted real attempts. Sandbox and in-progress attempts are excluded.",
            "questions": rows,
        }

    # ── Academic reports and verification ────────────────────────────────────

    def _report_context(self, attempt_id: str, user: dict) -> tuple[dict, dict]:
        attempt = self._platform().get_attempt(attempt_id)
        if not attempt or (attempt.get("attempt_type") or "real") != "real" or attempt.get("status") != "submitted":
            _fail(404, "not_found", "Submitted attempt not found.")
        if user["role"] == "student":
            if attempt.get("user_id") != user["user_id"]:
                _fail(403, "forbidden", "You can only download your own report.")
            if not attempt.get("results_published_at") or attempt.get("grading_status") == rules.GRADE_PENDING:
                _fail(403, "result_not_published", "Your result has not been published yet.")
        else:
            self._require_staff_exam(attempt["exam_id"], user)
            if attempt.get("grading_status") == rules.GRADE_PENDING:
                _fail(409, "grading_incomplete", "Grade all written answers before issuing a report.")
        return attempt, self._platform().get_exam(attempt["exam_id"]) or {}

    def academic_report(self, attempt_id: str, user: dict, verify_base_url: str) -> tuple[bytes, str]:
        attempt, exam = self._report_context(attempt_id, user)
        report = self._repo().active_report_for_attempt(attempt_id)
        if not report:
            report = self._repo().issue_report(
                tenant_id=attempt.get("tenant_id") or tenant_id(user),
                attempt_id=attempt_id,
                exam_id=attempt["exam_id"],
                issued_by=user["user_id"],
                token=secrets.token_urlsafe(24),
            )
        paper = rules.load_snapshot(attempt.get("snapshot_json")) or {"questions": []}
        responses = {row["question_id"]: row for row in self._repo().list_responses(attempt_id)}
        breakdown = []
        for index, question in enumerate(paper["questions"], start=1):
            response = responses.get(question["question_id"]) or {}
            blank = rules.answer_is_blank({"selected_option_id": response.get("selected_option_id"), "selected_option_ids": response.get("selected_option_ids"), "response_text": response.get("response_text")})
            breakdown.append({"number": index, "type": question.get("question_type"), "category": question.get("category") or "", "marks": int(question.get("marks") or 0), "awarded": int(response.get("awarded_marks") or 0), "status": "Not answered" if blank else ("Graded" if response.get("grading_status") != rules.GRADE_PENDING else "Pending")})
        max_score = int(attempt.get("max_score") or 0)
        context = {
            "report_id": report["report_id"],
            "verify_url": f"{verify_base_url.rstrip('/')}/verify/{report['verify_token']}",
            "issued_at": iso(report.get("issued_at")),
            "exam_title": exam.get("title") or "",
            "exam_code": exam.get("exam_code") or "",
            "candidate_name": attempt.get("student_name") or "",
            "roll_number": attempt.get("roll_number") or "",
            "submitted_at": iso(attempt.get("submitted_at")),
            "score": int(attempt.get("score") or 0),
            "max_score": max_score,
            "percentage": round(100 * int(attempt.get("score") or 0) / max_score, 1) if max_score else 0.0,
            "breakdown": breakdown,
        }
        return self.build_academic_pdf(context), f"{exam.get('exam_code') or 'exam'}_{attempt.get('roll_number') or attempt_id}_result.pdf"

    def verify_report(self, token: str) -> dict:
        """Public, minimal authenticity check: never returns marks or personal data."""
        clean = "".join(ch for ch in str(token or "") if ch.isalnum() or ch in "-_")[:96]
        report = self._repo().report_by_token(clean) if len(clean) >= 16 else None
        if not report:
            return {"valid": False, "status": "not_found", "message": "No report matches this verification code."}
        exam = self._platform().get_exam(report["exam_id"]) or {}
        if report.get("revoked_at"):
            return {"valid": False, "status": "revoked", "report_type": "Academic result report", "issued_at": iso(report.get("issued_at")), "revoked_at": iso(report.get("revoked_at")), "message": "This report was revoked by the issuing examiner."}
        return {"valid": True, "status": "valid", "report_type": "Academic result report", "report_id": report["report_id"], "exam_title": exam.get("title") or "", "issued_at": iso(report.get("issued_at")), "message": "This report was issued by Nigran 360 and has not been revoked."}

    def revoke_report(self, attempt_id: str, user: dict) -> dict:
        attempt = self._platform().get_attempt(attempt_id)
        if not attempt:
            _fail(404, "not_found", "Attempt not found.")
        self._require_staff_exam(attempt["exam_id"], user)
        report = self._repo().active_report_for_attempt(attempt_id)
        if not report:
            _fail(404, "not_found", "No active report has been issued for this attempt.")
        self._repo().revoke_report(report["report_id"])
        return {"status": "revoked", "report_id": report["report_id"]}

    # ── Bulk import ──────────────────────────────────────────────────────────

    @staticmethod
    def _parse_rows(content: str, file_format: str) -> list[dict]:
        if len(content.encode("utf-8")) > MAX_IMPORT_BYTES:
            _fail(413, "import_too_large", "Import files must be 1 MB or smaller.")
        fmt = (file_format or "").lower()
        if fmt == "json":
            try:
                data = json.loads(content)
            except ValueError as exc:
                _fail(422, "invalid_json", f"The JSON file could not be parsed: {exc.msg} (line {exc.lineno}).")
            if isinstance(data, dict):
                data = data.get("candidates") or data.get("questions") or data.get("rows") or []
            if not isinstance(data, list) or not all(isinstance(row, dict) for row in data):
                _fail(422, "invalid_json", "JSON must be an array of objects.")
            rows = data
        elif fmt == "csv":
            reader = csv.DictReader(io.StringIO(content.lstrip("﻿")))
            rows = [{(key or "").strip().lower(): (value or "").strip() for key, value in row.items() if key} for row in reader]
        else:
            _fail(422, "unsupported_format", "Upload a .csv or .json file.")
        if not rows:
            _fail(422, "empty_import", "The file has no data rows.")
        if len(rows) > MAX_IMPORT_ROWS:
            _fail(413, "too_many_rows", f"Import at most {MAX_IMPORT_ROWS} rows at a time.")
        return rows

    def import_candidates(self, content: str, file_format: str, exam_id: str, commit: bool, user: dict) -> dict:
        if exam_id:
            self._require_staff_exam(exam_id, user)
        rows = self._parse_rows(content, file_format)
        platform = self._platform()
        seen: set[str] = set()
        results = []
        for index, row in enumerate(rows, start=1):
            errors = []
            if any(key in row for key in ("password", "password_hash")):
                errors.append("Password columns are not accepted; temporary passwords are generated.")
            name = str(row.get("full_name") or row.get("name") or "").strip()
            email = str(row.get("email") or "").strip().lower()
            if len(name) < 2 or len(name) > 120:
                errors.append("full_name is required (2–120 characters).")
            if "@" not in email or "." not in email.split("@")[-1] or len(email) > 254:
                errors.append("A valid email is required.")
            elif email in seen:
                errors.append("Duplicate email in this file.")
            seen.add(email)
            existing = platform.get_user_by_email(email) if not errors else None
            action = "create"
            if existing:
                if existing.get("role") != "student":
                    errors.append("This email belongs to a non-candidate account.")
                elif (existing.get("tenant_id") or "tenant_default") != tenant_id(user):
                    errors.append("This candidate belongs to another institution.")
                else:
                    action = "enroll_existing" if exam_id else "skip_existing"
            results.append({"row": index, "full_name": name, "email": email, "action": action, "errors": errors})
        valid = [row for row in results if not row["errors"]]
        summary = {"rows": len(results), "valid": len(valid), "invalid": len(results) - len(valid), "committed": False}
        if not commit or summary["invalid"]:
            return {"summary": summary, "rows": results}
        created = []
        for row in valid:
            if row["action"] == "create":
                temp = "Nx-" + secrets.token_urlsafe(9)
                platform.create_user(row["email"], row["full_name"], "student", self.hash_password(temp), tenant_id(user))
                created.append({"email": row["email"], "temporary_password": temp})
            if exam_id:
                student = platform.get_user_by_email(row["email"])
                platform.assign_exam(exam_id, student["user_id"], user["user_id"], tenant_id(user))
        summary["committed"] = True
        summary["created"] = len(created)
        return {"summary": summary, "rows": results, "credentials": created}

    def import_questions(self, content: str, file_format: str, commit: bool, user: dict) -> dict:
        rows = self._parse_rows(content, file_format)
        results = []
        existing_texts = {
            " ".join(str(item.get("question_text") or "").lower().split())
            for item in self._repo().list_bank_questions(tenant_id(user), category="", difficulty="", question_type="", search="")
        }
        seen_texts: set[str] = set()
        for index, row in enumerate(rows, start=1):
            options = row.get("options")
            if isinstance(options, str) or options is None:
                texts = [part.strip() for part in str(options or "").split("|") if part.strip()]
                correct_raw = str(row.get("correct") or row.get("correct_options") or "")
                correct = {part.strip().upper() for part in correct_raw.replace(",", "|").split("|") if part.strip()}
                options = [
                    {"option_text": text, "is_correct": chr(65 + position) in correct or text in correct_raw.split("|")}
                    for position, text in enumerate(texts)
                ]
            payload = {
                "question_text": row.get("question_text") or row.get("question") or "",
                "question_type": row.get("question_type") or row.get("type") or "mcq",
                "marks": row.get("marks") or 1,
                "difficulty": row.get("difficulty") or "medium",
                "category": row.get("category") or row.get("topic") or "",
                "marking_scheme": row.get("marking_scheme") or "",
                "options": options if isinstance(options, list) else [],
            }
            errors = []
            try:
                validated = rules.validate_question(payload)
            except rules.AssessmentError as exc:
                errors.append(exc.message)
                validated = None
            key = " ".join(str(payload["question_text"]).lower().split())
            if key and key in seen_texts:
                errors.append("Duplicate of an earlier row in this file.")
            elif key and key in existing_texts:
                errors.append("This question already exists in your question bank.")
            seen_texts.add(key)
            results.append({"row": index, "question_text": str(payload["question_text"])[:120], "question_type": payload["question_type"], "errors": errors, "_payload": validated})
        valid = [row for row in results if not row["errors"]]
        summary = {"rows": len(results), "valid": len(valid), "invalid": len(results) - len(valid), "committed": False}
        if commit and not summary["invalid"]:
            for row in valid:
                self._repo().upsert_bank_question(row["_payload"], tenant_id(user), user["user_id"])
            summary["committed"] = True
        for row in results:
            row.pop("_payload", None)
        return {"summary": summary, "rows": results}
