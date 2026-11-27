"""Pure examination rules for Nigran 360.

Everything here is deterministic and I/O free so it can be unit-tested directly:
question validation, attempt snapshots, candidate-safe projection, objective grading,
deadlines, exam lifecycle/availability and question analytics.
"""

from __future__ import annotations

import json
import random
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable

QUESTION_TYPES = ("mcq", "multiple_select", "written")
TYPE_ALIASES = {"single_choice": "mcq", "single": "mcq", "multi": "multiple_select", "multiple": "multiple_select", "text": "written"}
DIFFICULTIES = ("easy", "medium", "hard")
MULTI_SCHEMES = ("all_or_nothing", "partial")

GRADE_AUTO = "auto_graded"
GRADE_PENDING = "pending_manual"
GRADE_MANUAL = "manually_graded"

ATTEMPT_REAL = "real"
ATTEMPT_SANDBOX = "sandbox"


class AssessmentError(ValueError):
    def __init__(self, error: str, message: str) -> None:
        super().__init__(message)
        self.error = error
        self.message = message


def _to_utc(value: Any) -> datetime | None:
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    return datetime.fromisoformat(str(value).replace("Z", "+00:00"))


# ── Question model ────────────────────────────────────────────────────────────

def normalize_question_type(value: Any) -> str:
    text = str(value or "mcq").strip().lower()
    text = TYPE_ALIASES.get(text, text)
    if text not in QUESTION_TYPES:
        raise AssessmentError("validation_error", "Question type must be single-answer MCQ, multiple-select or written response.")
    return text


def validate_question(data: dict) -> dict:
    """Validate and normalize a question payload for an exam or the question bank."""
    payload = dict(data)
    payload["question_type"] = normalize_question_type(payload.get("question_type"))
    payload["question_text"] = str(payload.get("question_text") or "").strip()
    if len(payload["question_text"]) < 3:
        raise AssessmentError("validation_error", "Question text is required.")
    if len(payload["question_text"]) > 4000:
        raise AssessmentError("validation_error", "Question text must be 4000 characters or fewer.")
    try:
        marks = int(payload.get("marks") or 0)
    except (TypeError, ValueError):
        raise AssessmentError("validation_error", "Question marks must be a whole number.") from None
    if marks < 1 or marks > 100:
        raise AssessmentError("validation_error", "Question marks must be between 1 and 100.")
    payload["marks"] = marks
    difficulty = str(payload.get("difficulty") or "medium").strip().lower()
    if difficulty not in DIFFICULTIES:
        raise AssessmentError("validation_error", "Difficulty must be easy, medium or hard.")
    payload["difficulty"] = difficulty
    payload["category"] = str(payload.get("category") or "").strip()[:128]

    qtype = payload["question_type"]
    if qtype == "written":
        payload["options"] = []
        payload["marking_scheme"] = "manual"
        return payload

    options = []
    for index, option in enumerate(payload.get("options") or []):
        text = str(option.get("option_text") or "").strip()
        if not text:
            continue
        options.append(
            {
                "option_id": option.get("option_id") or "",
                "option_text": text[:1000],
                "is_correct": bool(option.get("is_correct")),
                "sort_order": int(option.get("sort_order") if option.get("sort_order") is not None else index),
            }
        )
    if len(options) < 2:
        raise AssessmentError("validation_error", "Add at least two answer options.")
    if len(options) > 10:
        raise AssessmentError("validation_error", "A question can have at most 10 options.")
    correct = sum(1 for option in options if option["is_correct"])
    if qtype == "mcq" and correct != 1:
        raise AssessmentError("validation_error", "A single-answer MCQ needs exactly one correct option.")
    if qtype == "multiple_select" and correct < 1:
        raise AssessmentError("validation_error", "Mark at least one correct option.")
    payload["options"] = options
    if qtype == "multiple_select":
        scheme = str(payload.get("marking_scheme") or "all_or_nothing").strip().lower()
        if scheme not in MULTI_SCHEMES:
            raise AssessmentError("validation_error", "Multiple-select marking must be all_or_nothing or partial.")
        payload["marking_scheme"] = scheme
    else:
        payload["marking_scheme"] = "single_correct"
    return payload


# ── Attempt snapshot ──────────────────────────────────────────────────────────

def build_snapshot(
    questions: Iterable[dict],
    *,
    shuffle_questions: bool = False,
    shuffle_options: bool = False,
    seed: str = "",
) -> dict:
    """Freeze question content, order, options and marking scheme for one attempt.

    Shuffling is decided once here (seeded per attempt) so refreshes never reorder.
    The snapshot keeps answer keys and is stored server-side only.
    """
    rng = random.Random(seed or None)
    frozen = []
    for question in questions:
        qtype = TYPE_ALIASES.get(str(question.get("question_type") or "mcq").lower(), str(question.get("question_type") or "mcq").lower())
        options = [
            {
                "option_id": option.get("option_id"),
                "option_text": option.get("option_text") or "",
                "is_correct": bool(option.get("is_correct")),
            }
            for option in sorted(question.get("options") or [], key=lambda row: int(row.get("sort_order") or 0))
        ]
        if shuffle_options and qtype != "written":
            rng.shuffle(options)
        frozen.append(
            {
                "question_id": question.get("question_id"),
                "question_text": question.get("question_text") or "",
                "question_type": qtype,
                "marks": int(question.get("marks") or 1),
                "marking_scheme": question.get("marking_scheme") or ("manual" if qtype == "written" else "single_correct" if qtype == "mcq" else "all_or_nothing"),
                "category": question.get("category") or "",
                "difficulty": question.get("difficulty") or "medium",
                "options": options,
            }
        )
    if shuffle_questions:
        rng.shuffle(frozen)
    return {"version": 1, "questions": frozen}


def load_snapshot(value: Any) -> dict | None:
    if not value:
        return None
    try:
        data = json.loads(value) if isinstance(value, str) else dict(value)
    except (TypeError, ValueError):
        return None
    return data if isinstance(data.get("questions"), list) else None


def candidate_questions(snapshot: dict, *, include_correct: bool = False) -> list[dict]:
    """Project snapshot questions for the API; answer keys only when explicitly allowed."""
    result = []
    for index, question in enumerate(snapshot.get("questions") or []):
        options = []
        for option_index, option in enumerate(question.get("options") or []):
            payload = {
                "option_id": option.get("option_id"),
                "question_id": question.get("question_id"),
                "option_text": option.get("option_text") or "",
                "sort_order": option_index,
            }
            if include_correct:
                payload["is_correct"] = bool(option.get("is_correct"))
            options.append(payload)
        item = {
            "question_id": question.get("question_id"),
            "question_text": question.get("question_text") or "",
            "question_type": question.get("question_type") or "mcq",
            "marks": int(question.get("marks") or 1),
            "sort_order": index,
            "category": question.get("category") or "",
            "difficulty": question.get("difficulty") or "medium",
            "status": "active",
            "options": options,
        }
        if include_correct:
            item["marking_scheme"] = question.get("marking_scheme")
        result.append(item)
    return result


def snapshot_question(snapshot: dict, question_id: str) -> dict | None:
    for question in snapshot.get("questions") or []:
        if question.get("question_id") == question_id:
            return question
    return None


def snapshot_max_score(snapshot: dict) -> int:
    return sum(int(question.get("marks") or 0) for question in snapshot.get("questions") or [])


# ── Answers and grading ───────────────────────────────────────────────────────

def normalize_answer(question: dict, selected_option_id: str = "", selected_option_ids: Iterable[str] | None = None, response_text: str = "") -> dict:
    """Validate an answer against its snapshotted question; returns the stored answer form."""
    qtype = question.get("question_type") or "mcq"
    valid_ids = {option.get("option_id") for option in question.get("options") or []}
    if qtype == "written":
        text = str(response_text or "")
        if len(text) > 10000:
            raise AssessmentError("validation_error", "Written answers must be 10,000 characters or fewer.")
        return {"selected_option_id": "", "selected_option_ids": [], "response_text": text}
    if qtype == "multiple_select":
        ids = [str(value) for value in (selected_option_ids or []) if value]
        if selected_option_id and not ids:
            ids = [selected_option_id]
        ids = list(dict.fromkeys(ids))
        if any(value not in valid_ids for value in ids):
            raise AssessmentError("validation_error", "Selected option does not belong to this question.")
        return {"selected_option_id": "", "selected_option_ids": ids, "response_text": ""}
    choice = str(selected_option_id or "")
    if not choice and selected_option_ids:
        choice = str(list(selected_option_ids)[0] or "")
    if choice and choice not in valid_ids:
        raise AssessmentError("validation_error", "Selected option does not belong to this question.")
    return {"selected_option_id": choice, "selected_option_ids": [choice] if choice else [], "response_text": ""}


def grade_answer(question: dict, answer: dict) -> dict:
    """Grade one answer with the snapshotted marking scheme.

    mcq: full marks for the correct option, otherwise 0.
    multiple_select all_or_nothing: full marks only for exactly the correct set.
    multiple_select partial: floor(marks * max(0, correct_chosen - wrong_chosen) / total_correct).
    written: pending manual grading, never auto-scored.
    """
    marks = int(question.get("marks") or 0)
    qtype = question.get("question_type") or "mcq"
    if qtype == "written":
        has_text = bool(str(answer.get("response_text") or "").strip())
        return {"is_correct": None, "awarded_marks": 0, "grading_status": GRADE_PENDING if has_text else GRADE_AUTO}
    correct_ids = {option.get("option_id") for option in question.get("options") or [] if option.get("is_correct")}
    chosen = set(answer.get("selected_option_ids") or ([answer["selected_option_id"]] if answer.get("selected_option_id") else []))
    if qtype == "multiple_select":
        if not chosen:
            return {"is_correct": False, "awarded_marks": 0, "grading_status": GRADE_AUTO}
        if (question.get("marking_scheme") or "all_or_nothing") == "partial":
            right = len(chosen & correct_ids)
            wrong = len(chosen - correct_ids)
            awarded = (marks * max(0, right - wrong)) // max(1, len(correct_ids))
            return {"is_correct": chosen == correct_ids, "awarded_marks": awarded, "grading_status": GRADE_AUTO}
        exact = chosen == correct_ids
        return {"is_correct": exact, "awarded_marks": marks if exact else 0, "grading_status": GRADE_AUTO}
    exact = len(chosen) == 1 and chosen <= correct_ids
    return {"is_correct": exact, "awarded_marks": marks if exact else 0, "grading_status": GRADE_AUTO}


def answer_is_blank(answer: dict) -> bool:
    return not (answer.get("selected_option_ids") or answer.get("selected_option_id") or str(answer.get("response_text") or "").strip())


# ── Time ──────────────────────────────────────────────────────────────────────

def compute_deadline(started_at: Any, duration_minutes: Any, exam_end_time: Any = None) -> datetime:
    """Immutable server deadline: start + duration, capped by the exam window end."""
    start = _to_utc(started_at) or datetime.now(timezone.utc)
    deadline = start + timedelta(minutes=max(1, int(duration_minutes or 60)))
    end = _to_utc(exam_end_time)
    if end and end < deadline:
        deadline = end
    return deadline


def attempt_deadline(attempt: dict) -> datetime | None:
    """deadline_at for new attempts; legacy attempts fall back to start + duration."""
    deadline = _to_utc(attempt.get("deadline_at"))
    if deadline:
        return deadline
    if not attempt.get("started_at"):
        return None
    return _to_utc(attempt["started_at"]) + timedelta(minutes=max(1, int(attempt.get("duration_minutes") or 60)))


# ── Lifecycle ─────────────────────────────────────────────────────────────────

def exam_lifecycle(exam: dict, now: datetime) -> str:
    """User-facing lifecycle derived from stored status + schedule (stored values untouched).

    draft | upcoming | ongoing | completed | closed | archived
    """
    status = str(exam.get("status") or "draft").lower()
    if status in {"draft", "archived", "closed"}:
        return status
    start = _to_utc(exam.get("start_time"))
    end = _to_utc(exam.get("end_time"))
    if start and now < start:
        return "upcoming"
    if end and now >= end:
        return "completed"
    return "ongoing"


def candidate_availability(exam: dict, attempt: dict | None, now: datetime) -> str:
    """available | upcoming | in_progress | completed | closed for a candidate's dashboard."""
    if attempt and attempt.get("status") == "submitted":
        return "completed"
    lifecycle = exam_lifecycle(exam, now)
    if attempt and attempt.get("status") == "in_progress":
        deadline = attempt_deadline({**attempt, "duration_minutes": exam.get("duration_minutes")})
        if deadline and now < deadline:
            return "in_progress"
        return "completed"
    if lifecycle == "upcoming":
        return "upcoming"
    if lifecycle == "ongoing":
        return "available"
    return "closed"


# ── Analytics ─────────────────────────────────────────────────────────────────

def question_analytics(questions: list[dict], attempts: list[dict]) -> list[dict]:
    """Per-question statistics from real submitted attempts.

    `attempts` items: {"responses": {question_id: response_row}} where response rows carry
    selected_option_id / selected_option_ids / response_text / awarded_marks / is_correct.
    """
    total = len(attempts)
    rows = []
    for question in questions:
        qid = question.get("question_id")
        marks = int(question.get("marks") or 0)
        skipped = incorrect = full = 0
        awarded_sum = 0
        option_counts: dict[str, int] = {}
        for attempt in attempts:
            response = (attempt.get("responses") or {}).get(qid)
            answer = {
                "selected_option_id": (response or {}).get("selected_option_id") or "",
                "selected_option_ids": (response or {}).get("selected_option_ids") or [],
                "response_text": (response or {}).get("response_text") or "",
            }
            if not response or answer_is_blank(answer):
                skipped += 1
                continue
            awarded = int(response.get("awarded_marks") or 0)
            awarded_sum += awarded
            if marks and awarded >= marks:
                full += 1
            elif question.get("question_type") != "written" or response.get("grading_status") == GRADE_MANUAL:
                incorrect += 1
            for option_id in answer["selected_option_ids"] or ([answer["selected_option_id"]] if answer["selected_option_id"] else []):
                option_counts[option_id] = option_counts.get(option_id, 0) + 1
        answered = total - skipped
        facility = (awarded_sum / (marks * total)) if marks and total else None
        if facility is None:
            observed = "no data"
        elif facility >= 0.7:
            observed = "easy"
        elif facility >= 0.4:
            observed = "medium"
        else:
            observed = "hard"
        wrong_options = [
            {"option_id": option.get("option_id"), "option_text": option.get("option_text"), "count": option_counts.get(option.get("option_id"), 0)}
            for option in question.get("options") or []
            if not option.get("is_correct") and option_counts.get(option.get("option_id"), 0)
        ]
        wrong_options.sort(key=lambda row: row["count"], reverse=True)
        rows.append(
            {
                "question_id": qid,
                "question_text": question.get("question_text"),
                "question_type": question.get("question_type"),
                "category": question.get("category") or "",
                "configured_difficulty": question.get("difficulty") or "medium",
                "marks": marks,
                "attempts": total,
                "answered": answered,
                "skipped": skipped,
                "skipped_rate": round(skipped / total, 3) if total else None,
                "incorrect": incorrect,
                "incorrect_rate": round(incorrect / answered, 3) if answered else None,
                "full_marks": full,
                "facility_index": round(facility, 3) if facility is not None else None,
                "observed_difficulty": observed,
                "common_wrong_options": wrong_options[:3],
                "small_sample": total < 5,
            }
        )
    return rows
