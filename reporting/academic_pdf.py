"""Academic result PDF generator for Nigran 360.

Produces a verifiable result certificate using ReportLab.
The context dict is built by AssessmentService.academic_report().
"""
from __future__ import annotations

import io
from typing import Any

try:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.platypus import (
        HRFlowable,
        Paragraph,
        SimpleDocTemplate,
        Spacer,
        Table,
        TableStyle,
    )
    _REPORTLAB = True
except ImportError:
    _REPORTLAB = False


def build_academic_pdf(context: dict) -> bytes:
    """Render an academic result PDF and return the bytes.

    Falls back to a minimal plain-text PDF if ReportLab is unavailable.
    """
    if not _REPORTLAB:
        return _fallback_pdf(context)

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        topMargin=2 * cm,
        bottomMargin=2 * cm,
        leftMargin=2.5 * cm,
        rightMargin=2.5 * cm,
        title=f"Result – {context.get('exam_code', '')}",
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "Title360",
        parent=styles["Heading1"],
        fontSize=20,
        textColor=colors.HexColor("#1a3c5e"),
        spaceAfter=4,
    )
    sub_style = ParagraphStyle(
        "Sub360",
        parent=styles["Normal"],
        fontSize=11,
        textColor=colors.HexColor("#4a4a4a"),
        spaceAfter=2,
    )
    label_style = ParagraphStyle(
        "Label360",
        parent=styles["Normal"],
        fontSize=10,
        textColor=colors.HexColor("#888888"),
    )
    value_style = ParagraphStyle(
        "Value360",
        parent=styles["Normal"],
        fontSize=11,
        textColor=colors.HexColor("#111111"),
        spaceAfter=4,
    )
    score_style = ParagraphStyle(
        "Score360",
        parent=styles["Heading1"],
        fontSize=28,
        textColor=colors.HexColor("#1a7a3c"),
        alignment=1,  # centred
    )
    verify_style = ParagraphStyle(
        "Verify360",
        parent=styles["Normal"],
        fontSize=8,
        textColor=colors.HexColor("#888888"),
        alignment=1,
    )

    score = context.get("score", 0)
    max_score = context.get("max_score", 0)
    pct = context.get("percentage", 0.0)

    story: list[Any] = []

    # Header
    story.append(Paragraph("Nigran 360", title_style))
    story.append(Paragraph("Official Examination Result", sub_style))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#1a3c5e")))
    story.append(Spacer(1, 0.4 * cm))

    # Exam / candidate details
    details = [
        ("Examination", context.get("exam_title", "")),
        ("Exam Code", context.get("exam_code", "")),
        ("Candidate", context.get("candidate_name", "")),
        ("Roll Number", context.get("roll_number", "")),
        ("Submitted", context.get("submitted_at", "")),
        ("Report Issued", context.get("issued_at", "")),
    ]
    for label, value in details:
        story.append(Paragraph(label, label_style))
        story.append(Paragraph(str(value), value_style))

    story.append(Spacer(1, 0.4 * cm))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#cccccc")))
    story.append(Spacer(1, 0.3 * cm))

    # Score block
    story.append(Paragraph(f"{score} / {max_score}  ({pct}%)", score_style))
    story.append(Spacer(1, 0.4 * cm))

    # Question breakdown table
    breakdown = context.get("breakdown", [])
    if breakdown:
        story.append(Paragraph("Question Breakdown", styles["Heading3"]))
        story.append(Spacer(1, 0.2 * cm))
        table_data = [["#", "Type", "Category", "Marks", "Awarded", "Status"]]
        for row in breakdown:
            table_data.append([
                str(row.get("number", "")),
                str(row.get("type", "")),
                str(row.get("category", "")),
                str(row.get("marks", 0)),
                str(row.get("awarded", 0)),
                str(row.get("status", "")),
            ])
        tbl = Table(
            table_data,
            colWidths=[1 * cm, 2.5 * cm, 4 * cm, 1.8 * cm, 1.8 * cm, 4 * cm],
            repeatRows=1,
        )
        tbl.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1a3c5e")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f4f8ff")]),
            ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#dddddd")),
            ("ALIGN", (3, 0), (4, -1), "CENTER"),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ]))
        story.append(tbl)
        story.append(Spacer(1, 0.4 * cm))

    # Verification footer
    verify_url = context.get("verify_url", "")
    report_id = context.get("report_id", "")
    if verify_url:
        story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#cccccc")))
        story.append(Spacer(1, 0.2 * cm))
        story.append(Paragraph(
            f"Verify this report at: {verify_url}<br/>Report ID: {report_id}",
            verify_style,
        ))
        story.append(Paragraph(
            "This document was generated by Nigran 360. Its authenticity can be verified online.",
            verify_style,
        ))

    doc.build(story)
    return buf.getvalue()


def _fallback_pdf(context: dict) -> bytes:
    """Plain-text pseudo-PDF when ReportLab is unavailable."""
    text = (
        f"%PDF-1.4\n"
        f"% Nigran 360 Academic Result\n"
        f"% Exam: {context.get('exam_title', '')}\n"
        f"% Candidate: {context.get('candidate_name', '')}\n"
        f"% Score: {context.get('score', 0)} / {context.get('max_score', 0)}\n"
        f"% Report ID: {context.get('report_id', '')}\n"
        f"% Verify: {context.get('verify_url', '')}\n"
    )
    return text.encode()
