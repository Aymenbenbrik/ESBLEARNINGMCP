"""tn_latex_report_service.py

Generates a filled LaTeX/PDF exam evaluation report following the
'rapport examen officiel.tex' template structure.

8 validation criteria:
  1. INFO_MANQUANTE        – Missing general information
  2. BAREME_MANQUANT       – Questions without explicit points
  3. BAREME_EXCESSIF       – Points > 20 (per question or total)
  4. TEMPS_EXCESSIF        – Estimated time > declared duration
  5. EXAMEN_TRES_DIFFICILE – 'Très difficile' proportion > 60 %
  6. QCM_POINTS_EXCESSIFS  – QCM total points > 10
  7. QUESTIONS_SANS_SOURCE – Source coverage < 70 %
  8. QUESTIONS_SANS_AA     – Questions with no linked AA
"""
from __future__ import annotations

import os
import re
import shutil
import subprocess
from typing import Any, Dict, List, Optional, Tuple

# ── Logo search order ─────────────────────────────────────────────────────────
_LOGO_CANDIDATES: List[str] = [
    os.path.abspath(os.path.join(
        os.path.dirname(__file__), "..", "..", "..", "Validation Examen", "Logo.png"
    )),
    os.path.abspath(os.path.join(
        os.path.dirname(__file__), "..", "static", "img", "esprit_logo.png"
    )),
]

# ── Question-type normalisation ───────────────────────────────────────────────
_TYPE_CANONICAL: Dict[str, str] = {
    "MCQ": "MCQ", "QCM": "MCQ",
    "Short Answer": "Written", "Rédactionnel": "Written", "Essay": "Written",
    "Exercise": "Written", "Exercice": "Written",
    "Problem": "Written", "Problème": "Written",
    "Practical": "Practical", "Pratique": "Practical",
    "Case Study": "Case Study", "Étude de cas": "Case Study",
    "Projet": "Case Study", "Project": "Case Study",
}

_BLOOM_SKILL: Dict[str, str] = {
    "Mémoriser": "Recall",
    "Comprendre": "Comprehension",
    "Appliquer": "Application",
    "Analyser": "Critical thinking",
    "Évaluer": "Evaluation",
    "Créer": "Creation",
}

_BLOOM_ORDER = ["Mémoriser", "Comprendre", "Appliquer", "Analyser", "Évaluer", "Créer"]
_BLOOM_SHORT = ["Mém.", "Comp.", "Appl.", "Anal.", "Éval.", "Créer"]


# ═════════════════════════════════════════════════════════════════════════════
# LaTeX helpers
# ═════════════════════════════════════════════════════════════════════════════

def _tex(value: Any) -> str:
    """Escape a value for safe insertion in LaTeX text mode."""
    if value is None:
        return "---"
    s = str(value)
    s = s.replace("\\", r"\textbackslash{}")
    for ch, repl in [
        ("&", r"\&"), ("%", r"\%"), ("$", r"\$"), ("#", r"\#"),
        ("_", r"\_"), ("{", r"\{"), ("}", r"\}"),
        ("~", r"\textasciitilde{}"), ("^", r"\textasciicircum{}"),
    ]:
        s = s.replace(ch, repl)
    return s or "---"


def _yn(val: Optional[bool], lang: str = "fr") -> str:
    """Return LaTeX checkbox pair with the correct side ticked."""
    chk, box = r"\ding{51}", r"\ding{110}"
    yes_lbl, no_lbl = ("Oui", "Non") if lang == "fr" else ("Yes", "No")
    if val is True:
        return rf"{chk}~{yes_lbl} \hspace{{0.5cm}} {box}~{no_lbl}"
    if val is False:
        return rf"{box}~{yes_lbl} \hspace{{0.5cm}} {chk}~{no_lbl}"
    return rf"{box}~{yes_lbl} \hspace{{0.5cm}} {box}~{no_lbl}"


def _status_badge(status: str) -> str:
    """Coloured badge for validation table."""
    if status == "PASS":
        return r"\textcolor{VertConf}{\ding{51}~\textbf{Conforme}}"
    if status == "WARNING":
        return r"\textcolor{OrangeAtt}{\ding{108}~\textbf{Attention}}"
    return r"\textcolor{RougeNC}{\ding{55}~\textbf{Non conforme}}"


# ═════════════════════════════════════════════════════════════════════════════
# Validation — 8 criteria
# ═════════════════════════════════════════════════════════════════════════════

def validate_exam(analysis: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Run all 8 validation criteria.
    Each result dict: {criterion, label, status (PASS|WARNING|FAIL), detail, ok (bool)}
    """
    meta = analysis.get("exam_metadata") or {}
    questions = analysis.get("questions") or []
    time_info = analysis.get("time_analysis") or {}
    diff_pct = analysis.get("difficulty_percentages") or {}
    source_rate = float(analysis.get("source_coverage_rate") or 0)
    total_max = analysis.get("total_max_points")
    results: List[Dict[str, Any]] = []

    # ── 1. Informations générales manquantes ──────────────────────────────
    required_fields = [
        ("exam_name",           "Nom de l'épreuve"),
        ("class_name",          "Classe"),
        ("language",            "Langue"),
        ("declared_duration_min", "Durée"),
        ("exam_date",           "Date"),
        ("instructors",         "Enseignant(s)"),
    ]
    missing_info = [
        lbl for field, lbl in required_fields
        if not meta.get(field) or (isinstance(meta.get(field), list) and not meta[field])
    ]
    results.append({
        "criterion": "INFO_MANQUANTE",
        "label": "Informations générales complètes",
        "status": "FAIL" if missing_info else "PASS",
        "detail": ("Champs manquants : " + ", ".join(missing_info)) if missing_info
                  else "Toutes les informations générales sont présentes.",
        "ok": not missing_info,
    })

    # ── 2. Barème défini pour chaque question ─────────────────────────────
    no_bareme = [str(q.get("Question#")) for q in questions if q.get("points") is None]
    results.append({
        "criterion": "BAREME_MANQUANT",
        "label": "Barème défini pour chaque question",
        "status": "FAIL" if no_bareme else "PASS",
        "detail": ("Questions sans barème : Q" + ", Q".join(no_bareme[:10])) if no_bareme
                  else "Barème explicite pour toutes les questions.",
        "ok": not no_bareme,
    })

    # ── 3. Barème ≤ 20 pts ────────────────────────────────────────────────
    excess_q = [str(q.get("Question#")) for q in questions if (q.get("points") or 0) > 20]
    excess_total = bool(total_max and float(total_max) > 20)
    fail3 = bool(excess_q) or excess_total
    d3: List[str] = []
    if excess_q:
        d3.append("Q" + ", Q".join(excess_q) + " : barème > 20 pts")
    if excess_total:
        d3.append(f"Total exam ({total_max} pts) > 20")
    results.append({
        "criterion": "BAREME_EXCESSIF",
        "label": "Barème ≤ 20 pts (question et total)",
        "status": "FAIL" if fail3 else "PASS",
        "detail": " | ".join(d3) if d3 else "Aucun barème excessif détecté.",
        "ok": not fail3,
    })

    # ── 4. Durée estimée ≤ durée allouée ─────────────────────────────────
    verdict = time_info.get("verdict", "UNKNOWN")
    results.append({
        "criterion": "TEMPS_EXCESSIF",
        "label": "Durée estimée ≤ durée allouée",
        "status": ("FAIL" if verdict == "TROP_LONG" else
                   "WARNING" if verdict in ("TROP_COURT", "UNKNOWN") else "PASS"),
        "detail": time_info.get("verdict_label") or "Durée déclarée introuvable dans le PDF.",
        "ok": verdict == "OK",
    })

    # ── 5. Proportion 'Très difficile' ≤ 60 % ────────────────────────────
    tres_diff = float(diff_pct.get("Très difficile", 0))
    results.append({
        "criterion": "EXAMEN_TRES_DIFFICILE",
        "label": "Proportion 'Très difficile' ≤ 60 %",
        "status": "FAIL" if tres_diff > 60 else "PASS",
        "detail": f"{tres_diff:.1f} % des questions classées 'Très difficile'.",
        "ok": tres_diff <= 60,
    })

    # ── 6. Total points QCM ≤ 10 ─────────────────────────────────────────
    qcm_qs = [q for q in questions
               if (q.get("Type") or "").strip().upper() in ("MCQ", "QCM")]
    qcm_pts = sum((q.get("points") or 0) for q in qcm_qs)
    results.append({
        "criterion": "QCM_POINTS_EXCESSIFS",
        "label": "Total points QCM ≤ 10",
        "status": "FAIL" if qcm_pts > 10 else "PASS",
        "detail": (f"{len(qcm_qs)} question(s) QCM — {qcm_pts} pts au total." +
                   (" Dépasse le seuil de 10 pts." if qcm_pts > 10 else "")),
        "ok": qcm_pts <= 10,
    })

    # ── 7. Questions alignées aux documents fournis ───────────────────────
    results.append({
        "criterion": "QUESTIONS_SANS_SOURCE",
        "label": "Alignement aux documents fournis ≥ 70 %",
        "status": ("FAIL" if source_rate < 50 else
                   "WARNING" if source_rate < 70 else "PASS"),
        "detail": (f"Taux d'alignement : {source_rate:.1f} %." +
                   (" Insuffisant (seuil : 50 %)." if source_rate < 50 else
                    " À améliorer (seuil : 70 %)." if source_rate < 70 else "")),
        "ok": source_rate >= 70,
    })

    # ── 8. Toutes les questions reliées à un AA ───────────────────────────
    no_aa = [str(q.get("Question#")) for q in questions if not (q.get("AA#") or [])]
    results.append({
        "criterion": "QUESTIONS_SANS_AA",
        "label": "Toutes les questions reliées à un AA",
        "status": "FAIL" if no_aa else "PASS",
        "detail": ("Questions sans AA : Q" + ", Q".join(no_aa[:10])) if no_aa
                  else "Toutes les questions sont reliées à au moins un AA.",
        "ok": not no_aa,
    })

    return results


# ═════════════════════════════════════════════════════════════════════════════
# Score computation
# ═════════════════════════════════════════════════════════════════════════════

def _compute_scores(
    analysis: Dict[str, Any],
    validation: List[Dict[str, Any]],
) -> Tuple[int, int, int]:
    """Returns (content_score/70, quality_score/20, total/90)."""
    # Quality /20 : 2.5 per PASS, 1.25 per WARNING, 0 per FAIL
    quality = sum(
        2.5 if v["status"] == "PASS" else (1.25 if v["status"] == "WARNING" else 0.0)
        for v in validation
    )
    quality_score = min(20, round(quality))

    questions = analysis.get("questions") or []
    total_q = max(len(questions), 1)

    # Bloom coverage /15
    bloom_pct = analysis.get("bloom_percentages") or {}
    levels_present = sum(1 for v in bloom_pct.values() if v > 0)
    bloom_score = round(levels_present / 6 * 15)

    # AA coverage /20
    q_with_aa = sum(1 for q in questions if q.get("AA#"))
    aa_score = round(q_with_aa / total_q * 20)

    # Source alignment /20
    source_rate = float(analysis.get("source_coverage_rate") or 0)
    source_score = round(source_rate / 100 * 20)

    # Difficulty balance /15 (penalised by excess 'Très difficile')
    diff_pct = analysis.get("difficulty_percentages") or {}
    tres_diff = float(diff_pct.get("Très difficile", 0))
    balance_score = round(max(0.0, 15.0 - tres_diff * 0.15))

    content_score = min(70, bloom_score + aa_score + source_score + balance_score)
    return content_score, quality_score, content_score + quality_score


# ═════════════════════════════════════════════════════════════════════════════
# Section generators
# ═════════════════════════════════════════════════════════════════════════════

def _preamble(logo_filename: str) -> str:
    return rf"""\documentclass[11pt,a4paper]{{article}}

\usepackage[utf8]{{inputenc}}
\usepackage[T1]{{fontenc}}
\usepackage[french,english]{{babel}}
\usepackage{{geometry}}
\usepackage{{longtable}}
\usepackage{{booktabs}}
\usepackage{{xcolor}}
\usepackage{{graphicx}}
\usepackage{{fancyhdr}}
\usepackage{{colortbl}}
\usepackage{{pifont}}
\usepackage{{tikz}}
\usepackage{{pgfplots}}
\pgfplotsset{{compat=1.18}}
\usepgfplotslibrary{{polar}}
\usepackage{{array}}
\usepackage{{tabularx}}
\usepackage{{multirow}}
\usepackage{{enumitem}}
\usepackage{{microtype}}

\geometry{{margin=2.0cm, top=2.5cm, bottom=2.0cm}}

%% ── Colour palette ────────────────────────────────────────────────────────
\definecolor{{EspritBleu}}{{RGB}}{{0,102,153}}
\definecolor{{GrisClair}}{{RGB}}{{240,240,240}}
\definecolor{{VertConf}}{{RGB}}{{0,140,70}}
\definecolor{{RougeNC}}{{RGB}}{{180,30,40}}
\definecolor{{OrangeAtt}}{{RGB}}{{200,100,0}}

%% ── Header / footer ──────────────────────────────────────────────────────
\pagestyle{{fancy}}
\fancyhf{{}}
\fancyhead[L]{{\textcolor{{EspritBleu}}{{\textbf{{ESPRIT School of Business}}}}}}
\fancyhead[C]{{\textcolor{{EspritBleu}}{{\thepage}}}}
\fancyhead[R]{{\textcolor{{EspritBleu}}{{Rapport d'Évaluation d'Examen}}}}
\fancyfoot[C]{{\textit{{Département IMA — Rapport généré automatiquement}}}}
\renewcommand{{\headrulewidth}}{{0.6pt}}
\renewcommand{{\footrulewidth}}{{0.3pt}}

%% ── Section style ────────────────────────────────────────────────────────
\usepackage{{titlesec}}
\titleformat{{\section}}
  {{\color{{white}}\normalfont\large\bfseries}}{{}}{{0em}}
  {{\colorbox{{EspritBleu}}{{\parbox{{\dimexpr\linewidth-2\fboxsep}}{{\centering\strut#1\strut}}}}}}
\titlespacing*{{\section}}{{0pt}}{{1em}}{{0.6em}}

\renewcommand{{\arraystretch}}{{1.45}}
\setlength{{\tabcolsep}}{{6pt}}

\begin{{document}}
"""


def _header_table(logo_filename: str, course_title: str) -> str:
    return rf"""
\begin{{table}}[h!]
\centering
\begin{{tabular}}{{m{{2.8cm}} m{{10.5cm}} m{{2.8cm}}}}
\includegraphics[width=2.4cm,keepaspectratio]{{{logo_filename}}} &
\centering
{{\Large \textbf{{Rapport d'Évaluation d'Examen}}}}\\
{{\normalsize \textcolor{{EspritBleu}}{{\textbf{{{_tex(course_title)}}}}}}} &
\\
\end{{tabular}}
\end{{table}}
\vspace{{0.3cm}}
\hrule
\vspace{{0.4cm}}
"""


def _sec_general_info(meta: Dict) -> str:
    instructors = ", ".join(meta.get("instructors") or []) or "---"
    duration = (f"{meta.get('declared_duration_min')} minutes"
                if meta.get("declared_duration_min") else "---")
    rows_data = [
        ("Nom de l'épreuve / Course",       meta.get("exam_name")),
        ("Classe / Class",                   meta.get("class_name")),
        ("Langue / Language",                meta.get("language")),
        ("Durée déclarée / Duration",        duration),
        ("Date",                             meta.get("exam_date")),
        ("Enseignant(s) / Instructor(s)",    instructors),
        ("Département / Department",         meta.get("department")),
        ("Nombre de pages / Pages",          meta.get("num_pages")),
    ]
    rows = "\n".join(
        rf"  {_tex(k)} & {_tex(v)} \\ \hline" for k, v in rows_data
    )
    return rf"""
\section*{{Informations Générales / General Information}}

\begin{{longtable}}{{|p{{6.5cm}}|p{{9cm}}|}}
\hline
\rowcolor{{GrisClair}}
\textbf{{Élément}} & \textbf{{Information}} \\ \hline
{rows}
\end{{longtable}}
"""


def _sec_exam_format(meta: Dict, time_ok: Optional[bool]) -> str:
    rows_data = [
        ("Réponse sur la feuille de l'examen", meta.get("answer_on_sheet")),
        ("Documents autorisés",               meta.get("documents_allowed")),
        ("Calculatrice autorisée",             meta.get("calculator_allowed")),
        ("PC autorisé",                        meta.get("computer_allowed")),
        ("Accès à Internet autorisé",          meta.get("internet_allowed")),
        ("Durée adéquate par rapport aux énoncés", time_ok),
        ("Tous les enseignants ont validé l'examen", None),
    ]
    rows = "\n".join(
        rf"  {_tex(k)} & {_yn(v)} \\ \hline" for k, v in rows_data
    )
    return rf"""
\section*{{Forme de l'Examen / Exam Format}}

\begin{{longtable}}{{|p{{10cm}}|p{{5.5cm}}|}}
\hline
\rowcolor{{GrisClair}}
\textbf{{Critère}} & \textbf{{Choix}} \\ \hline
{rows}
\end{{longtable}}
"""


def _sec_exam_content(questions: List[Dict], total_max: Optional[float]) -> str:
    """Question-type distribution table."""
    type_stats: Dict[str, Dict] = {
        "MCQ":        {"qs": [], "pts": 0.0, "has_bareme": False},
        "Written":    {"qs": [], "pts": 0.0, "has_bareme": False},
        "Practical":  {"qs": [], "pts": 0.0, "has_bareme": False},
        "Case Study": {"qs": [], "pts": 0.0, "has_bareme": False},
    }
    for q in questions:
        raw = (q.get("Type") or "").strip()
        canon = _TYPE_CANONICAL.get(raw, "Written")
        if canon not in type_stats:
            canon = "Written"
        d = type_stats[canon]
        d["qs"].append(q)
        if q.get("points") is not None:
            d["pts"] += float(q.get("points") or 0)
            d["has_bareme"] = True

    labels = [
        ("QCM",                      "MCQ"),
        ("Questions rédactionnelles", "Written"),
        ("Questions pratiques",       "Practical"),
        ("Étude de cas",              "Case Study"),
    ]
    rows = []
    for lbl, key in labels:
        d = type_stats[key]
        present = bool(d["qs"])
        pts_str = str(int(d["pts"])) if (present and d["pts"]) else "---"
        rows.append(
            rf"  {_tex(lbl)} & {_yn(present)} & {pts_str} & {_yn(d['has_bareme'] if present else None)} \\ \hline"
        )
    total_pts = int(sum((q.get("points") or 0) for q in questions))
    rows_str = "\n".join(rows)
    return rf"""
\section*{{Contenu de l'Examen / Exam Content}}

\subsection*{{Répartition et barème des questions}}
\begin{{longtable}}{{|p{{4.5cm}}|p{{3.5cm}}|p{{2.5cm}}|p{{3.5cm}}|}}
\hline
\rowcolor{{GrisClair}}
\textbf{{Type de question}} & \textbf{{Présence}} & \textbf{{Points totaux}} & \textbf{{Barème par question}} \\ \hline
{rows_str}
\rowcolor{{GrisClair}}
\textbf{{Total}} & & \textbf{{{total_pts}}} & \\ \hline
\end{{longtable}}
"""


def _sec_aa_mapping(questions: List[Dict]) -> str:
    """AA → Question → Bloom → Points mapping."""
    rows: List[str] = []
    for q in questions:
        qn = f"Q{q.get('Question#')}"
        bloom = _tex(q.get("Bloom_Level") or "---")
        pts = str(int(q.get("points"))) if q.get("points") is not None else "---"
        aa_list = q.get("AA#") or []
        if aa_list:
            for aa in aa_list[:3]:
                rows.append(rf"  AA{aa} & {qn} & {bloom} & {pts} \\ \hline")
        else:
            rows.append(rf"  --- & {qn} & {bloom} & {pts} \\ \hline")
    if not rows:
        rows.append(r"  --- & --- & --- & --- \\ \hline")
    body = "\n".join(rows[:35])
    return rf"""
\subsection*{{Couverture des Acquis d'Apprentissage (AA)}}
\begin{{longtable}}{{|p{{3cm}}|p{{3cm}}|p{{5cm}}|p{{3cm}}|}}
\hline
\rowcolor{{GrisClair}}
\textbf{{AA}} & \textbf{{Question}} & \textbf{{Niveau Bloom}} & \textbf{{Points}} \\ \hline
{body}
\end{{longtable}}
"""


def _sec_bloom_radar(bloom_pct: Dict[str, float]) -> str:
    """Polar radar chart for Bloom distribution."""
    coords_parts = []
    for lvl, angle in zip(_BLOOM_ORDER, range(0, 360, 60)):
        val = round(bloom_pct.get(lvl, 0) / 20.0, 2)
        coords_parts.append(f"({angle},{val})")
    # close polygon
    coords_parts.append(f"(360,{round(bloom_pct.get('Mémoriser', 0) / 20.0, 2)})")
    coords = " ".join(coords_parts)

    legend_rows = " \\\\\n  ".join(
        rf"{_tex(lvl)} & {bloom_pct.get(lvl, 0):.1f}\%"
        for lvl in _BLOOM_ORDER
    )
    short_labels = ",".join(_BLOOM_SHORT)
    return rf"""
\section*{{Répartition Bloom / Bloom Taxonomy Distribution}}

\begin{{center}}
\begin{{tikzpicture}}
\begin{{polaraxis}}[
  width=7cm, height=7cm,
  xtick={{0,60,120,180,240,300}},
  xticklabels={{{short_labels}}},
  ymin=0, ymax=5,
  ytick={{0,1,2,3,4,5}},
  yticklabels={{0\%,20\%,40\%,60\%,80\%,100\%}},
  font=\footnotesize,
  tick label style={{font=\tiny}},
]
\addplot[thick, color=EspritBleu, fill=EspritBleu, fill opacity=0.25]
  coordinates {{{coords}}};
\end{{polaraxis}}
\end{{tikzpicture}}
\end{{center}}

\begin{{center}}
\begin{{tabular}}{{ll}}
\rowcolor{{GrisClair}}\textbf{{Niveau}} & \textbf{{Proportion}} \\
  {legend_rows} \\
\end{{tabular}}
\end{{center}}
"""


def _sec_quality_indicators(analysis: Dict, validation: List[Dict]) -> str:
    """Yes/No quality indicators derived from validation results."""
    by_crit = {v["criterion"]: v for v in validation}

    def _ok(crit: str) -> Optional[bool]:
        v = by_crit.get(crit)
        return v["ok"] if v else None

    bloom_missing = analysis.get("bloom_missing") or []
    bloom_ok: Optional[bool] = (len(bloom_missing) == 0
                                 if analysis.get("bloom_percentages") else None)
    bareme_ok_raw = _ok("BAREME_MANQUANT") and _ok("BAREME_EXCESSIF")
    bareme_ok: Optional[bool] = bool(bareme_ok_raw) if bareme_ok_raw is not None else None

    rows_data = [
        ("L'examen couvre tous les acquis d'apprentissage (AA)",   _ok("QUESTIONS_SANS_AA")),
        ("Les questions sont cohérentes avec les objectifs du cours", _ok("QUESTIONS_SANS_SOURCE")),
        ("Couverture des niveaux de la taxonomie de Bloom",         bloom_ok),
        ("Le niveau de difficulté est adapté à la classe",          _ok("EXAMEN_TRES_DIFFICILE")),
        ("Le barème est explicite et équilibré",                     bareme_ok),
        ("La durée est adéquate par rapport aux énoncés",           _ok("TEMPS_EXCESSIF")),
        ("Les consignes sont claires (infos complètes)",            _ok("INFO_MANQUANTE")),
    ]
    rows = "\n".join(
        rf"  {_tex(k)} & {_yn(v)} \\ \hline" for k, v in rows_data
    )
    return rf"""
\section*{{Indicateurs Qualité / Quality Indicators}}

\begin{{longtable}}{{|p{{10cm}}|p{{5.5cm}}|}}
\hline
\rowcolor{{GrisClair}}
\textbf{{Critère}} & \textbf{{Choix}} \\ \hline
{rows}
\end{{longtable}}
"""


def _sec_validation_criteria(validation: List[Dict]) -> str:
    """Full 8-criteria table with traffic-light status."""
    rows = "\n".join(
        rf"  {_tex(v['label'])} & {_status_badge(v['status'])} & {_tex(v['detail'])} \\ \hline"
        for v in validation
    )
    return rf"""
\section*{{Critères de Validation Automatique}}

\begin{{longtable}}{{|p{{5cm}}|p{{3.5cm}}|p{{7cm}}|}}
\hline
\rowcolor{{GrisClair}}
\textbf{{Critère}} & \textbf{{Statut}} & \textbf{{Détail}} \\ \hline
{rows}
\end{{longtable}}
"""


def _sec_question_classification(questions: List[Dict]) -> str:
    rows: List[str] = []
    for q in questions[:30]:
        qn = f"Q{q.get('Question#')}"
        raw_type = (q.get("Type") or "---").strip()
        canon = _TYPE_CANONICAL.get(raw_type, raw_type)
        bloom = _tex(q.get("Bloom_Level") or "---")
        skill = _tex(_BLOOM_SKILL.get(q.get("Bloom_Level") or "", "---"))
        diff = _tex(q.get("Difficulty") or "---")
        t_est = q.get("estimated_time_min")
        time_str = f"{t_est} min" if t_est is not None else "---"
        pts = str(int(q.get("points"))) if q.get("points") is not None else "---"
        rows.append(
            rf"  {qn} & {_tex(canon)} & {bloom} & {diff} & {pts} & {time_str} \\ \hline"
        )
    body = "\n".join(rows) if rows else r"  --- & --- & --- & --- & --- & --- \\ \hline"
    return rf"""
\section*{{Classification des Questions}}

\begin{{longtable}}{{|p{{1.5cm}}|p{{2.8cm}}|p{{2.8cm}}|p{{2.5cm}}|p{{1.5cm}}|p{{2cm}}|}}
\hline
\rowcolor{{GrisClair}}
\textbf{{Q\#}} & \textbf{{Type}} & \textbf{{Bloom}} & \textbf{{Difficulté}} & \textbf{{Pts}} & \textbf{{Temps est.}} \\ \hline
{body}
\end{{longtable}}
"""


def _sec_scores(content_score: int, quality_score: int, total: int) -> str:
    pct = round(total / 90 * 100)
    if pct >= 85:
        verdict_tex = r"\textcolor{VertConf}{\textbf{Excellent}}"
    elif pct >= 70:
        verdict_tex = r"\textcolor{VertConf}{\textbf{Satisfaisant}}"
    elif pct >= 50:
        verdict_tex = r"\textcolor{OrangeAtt}{\textbf{À améliorer}}"
    else:
        verdict_tex = r"\textcolor{RougeNC}{\textbf{Non conforme}}"
    return rf"""
\section*{{Score Final / Final Score}}

\begin{{center}}
\begin{{tabular}}{{|p{{8.5cm}}|p{{3cm}}|p{{3cm}}|}}
\hline
\rowcolor{{GrisClair}}
\textbf{{Catégorie}} & \textbf{{Score}} & \textbf{{Maximum}} \\ \hline
Contenu de l'examen & {content_score} & 70 \\ \hline
Indicateurs qualité & {quality_score} & 20 \\ \hline
\rowcolor{{EspritBleu}}
\textcolor{{white}}{{\textbf{{Total}}}} & \textcolor{{white}}{{\textbf{{{total}}}}} &
\textcolor{{white}}{{\textbf{{90}}}} \\ \hline
\end{{tabular}}
\end{{center}}

\vspace{{0.3cm}}
\noindent Appréciation : {verdict_tex} \quad ({pct}\%)
"""


def _sec_overall_appreciation(validation: List[Dict]) -> str:
    fails = sum(1 for v in validation if v["status"] == "FAIL")
    warns = sum(1 for v in validation if v["status"] == "WARNING")

    if fails == 0 and warns == 0:
        checked = [True, False, False, False]
    elif fails == 0:
        checked = [False, True, False, False]
    elif fails <= 2:
        checked = [False, False, True, False]
    else:
        checked = [False, False, False, True]

    levels = [
        ("Très satisfaisant", checked[0]),
        ("Satisfaisant",      checked[1]),
        ("À améliorer",       checked[2]),
        ("Non conforme",      checked[3]),
    ]
    chk, box = r"\ding{51}", r"\ding{110}"
    rows = "\n".join(
        rf"  {_tex(lbl)} & {chk if c else box} \\ \hline"
        for lbl, c in levels
    )

    # Auto-generated comment
    fail_items = [v["label"] for v in validation if v["status"] == "FAIL"]
    warn_items  = [v["label"] for v in validation if v["status"] == "WARNING"]
    comment_parts: List[str] = []
    if fail_items:
        comment_parts.append("Non-conformités détectées : " + "; ".join(fail_items[:4]) + ".")
    if warn_items:
        comment_parts.append("Points d'attention : " + "; ".join(warn_items[:3]) + ".")
    if not comment_parts:
        comment_parts.append("L'examen est globalement conforme aux critères d'évaluation.")
    comment = _tex(" ".join(comment_parts))

    return rf"""
\section*{{Appréciation Globale / Overall Appreciation}}

\begin{{longtable}}{{|p{{10cm}}|p{{4cm}}|}}
\hline
\rowcolor{{GrisClair}}
\textbf{{Niveau d'évaluation}} & \textbf{{Case à cocher}} \\ \hline
{rows}
\end{{longtable}}

\vspace{{0.3cm}}
\noindent\textbf{{Commentaires généraux :}}

\vspace{{0.2cm}}
\noindent {comment}
\vspace{{0.4cm}}
"""


def _sec_recommendations(analysis: Dict, validation: List[Dict]) -> str:
    recs: List[str] = []

    # Validation failures first
    for v in validation:
        if v["status"] == "FAIL":
            recs.append(f"[{v['criterion']}] {v['detail']}")
        elif v["status"] == "WARNING":
            recs.append(f"[Attention] {v['detail']}")

    # LLM recommendations
    for r in (analysis.get("recommendations") or [])[:10]:
        clean = str(r).strip()
        if clean and clean not in recs:
            recs.append(clean)

    if not recs:
        recs.append("L'examen est conforme à l'ensemble des critères. Aucune recommandation particulière.")

    items = "\n".join(rf"\item {_tex(r)}" for r in recs[:18])
    return rf"""
\section*{{Recommandations / Recommendations}}

\begin{{itemize}}[leftmargin=1.5em, itemsep=4pt, parsep=0pt]
{items}
\end{{itemize}}
"""


def _sec_validation_signature(instructors: List[str]) -> str:
    names = (instructors or []) + ["---", "---", "---"]
    rows = "\n".join(
        rf"  {_tex(n)} & & \\ \hline"
        for n in names[:3]
    )
    return rf"""
\section*{{Validation / Signatures}}

\begin{{longtable}}{{|p{{6cm}}|p{{4cm}}|p{{4cm}}|}}
\hline
\rowcolor{{GrisClair}}
\textbf{{Nom de l'enseignant}} & \textbf{{Signature}} & \textbf{{Date}} \\ \hline
{rows}
\end{{longtable}}

\vspace{{1cm}}
"""


# ═════════════════════════════════════════════════════════════════════════════
# Main document generator
# ═════════════════════════════════════════════════════════════════════════════

def generate_tex_content(
    analysis: Dict[str, Any],
    course_title: str,
    validation: List[Dict[str, Any]],
    logo_filename: str = "logo.png",
) -> str:
    """Assemble the full .tex document string."""
    meta = analysis.get("exam_metadata") or {}
    questions = analysis.get("questions") or []
    bloom_pct = analysis.get("bloom_percentages") or {}
    total_max = analysis.get("total_max_points")
    time_info = analysis.get("time_analysis") or {}

    verdict = time_info.get("verdict", "UNKNOWN")
    time_ok: Optional[bool] = (
        True if verdict == "OK" else
        False if verdict == "TROP_LONG" else None
    )

    content_score, quality_score, total = _compute_scores(analysis, validation)

    parts = [
        _preamble(logo_filename),
        _header_table(logo_filename, course_title),
        _sec_general_info(meta),
        _sec_exam_format(meta, time_ok),
        _sec_exam_content(questions, total_max),
        _sec_aa_mapping(questions),
        _sec_bloom_radar(bloom_pct),
        _sec_quality_indicators(analysis, validation),
        _sec_validation_criteria(validation),
        _sec_question_classification(questions),
        _sec_scores(content_score, quality_score, total),
        _sec_overall_appreciation(validation),
        _sec_recommendations(analysis, validation),
        _sec_validation_signature(meta.get("instructors") or []),
        "\n\\end{document}\n",
    ]
    return "\n".join(parts)


# ═════════════════════════════════════════════════════════════════════════════
# Compilation helpers
# ═════════════════════════════════════════════════════════════════════════════

def _find_latex_compiler() -> Optional[str]:
    for cmd in ["pdflatex", "xelatex"]:
        found = shutil.which(cmd)
        if found:
            return found
    # MiKTeX common Windows locations
    for base in [
        r"C:\Users\aymen\AppData\Local\Programs\MiKTeX\miktex\bin\x64",
        r"C:\Program Files\MiKTeX\miktex\bin\x64",
        r"C:\Program Files\MiKTeX 2.9\miktex\bin\x64",
    ]:
        for exe in ["pdflatex.exe", "xelatex.exe"]:
            full = os.path.join(base, exe)
            if os.path.exists(full):
                return full
    return None


def generate_tn_latex_report(
    analysis: Dict[str, Any],
    course_title: str,
    output_tex_path: str,
    compile_pdf: bool = True,
) -> Tuple[str, Optional[str], List[Dict[str, Any]]]:
    """
    Generate a filled .tex report and optionally compile to PDF.

    Returns:
        (tex_path, pdf_path_or_None, validation_results)
    """
    # 1. Run validation
    validation = validate_exam(analysis)

    # 2. Prepare output directory
    out_dir = os.path.dirname(os.path.abspath(output_tex_path))
    os.makedirs(out_dir, exist_ok=True)

    # 3. Copy logo
    logo_src = next((p for p in _LOGO_CANDIDATES if os.path.exists(p)), None)
    logo_filename = "logo.png"
    if logo_src:
        logo_dst = os.path.join(out_dir, logo_filename)
        if not os.path.exists(logo_dst):
            shutil.copy2(logo_src, logo_dst)
    else:
        # Create a minimal placeholder so LaTeX doesn't error
        logo_filename = ""  # will skip includegraphics

    # 4. Generate .tex content
    tex_content = generate_tex_content(analysis, course_title, validation, logo_filename)

    # 5. Write .tex
    with open(output_tex_path, "w", encoding="utf-8") as f:
        f.write(tex_content)

    # 6. Compile to PDF
    pdf_path: Optional[str] = None
    if compile_pdf:
        compiler = _find_latex_compiler()
        if compiler:
            tex_name = os.path.basename(output_tex_path)
            try:
                for _ in range(2):  # two passes for cross-references
                    subprocess.run(
                        [compiler,
                         "-interaction=nonstopmode",
                         "-halt-on-error",
                         "-output-directory", out_dir,
                         tex_name],
                        cwd=out_dir,
                        capture_output=True,
                        text=True,
                        timeout=120,
                    )
                expected_pdf = output_tex_path.replace(".tex", ".pdf")
                if os.path.exists(expected_pdf) and os.path.getsize(expected_pdf) > 0:
                    pdf_path = expected_pdf
                    # Clean auxiliary files
                    for ext in [".aux", ".log", ".out", ".toc"]:
                        aux = output_tex_path.replace(".tex", ext)
                        if os.path.exists(aux):
                            try:
                                os.remove(aux)
                            except OSError:
                                pass
            except Exception:
                pass  # Return .tex if compilation fails

    return output_tex_path, pdf_path, validation
