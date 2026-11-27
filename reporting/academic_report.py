"""Academic result report (PDF) with a QR verification code.

Deliberately separate from the proctoring/risk report: it contains only performance data
from the graded attempt, never monitoring evidence or answer keys.
"""

from __future__ import annotations

import io

from reportlab.graphics import renderPDF
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Flowable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

INK = colors.HexColor("#0f172a")
ACCENT = colors.HexColor("#0e7490")
MUTED = colors.HexColor("#475569")
RULE = colors.HexColor("#cbd5e1")


class _Qr(Flowable):
    def __init__(self, value: str, size: float = 34 * mm) -> None:
        super().__init__()
        self.value = value
        self.size = size
        self.width = self.height = size

    def draw(self) -> None:
        widget = QrCodeWidget(self.value)
        x1, y1, x2, y2 = widget.getBounds()
        drawing = Drawing(self.size, self.size, transform=[self.size / (x2 - x1), 0, 0, self.size / (y2 - y1), 0, 0])
        drawing.add(widget)
        renderPDF.draw(drawing, self.canv, 0, 0)


def build_academic_report(context: dict) -> bytes:
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm, bottomMargin=16 * mm, title="Nigran 360 Result Report")
    base = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=base["Title"], fontSize=20, textColor=INK, alignment=0, spaceAfter=2)
    sub = ParagraphStyle("sub", parent=base["Normal"], fontSize=9.5, textColor=MUTED)
    h2 = ParagraphStyle("h2", parent=base["Heading3"], fontSize=11.5, textColor=ACCENT, spaceBefore=10, spaceAfter=4)
    body = ParagraphStyle("body", parent=base["Normal"], fontSize=9.5, textColor=INK, leading=13)

    story = [
        Paragraph("Nigran 360", ParagraphStyle("brand", parent=sub, textColor=ACCENT, fontSize=10)),
        Paragraph("Examination Result Report", h1),
        Paragraph(f"Report ID {context['report_id']} · Issued {context['issued_at'][:19].replace('T', ' ')} UTC", sub),
        Spacer(1, 8),
    ]

    details = Table(
        [
            ["Candidate", context["candidate_name"]],
            ["Roll number", context["roll_number"]],
            ["Examination", f"{context['exam_title']} ({context['exam_code']})"],
            ["Submitted", (context.get("submitted_at") or "")[:19].replace("T", " ") + " UTC"],
        ],
        colWidths=[34 * mm, 90 * mm],
    )
    details.setStyle(TableStyle([
        ("FONT", (0, 0), (0, -1), "Helvetica-Bold", 9.5),
        ("FONT", (1, 0), (1, -1), "Helvetica", 9.5),
        ("TEXTCOLOR", (0, 0), (0, -1), MUTED),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    header = Table([[details, _Qr(context["verify_url"])]], colWidths=[130 * mm, 40 * mm])
    header.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("ALIGN", (1, 0), (1, 0), "RIGHT")]))
    story += [header, Paragraph("Scan the QR code or open the link below to verify this report.", sub), Paragraph(context["verify_url"], sub)]

    story.append(Paragraph("Result", h2))
    score = Table(
        [["Score", "Maximum", "Percentage"], [str(context["score"]), str(context["max_score"]), f"{context['percentage']:.1f}%"]],
        colWidths=[40 * mm, 40 * mm, 40 * mm],
    )
    score.setStyle(TableStyle([
        ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 9),
        ("TEXTCOLOR", (0, 0), (-1, 0), MUTED),
        ("FONT", (0, 1), (-1, 1), "Helvetica-Bold", 16),
        ("TEXTCOLOR", (0, 1), (-1, 1), INK),
        ("LINEBELOW", (0, 0), (-1, 0), 0.5, RULE),
        ("TOPPADDING", (0, 1), (-1, 1), 6),
    ]))
    story.append(score)

    story.append(Paragraph("Question breakdown", h2))
    rows = [["#", "Type", "Topic", "Marks", "Awarded", "Status"]]
    labels = {"mcq": "Single answer", "multiple_select": "Multiple select", "written": "Written"}
    for item in context["breakdown"]:
        rows.append([str(item["number"]), labels.get(item["type"], item["type"]), item["category"] or "—", str(item["marks"]), str(item["awarded"]), item["status"]])
    table = Table(rows, colWidths=[10 * mm, 32 * mm, 52 * mm, 20 * mm, 22 * mm, 30 * mm], repeatRows=1)
    table.setStyle(TableStyle([
        ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 8.5),
        ("FONT", (0, 1), (-1, -1), "Helvetica", 8.5),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("BACKGROUND", (0, 0), (-1, 0), ACCENT),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f1f5f9")]),
        ("GRID", (0, 0), (-1, -1), 0.25, RULE),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(table)
    story += [
        Spacer(1, 10),
        Paragraph("This report contains academic performance data only. Proctoring indicators are reviewed separately by examiners and are not part of this result.", body),
    ]
    doc.build(story)
    return buffer.getvalue()
