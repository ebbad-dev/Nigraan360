"""Nigran 360 schema additions (migration 20261127_0002_nigran360).

Additive and re-runnable: every statement is guarded so it can run against an existing
ProctorAI database without touching existing rows or columns.
"""

from __future__ import annotations

from typing import Any


def _add_columns(db: Any, table: str, columns: tuple[tuple[str, str], ...]) -> None:
    for column, definition in columns:
        db.execute(
            f"""
            IF COL_LENGTH('{table}', '{column}') IS NULL
            ALTER TABLE {table} ADD {column} {definition}
            """
        )


def apply_nigran360_schema(db: Any) -> None:
    _add_columns(
        db,
        "Exams",
        (
            ("instructions", "NVARCHAR(MAX) NULL"),
            ("shuffle_questions", "BIT NOT NULL DEFAULT 0"),
            ("shuffle_options", "BIT NOT NULL DEFAULT 0"),
            ("results_published_at", "DATETIME2 NULL"),
            ("results_published_by", "NVARCHAR(64) NULL"),
        ),
    )
    _add_columns(
        db,
        "ExamQuestions",
        (
            ("category", "NVARCHAR(128) NULL"),
            ("difficulty", "NVARCHAR(16) NULL"),
            ("marking_scheme", "NVARCHAR(32) NULL"),
            ("source_question_id", "NVARCHAR(64) NULL"),
        ),
    )
    _add_columns(
        db,
        "ExamAttempts",
        (
            ("deadline_at", "DATETIME2 NULL"),
            ("attempt_type", "NVARCHAR(16) NOT NULL DEFAULT 'real'"),
            ("snapshot_json", "NVARCHAR(MAX) NULL"),
            ("grading_status", "NVARCHAR(32) NULL"),
        ),
    )
    _add_columns(
        db,
        "StudentResponses",
        (
            ("selected_option_ids_json", "NVARCHAR(MAX) NULL"),
            ("flagged", "BIT NOT NULL DEFAULT 0"),
            ("client_seq", "INT NULL"),
            ("last_mutation_id", "NVARCHAR(64) NULL"),
            ("grading_status", "NVARCHAR(32) NULL"),
            ("feedback", "NVARCHAR(MAX) NULL"),
            ("graded_by", "NVARCHAR(64) NULL"),
            ("graded_at", "DATETIME2 NULL"),
        ),
    )
    # One response row per attempt/question so concurrent saves cannot duplicate answers.
    db.execute(
        """
        IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_StudentResponses_AttemptQuestion')
           AND NOT EXISTS (
               SELECT 1 FROM StudentResponses GROUP BY attempt_id, question_id HAVING COUNT(*) > 1
           )
        CREATE UNIQUE INDEX UX_StudentResponses_AttemptQuestion
            ON StudentResponses(attempt_id, question_id)
        """
    )
    db.execute(
        """
        IF OBJECT_ID('BankQuestions', 'U') IS NULL
        CREATE TABLE BankQuestions (
            question_id NVARCHAR(64) NOT NULL PRIMARY KEY,
            tenant_id NVARCHAR(64) NOT NULL,
            owner_user_id NVARCHAR(64) NULL,
            question_text NVARCHAR(MAX) NOT NULL,
            question_type NVARCHAR(32) NOT NULL DEFAULT 'mcq',
            category NVARCHAR(128) NULL,
            difficulty NVARCHAR(16) NOT NULL DEFAULT 'medium',
            marks INT NOT NULL DEFAULT 1,
            marking_scheme NVARCHAR(32) NULL,
            status NVARCHAR(32) NOT NULL DEFAULT 'active',
            created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
            updated_at DATETIME2 NULL
        )
        """
    )
    db.execute(
        """
        IF OBJECT_ID('BankOptions', 'U') IS NULL
        CREATE TABLE BankOptions (
            option_id NVARCHAR(64) NOT NULL PRIMARY KEY,
            question_id NVARCHAR(64) NOT NULL,
            option_text NVARCHAR(MAX) NOT NULL,
            is_correct BIT NOT NULL DEFAULT 0,
            sort_order INT NOT NULL DEFAULT 0
        )
        """
    )
    db.execute(
        """
        IF OBJECT_ID('Announcements', 'U') IS NULL
        CREATE TABLE Announcements (
            announcement_id NVARCHAR(64) NOT NULL PRIMARY KEY,
            tenant_id NVARCHAR(64) NOT NULL,
            exam_id NVARCHAR(64) NOT NULL,
            title NVARCHAR(200) NOT NULL,
            body NVARCHAR(2000) NOT NULL,
            priority NVARCHAR(16) NOT NULL DEFAULT 'normal',
            created_by NVARCHAR(64) NULL,
            created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
            withdrawn_at DATETIME2 NULL
        )
        """
    )
    db.execute(
        """
        IF OBJECT_ID('IssuedReports', 'U') IS NULL
        CREATE TABLE IssuedReports (
            report_id NVARCHAR(64) NOT NULL PRIMARY KEY,
            tenant_id NVARCHAR(64) NOT NULL,
            verify_token NVARCHAR(96) NOT NULL UNIQUE,
            report_type NVARCHAR(32) NOT NULL DEFAULT 'academic_result',
            attempt_id NVARCHAR(64) NOT NULL,
            exam_id NVARCHAR(64) NOT NULL,
            issued_by NVARCHAR(64) NULL,
            issued_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
            revoked_at DATETIME2 NULL
        )
        """
    )
    for name, sql in (
        ("IX_BankQuestions_Tenant", "CREATE INDEX IX_BankQuestions_Tenant ON BankQuestions(tenant_id, status, category)"),
        ("IX_BankOptions_Question", "CREATE INDEX IX_BankOptions_Question ON BankOptions(question_id, sort_order)"),
        ("IX_Announcements_Exam", "CREATE INDEX IX_Announcements_Exam ON Announcements(exam_id, created_at DESC)"),
        ("IX_IssuedReports_Attempt", "CREATE INDEX IX_IssuedReports_Attempt ON IssuedReports(attempt_id)"),
        ("IX_ExamAttempts_ExamType", "CREATE INDEX IX_ExamAttempts_ExamType ON ExamAttempts(exam_id, attempt_type, status)"),
    ):
        db.execute(
            f"""
            IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = '{name}')
            {sql}
            """
        )
