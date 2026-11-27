"""PostgreSQL compatibility shim for Nigran 360.

Activated when DATABASE_URL env var is set. Inherits DatabaseConnection so all
DDL methods are reused unchanged; query() and execute() intercept every SQL
statement and translate MSSQL syntax to PostgreSQL on the fly.

Translation rules applied to every statement:
  NVARCHAR(MAX) → TEXT, NVARCHAR(N) → VARCHAR(N)
  DATETIME2 → TIMESTAMP, SYSUTCDATETIME()/GETUTCDATE() → NOW()
  BIT DEFAULT 1/0 → BOOLEAN DEFAULT TRUE/FALSE
  INT IDENTITY(1,1) → BIGSERIAL
  IF OBJECT_ID … IS NULL CREATE TABLE → CREATE TABLE IF NOT EXISTS
  IF COL_LENGTH … IS NULL ALTER TABLE … ADD → ALTER TABLE … ADD COLUMN IF NOT EXISTS
  IF NOT EXISTS (SELECT 1 FROM X WHERE …) INSERT → INSERT … ON CONFLICT DO NOTHING
  IF NOT EXISTS (sys.indexes) CREATE INDEX → CREATE INDEX IF NOT EXISTS
  ALTER TABLE X ALTER COLUMN Y NVARCHAR(N) NOT NULL → TYPE VARCHAR(N) USING …
  SELECT TOP N → SELECT … LIMIT N
  DATEADD(minute, n, col) → (col + n * INTERVAL '1 minute')
  ? → %s  (and literal % → %% so LIKE patterns survive)
"""
from __future__ import annotations

import logging
import re
import threading
import time
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger("pg_compat")


def _as_utc(value: Any) -> Any:
    if isinstance(value, datetime) and value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


# ---------------------------------------------------------------------------
# SQL translator
# ---------------------------------------------------------------------------

def _translate(sql: str) -> str:
    s = sql.strip()

    # 1. CREATE TABLE IF NOT EXISTS
    s = re.sub(
        r"IF\s+OBJECT_ID\s*\(\s*'[^']+'\s*,\s*'U'\s*\)\s+IS\s+NULL\s+CREATE\s+TABLE\s+",
        "CREATE TABLE IF NOT EXISTS ",
        s, flags=re.IGNORECASE,
    )

    # 2. ADD COLUMN IF NOT EXISTS
    s = re.sub(
        r"IF\s+COL_LENGTH\s*\(\s*'[^']+'\s*,\s*'[^']+'\s*\)\s+IS\s+NULL\s+"
        r"ALTER\s+TABLE\s+(\w+)\s+ADD\s+",
        r"ALTER TABLE \1 ADD COLUMN IF NOT EXISTS ",
        s, flags=re.IGNORECASE,
    )

    # 3. Data seed: IF NOT EXISTS (SELECT 1 … WHERE …) INSERT → INSERT … ON CONFLICT DO NOTHING
    s = re.sub(
        r"IF\s+NOT\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+\w+\s+WHERE[^\)]+\)\s+"
        r"(INSERT\s+INTO\s+\w+[^;]+)",
        lambda m: m.group(1).rstrip() + "\nON CONFLICT DO NOTHING",
        s, flags=re.IGNORECASE | re.DOTALL,
    )

    # 4. Remove sys.indexes guard (CREATE INDEX IF NOT EXISTS added below)
    s = re.sub(
        r"IF\s+NOT\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+sys\.indexes\s+WHERE\s+name\s*=\s*'[^']+'\s*\)\s+",
        "",
        s, flags=re.IGNORECASE,
    )

    # 5. CREATE [UNIQUE] INDEX → add IF NOT EXISTS
    s = re.sub(
        r"CREATE\s+(UNIQUE\s+)?INDEX\s+(?!IF\s+NOT\s+EXISTS\b)",
        lambda m: f"CREATE {(m.group(1) or '')}INDEX IF NOT EXISTS ",
        s, flags=re.IGNORECASE,
    )

    # 6. ALTER COLUMN type (MSSQL) → PostgreSQL
    s = re.sub(
        r"ALTER\s+TABLE\s+(\w+)\s+ALTER\s+COLUMN\s+(\w+)\s+NVARCHAR\s*\((\d+)\)\s+NOT\s+NULL",
        r"ALTER TABLE \1 ALTER COLUMN \2 TYPE VARCHAR(\3) USING \2::VARCHAR,"
        r" ALTER COLUMN \2 SET NOT NULL",
        s, flags=re.IGNORECASE,
    )

    # 7. Type substitutions
    s = re.sub(r"\bNVARCHAR\s*\(\s*MAX\s*\)", "TEXT", s, flags=re.IGNORECASE)
    s = re.sub(r"\bNVARCHAR\s*\(\s*(\d+)\s*\)", r"VARCHAR(\1)", s, flags=re.IGNORECASE)
    s = re.sub(r"\bDATETIME2\b", "TIMESTAMP", s, flags=re.IGNORECASE)
    s = re.sub(r"\bSYSUTCDATETIME\(\)", "NOW()", s, flags=re.IGNORECASE)
    s = re.sub(r"\bGETUTCDATE\(\)", "NOW()", s, flags=re.IGNORECASE)
    s = re.sub(r"\bGETDATE\(\)", "NOW()", s, flags=re.IGNORECASE)

    # 8. BIT → BOOLEAN (most-specific first)
    s = re.sub(r"\bBIT\s+NOT\s+NULL\s+DEFAULT\s+1\b", "BOOLEAN NOT NULL DEFAULT TRUE", s, flags=re.IGNORECASE)
    s = re.sub(r"\bBIT\s+NOT\s+NULL\s+DEFAULT\s+0\b", "BOOLEAN NOT NULL DEFAULT FALSE", s, flags=re.IGNORECASE)
    s = re.sub(r"\bBIT\s+NULL\b", "BOOLEAN NULL", s, flags=re.IGNORECASE)
    s = re.sub(r"\bBIT\b(?!\s*\()", "BOOLEAN", s, flags=re.IGNORECASE)

    # 9. IDENTITY → SERIAL
    s = re.sub(
        r"\bINT\s+IDENTITY\s*\(\s*1\s*,\s*1\s*\)\s+NOT\s+NULL\s+PRIMARY\s+KEY",
        "BIGSERIAL NOT NULL PRIMARY KEY",
        s, flags=re.IGNORECASE,
    )

    # 10. SELECT TOP N → SELECT … LIMIT N
    top_m = re.search(r"\bSELECT\s+TOP\s+(\d+)\s+", s, flags=re.IGNORECASE)
    if top_m:
        limit_val = top_m.group(1)
        s = re.sub(r"\bSELECT\s+TOP\s+\d+\s+", "SELECT ", s, count=1, flags=re.IGNORECASE)
        s = s.rstrip().rstrip(";").rstrip()
        s += f" LIMIT {limit_val}"

    # 11. DATEADD(minute, n, col)
    s = re.sub(
        r"DATEADD\s*\(\s*minute\s*,\s*([^,]+?)\s*,\s*([^)]+?)\s*\)",
        r"(\2 + (\1) * INTERVAL '1 minute')",
        s, flags=re.IGNORECASE,
    )

    # 12. Parameter placeholders: escape literal % first, then ? → %s
    s = s.replace("%", "%%")
    s = s.replace("?", "%s")

    return s


# ---------------------------------------------------------------------------
# psycopg2 cursor wrapper
# ---------------------------------------------------------------------------

class _PGCursor:
    __slots__ = ("_c",)

    def __init__(self, cursor):
        self._c = cursor

    def execute(self, sql: str, params=()):
        self._c.execute(_translate(sql), params or None)

    @property
    def description(self):
        return self._c.description

    @property
    def rowcount(self):
        return self._c.rowcount

    def fetchall(self):
        return self._c.fetchall()

    def fetchone(self):
        return self._c.fetchone()

    def nextset(self):
        try:
            return self._c.nextset()
        except Exception:
            return None

    def close(self):
        self._c.close()


# ---------------------------------------------------------------------------
# PostgreSQLConnection
# ---------------------------------------------------------------------------

class PostgreSQLConnection:
    """Drop-in for DatabaseConnection backed by PostgreSQL / psycopg2.

    Inherits nothing from DatabaseConnection intentionally — it re-calls the
    baseline DDL methods by passing *itself* as the db argument, so every SQL
    statement flows through the translator above.
    """

    def __init__(self, database_url: str):
        self._url = database_url
        self.connection = None
        self.is_active = False
        self._lock = threading.RLock()

    # ------------------------------------------------------------------
    # Connection
    # ------------------------------------------------------------------

    def connect(self, max_retries: int = 3, delay_sec: float = 1.0) -> bool:
        try:
            import psycopg2  # noqa: PLC0415
        except ImportError as exc:
            logger.error("psycopg2-binary is not installed: %s", exc)
            return False

        for attempt in range(1, max_retries + 1):
            try:
                with self._lock:
                    self.connection = psycopg2.connect(self._url)
                    self.connection.autocommit = False
                    self.is_active = True
                    self._run_migrations()
                    return True
            except Exception as exc:
                logger.warning("PG connect attempt %s/%s: %s", attempt, max_retries, exc)
                self.is_active = False
                if attempt < max_retries:
                    time.sleep(delay_sec)
        return False

    def _run_migrations(self) -> None:
        from database.nigran_schema import (
            apply_disputes_schema,
            apply_grade_history_schema,
            apply_nigran360_schema,
        )
        from database.schema_migrations import Migration, apply_migrations

        # Import the baseline DDL from db_connection and run it through self
        from database.db_connection import DatabaseConnection as _DC

        apply_migrations(self, (
            Migration(
                migration_id="20260716_0001_phase1_baseline",
                description="Phase 1 baseline",
                revision="phase1-baseline-v1",
                apply=lambda: _DC._initialize_schema_baseline(self),
            ),
            Migration(
                migration_id="20261127_0002_nigran360",
                description="Nigran 360 schema",
                revision="nigran360-v1",
                apply=lambda: apply_nigran360_schema(self),
            ),
            Migration(
                migration_id="20261127_0003_disputes",
                description="Disputes",
                revision="disputes-v1",
                apply=lambda: apply_disputes_schema(self),
            ),
            Migration(
                migration_id="20261127_0004_grade_history",
                description="Grade history",
                revision="grade-history-v1",
                apply=lambda: apply_grade_history_schema(self),
            ),
        ))

    # ------------------------------------------------------------------
    # Query interface (same as DatabaseConnection)
    # ------------------------------------------------------------------

    def query(self, sql: str, params: tuple = ()) -> list[dict]:
        if not self.connection:
            return []
        with self._lock:
            cur = _PGCursor(self.connection.cursor())
            try:
                cur.execute(sql, params)
                cols = [d[0] for d in (cur.description or [])]
                return [dict(zip(cols, (_as_utc(v) for v in row))) for row in cur.fetchall()]
            finally:
                cur.close()

    def execute(self, sql: str, params: tuple = ()) -> int:
        if not self.connection:
            return 0
        with self._lock:
            cur = _PGCursor(self.connection.cursor())
            try:
                cur.execute(sql, params)
                count = cur.rowcount
                while cur.nextset():
                    pass
                self.connection.commit()
                return count if count is not None else 0
            except Exception:
                self.connection.rollback()
                raise
            finally:
                cur.close()

    def close(self) -> None:
        if self.connection:
            self.connection.close()
        self.connection = None
        self.is_active = False
