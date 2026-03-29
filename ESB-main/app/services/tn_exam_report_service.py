import os
import html
from datetime import datetime
from typing import Any, Dict, List, Tuple

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    PageBreak,
    Image,
)
from reportlab.graphics.shapes import Drawing
from reportlab.graphics.charts.piecharts import Pie
from reportlab.graphics.charts.barcharts import VerticalBarChart
from reportlab.graphics.charts.legends import Legend


# -------------------------------------------------------------------
# Clean, ESB-ish PDF (white background, small accent palette)
# -------------------------------------------------------------------

BRAND = colors.HexColor("#d4181f")
INK = colors.HexColor("#111827")
MUTED = colors.HexColor("#6b7280")
LINE = colors.HexColor("#e5e7eb")
BG_SOFT = colors.HexColor("#f8fafc")


def _safe(text: str) -> str:
    if text is None:
        return ""
    t = html.escape(str(text))
    return t.replace("\n", "<br/>")


def _pct(v) -> str:
    try:
        return f"{float(v):.1f}%"
    except Exception:
        return f"{v}%"


def _make_pie(title: str, pct_map: Dict[str, float], max_items: int = 8) -> Drawing:
    """Pie chart with legend. Keeps it readable by limiting items."""
    items = sorted([(k, float(v)) for k, v in (pct_map or {}).items()], key=lambda x: -x[1])
    items = [it for it in items if it[1] > 0]

    # If many categories (AA), keep top-N + "Autres"
    if len(items) > max_items:
        head = items[: max_items - 1]
        tail = items[max_items - 1 :]
        other = sum(v for _, v in tail)
        items = head + [("Autres", other)]

    if not items:
        items = [("—", 100.0)]

    d = Drawing(16 * cm, 7.2 * cm)

    pie = Pie()
    pie.x = 0.2 * cm
    pie.y = 0.2 * cm
    pie.width = 7.0 * cm
    pie.height = 7.0 * cm
    pie.data = [v for _, v in items]
    pie.labels = ["" for _ in items]
    pie.simpleLabels = 0
    pie.sideLabels = 0
    pie.slices.strokeWidth = 0.25
    pie.slices.strokeColor = colors.white

    # Gentle palette (not too many colors)
    palette = [
        colors.HexColor("#d4181f"),
        colors.HexColor("#111827"),
        colors.HexColor("#0ea5e9"),
        colors.HexColor("#22c55e"),
        colors.HexColor("#f59e0b"),
        colors.HexColor("#a855f7"),
        colors.HexColor("#14b8a6"),
        colors.HexColor("#64748b"),
    ]
    for i in range(len(items)):
        pie.slices[i].fillColor = palette[i % len(palette)]

    legend = Legend()
    legend.x = 8.0 * cm
    legend.y = 0.5 * cm
    legend.dx = 8
    legend.dy = 8
    legend.fontName = "Helvetica"
    legend.fontSize = 8
    legend.columnMaximum = 10
    legend.alignment = "right"
    legend.colorNamePairs = [
        (pie.slices[i].fillColor, f"{k} ({_pct(v)})") for i, (k, v) in enumerate(items)
    ]

    d.add(pie)
    d.add(legend)
    return d


def _make_grouped_bars(title: str, categories: List[str], observed: Dict[str, float], expected: Dict[str, float]) -> Drawing:
    d = Drawing(16 * cm, 7.5 * cm)
    chart = VerticalBarChart()
    chart.x = 0.8 * cm
    chart.y = 0.6 * cm
    chart.height = 6.0 * cm
    chart.width = 14.5 * cm

    obs = [float(observed.get(c, 0) or 0) for c in categories]
    exp = [float(expected.get(c, 0) or 0) for c in categories]
    chart.data = [obs, exp]
    chart.valueAxis.valueMin = 0
    chart.valueAxis.valueMax = max(100, int(max(obs + exp + [0]) // 10 + 1) * 10)
    chart.valueAxis.valueStep = 10
    chart.categoryAxis.categoryNames = categories
    chart.categoryAxis.labels.boxAnchor = "ne"
    chart.categoryAxis.labels.angle = 30
    chart.categoryAxis.labels.dy = -2
    chart.barWidth = 10
    chart.groupSpacing = 8
    chart.barSpacing = 2
    chart.bars[0].fillColor = BRAND
    chart.bars[1].fillColor = colors.HexColor("#111827")

    legend = Legend()
    legend.x = 11.8 * cm
    legend.y = 6.7 * cm
    legend.fontName = "Helvetica"
    legend.fontSize = 8
    legend.colorNamePairs = [(BRAND, "Observé"), (colors.HexColor("#111827"), "Attendu")]

    d.add(chart)
    d.add(legend)
    return d


def generate_tn_exam_report_pdf(
    output_path: str,
    course_title: str,
    exam_title: str,
    analysis: Dict[str, Any],
):
    """Generate a clean, interpretable multi-section PDF for TN exam analysis."""
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    styles = getSampleStyleSheet()
    title = ParagraphStyle("Title", parent=styles["Title"], fontSize=20, textColor=INK, spaceAfter=10)
    h1 = ParagraphStyle("H1", parent=styles["Heading1"], textColor=INK, spaceBefore=10, spaceAfter=8)
    h2 = ParagraphStyle("H2", parent=styles["Heading2"], textColor=INK, spaceBefore=8, spaceAfter=6)
    lead = ParagraphStyle("Lead", parent=styles["BodyText"], fontSize=11, leading=14, textColor=INK)
    small = ParagraphStyle("Small", parent=styles["BodyText"], fontSize=9, leading=12, textColor=MUTED)

    doc = SimpleDocTemplate(
        output_path,
        pagesize=A4,
        rightMargin=1.6 * cm,
        leftMargin=1.6 * cm,
        topMargin=1.6 * cm,
        bottomMargin=1.6 * cm,
        title=f"{course_title} — {exam_title}",
    )

    story: List[Any] = []

    # ---------------- Page 1: Cover + KPIs ----------------
    logo_path = os.path.join(os.path.dirname(__file__), "..", "static", "img", "esprit_logo.png")
    logo_path = os.path.abspath(logo_path)
    if os.path.exists(logo_path):
        try:
            story.append(Image(logo_path, width=4.2 * cm, height=1.6 * cm))
            story.append(Spacer(1, 6))
        except Exception:
            pass

    story.append(Paragraph("Rapport d'analyse d'examen", title))
    story.append(Paragraph(_safe(course_title), ParagraphStyle("Course", parent=styles["Heading2"], textColor=BRAND)))
    story.append(Paragraph(_safe(exam_title), ParagraphStyle("Exam", parent=styles["Heading3"], textColor=INK)))
    story.append(Paragraph(_safe(f"Généré le {datetime.now().strftime('%d/%m/%Y %H:%M')}"), small))
    story.append(Spacer(1, 10))

    # ── Metadata section ──────────────────────────────────────────────────
    meta = analysis.get("exam_metadata") or {}
    if meta:
        story.append(Paragraph("Informations générales de l'examen", h2))

        def _bool_str(v) -> str:
            if v is True:
                return "Oui"
            if v is False:
                return "Non"
            return "—"

        meta_rows = [
            ["Épreuve", _safe(meta.get("exam_name") or "—"),
             "Classe", _safe(meta.get("class_name") or "—")],
            ["Langue", _safe(meta.get("language") or "—"),
             "Date", _safe(meta.get("exam_date") or "—")],
            ["Durée déclarée",
             f"{meta.get('declared_duration_min')} min" if meta.get("declared_duration_min") else "—",
             "Pages", str(meta.get("num_pages") or "—")],
            ["Enseignant(s)",
             _safe(", ".join(meta.get("instructors") or []) or "—"),
             "Département", _safe(meta.get("department") or "—")],
            ["Type d'examen", _safe(meta.get("exam_type") or "—"),
             "Réponse sur feuille", _bool_str(meta.get("answer_on_sheet"))],
            ["Calculatrice", _bool_str(meta.get("calculator_allowed")),
             "PC autorisé", _bool_str(meta.get("computer_allowed"))],
            ["Internet", _bool_str(meta.get("internet_allowed")),
             "Documents", _bool_str(meta.get("documents_allowed"))],
        ]
        meta_table = Table(meta_rows, colWidths=[3.5 * cm, 5.0 * cm, 3.5 * cm, 5.0 * cm])
        meta_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), BG_SOFT),
            ("BOX", (0, 0), (-1, -1), 0.6, LINE),
            ("INNERGRID", (0, 0), (-1, -1), 0.4, LINE),
            ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
            ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
            ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"),
            ("TEXTCOLOR", (0, 0), (-1, -1), INK),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ]))
        story.append(meta_table)
        story.append(Spacer(1, 10))

    total_q = analysis.get("total_questions", 0) or 0
    src_rate = analysis.get("source_coverage_rate", 0) or 0
    diff_idx = analysis.get("difficulty_index", 0) or 0
    bloom_idx = analysis.get("bloom_index", 0) or 0

    kpi_rows = [
        ["Questions", str(total_q), "Alignement (sources)", _pct(src_rate)],
        ["Indice difficulté", f"{diff_idx}/5", "Indice Bloom", f"{bloom_idx}/6"],
    ]
    kpi = Table(kpi_rows, colWidths=[4.2 * cm, 3.2 * cm, 4.4 * cm, 3.2 * cm])
    kpi.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), BG_SOFT),
                ("BOX", (0, 0), (-1, -1), 0.6, LINE),
                ("INNERGRID", (0, 0), (-1, -1), 0.4, LINE),
                ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
                ("FONTNAME", (1, 0), (1, -1), "Helvetica-Bold"),
                ("FONTNAME", (3, 0), (3, -1), "Helvetica-Bold"),
                ("TEXTCOLOR", (0, 0), (-1, -1), INK),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
            ]
        )
    )
    story.append(kpi)
    story.append(Spacer(1, 12))

    story.append(Paragraph("Interprétation générale", h1))
    story.append(Paragraph(_safe(analysis.get("overall_interpretation") or "—"), lead))

    # Quick flags
    aa_missing = analysis.get("aa_missing") or []
    bloom_missing = analysis.get("bloom_missing") or []
    flags: List[str] = []
    if src_rate < 70:
        flags.append("Alignement aux supports faible (< 70%).")
    if aa_missing:
        flags.append(f"AA non couverts: {', '.join([f'AA#{x}' for x in aa_missing[:8]])}{'…' if len(aa_missing) > 8 else ''}.")
    if bloom_missing:
        flags.append(f"Niveaux Bloom absents: {', '.join(bloom_missing)}.")

    # Time verdict flag
    time_analysis = analysis.get("time_analysis") or {}
    if time_analysis.get("verdict") in ("TROP_LONG", "TROP_COURT"):
        flags.append(time_analysis.get("verdict_label", ""))

    if flags:
        story.append(Spacer(1, 6))
        story.append(Paragraph("Points d'attention", h2))
        for f in flags[:6]:
            story.append(Paragraph(_safe(f"• {f}"), lead))

    story.append(PageBreak())

    # ---------------- Page 1b: Duration analysis ----------------
    if time_analysis:
        story.append(Paragraph("Analyse de la durée", h1))
        story.append(Paragraph(
            "Estimation du temps nécessaire basée sur le type, niveau Bloom et difficulté de chaque question.",
            small
        ))
        story.append(Spacer(1, 8))

        ta = time_analysis
        declared = ta.get("declared_duration_min")
        est = ta.get("total_estimated_min", 0)
        buf = ta.get("reading_buffer_min", 0)
        total_buf = ta.get("total_with_buffer_min", 0)
        delta = ta.get("delta_min")
        verdict = ta.get("verdict", "UNKNOWN")
        verdict_label = ta.get("verdict_label", "—")

        # Verdict color
        if verdict == "TROP_LONG":
            verdict_color = colors.HexColor("#dc2626")
        elif verdict == "TROP_COURT":
            verdict_color = colors.HexColor("#d97706")
        else:
            verdict_color = colors.HexColor("#16a34a")

        dur_rows = [
            ["Temps pur estimé (questions)", f"{est} min"],
            ["Marge lecture / report (10%)", f"{buf} min"],
            ["Total estimé (avec marge)", f"{total_buf} min"],
            ["Durée déclarée par l'enseignant", f"{declared} min" if declared else "—"],
            ["Écart (estimé − déclaré)", f"{delta:+.1f} min" if delta is not None else "—"],
        ]
        dur_table = Table(dur_rows, colWidths=[10 * cm, 4 * cm])
        dur_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), BG_SOFT),
            ("BOX", (0, 0), (-1, -1), 0.6, LINE),
            ("INNERGRID", (0, 0), (-1, -1), 0.4, LINE),
            ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
            ("FONTNAME", (0, 3), (0, 4), "Helvetica-Bold"),
            ("ALIGN", (1, 0), (1, -1), "RIGHT"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("FONTSIZE", (0, 0), (-1, -1), 10),
            ("LEFTPADDING", (0, 0), (-1, -1), 10),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ]))
        story.append(dur_table)
        story.append(Spacer(1, 8))

        verdict_style = ParagraphStyle(
            "Verdict", parent=styles["BodyText"], fontSize=11,
            textColor=verdict_color, leading=14, fontName="Helvetica-Bold"
        )
        story.append(Paragraph(f"Verdict : {_safe(verdict_label)}", verdict_style))
        story.append(Spacer(1, 6))

        story.append(Paragraph(
            "Paramètres d'estimation : base temps par type × multiplicateur Bloom × multiplicateur difficulté + 10% marge.",
            small
        ))
        story.append(PageBreak())

    # ---------------- Page 2: Charts overview ----------------
    story.append(Paragraph("1. Vue d'ensemble (charts)", h1))
    story.append(Paragraph("Répartitions observées pour comprendre la structure de l'examen.", small))
    story.append(Spacer(1, 8))

    bloom_pct = analysis.get("bloom_percentages") or {}
    diff_pct = analysis.get("difficulty_percentages") or {}
    aa_pct = analysis.get("aa_percentages") or {}

    story.append(Paragraph("Bloom (observé)", h2))
    story.append(_make_pie("Bloom", bloom_pct, max_items=6))
    story.append(Spacer(1, 10))

    story.append(Paragraph("Difficulté (observé)", h2))
    story.append(_make_pie("Difficulté", diff_pct, max_items=5))
    story.append(Spacer(1, 10))

    story.append(Paragraph("AA (observé) — top", h2))
    story.append(_make_pie("AA", aa_pct, max_items=8))

    story.append(PageBreak())

    # ---------------- Page 3: Expectations vs Observed ----------------
    story.append(Paragraph("2. Attendus vs Observé", h1))
    story.append(Paragraph("Les attendus sont une distribution cible (modifiable plus tard).", small))
    story.append(Spacer(1, 8))

    exp_bloom = analysis.get("expected_bloom_percentages") or {}
    exp_diff = analysis.get("expected_difficulty_percentages") or {}

    bloom_order = ["Mémoriser", "Comprendre", "Appliquer", "Analyser", "Évaluer", "Créer"]
    diff_order = ["Très facile", "Facile", "Moyen", "Difficile", "Très difficile"]

    story.append(Paragraph("Bloom", h2))
    story.append(_make_grouped_bars("Bloom", bloom_order, bloom_pct, exp_bloom))
    story.append(Spacer(1, 10))

    # Bloom table
    bloom_delta = analysis.get("bloom_delta") or {}
    rows = [["Niveau", "Observé", "Attendu", "Δ"]]
    for c in bloom_order:
        rows.append([c, _pct(bloom_pct.get(c, 0)), _pct(exp_bloom.get(c, 0)), _pct(bloom_delta.get(c, 0)).replace("%", "") + "%"])
    t = Table(rows, colWidths=[6 * cm, 3 * cm, 3 * cm, 3 * cm])
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), BG_SOFT),
                ("TEXTCOLOR", (0, 0), (-1, 0), INK),
                ("GRID", (0, 0), (-1, -1), 0.4, LINE),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("ALIGN", (1, 1), (-1, -1), "RIGHT"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ]
        )
    )
    story.append(t)
    story.append(Spacer(1, 14))

    story.append(Paragraph("Difficulté", h2))
    story.append(_make_grouped_bars("Difficulté", diff_order, diff_pct, exp_diff))
    story.append(Spacer(1, 10))

    diff_delta = analysis.get("difficulty_delta") or {}
    rows = [["Niveau", "Observé", "Attendu", "Δ"]]
    for c in diff_order:
        rows.append([c, _pct(diff_pct.get(c, 0)), _pct(exp_diff.get(c, 0)), _pct(diff_delta.get(c, 0)).replace("%", "") + "%"])
    t = Table(rows, colWidths=[6 * cm, 3 * cm, 3 * cm, 3 * cm])
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), BG_SOFT),
                ("TEXTCOLOR", (0, 0), (-1, 0), INK),
                ("GRID", (0, 0), (-1, -1), 0.4, LINE),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("ALIGN", (1, 1), (-1, -1), "RIGHT"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ]
        )
    )
    story.append(t)

    story.append(PageBreak())

    # ---------------- Page 4: Detailed table (with Barème + Temps estimé) ------
    story.append(Paragraph("3. Détail des questions", h1))
    story.append(Paragraph(
        "Tableau synthétique avec Bloom, difficulté, barème et durée estimée par question.", small
    ))
    story.append(Spacer(1, 8))

    questions = analysis.get("questions") or []
    total_max_points = analysis.get("total_max_points")

    # Header
    rows = [["#", "Question (aperçu)", "Bloom", "Diff.", "Barème", "Temps est.", "AA", "Source"]]
    for q in questions:
        qn = q.get("Question#")
        text = (q.get("Text") or q.get("QuestionText") or "").replace("\n", " ").strip()
        preview = text[:90] + ("…" if len(text) > 90 else "")
        bloom = q.get("Bloom_Level") or "—"
        diff = q.get("Difficulty") or "—"
        aas = q.get("AA#") or []
        aa_txt = ", ".join([f"AA{a}" for a in aas[:3]]) + ("…" if len(aas) > 3 else "")
        has_src = "Oui" if (q.get("sources") or []) else "Non"

        # Barème
        pts = q.get("points")
        mx = q.get("max_points")
        if pts is not None and mx is not None:
            bareme_str = f"{pts}/{mx}"
        elif pts is not None:
            bareme_str = str(pts)
        else:
            bareme_str = "—"

        # Temps estimé
        t_est = q.get("estimated_time_min")
        time_str = f"{t_est} min" if t_est is not None else "—"

        rows.append([
            str(qn), _safe(preview), bloom, diff,
            bareme_str, time_str, aa_txt or "—", has_src
        ])

    # Add total row if barème info is available
    has_bareme = any(q.get("points") is not None for q in questions)
    has_times = any(q.get("estimated_time_min") is not None for q in questions)
    if has_bareme or has_times:
        total_pts_sum = sum(q.get("points") or 0 for q in questions if q.get("points") is not None)
        total_time_sum = sum(q.get("estimated_time_min") or 0 for q in questions)
        total_bareme = f"{total_pts_sum}/{total_max_points}" if total_max_points else str(total_pts_sum) if has_bareme else "—"
        rows.append([
            "∑", "TOTAL", "", "",
            total_bareme,
            f"{round(total_time_sum, 1)} min" if has_times else "—",
            "", ""
        ])

    col_widths = [0.8 * cm, 7.8 * cm, 2.2 * cm, 1.8 * cm, 1.8 * cm, 1.8 * cm, 2.0 * cm, 1.5 * cm]
    table = Table(rows, colWidths=col_widths, repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), BG_SOFT),
                ("TEXTCOLOR", (0, 0), (-1, 0), INK),
                ("GRID", (0, 0), (-1, -1), 0.35, LINE),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
                ("BACKGROUND", (0, -1), (-1, -1), BG_SOFT),
                ("FONTSIZE", (0, 0), (-1, -1), 7.5),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("ALIGN", (0, 1), (0, -1), "CENTER"),
                ("ALIGN", (4, 1), (5, -1), "RIGHT"),
            ]
        )
    )
    story.append(table)

    story.append(PageBreak())

    # ---------------- Page 5: Recommendations + sources ----------------
    story.append(Paragraph("4. Recommandations", h1))
    recs = analysis.get("recommendations") or []
    if recs:
        for r in recs[:18]:
            story.append(Paragraph(_safe(f"• {r}"), lead))
    else:
        story.append(Paragraph("—", lead))

    story.append(Spacer(1, 12))
    story.append(Paragraph("5. Sources (extraits)", h1))
    story.append(Paragraph("Extraits courts des sources retrouvées (max 2 par question).", small))
    story.append(Spacer(1, 6))

    mono = ParagraphStyle("Mono", parent=styles["Code"], fontName="Courier", fontSize=8, leading=10, textColor=INK)
    for q in questions[:20]:
        qn = q.get("Question#")
        srcs = q.get("sources") or []
        if not srcs:
            continue
        story.append(Paragraph(_safe(f"Q{qn}"), h2))
        for s in srcs[:2]:
            label = f"{s.get('file')} — page {s.get('page')}"
            if s.get("chapter"):
                label = f"{s.get('chapter')} • {label}"
            story.append(Paragraph(_safe(label), small))
            ex = (s.get("excerpt") or "").strip()
            if ex:
                story.append(Paragraph(_safe(ex), mono))
            story.append(Spacer(1, 4))
        story.append(Spacer(1, 6))

    doc.build(story)

    """Generate a clean, interpretable multi-section PDF for TN exam analysis."""
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    styles = getSampleStyleSheet()
    title = ParagraphStyle("Title", parent=styles["Title"], fontSize=20, textColor=INK, spaceAfter=10)
    h1 = ParagraphStyle("H1", parent=styles["Heading1"], textColor=INK, spaceBefore=10, spaceAfter=8)
    h2 = ParagraphStyle("H2", parent=styles["Heading2"], textColor=INK, spaceBefore=8, spaceAfter=6)
    lead = ParagraphStyle("Lead", parent=styles["BodyText"], fontSize=11, leading=14, textColor=INK)
    small = ParagraphStyle("Small", parent=styles["BodyText"], fontSize=9, leading=12, textColor=MUTED)

    doc = SimpleDocTemplate(
        output_path,
        pagesize=A4,
        rightMargin=1.6 * cm,
        leftMargin=1.6 * cm,
        topMargin=1.6 * cm,
        bottomMargin=1.6 * cm,
        title=f"{course_title} — {exam_title}",
    )

    story: List[Any] = []

    # ---------------- Page 1: Cover + KPIs ----------------
    logo_path = os.path.join(os.path.dirname(__file__), "..", "static", "img", "esprit_logo.png")
    logo_path = os.path.abspath(logo_path)
    if os.path.exists(logo_path):
        try:
            story.append(Image(logo_path, width=4.2 * cm, height=1.6 * cm))
            story.append(Spacer(1, 6))
        except Exception:
            pass

    story.append(Paragraph("Rapport d’analyse d’examen", title))
    story.append(Paragraph(_safe(course_title), ParagraphStyle("Course", parent=styles["Heading2"], textColor=BRAND)))
    story.append(Paragraph(_safe(exam_title), ParagraphStyle("Exam", parent=styles["Heading3"], textColor=INK)))
    story.append(Paragraph(_safe(f"Généré le {datetime.now().strftime('%d/%m/%Y %H:%M')}"), small))
    story.append(Spacer(1, 10))

    total_q = analysis.get("total_questions", 0) or 0
    src_rate = analysis.get("source_coverage_rate", 0) or 0
    diff_idx = analysis.get("difficulty_index", 0) or 0
    bloom_idx = analysis.get("bloom_index", 0) or 0

    kpi_rows = [
        ["Questions", str(total_q), "Alignement (sources)", _pct(src_rate)],
        ["Indice difficulté", f"{diff_idx}/5", "Indice Bloom", f"{bloom_idx}/6"],
    ]
    kpi = Table(kpi_rows, colWidths=[4.2 * cm, 3.2 * cm, 4.4 * cm, 3.2 * cm])
    kpi.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), BG_SOFT),
                ("BOX", (0, 0), (-1, -1), 0.6, LINE),
                ("INNERGRID", (0, 0), (-1, -1), 0.4, LINE),
                ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
                ("FONTNAME", (1, 0), (1, -1), "Helvetica-Bold"),
                ("FONTNAME", (3, 0), (3, -1), "Helvetica-Bold"),
                ("TEXTCOLOR", (0, 0), (-1, -1), INK),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
            ]
        )
    )
    story.append(kpi)
    story.append(Spacer(1, 12))

    story.append(Paragraph("Interprétation générale", h1))
    story.append(Paragraph(_safe(analysis.get("overall_interpretation") or "—"), lead))

    # Quick flags
    aa_missing = analysis.get("aa_missing") or []
    bloom_missing = analysis.get("bloom_missing") or []
    flags: List[str] = []
    if src_rate < 70:
        flags.append("Alignement aux supports faible (< 70%).")
    if aa_missing:
        flags.append(f"AA non couverts: {', '.join([f'AA#{x}' for x in aa_missing[:8]])}{'…' if len(aa_missing) > 8 else ''}.")
    if bloom_missing:
        flags.append(f"Niveaux Bloom absents: {', '.join(bloom_missing)}.")
    if flags:
        story.append(Spacer(1, 6))
        story.append(Paragraph("Points d’attention", h2))
        for f in flags[:6]:
            story.append(Paragraph(_safe(f"• {f}"), lead))

    story.append(PageBreak())

    # ---------------- Page 2: Charts overview ----------------
    story.append(Paragraph("1. Vue d’ensemble (charts)", h1))
    story.append(Paragraph("Répartitions observées pour comprendre la structure de l’examen.", small))
    story.append(Spacer(1, 8))

    bloom_pct = analysis.get("bloom_percentages") or {}
    diff_pct = analysis.get("difficulty_percentages") or {}
    aa_pct = analysis.get("aa_percentages") or {}

    story.append(Paragraph("Bloom (observé)", h2))
    story.append(_make_pie("Bloom", bloom_pct, max_items=6))
    story.append(Spacer(1, 10))

    story.append(Paragraph("Difficulté (observé)", h2))
    story.append(_make_pie("Difficulté", diff_pct, max_items=5))
    story.append(Spacer(1, 10))

    story.append(Paragraph("AA (observé) — top", h2))
    story.append(_make_pie("AA", aa_pct, max_items=8))

    story.append(PageBreak())

    # ---------------- Page 3: Expectations vs Observed ----------------
    story.append(Paragraph("2. Attendus vs Observé", h1))
    story.append(Paragraph("Les attendus sont une distribution cible (modifiable plus tard).", small))
    story.append(Spacer(1, 8))

    exp_bloom = analysis.get("expected_bloom_percentages") or {}
    exp_diff = analysis.get("expected_difficulty_percentages") or {}

    bloom_order = ["Mémoriser", "Comprendre", "Appliquer", "Analyser", "Évaluer", "Créer"]
    diff_order = ["Très facile", "Facile", "Moyen", "Difficile", "Très difficile"]

    story.append(Paragraph("Bloom", h2))
    story.append(_make_grouped_bars("Bloom", bloom_order, bloom_pct, exp_bloom))
    story.append(Spacer(1, 10))

    # Bloom table
    bloom_delta = analysis.get("bloom_delta") or {}
    rows = [["Niveau", "Observé", "Attendu", "Δ"]]
    for c in bloom_order:
        rows.append([c, _pct(bloom_pct.get(c, 0)), _pct(exp_bloom.get(c, 0)), _pct(bloom_delta.get(c, 0)).replace("%", "") + "%"])
    t = Table(rows, colWidths=[6 * cm, 3 * cm, 3 * cm, 3 * cm])
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), BG_SOFT),
                ("TEXTCOLOR", (0, 0), (-1, 0), INK),
                ("GRID", (0, 0), (-1, -1), 0.4, LINE),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("ALIGN", (1, 1), (-1, -1), "RIGHT"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ]
        )
    )
    story.append(t)
    story.append(Spacer(1, 14))

    story.append(Paragraph("Difficulté", h2))
    story.append(_make_grouped_bars("Difficulté", diff_order, diff_pct, exp_diff))
    story.append(Spacer(1, 10))

    diff_delta = analysis.get("difficulty_delta") or {}
    rows = [["Niveau", "Observé", "Attendu", "Δ"]]
    for c in diff_order:
        rows.append([c, _pct(diff_pct.get(c, 0)), _pct(exp_diff.get(c, 0)), _pct(diff_delta.get(c, 0)).replace("%", "") + "%"])
    t = Table(rows, colWidths=[6 * cm, 3 * cm, 3 * cm, 3 * cm])
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), BG_SOFT),
                ("TEXTCOLOR", (0, 0), (-1, 0), INK),
                ("GRID", (0, 0), (-1, -1), 0.4, LINE),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("ALIGN", (1, 1), (-1, -1), "RIGHT"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ]
        )
    )
    story.append(t)

    story.append(PageBreak())

    # ---------------- Page 4: Detailed table ----------------
    story.append(Paragraph("3. Détail des questions", h1))
    story.append(Paragraph("Tableau synthétique (Bloom, difficulté, AA, source).", small))
    story.append(Spacer(1, 8))

    questions = analysis.get("questions") or []
    rows = [["#", "Question (aperçu)", "Bloom", "Diff.", "AA", "Source"]]
    for q in questions:
        qn = q.get("Question#")
        text = (q.get("Text") or q.get("QuestionText") or "").replace("\n", " ").strip()
        preview = text[:120] + ("…" if len(text) > 120 else "")
        bloom = q.get("Bloom_Level") or "—"
        diff = q.get("Difficulty") or "—"
        aas = q.get("AA#") or []
        aa_txt = ", ".join([f"AA{a}" for a in aas[:4]]) + ("…" if len(aas) > 4 else "")
        has_src = "Oui" if (q.get("sources") or []) else "Non"
        rows.append([str(qn), _safe(preview), bloom, diff, aa_txt or "—", has_src])

    table = Table(rows, colWidths=[0.9 * cm, 9.6 * cm, 2.4 * cm, 2.1 * cm, 2.5 * cm, 1.7 * cm], repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), BG_SOFT),
                ("TEXTCOLOR", (0, 0), (-1, 0), INK),
                ("GRID", (0, 0), (-1, -1), 0.35, LINE),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("ALIGN", (0, 1), (0, -1), "CENTER"),
            ]
        )
    )
    story.append(table)

    story.append(PageBreak())

    # ---------------- Page 5: Recommendations + sources ----------------
    story.append(Paragraph("4. Recommandations", h1))
    recs = analysis.get("recommendations") or []
    if recs:
        for r in recs[:18]:
            story.append(Paragraph(_safe(f"• {r}"), lead))
    else:
        story.append(Paragraph("—", lead))

    story.append(Spacer(1, 12))
    story.append(Paragraph("5. Sources (extraits)", h1))
    story.append(Paragraph("Extraits courts des sources retrouvées (max 2 par question).", small))
    story.append(Spacer(1, 6))

    mono = ParagraphStyle("Mono", parent=styles["Code"], fontName="Courier", fontSize=8, leading=10, textColor=INK)
    for q in questions[:20]:
        qn = q.get("Question#")
        srcs = q.get("sources") or []
        if not srcs:
            continue
        story.append(Paragraph(_safe(f"Q{qn}"), h2))
        for s in srcs[:2]:
            label = f"{s.get('file')} — page {s.get('page')}"
            if s.get("chapter"):
                label = f"{s.get('chapter')} • {label}"
            story.append(Paragraph(_safe(label), small))
            ex = (s.get("excerpt") or "").strip()
            if ex:
                story.append(Paragraph(_safe(ex), mono))
            story.append(Spacer(1, 4))
        story.append(Spacer(1, 6))

    doc.build(story)
