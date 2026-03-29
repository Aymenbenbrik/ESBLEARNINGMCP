import os
import re
import json
import random
from datetime import datetime
from PyPDF2 import PdfReader
from docx import Document as DocxDocument
from flask import current_app
from flask import current_app

import logging
from app.models import Syllabus  # Import at top for consistency


logger = logging.getLogger(__name__)

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, SystemMessage

def _get_gemini_model():
    api_key = current_app.config.get("GOOGLE_API_KEY")
    model = current_app.config.get("GEMINI_MODEL")
    if not api_key:
        logger.error("Google API key is not configured")
        raise ValueError("Google API key is not configured")
    if not model:
        logger.error("GEMINI_MODEL is not configured")
        raise ValueError("GEMINI_MODEL is not configured")
    
    return ChatGoogleGenerativeAI(
        model=model,
        google_api_key=api_key,
        temperature=0.2
    )

def extract_text_from_file(filepath):
    if not os.path.exists(filepath):
        logger.error(f"File not found: {filepath}")
        return None
    ext = os.path.splitext(filepath)[1].lower()
    try:
        if ext == '.pdf':
            reader = PdfReader(filepath)
            text = ''
            for page in reader.pages:
                page_text = page.extract_text()
                if page_text:
                    text += page_text + '\n'
            return text.strip()
        elif ext in ['.doc', '.docx']:
            doc = DocxDocument(filepath)
            text = '\n'.join([para.text for para in doc.paragraphs])
            return text.strip()
        else:
            logger.warning(f"Unsupported file extension for extraction: {ext}")
            return None
    except Exception as e:
        logger.error(f"Error extracting text from file {filepath}: {e}")
        return None

def _extract_json_array(text):
    matches = re.findall(r"\[\s*\{.*?\}\s*\]", text, re.DOTALL)
    if not matches:
        return []
    candidate = matches[0]
    candidate = candidate.replace("{{", "{").replace("}}", "}")
    candidate = re.sub(r",\s*\]", "]", candidate)
    candidate = re.sub(r",\s*}", "}", candidate)
    try:
        return json.loads(candidate)
    except json.JSONDecodeError:
        return []

# Type normalization map (English/mixed -> French)
_QTYPE_NORMALIZE = {
    'mcq': 'QCM',
    'multiple choice': 'QCM',
    'multiple_choice': 'QCM',
    'qcm': 'QCM',
    'true/false': 'Vrai/Faux',
    'true_false': 'Vrai/Faux',
    'vrai/faux': 'Vrai/Faux',
    'vrai_faux': 'Vrai/Faux',
    'short answer': 'Ouvert',
    'short_answer': 'Ouvert',
    'open': 'Ouvert',
    'ouvert': 'Ouvert',
    'essay': 'Rédactionnel',
    'redactionnel': 'Rédactionnel',
    'rédactionnel': 'Rédactionnel',
    'calculation': 'Calcul',
    'numerical': 'Calcul',
    'calcul': 'Calcul',
    'practical': 'Pratique',
    'pratique': 'Pratique',
    'case study': 'Étude de cas',
    'case_study': 'Étude de cas',
    'étude de cas': 'Étude de cas',
    'etude de cas': 'Étude de cas',
}


def _normalize_question_type(raw_type: str) -> str:
    """Normalize question type to standard French label."""
    if not raw_type:
        return ''
    lower = raw_type.strip().lower()
    return _QTYPE_NORMALIZE.get(lower, raw_type.strip())


def extract_questions_from_text(exam_text: str, latex_source: str = '') -> list:
    latex_hint = ""
    if latex_source and latex_source.strip():
        latex_hint = f"""
Utilise également le source LaTeX suivant pour améliorer l'extraction (numérotation, formules exactes):
--- SOURCE LATEX ---
{latex_source[:5000]}
--- FIN SOURCE LATEX ---
"""
    prompt = f"""Tu es un expert en extraction de questions d'examen universitaire en français.

Extrais TOUTES les questions du texte d'examen ci-dessous.
{latex_hint}

RÈGLES OBLIGATOIRES:
1. Préserve les formules mathématiques EXACTEMENT (ex: $x^2$, $\\alpha + \\beta$, $$\\int_0^1 f(x)\\,dx$$)
2. Si une figure/tableau est mentionné(e), inclus une référence explicite [Figure N] ou [Tableau N] dans le texte
3. Pour les QCM, inclus les choix (A, B, C, D) dans le texte de la question
4. Détermine le type: QCM, Ouvert, Calcul, Vrai/Faux, Pratique, Étude de cas, Rédactionnel
5. Préserve la numérotation originale des questions

Retourne UNIQUEMENT un JSON array valide (pas d'autre texte):
[
  {{
    "question_number": 1,
    "question_text": "Texte COMPLET de la question avec formules LaTeX préservées",
    "type": "Calcul"
  }},
  {{
    "question_number": 2,
    "question_text": "Question avec choix:\\nA) option 1\\nB) option 2\\nC) option 3\\nD) option 4",
    "type": "QCM"
  }}
]

Texte de l'examen:
{exam_text}
"""
    llm = _get_gemini_model()
    messages = [
        SystemMessage(content="Tu es un expert en extraction de questions d'examen. Préserve exactement les formules mathématiques LaTeX."),
        HumanMessage(content=prompt)
    ]
    try:
        completion = llm.invoke(messages)
        output_text = completion.content
        data = _extract_json_array(output_text)
    except Exception as e:
        logger.error(f"Error extracting questions: {e}")
        data = []
    questions = []
    seen = set()
    idx = 1
    for q in data:
        qtext = (q.get("question_text") or q.get("text") or "").strip()
        qtype = _normalize_question_type(q.get("type") or q.get("question_type") or "")
        if qtext and qtext not in seen:
            questions.append({
                "Question#": idx,
                "Text": qtext,
                "Type": qtype,
            })
            seen.add(qtext)
            idx += 1
    return questions


def _extract_json_object(text):
    """
    Extract JSON object from LLM response (handles extra text like "Voici le JSON: {...}").
    Returns dict or raises ValueError if invalid.
    """
    # Find JSON block using regex (matches { ... } with balanced braces)
    json_match = re.search(r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}', text, re.DOTALL)
    if not json_match:
        raise ValueError("No JSON object found in response")
    
    json_str = json_match.group(0)
    try:
        return json.loads(json_str)
    except json.JSONDecodeError as e:
        raise ValueError(f"Invalid JSON in response: {e}")
    

def classify_questions_clo(questions: list, clo_data: list) -> list:
    clo_text = "\n".join([f'CLO#{c["CLO#"]}: {c["CLO Description"]}' for c in clo_data])
    questions_text = "\n".join([f'{q["Question#"]}: {q["Text"]}' for q in questions])

    prompt = f"""
[INST]
Tu es un assistant intelligent qui classe des questions d'examen dans des CLOs (Course Learning Outcomes) en fonction de leur sens et relation conceptuelle, pas seulement par mots-clés.
IMPORTANT: Pour chaque question, analyse en profondeur le sens global et le contexte, pas seulement les mots-clés. Essaie d’extraire la signification implicite de la question, y compris les concepts sous-jacents et les réponses possibles attendues. Utilise cette compréhension pour déterminer les CLOs les plus pertinents. Cela permettra une classification plus précise et cohérente.

Voici la liste des CLOs disponibles :

{clo_text}

Voici la liste des questions à classer :

{questions_text}

Pour chaque question, indique uniquement :
- "Question#" : le numéro de la question
- "QuestionText" : le texte complet de la question
- "CLO#" : le ou les numéros des CLOs correspondants (sous forme de liste si plusieurs), ou "None" si aucun CLO ne correspond
- "CLODescription" : la ou les descriptions complètes des CLOs correspondants (liste dans le même ordre), ou "None"

Règles IMPORTANTES :
1. Chaque question doit être associée à AU MOINS UN CLO parmi la liste.
2. Cherche la correspondance la plus pertinente en analysant le sens global de la question et des CLOs, pas seulement les mots-clés.
3. Si une question correspond à plusieurs CLOs, retourne-les tous sous forme de liste.
4. Utilise "None" uniquement si vraiment aucun CLO ne correspond.
5. Sois précis et cohérent dans l'association.

Exemple de sortie JSON valide :

[
  {{
    "Question#": 1,
    "QuestionText": "Quelle est la différence entre une couche RNN et une couche LSTM ?",
    "CLO#": [4, 6],
    "CLODescription": [
      "Implement RNNs and transformers for sequence modeling tasks, such as NLP applications.",
      "Analyse algorithm efficiency and compare different approaches."
    ]
  }},
  {{
    "Question#": 2,
    "QuestionText": "Expliquez le concept de normalisation dans les réseaux de neurones.",
    "CLO#": 3,
    "CLODescription": "Apply normalization techniques to improve model training."
  }}
]

Retourne uniquement un JSON array valide, sans autre texte.
[/INST]
"""
    try:
        llm = _get_gemini_model()
        llm.temperature = 0  # Force deterministic
        
        # Need to parse instructions specifically for the prompt structure
        messages = [
             HumanMessage(content=prompt)
        ]
        
        response = llm.invoke(messages).content
    except Exception as e:
        logger.error(f"Error calling Gemini: {e}")
        return []
    classified = _extract_json_array(response)
    return classified


def classify_questions_bloom(questions: list) -> list:
    """Classify all questions' Bloom level in a SINGLE LLM call (batch mode for speed)."""
    bloom_levels = ["Mémoriser", "Comprendre", "Appliquer", "Analyser", "Évaluer", "Créer"]
    bloom_descriptions = {
        "Mémoriser": "Se souvenir ou rappeler des faits et concepts.",
        "Comprendre": "Expliquer, reformuler ou interpréter des idées.",
        "Appliquer": "Utiliser des connaissances dans des contextes pratiques.",
        "Analyser": "Identifier des relations ou différencier des parties d'un problème.",
        "Évaluer": "Jugement critique ou justification d'un choix.",
        "Créer": "Produire ou combiner des idées pour générer quelque chose de nouveau."
    }

    if not questions:
        return questions

    llm = _get_gemini_model()

    questions_text = "\n".join([
        f"Q{q.get('Question#', i+1)}: {(q.get('Text') or '')[:200]}"
        for i, q in enumerate(questions)
    ])

    prompt = f"""
[INST]
Classe chaque question d'examen selon la taxonomie de Bloom révisée.

Niveaux disponibles (retourne EXACTEMENT l'un d'eux):
1. Mémoriser   — rappel de faits, définitions, formules
2. Comprendre  — expliquer, reformuler, interpréter
3. Appliquer   — utiliser une méthode dans un nouveau contexte
4. Analyser    — décomposer, comparer, identifier des relations
5. Évaluer     — juger, justifier, critiquer
6. Créer       — concevoir, produire, combiner pour créer quelque chose de nouveau

Questions à classifier:
{questions_text}

Retourne UNIQUEMENT un JSON array:
[
  {{"Question#": 1, "Bloom_Level": "Appliquer"}},
  {{"Question#": 2, "Bloom_Level": "Mémoriser"}}
]
[/INST]
"""
    try:
        response = llm.invoke([HumanMessage(content=prompt)]).content
        arr = _extract_json_array(response) or []
        by_q = {int(item.get("Question#", 0)): item.get("Bloom_Level", "Comprendre") for item in arr}
    except Exception as e:
        logger.error(f"Error batch-classifying Bloom: {e}")
        by_q = {}

    classified_questions = []
    for q in questions:
        qnum = int(q.get("Question#", 0))
        raw_level = by_q.get(qnum, "Comprendre")
        bloom_level = "Comprendre"
        for level in bloom_levels:
            if level.lower() in (raw_level or "").lower():
                bloom_level = level
                break
        q["Bloom_Level"] = bloom_level
        q["Bloom_Description"] = bloom_descriptions.get(bloom_level, "")
        classified_questions.append(q)
    return classified_questions
def normalize_question_keys(q):
    """
    Normalize question dict keys to a consistent format:
    - 'Question#' (int or str)
    - 'Text' (str)
    - 'Type' (optional)
    - 'CLO#' (optional)
    - 'CLODescription' (optional)
    - 'Bloom_Level' (optional)
    - 'Bloom_Description' (optional)
    """
    text = q.get("Text") or q.get("question_text") or q.get("QuestionText") or ""
    qnum = q.get("Question#") or q.get("question_number") or None
    qtype = _normalize_question_type(q.get("Type") or q.get("type") or "")
    clo = q.get("CLO#") or q.get("clo#") or None
    clo_desc = q.get("CLODescription") or q.get("clo_description") or None
    bloom_level = q.get("Bloom_Level") or q.get("bloom_level") or None
    bloom_desc = q.get("Bloom_Description") or q.get("bloom_description") or None

    return {
        "Question#": qnum,
        "Text": text.strip() if text else "",
        "Type": qtype,
        "CLO#": clo,
        "CLODescription": clo_desc,
        "Bloom_Level": bloom_level,
        "Bloom_Description": bloom_desc
    }

def generate_report_narrative(clo_data, clo_percentages, bloom_percentages, taught_clos, exam_clos, objectives_summary, total_questions, questions_sample, week_num, course_title="Cours de Machine Learning"):
    """
    LLM call to generate argumentative narratives and recommendations (with current week & structured recs).
    FIXED: Enforce 'recommendations' as flat multi-line string (no nested dict/JSON).
    """
    # Prepare inputs (str-safe CLOs)
    taught_clos_list = [int(c) if isinstance(c, str) else c for c in taught_clos]
    taught_clos_str = ', '.join(str(c) for c in sorted(taught_clos_list))
    exam_clos_list = [int(c) if isinstance(c, str) else c for c in exam_clos]
    exam_clos_str = ', '.join(str(c) for c in sorted(exam_clos_list))
    clo_gaps = list(set(exam_clos_list) - set(taught_clos_list))
    clo_missing = list(set(taught_clos_list) - set(exam_clos_list))
    objectives_str = ' ; '.join(objectives_summary)
    
    low_pct = sum(bloom_percentages.get(l, 0) for l in ['Mémoriser', 'Comprendre'])
    med_pct = sum(bloom_percentages.get(l, 0) for l in ['Appliquer', 'Analyser'])
    high_pct = sum(bloom_percentages.get(l, 0) for l in ['Évaluer', 'Créer'])
    
    sample_questions = '\n'.join([f"{q['Question#']}: {q['Text'][:100]}..." for q in questions_sample[:2]])
    
    # FIXED: Prompt - Enforce flat string for recommendations (multi-line with \n)
    prompt = f"""
Tu es un expert en analyse pédagogique pour examens de {course_title}. Génère un rapport argumenté en français (150-250 mots par section) sur l'analyse d'un examen de semaine {week_num}, en considérant les CLOs cumulatifs jusqu'à la semaine {week_num} incluse.

Données d'entrée :
- Objectifs cumulatifs semaines 1-{week_num} (incluse) : {objectives_str}
- CLOs enseignés jusqu'à semaine {week_num} incluse : {taught_clos_str}
- CLOs couverts dans l'examen (sur {total_questions} questions) : {exam_clos_str} (répartition : {clo_percentages})
- CLOs couverts mais non enseignés (risque prématurité) : {', '.join(map(str, sorted(clo_gaps)))}
- CLOs enseignés mais absents (lacunes) : {', '.join(map(str, sorted(clo_missing)))}
- Répartition Bloom (tous niveaux, même 0%) : {bloom_percentages} (Faible: {low_pct}%, Moyenne: {med_pct}%, Élevée: {high_pct}%)
- Exemples de questions : {sample_questions}
- CLOs disponibles : {json.dumps(clo_data)[:500]}

Structure la sortie comme un JSON :
{{
  "objectives_summary": "Résumé détaillé (1-2 paragraphes) des objectifs et CLOs cumulatifs jusqu'à semaine {week_num} incluse, en reliant à {course_title}. Explique l'évolution pédagogique incluant la semaine actuelle.",
  "clo_narrative": "Analyse approfondie de la couverture CLO (200 mots) : alignement jusqu'à semaine {week_num} (forces e.g., CLO2 36% bien couvert), gaps/impacts (e.g., CLO4 manquant risque lacunes en CNN), suggestions brèves.",
  "bloom_narrative": "Analyse Bloom et difficulté (200 mots) : distribution complète (tous niveaux même 0%), équilibre (e.g., 0% Créer limite innovation), implications, suggestions par niveau (mentionnez <10% spécifiquement).",
  "recommendations": "FIXED: Chaîne de texte unique multi-ligne (utilise \\n pour sauts de ligne) de 7-10 recommandations actionnables, groupées par catégorie : commence par **CLO:** puis bullets - pour recs CLO, \\n\\n**Bloom:** puis bullets, \\n\\n**Difficulté:** puis bullets. Exemples : '**CLO:**\\n- Pour gaps CLO4, ajoutez 2 questions sur CNN...\\n- ...\\n\\n**Bloom:**\\n- Pour Créer 0%, intégrez conception...\\n- ...'. PAS un objet JSON imbriqué – tout en une chaîne plate pour parsing facile. Personnalisez à {course_title} (ANN/CNN/RNN)."
}}

Retourne UNIQUEMENT ce JSON valide, sans texte supplémentaire.
"""
    
    estimated_tokens = len(prompt) // 4 + 1500
    print(f"DEBUG LLM: Estimated tokens: {estimated_tokens}. Calling Gemini...")
    
    estimated_tokens = len(prompt) // 4 + 1500
    print(f"DEBUG LLM: Estimated tokens: {estimated_tokens}. Calling Gemini...")
    
    try:
        llm = _get_gemini_model()
        llm.temperature = 0.3
        
        response = llm.invoke([HumanMessage(content=prompt)]).content
        print(f"DEBUG LLM: Response received (length: {len(response)} chars)")
        
        narrative_data = _extract_json_object(response)
        
        # FIXED: Ensure 'recommendations' is str (convert if dict)
        if isinstance(narrative_data.get('recommendations'), dict):
            narrative_data['recommendations'] = json.dumps(narrative_data['recommendations'], indent=2, ensure_ascii=False)
            logger.warning("Converted nested recommendations dict to string")
        
        logger.info("LLM narrative generated and parsed successfully")
        return narrative_data
        
    except Exception as e:
        logger.error(f"LLM call failed: {e}")
        print(f"DEBUG LLM: Falling back to enhanced narrative due to: {e}")
    
    # ENHANCED FALLBACK (str-safe)
    alignment = len(set(exam_clos_list).intersection(set(taught_clos_list)))
    total_taught = len(taught_clos_list)
    gaps_str = ', '.join(map(str, sorted(clo_gaps))) if clo_gaps else "Aucun"
    missing_str = ', '.join(map(str, sorted(clo_missing))) if clo_missing else "Aucun"
    low_levels_str = ', '.join([l for l, p in bloom_percentages.items() if p < 10 and p > 0]) or "Créer (0%)"
    clean_objectives = ' ; '.join(objectives_summary) if objectives_summary else "Objectifs non définis."
    
    recs_clo = f"- Pour gaps {gaps_str}: Ajoutez 2-3 questions post-semaine {week_num} ; ex. 'Appliquez CLO4 (CNN) dans un cas {course_title} sans prérequis avancés.'\n- Pour manquants {missing_str}: Intégrez dans prochain examen ; ex. 'Évaluez CLO5 (biais/variance) avec dataset réel.'\n- Équilibrez % : Si CLO2 dominant, diversifiez vers CLO3."
    recs_bloom = f"- Pour Créer 0%: Ajoutez questions de conception ; ex. 'Concevez un RNN simple pour séquences en {course_title}, justifiez hyperparamètres.'\n- Pour niveaux <10% ({low_levels_str}): Boostez avec essais ouverts ; ex. 'Évaluez limites ANN vs classiques.'\n- Tous niveaux affichés (même 0%) pour complétude – visez équilibre 20% par tier."
    recs_diff = f"- Réduisez Faible ({low_pct}%) : Remplacez Mémoriser par Analyser ; ex. 'Analysez pourquoi un modèle sur-apprend en {course_title}.'\n- Augmentez Élevée ({high_pct}%) : Intégrez Évaluer/Créer ; ex. 'Critiquez un CNN pour votre étude de cas.'\n- Testez Moyenne ({med_pct}%) : Vérifiez via pilote avec {total_questions} questions."
    
    return {
        "objectives_summary": f"Pour {course_title} (semaines 1-{week_num} incluse): Objectifs cumulatifs couvrent {len(objectives_summary)} thèmes, des bases (CLO1) aux avancés (CLO{total_taught} en semaine {week_num}). Évolution : 1-3 théorique ({low_pct}% Bloom faible), 4-{week_num} pratique ({med_pct}% analyse). Alignement : {alignment}/{total_taught} CLOs couverts jusqu'à maintenant. {clean_objectives[:300]}...",
        "clo_narrative": f"Analyse CLO examen semaine {week_num} ({total_questions} questions), cumulatif jusqu'à semaine {week_num} incluse : {alignment}/{total_taught} alignés (forces : CLO2 propagation ; CLOs enseignés {taught_clos_str}). Faiblesses : {len(clo_gaps)} non enseignés couverts ({gaps_str} – risque confusion si prématuré). {len(clo_missing)} absents ({missing_str} – lacunes). Suggestion : Visez 90%+ ; ajustez syllabus semaine {week_num} pour équilibre.",
        "bloom_narrative": f"Taxonomie Bloom (tous niveaux affichés, même 0%) : {bloom_percentages} (Faible {low_pct}% : bases solides ; Moyenne {med_pct}% : bonne ; Élevée {high_pct}% : limitée). Équilibre ok mi-semestre, mais {len([p for p in bloom_percentages.values() if p < 10])} <10% ({low_levels_str} – e.g., Créer 0% freine innovation en {course_title}). Implications : Fort en rappel, faible synthèse. Suggestion : Diversifiez ; ajoutez 20% Élevée pour profondeur.",
        "recommendations": f"**Recommandations CLO:**\n{recs_clo}\n\n**Recommandations Bloom:**\n{recs_bloom}\n\n**Recommandations Difficulté:**\n{recs_diff}\n- Suivi global : Réanalysez post-ajustements ; pilotez avec étudiants pour valider jusqu'à semaine {week_num}."
    }



import logging
from app.models import Syllabus  # Ensure this import; add if missing
from typing import List, Dict, Set, Any

logger = logging.getLogger(__name__)

def analyze_exam_content(extracted_text: str, course_id: int = None, week_num: int = None, taught_clos: List[int] = None, objectives_summary: List[str] = None, course_title: str = "Cours de Machine Learning") -> Dict[str, Any]:
    if not extracted_text:
        return {'error': 'No text to analyze'}

    # Fetch CLO data from syllabus DB for course_id
    syllabus = Syllabus.query.filter_by(course_id=course_id).first()
    clo_data = syllabus.clo_data if syllabus and syllabus.clo_data else []  # Global CLOs, e.g., [1,2,3,4,5,6]

    # FIXED: Build taught_clos and objectives_summary dynamically if not provided (handle list or dict format)
    if taught_clos is None or objectives_summary is None:
        taught_clos_set: Set[int] = set()
        objectives_list: List[str] = []
        
        if hasattr(syllabus, 'weekly_plan') and syllabus.weekly_plan and week_num:
            weekly_plan = syllabus.weekly_plan
            logger.debug(f"weekly_plan type: {type(weekly_plan)}")
            
            if isinstance(weekly_plan, list):
                # FIXED: Handle list format [{'Week#':1, 'Related CLOs':[1], 'Class Objectives':'...'}, ...]
                logger.debug(f"weekly_plan sample: {weekly_plan[:2]}")  # Log sample
                for item in weekly_plan:
                    week_num_item = item.get('Week#')
                    if isinstance(week_num_item, int) and 1 <= week_num_item <= week_num:
                        # Add CLOs (union)
                        week_clos = set(item.get('Related CLOs', []))
                        taught_clos_set.update(week_clos)
                        
                        # Build objective string (use 'Class Objectives' or 'Topic' + objectives)
                        objectives = item.get('Class Objectives', '')
                        topic = item.get('Topic', '')
                        obj_str = f"{topic} - {objectives}".strip(' -') if topic and objectives else (objectives or topic or f"Objectifs semaine {week_num_item}")
                        objectives_list.append(f"Semaine {week_num_item}: {obj_str}")
                
                logger.debug(f"Parsed from list up to week {week_num}: taught_clos {sorted(taught_clos_set)}, objectives count: {len(objectives_list)}")
                
            elif isinstance(weekly_plan, dict):
                # Original dict format {"1": {...}, ...}
                logger.debug(f"weekly_plan dict keys: {list(weekly_plan.keys())}")
                for w in range(1, week_num + 1):
                    week_data = weekly_plan.get(str(w), {})
                    week_clos = set(week_data.get('CLOs', []))  # Assuming 'CLOs' key in dict
                    taught_clos_set.update(week_clos)
                    objectives = week_data.get('objectives', f"Objectifs semaine {w}")
                    objectives_list.append(f"Semaine {w}: {objectives}")
                
                logger.debug(f"Parsed from dict up to week {week_num}: taught_clos {sorted(taught_clos_set)}")
            
            else:
                logger.warning(f"Unexpected weekly_plan type: {type(weekly_plan)}")
                weekly_plan = None
        
        if not taught_clos_set or not objectives_list:  # Fallback if empty or no plan
            # Progressive fallback using global clo_data (e.g., CLO1 for week1, up to week_num)
            max_clo = min(len(clo_data), week_num) if clo_data else week_num
            taught_clos_set = set(range(1, max_clo + 1))
            objectives_list = [f"Semaine {w}: Introduction aux concepts CLO{w} ({course_title})." for w in range(1, week_num + 1)]
            logger.warning(f"Applied fallback - taught_clos: {sorted(taught_clos_set)}, objectives count: {len(objectives_list)}")
        
        taught_clos = list(taught_clos_set)
        objectives_summary = objectives_list
        logger.info(f"Final taught CLOs up to week {week_num} (inclusive): {sorted(taught_clos)}")
        logger.debug(f"Objectives summary (first 2): {objectives_summary[:2]}")

    # Step 1: Extract questions
    questions_raw = extract_questions_from_text(extracted_text)
    questions = [normalize_question_keys(q) for q in questions_raw]

    # Step 2: Classify CLO
    clo_classified_raw = classify_questions_clo(questions, clo_data)
    clo_classified = [normalize_question_keys(q) for q in clo_classified_raw]

    # Step 3: Classify Bloom
    bloom_classified = classify_questions_bloom(clo_classified)

    # Step 4: Calculate CLO distribution counts
    clo_counts = {}
    exam_clos = set()  # Collect unique exam CLOs
    for q in bloom_classified:
        clos = q.get("CLO#")
        if isinstance(clos, list):
            for c in clos:
                clo_counts[c] = clo_counts.get(c, 0) + 1
                exam_clos.add(str(c))
        elif clos:
            clo_counts[clos] = clo_counts.get(clos, 0) + 1
            exam_clos.add(str(clos))

    total_questions = len(bloom_classified)
    clo_percentages = {str(k): round((v / total_questions) * 100, 1) for k, v in clo_counts.items()}  # Normalize to str keys

    # Step 5: Calculate Bloom distribution counts (ensures all levels possible, even if 0%)
    bloom_levels = ['Mémoriser', 'Comprendre', 'Appliquer', 'Analyser', 'Évaluer', 'Créer']
    bloom_counts = {level: 0 for level in bloom_levels}  # FIXED: Initialize all to 0 for full coverage
    for q in bloom_classified:
        level = q.get("Bloom_Level", "Unknown")
        if level in bloom_counts:
            bloom_counts[level] += 1
    bloom_percentages = {k: round((v / total_questions) * 100, 1) if total_questions > 0 else 0 for k, v in bloom_counts.items()}

    # Compute gaps and difficulty (use provided or built taught_clos)
    taught_clos_set = {str(c) for c in taught_clos}  # Ensure strings
    exam_clos_set = exam_clos  # Already strings
    clo_not_taught = list(exam_clos_set - taught_clos_set)  # Covered but not taught (fewer with current week)
    clo_missing = list(taught_clos_set - exam_clos_set)     # Taught but missing

    # Difficulty buckets
    low_levels = ['Mémoriser', 'Comprendre']
    med_levels = ['Appliquer', 'Analyser']
    high_levels = ['Évaluer', 'Créer']
    low_pct = sum(bloom_percentages.get(l, 0) for l in low_levels)
    med_pct = sum(bloom_percentages.get(l, 0) for l in med_levels)
    high_pct = sum(bloom_percentages.get(l, 0) for l in high_levels)

    # Generate LLM narratives (pass week_num for current week context)
    questions_sample = bloom_classified[:3]  # Sample for LLM context
    narratives = generate_report_narrative(
        clo_data, clo_percentages, bloom_percentages, taught_clos, exam_clos_set,
        objectives_summary, total_questions, questions_sample, week_num,  # Pass week_num
        course_title=course_title
    )

    return {
        "questions_classified": bloom_classified,
        "clo_percentages": clo_percentages,
        "bloom_percentages": bloom_percentages,  # Now includes all 6 levels (even 0%)
        "total_questions": total_questions,
        # Gaps and difficulty
        "taught_clos": taught_clos,  # List of ints
        "exam_clos": list(exam_clos_set),  # List of str
        "clo_not_taught": clo_not_taught,  # List of str
        "clo_missing": clo_missing,  # List of str
        "bloom_low_pct": low_pct,
        "bloom_med_pct": med_pct,
        "bloom_high_pct": high_pct,
        # LLM narratives
        "objectives_summary": narratives.get("objectives_summary", ""),  # Now clean, from real data
        "clo_narrative": narratives.get("clo_narrative", ""),
        "bloom_narrative": narratives.get("bloom_narrative", ""),
        "recommendations": narratives.get("recommendations", "")
    }


from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.colors import HexColor
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.units import cm
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

def generate_exam_analysis_pdf(course, week_num, exam_document, analysis_results, week_data, output_path):
    doc = SimpleDocTemplate(output_path, pagesize=A4,
                            rightMargin=1.5*cm, leftMargin=1.5*cm,
                            topMargin=2*cm, bottomMargin=2*cm)
    styles = getSampleStyleSheet()
    styleH1 = ParagraphStyle('CustomH1', parent=styles['Heading1'], fontSize=18, spaceAfter=20, alignment=1, textColor=HexColor('#dc3545'))
    styleH2 = ParagraphStyle('CustomH2', parent=styles['Heading2'], fontSize=14, spaceAfter=12, fontName='Helvetica-Bold', textColor=HexColor('#495057'))
    styleH3 = ParagraphStyle('CustomH3', parent=styles['Heading3'], fontSize=12, spaceAfter=8, fontName='Helvetica-Bold', textColor=HexColor('#6c757d'))
    styleNormal = styles['Normal']
    styleHighlight = ParagraphStyle('Highlight', parent=styleNormal, textColor=HexColor('#dc3545'), backColor=HexColor('#fff3cd'), spaceAfter=12, fontSize=10)
    styleBold = ParagraphStyle('Bold', parent=styleNormal, fontSize=10, fontName='Helvetica-Bold', spaceAfter=6)
    styleItalic = ParagraphStyle('Italic', parent=styleNormal, fontSize=10, fontName='Helvetica-Oblique', spaceAfter=6, textColor=HexColor('#6c757d'))

    elements = []

    # HEADER
    elements.append(Paragraph("Analyse Détaillée de l'Examen", styleH1))
    elements.append(Paragraph(f"{course.title} - Semaine {week_num} | Généré le {datetime.now().strftime('%d/%m/%Y %H:%M')}", styleH2))
    elements.append(Spacer(1, 20))

    # Section 1 - Objectives
    elements.append(Paragraph("1. Contexte Pédagogique et Objectifs", styleH2))
    objectives_text = analysis_results.get('objectives_summary', 'Objectifs non disponibles – vérifiez le syllabus.')
    elements.append(Paragraph(objectives_text, styleItalic))
    elements.append(Spacer(1, 12))

    # Section 2: CLO
    elements.append(Paragraph("2. Analyse de la Couverture des CLOs", styleH2))
    clo_narrative = analysis_results.get('clo_narrative', 'Analyse non disponible.')
    elements.append(Paragraph(clo_narrative, styleBold))
    elements.append(Spacer(1, 8))

    # CLO Table (Row backgrounds for status)
    clo_percentages = {str(k): v for k, v in analysis_results.get('clo_percentages', {}).items()}
    elements.append(Paragraph("Répartition des CLOs", styleH3))
    if clo_percentages:
        data = [["CLO", "Pourcentage (%)", "Statut"]]
        taught_clos = set(str(c) for c in analysis_results.get('taught_clos', []))
        row_colors = []  # Green for Enseigné, red for Non
        for clo, pct in sorted(clo_percentages.items(), key=lambda x: int(x[0])):
            status = "Enseigné" if clo in taught_clos else "Non enseigné"
            row_colors.append(HexColor('#d4edda') if status == "Enseigné" else HexColor('#f8d7da'))  # Visual cue
            data.append([f"CLO{clo}", f"{pct}%", status])
        
        num_rows = len(data) - 1
        print(f"DEBUG PDF: CLO table - {num_rows} data rows, {len(row_colors)} row colors")  # Debug
        
        t = Table(data, hAlign='LEFT', rowHeights=20)
        t.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), HexColor('#dc3545')),
            ('TEXTCOLOR', (0,0), (-1,0), (1,1,1)),  # White tuple (static)
            ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
            ('FONTSIZE', (0,0), (-1,-1), 9),
            ('GRID', (0,0), (-1,-1), 1, (0,0,0)),  # Black tuple (static)
            ('ALIGN', (1,1), (1,-1), 'RIGHT'),
            ('ROWBACKGROUNDS', (0,1), (-1,-1), row_colors),  # Only backgrounds (safe)
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ]))
        elements.append(t)

    # Gaps Tables (Static colors)
    clo_not_taught = [str(c) for c in analysis_results.get('clo_not_taught', [])]
    if clo_not_taught:
        elements.append(Spacer(1, 8))
        elements.append(Paragraph("🚨 CLOs Couverts mais Non Enseignés (Risque de Prématurité)", styleHighlight))
        gap_data = [["CLO", "Pourcentage (%)"]]
        for clo in sorted(clo_not_taught, key=lambda x: int(x)):
            gap_data.append([f"CLO{clo}", f"{clo_percentages.get(clo, 0)}%"])
        gt = Table(gap_data, hAlign='LEFT', rowHeights=18)
        gt.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), HexColor('#f8d7da')),
            ('TEXTCOLOR', (0,0), (-1,0), (0.86, 0.21, 0.21)),  # Static red tuple
            ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
            ('FONTSIZE', (0,0), (-1,-1), 9),
            ('GRID', (0,0), (-1,-1), 0.8, (0.86, 0.21, 0.21)),  # Static red border
            ('ALIGN', (1,1), (1,-1), 'RIGHT'),
            ('ROWBACKGROUNDS', (0,1), (-1,-1), [HexColor('#fdf2f2')] * len(gap_data[1:])),
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ]))
        elements.append(gt)

    clo_missing = [str(c) for c in analysis_results.get('clo_missing', [])]
    if clo_missing:
        elements.append(Spacer(1, 8))
        elements.append(Paragraph("⚠️ CLOs Enseignés mais Absents (Lacunes à Combler)", styleHighlight))
        missing_data = [["CLO", "Couvert ?"]]
        for clo in sorted(clo_missing, key=lambda x: int(x)):
            missing_data.append([f"CLO{clo}", "Non"])
        mt = Table(missing_data, hAlign='LEFT', rowHeights=18)
        mt.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), HexColor('#fff3cd')),
            ('TEXTCOLOR', (0,0), (-1,0), (0.53, 0.40, 0.02)),  # Static dark yellow tuple
            ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
            ('FONTSIZE', (0,0), (-1,-1), 9),
            ('GRID', (0,0), (-1,-1), 0.8, (1.0, 0.81, 0.07)),  # Static yellow border tuple
            ('ROWBACKGROUNDS', (0,1), (-1,-1), [HexColor('#fff8dc')] * len(missing_data[1:])),
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ]))
        elements.append(mt)
    elements.append(Spacer(1, 12))

    # Section 3: Bloom (Always 6 rows, even 0%)
    elements.append(Paragraph("3. Analyse de la Taxonomie de Bloom et Difficulté", styleH2))
    bloom_narrative = analysis_results.get('bloom_narrative', 'Analyse non disponible.')
    elements.append(Paragraph(bloom_narrative, styleBold))
    elements.append(Spacer(1, 8))

    bloom_percentages = analysis_results.get('bloom_percentages', {})
    elements.append(Paragraph("Répartition par Niveau de Bloom", styleH3))
    data = [["Niveau", "Pourcentage (%)", "Difficulté"]]  # Always show full table
    bloom_order = ['Mémoriser', 'Comprendre', 'Appliquer', 'Analyser', 'Évaluer', 'Créer']
    row_colors = []
    for level in bloom_order:
        pct = bloom_percentages.get(level, 0)
        diff = "Faible" if level in ['Mémoriser', 'Comprendre'] else ("Moyenne" if level in ['Appliquer', 'Analyser'] else "Élevée")
        row_color = HexColor('#d1ecf1') if diff == "Faible" else (HexColor('#d4edda') if diff == "Moyenne" else HexColor('#f8d7da'))
        if pct < 10:
            row_color = HexColor('#f8d7da')  # Red row for low % (visual cue, even 0%)
        data.append([level, f"{pct}%", diff])
        row_colors.append(row_color)
    
    # FIXED: Always 6 rows for Bloom
    if len(row_colors) != 6:
        row_colors = [HexColor('#ffffff')] * 6  # Fallback white
    print(f"DEBUG PDF: Bloom table - 6 data rows, {len(row_colors)} row colors")  # Debug
    
    t = Table(data, colWidths=[5*cm, 3*cm, 3*cm], hAlign='LEFT', rowHeights=20)
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), HexColor('#17a2b8')),
        ('TEXTCOLOR', (0,0), (-1,0), (1,1,1)),  # White tuple (static)
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTSIZE', (0,0), (-1,-1), 9),
        ('GRID', (0,0), (-1,-1), 1, (0,0,0)),  # Black tuple (static)
        ('ALIGN', (1,1), (1,-1), 'RIGHT'),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), row_colors),  # Only backgrounds (safe)
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ]))
    elements.append(t)
    elements.append(Spacer(1, 12))

    # Section 4: Recommendations (ENHANCED: Render groups with sub-headers)
    elements.append(Paragraph("4. Recommandations Spécifiques", styleH2))
    recs_text = analysis_results.get('recommendations', 'Recommandations non disponibles.')
    rec_lines = [line.strip() for line in recs_text.split('\n') if line.strip()]
    
    current_group = ""  # Track sub-headers
    for line in rec_lines:
        if line.startswith('**') and line.endswith(':**'):
            # Sub-header (e.g., "**CLO:**")
            current_group = line[2:-2]  # Extract "CLO"
            elements.append(Paragraph(f"{current_group}:", styleH3))  # Bold sub-header
        else:
            if line.startswith('- '):
                line = line[2:].strip()
            elif not line.startswith('• '):
                line = f"&bull; {line}"
            elements.append(Paragraph(line, styleBold))
    elements.append(Spacer(1, 12))

    # Section 5: Appendix - Questions (FIXED: Space after CLOs)
    elements.append(Paragraph("5. Annexe : Classification des Questions", styleH2))
    questions = analysis_results.get('questions_classified', [])
    if questions:
        data = [["#", "Question (Aperçu)", "CLO(s)", "Niveau Bloom"]]
        for q in questions:
            qnum = q.get("Question#", "")
            text = q.get("Text", "").replace('\n', ' ')[:200] + ("..." if len(q.get("Text", "")) > 200 else "")
            clo = str(q.get("CLO#", "")).replace("[", "").replace("]", "").replace("'", "") + " "  # FIXED: Add space after CLOs
            bloom = q.get("Bloom_Level", "")
            data.append([str(qnum), text, clo, bloom])
        t = Table(data, colWidths=[1*cm, 12*cm, 3*cm, 3*cm], repeatRows=1, rowHeights=25)
        t.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), HexColor('#6c757d')),
            ('TEXTCOLOR', (0,0), (-1,0), (1,1,1)),  # White tuple (static)
            ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
            ('FONTSIZE', (0,0), (-1,-1), 8),
            ('GRID', (0,0), (-1,-1), 0.5, (0.5,0.5,0.5)),  # Grey tuple (static)
            ('VALIGN', (0,0), (-1,-1), 'TOP'),
            ('LEFTPADDING', (1,1), (1,-1), 5),
            ('ALIGN', (0,1), (0,-1), 'CENTER'),
        ]))
        elements.append(t)
    else:
        elements.append(Paragraph("Aucune question extraite.", styleNormal))

    # Build PDF
    try:
        doc.build(elements)
        print(f"DEBUG PDF: Successfully built at {output_path}")  # Debug success
        logger.info(f"PDF generated successfully at {output_path}")
    except Exception as build_error:
        print(f"ERROR PDF Build: {build_error}")  # Debug failure
        import traceback
        print(traceback.format_exc())
        logger.error(f"PDF build failed: {build_error}")
        raise  # Re-raise for route to catch
