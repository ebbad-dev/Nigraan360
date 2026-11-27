"""FastAPI router for Nigran 360 assessment features.

Covers:
- Question bank (examiner/admin)
- Candidate dashboard and results (student)
- Live monitoring (examiner/admin)
- Announcements (examiner/admin + candidate read)
- Grading queue and grading actions (examiner/admin)
- Result publication (examiner/admin)
- Analytics (examiner/admin)
- Academic PDF report download (student + instructor)
- Report verification (public)
- Sandbox attempt (examiner/admin)
- Bulk import: candidates and questions (examiner/admin)
"""
from __future__ import annotations

from typing import Any, Callable, List, Optional

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, Field

from services.assessment_service import AssessmentService
from services.exam_service import ExamServiceError


# ── Request models ────────────────────────────────────────────────────────────

class BankQuestionRequest(BaseModel):
    question_text: str
    question_type: str = "mcq"
    category: str = ""
    difficulty: str = "medium"
    marks: int = 1
    marking_scheme: str = ""
    options: List[dict] = Field(default_factory=list)


class AssignBankRequest(BaseModel):
    question_ids: List[str]


class AnnouncementRequest(BaseModel):
    body: str
    audience: str = "all"


class GradeRequest(BaseModel):
    awarded_marks: Optional[float] = None
    feedback: str = ""
    is_correct: Optional[bool] = None


class PublishResultsRequest(BaseModel):
    publish: bool = True


class ImportRequest(BaseModel):
    content: str
    file_format: str = "csv"
    commit: bool = False


# ── Router factory ────────────────────────────────────────────────────────────

def create_assessment_router(
    service: AssessmentService,
    current_user: Callable,
    require_roles: Callable[..., Callable],
    audit: Callable[..., None],
    api_error: Callable[..., None],
) -> APIRouter:
    router = APIRouter(tags=["assessment"])

    def invoke(method: Callable, *args: Any, **kwargs: Any) -> Any:
        try:
            return method(*args, **kwargs)
        except ExamServiceError as exc:
            api_error(exc.status_code, exc.error, exc.message, exc.details)
        raise AssertionError("api_error dependency must raise")

    # ── Question bank ─────────────────────────────────────────────────────────

    @router.get("/bank/questions")
    def list_bank_questions(
        category: str = "",
        difficulty: str = "",
        question_type: str = "",
        search: str = "",
        user: dict = Depends(require_roles("instructor", "admin")),
    ):
        return invoke(
            service.list_bank,
            user,
            {"category": category, "difficulty": difficulty, "question_type": question_type, "search": search},
        )

    @router.post("/bank/questions")
    def create_bank_question(req: BankQuestionRequest, user: dict = Depends(require_roles("instructor", "admin"))):
        return invoke(service.save_bank_question, req.model_dump(), user)

    @router.put("/bank/questions/{question_id}")
    def update_bank_question(
        question_id: str, req: BankQuestionRequest, user: dict = Depends(require_roles("instructor", "admin"))
    ):
        return invoke(service.save_bank_question, req.model_dump(), user, question_id)

    @router.delete("/bank/questions/{question_id}")
    def archive_bank_question(question_id: str, user: dict = Depends(require_roles("instructor", "admin"))):
        return invoke(service.archive_bank_question, question_id, user)

    @router.post("/exams/{exam_id}/bank/assign")
    def assign_bank_questions(
        exam_id: str, req: AssignBankRequest, user: dict = Depends(require_roles("instructor", "admin"))
    ):
        return invoke(service.assign_bank_questions, exam_id, req.question_ids, user)

    # ── Candidate dashboard and results ───────────────────────────────────────

    @router.get("/student/dashboard")
    def candidate_dashboard(user: dict = Depends(require_roles("student"))):
        return invoke(service.candidate_dashboard, user)

    @router.get("/student/results")
    def candidate_results(user: dict = Depends(require_roles("student"))):
        return invoke(service.candidate_results, user)

    # ── Announcements ─────────────────────────────────────────────────────────

    @router.post("/exams/{exam_id}/announcements")
    def create_announcement(
        exam_id: str,
        req: AnnouncementRequest,
        request: Request,
        user: dict = Depends(require_roles("instructor", "admin")),
    ):
        result = invoke(service.create_announcement, exam_id, req.model_dump(), user)
        audit("announcement.created", actor=user, resource_type="exam", resource_id=exam_id, request=request)
        return result

    @router.get("/exams/{exam_id}/announcements")
    def list_exam_announcements(exam_id: str, user: dict = Depends(require_roles("instructor", "admin"))):
        return invoke(service.list_exam_announcements, exam_id, user)

    @router.delete("/exams/{exam_id}/announcements/{announcement_id}")
    def withdraw_announcement(
        exam_id: str,
        announcement_id: str,
        request: Request,
        user: dict = Depends(require_roles("instructor", "admin")),
    ):
        result = invoke(service.withdraw_announcement, exam_id, announcement_id, user)
        audit("announcement.withdrawn", actor=user, resource_type="exam", resource_id=exam_id, request=request)
        return result

    @router.get("/student/announcements")
    def candidate_announcements(user: dict = Depends(require_roles("student"))):
        return invoke(service.candidate_announcements, user)

    # ── Live monitoring ───────────────────────────────────────────────────────

    @router.get("/exams/{exam_id}/monitor")
    def live_monitor(exam_id: str, user: dict = Depends(require_roles("instructor", "admin"))):
        return invoke(service.live_monitor, exam_id, user)

    # ── Grading ───────────────────────────────────────────────────────────────

    @router.get("/exams/{exam_id}/grading")
    def grading_queue(exam_id: str, user: dict = Depends(require_roles("instructor", "admin"))):
        return invoke(service.grading_queue, exam_id, user)

    @router.post("/responses/{response_id}/grade")
    def grade_response(
        response_id: str,
        req: GradeRequest,
        request: Request,
        user: dict = Depends(require_roles("instructor", "admin")),
    ):
        result = invoke(service.grade_response, response_id, req.model_dump(), user)
        audit("response.graded", actor=user, resource_type="response", resource_id=response_id, request=request)
        return result

    # ── Results ───────────────────────────────────────────────────────────────

    @router.get("/exams/{exam_id}/results")
    def exam_results(exam_id: str, user: dict = Depends(require_roles("instructor", "admin"))):
        return invoke(service.exam_results, exam_id, user)

    @router.post("/exams/{exam_id}/results/publish")
    def publish_results(
        exam_id: str,
        req: PublishResultsRequest,
        request: Request,
        user: dict = Depends(require_roles("instructor", "admin")),
    ):
        result = invoke(service.publish_results, exam_id, req.publish, user)
        audit(
            "results.published" if req.publish else "results.unpublished",
            actor=user,
            resource_type="exam",
            resource_id=exam_id,
            request=request,
        )
        return result

    # ── Analytics ─────────────────────────────────────────────────────────────

    @router.get("/exams/{exam_id}/analytics")
    def exam_analytics(exam_id: str, user: dict = Depends(require_roles("instructor", "admin"))):
        return invoke(service.analytics, exam_id, user)

    # ── Academic PDF report ───────────────────────────────────────────────────

    @router.get("/attempts/{attempt_id}/report")
    def academic_report(attempt_id: str, request: Request, user: dict = Depends(current_user)):
        from fastapi.responses import Response as FResponse
        verify_base = str(request.base_url).rstrip("/")
        pdf_bytes, filename = invoke(service.academic_report, attempt_id, user, verify_base)
        return FResponse(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    @router.delete("/attempts/{attempt_id}/report")
    def revoke_report(attempt_id: str, request: Request, user: dict = Depends(require_roles("instructor", "admin"))):
        result = invoke(service.revoke_report, attempt_id, user)
        audit("report.revoked", actor=user, resource_type="attempt", resource_id=attempt_id, request=request)
        return result

    # ── Report verification (public) ──────────────────────────────────────────

    @router.get("/reports/verify/{token}")
    def verify_report(token: str):
        return invoke(service.verify_report, token)

    # ── Bulk import ───────────────────────────────────────────────────────────

    @router.post("/exams/{exam_id}/import/candidates")
    def import_candidates(
        exam_id: str,
        req: ImportRequest,
        request: Request,
        user: dict = Depends(require_roles("instructor", "admin")),
    ):
        result = invoke(service.import_candidates, req.content, req.file_format, exam_id, req.commit, user)
        if req.commit:
            audit("candidates.imported", actor=user, resource_type="exam", resource_id=exam_id, request=request)
        return result

    @router.post("/bank/import/questions")
    def import_questions(
        req: ImportRequest,
        request: Request,
        user: dict = Depends(require_roles("instructor", "admin")),
    ):
        result = invoke(service.import_questions, req.content, req.file_format, req.commit, user)
        if req.commit:
            audit("questions.imported", actor=user, resource_type="bank", resource_id="", request=request)
        return result

    return router
