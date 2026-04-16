# Rapport d'Audit Complet — ESB-Learning Agentic AI Platform

**Date** : 16 Avril 2026  
**Projet** : ESB-Learning — Plateforme e-learning adaptative pour ESPRIT  
**Auditeur** : GitHub Copilot (Analyse automatique du code source)  
**Chemin** : `C:\Users\aymen\OneDrive\Bureau\Developpement\ESB-Learning`  
**Score Global** : **B+ (7/10)** — Architecture hybride solide, autonomie agents à améliorer

---

## Table des Matières

1. [Vue d'Ensemble du Projet](#1-vue-densemble-du-projet)
2. [Architectures Agentic AI](#2-architectures-agentic-ai)
3. [Agents et leurs Descriptions](#3-agents-et-leurs-descriptions)
4. [Tools Disponibles](#4-tools-disponibles)
5. [Skills Disponibles](#5-skills-disponibles)
6. [Architecture Globale — Graphe](#6-architecture-globale--graphe)
7. [Services Disponibles](#7-services-disponibles)
8. [Techniques RAG Utilisées](#8-techniques-rag-utilisées)
9. [Stack Technique](#9-stack-technique)
10. [Matrice Skills × Agents](#10-matrice-skills--agents)
11. [Scores d'Audit Détaillés](#11-scores-daudit-détaillés)
12. [Recommandations](#12-recommandations)

---

## 1. Vue d'Ensemble du Projet

ESB-Learning est une plateforme d'e-learning adaptative développée pour ESPRIT (École Supérieure Privée d'Ingénierie et de Technologies). Elle combine :

- **Backend Flask** (Python) avec LangGraph + LangChain + Google Gemini 2.5
- **Frontend Next.js** (TypeScript/React) avec Tailwind CSS
- **4 Agents Agentic AI** orchestrés par un SkillManager centralisé
- **Architecture RAG hybride** (ChromaDB + FAISS + BM25 + YouTube)
- **Protocole MCP** (Model Context Protocol) pour les tools structurés

### Personas Utilisateurs

| Rôle | Description | Agents accessibles |
|------|-------------|-------------------|
| **Étudiant** | Apprentissage actif, quiz, TP | Assistant, Coach |
| **Enseignant** | Création examens/TP, analytics classe | Assistant, Exam, TP |
| **Admin** | Supervision globale de la plateforme | Tous |

---

## 2. Architectures Agentic AI

Le projet implémente **4 architectures Agentic AI distinctes**.

### 2.1 Architecture 1 — ReAct Agent (Assistant)

**Pattern** : `create_react_agent` (LangGraph prebuilt)  
**Fichier** : `app/services/assistant_agent.py` (~893 lignes)

```
User Message
     │
     ▼
┌─────────────────────────────────────┐
│          ReAct Agent Loop           │
│  ┌─────────────────────────────┐    │
│  │     Gemini 2.5-Flash LLM    │    │
│  └──────────┬──────────────────┘    │
│             │ Think                 │
│             ▼                       │
│  ┌─────────────────────────────┐    │
│  │    Tool Selection & Call    │    │
│  │  (9 base tools + N skills)  │    │
│  └──────────┬──────────────────┘    │
│             │ Act                   │
│             ▼                       │
│  ┌─────────────────────────────┐    │
│  │    Tool Result Observation  │    │
│  └──────────┬──────────────────┘    │
│             │ Loop until done       │
│             ▼                       │
│        Final Response               │
└─────────────────────────────────────┘
```

**Caractéristiques** :
- Boucle ReAct autonome (Reason → Act → Observe)
- Détection automatique de langue (FR / EN / Tunisien/Derja)
- Enrichissement TunBERT pour le dialecte tunisien
- Injection dynamique de skills via `as_langchain_tools()`
- Personnalité adaptative selon rôle (student/teacher/admin)

### 2.2 Architecture 2 — StateGraph avec nœuds ReAct (Coach)

**Pattern** : LangGraph `StateGraph` + `create_react_agent` par nœud  
**Fichier** : `app/services/coach_agent.py`

```
START
  │
  ▼
[collect_data] ──── Pure function (agrégation DB)
  │
  ▼
[analyze_performance] ── ReAct sub-agent
  │  Tools: performance-scorer, bloom-classifier
  │
  ▼
[detect_gaps] ──── ReAct sub-agent
  │  Tools: weakness-detector, syllabus-mapper
  │
  ▼
[generate_plan] ── ReAct sub-agent
  │  Tools: exercise-recommender, study-planner,
  │         feedback-writer, language-adapter
  │
  ▼
[finalize] ─────── Pure function (assemblage réponse)
  │
  ▼
END
```

**State partagé (CoachState)** :
- `student_id`, `course_ids`
- `performance_data`, `analysis`, `skill_gaps`
- `recommendations`, `study_plan`, `feedback`

### 2.3 Architecture 3 — StateGraph 11 nœuds hybrides (Exam Agent)

**Pattern** : LangGraph `StateGraph` — 5 nœuds ReAct + 6 nœuds déterministes  
**Fichier** : `app/services/exam_agent_graph.py` (~384 lignes)

```
START
  │
  ▼
[extract_text] ────────── Déterministe
  │  MCP: extract_exam_text
  │
  ▼
[extract_questions] ───── Déterministe
  │  MCP: extract_exam_questions + _get_course_context
  │
  ▼
[classify_aa] ─────────── ReAct sub-agent
  │  MCP: classify_questions_aa
  │  Skills: syllabus-mapper
  │
  ▼
[classify_bloom] ──────── ReAct sub-agent
  │  MCP: classify_questions_bloom
  │  Skills: bloom-classifier
  │
  ▼
[assess_difficulty] ───── Déterministe
  │  MCP: assess_question_difficulty
  │
  ▼
[compare_content] ──────── Déterministe
  │  MCP: compare_module_vs_exam
  │
  ▼
[analyze_feedback] ──────── ReAct sub-agent
  │  MCP: generate_exam_feedback
  │  Skills: feedback-writer, rubric-builder
  │
  ▼
[suggest_adjustments] ──── ReAct sub-agent
  │  MCP: suggest_exam_adjustments
  │  Skills: syllabus-mapper, bloom-classifier
  │
  ▼
[generate_corrections] ─── ReAct sub-agent
  │  MCP: generate_question_correction, correct_student_answer
  │  Skills: rubric-builder, feedback-writer
  │
  ▼
[generate_latex] ──────── Déterministe
  │  MCP: generate_exam_latex (compilation PDF)
  │
  ▼
[evaluate_proposal] ───── Déterministe
  │  MCP: evaluate_exam_proposal
  │
  ▼
END
```

**State partagé (ExamEvaluationState)** :
- `session_id`, `course_id`, `file_path`
- `exam_text`, `questions`, `aa_list`, `course_context`
- `comparison_report`, `feedback`, `adjustments`
- `latex_source`, `latex_pdf_path`, `corrections`

### 2.4 Architecture 4 — Dual StateGraph (TP Agent)

**Pattern** : 2 × LangGraph `StateGraph` — nœuds ReAct avec fallback déterministe  
**Fichier** : `app/services/tp_agent_graph.py` (~361 lignes)

**Workflow Enseignant (Création) :**
```
START
  │
  ▼
[get_context] ─────────── Déterministe
  │  MCP: get_section_context
  │
  ▼
[generate_statement] ──── ReAct sub-agent
  │  MCP: generate_tp_statement
  │  Skills: quiz-generator
  │
  ▼
[parse_questions] ──────── ReAct sub-agent
  │  MCP: parse_tp_questions
  │  Skills: bloom-classifier
  │
  ▼
[suggest_aa] ────────────  ReAct sub-agent
  │  MCP: suggest_aa_codes
  │  Skills: syllabus-mapper
  │
  ▼
[generate_reference] ───── ReAct sub-agent
  │  MCP: generate_reference_solution
  │  Skills: rubric-builder
  │
  ▼
END
```

**Workflow Étudiant (Correction) :**
```
START
  │
  ▼
[auto_correct] ─────────── ReAct sub-agent
  │  MCP: auto_correct_submission
  │  Skills: code-reviewer
  │
  ▼
[propose_grade] ────────── ReAct sub-agent
  │  MCP: propose_grade
  │  Skills: feedback-writer
  │
  ▼
END
```

**State Création (TPCreationState)** : `section_id`, `language`, `statement`, `questions`, `suggested_aa`, `reference_solution`  
**State Correction (TPCorrectionState)** : `statement`, `student_code`, `correction_report`, `proposed_grade`

---

## 3. Agents et leurs Descriptions

### Vue d'Ensemble

| ID | Nom | Type | Fichier | Lignes | Pattern |
|----|-----|------|---------|--------|---------|
| `assistant` | Assistant Pédagogique | ReAct | `assistant_agent.py` | ~893 | `create_react_agent` |
| `coach` | Coach Étudiant | StateGraph | `coach_agent.py` | ~342 | StateGraph + ReAct nodes |
| `exam` | Évaluateur d'Examens | StateGraph | `exam_agent_graph.py` | ~384 | StateGraph 11 nœuds |
| `tp` | Agent Travaux Pratiques | StateGraph | `tp_agent_graph.py` | ~361 | Dual StateGraph |

---

### Agent 1 : Assistant Pédagogique (`assistant`)

**Description** : Agent conversationnel adaptatif, point d'entrée principal de la plateforme. Répond aux questions des étudiants et enseignants sur les cours, performances, planning. Trilingue (FR/EN/Tunisien).

**LLM** : Gemini 2.5-Flash (`temperature=0.4`)  
**Pattern** : ReAct (Reason + Act + Observe boucle autonome)

**Tools de base (9) :**

| Tool | Rôle | Description |
|------|------|-------------|
| `get_my_courses` | Tous | Liste les cours de l'utilisateur (rôle étudiant/enseignant) |
| `get_calendar_activities` | Tous | Activités à venir (quiz, examens, séances, devoirs) |
| `get_course_details` | Tous | Détails complets d'un cours (chapitres, sections, documents) |
| `get_my_performance` | Étudiant | Scores quiz, moyennes, taux de complétion par cours |
| `get_my_grades_summary` | Étudiant | Résumé notes par module (quiz, devoirs, présence) |
| `get_recommendations` | Étudiant | Recommandations IA exercices et activités d'étude |
| `get_at_risk_students` | Enseignant | Détection étudiants à risque (faibles scores, absences) |
| `get_class_performance` | Enseignant | Performance de toute la classe par cours |
| `suggest_quiz_for_student` | Enseignant | Suggestions quiz ciblant les faiblesses d'un étudiant |

**Skills injectés dynamiquement** via `SkillManager.as_langchain_tools()` :
- Tous les skills compatibles avec l'agent `assistant` selon le rôle utilisateur

**Feature spéciale** : Enrichissement TunBERT pour le dialecte tunisien — classification d'intentions NLP avant envoi au LLM.

---

### Agent 2 : Coach Étudiant (`coach`)

**Description** : Agent d'analyse de performance et de coaching personnalisé. Pipeline autonome qui analyse les données d'un étudiant, identifie ses lacunes et génère un plan d'étude adaptatif.

**LLM** : Gemini 2.5-Flash + Gemini 2.5-Pro (pour les analyses complexes)  
**Pattern** : StateGraph 5 nœuds (1 déterministe + 3 ReAct + 1 déterministe)

**Nœuds et tools :**

| Nœud | Type | Skills/Tools utilisés |
|------|------|----------------------|
| `collect_data` | Déterministe | DB queries (Quiz, Enrollment, QuizQuestion) |
| `analyze_performance` | ReAct | `performance-scorer`, `bloom-classifier` |
| `detect_gaps` | ReAct | `weakness-detector`, `syllabus-mapper` |
| `generate_plan` | ReAct | `exercise-recommender`, `study-planner`, `feedback-writer`, `language-adapter` |
| `finalize` | Déterministe | Assemblage réponse backward-compatible |

---

### Agent 3 : Évaluateur d'Examens (`exam`)

**Description** : Agent multi-étapes pour l'analyse et la génération d'examens. Prend en entrée un fichier examen (PDF/DOCX/TXT), l'analyse selon la taxonomie de Bloom et les AA du cours, génère des ajustements et produit un nouveau document LaTeX/PDF.

**LLM** : Gemini 2.5-Flash (`temperature=0.1`)  
**Pattern** : StateGraph 11 nœuds (5 ReAct + 6 déterministes)  
**Bridge** : `mcp_langchain_bridge.py` — conversion MCP tools → LangChain StructuredTools

**Pipeline complet :**

| Étape | Nœud | Type | MCP Tool | Skill |
|-------|------|------|----------|-------|
| 1 | `extract_text` | Déterministe | `extract_exam_text` | — |
| 2 | `extract_questions` | Déterministe | `extract_exam_questions` | — |
| 3 | `classify_aa` | ReAct | `classify_questions_aa` | `syllabus-mapper` |
| 4 | `classify_bloom` | ReAct | `classify_questions_bloom` | `bloom-classifier` |
| 5 | `assess_difficulty` | Déterministe | `assess_question_difficulty` | — |
| 6 | `compare_content` | Déterministe | `compare_module_vs_exam` | — |
| 7 | `analyze_feedback` | ReAct | `generate_exam_feedback` | `feedback-writer`, `rubric-builder` |
| 8 | `suggest_adjustments` | ReAct | `suggest_exam_adjustments` | `syllabus-mapper`, `bloom-classifier` |
| 9 | `generate_corrections` | ReAct | `generate_question_correction` | `rubric-builder`, `feedback-writer` |
| 10 | `generate_latex` | Déterministe | `generate_exam_latex` | — |
| 11 | `evaluate_proposal` | Déterministe | `evaluate_exam_proposal` | — |

**Outputs** : JSON d'analyse + Document LaTeX + PDF compilé

---

### Agent 4 : Agent Travaux Pratiques (`tp`)

**Description** : Agent dual-workflow pour la gestion complète des TP. Pour les enseignants : génération automatique d'énoncés avec solution de référence. Pour les étudiants : correction automatique de code et notation.

**LLM** : Gemini 2.5-Flash + Gemini 2.5-Pro (génération complexe)  
**Langages supportés** : Python 3, SQL (PostgreSQL), R, Java 11+, C (C11), C++ (C++17)  
**Pattern** : 2 × StateGraph (5 nœuds création + 2 nœuds correction), chacun ReAct avec fallback déterministe

**Workflow Création (Enseignant) :**

| Nœud | Type | MCP Tool | Skill |
|------|------|----------|-------|
| `get_context` | Déterministe | `get_section_context` | — |
| `generate_statement` | ReAct | `generate_tp_statement` | `quiz-generator` |
| `parse_questions` | ReAct | `parse_tp_questions` | `bloom-classifier` |
| `suggest_aa` | ReAct | `suggest_aa_codes` | `syllabus-mapper` |
| `generate_reference` | ReAct | `generate_reference_solution` | `rubric-builder` |

**Workflow Correction (Étudiant) :**

| Nœud | Type | MCP Tool | Skill |
|------|------|----------|-------|
| `auto_correct` | ReAct | `auto_correct_submission` | `code-reviewer` |
| `propose_grade` | ReAct | `propose_grade` | `feedback-writer` |

**Feature Socratique** : MCP tool `chat_with_student` — chatbot qui guide sans donner la réponse directe (uniquement pour les TP formatifs).

---

## 4. Tools Disponibles

### 4.1 MCP Tools — TP Agent (10 tools)

*Fichier* : `app/services/mcp_tools.py`  
*Registre* : `MCP_TOOL_DEFINITIONS`

| # | Nom | Description | Inputs requis |
|---|-----|-------------|---------------|
| 1 | `get_section_context` | Récupère tout le contenu pédagogique d'une section (docs, transcripts YouTube, activités) | `section_id` |
| 2 | `generate_tp_statement` | Génère un énoncé TP dans le langage de programmation spécifié | `context`, `language`, `[hint]` |
| 3 | `suggest_aa_codes` | Suggère les codes AA pertinents pour un énoncé TP | `section_id`, `statement` |
| 4 | `generate_reference_solution` | Génère une solution de référence + grille d'évaluation | `statement`, `language`, `[max_grade]` |
| 5 | `auto_correct_submission` | Correction automatique du code étudiant vs solution de référence | `statement`, `reference_solution`, `student_code`, `language` |
| 6 | `propose_grade` | Propose une note numérique (0–max_grade) basée sur le rapport de correction | `correction_report`, `[max_grade]` |
| 7 | `parse_tp_questions` | Parse un énoncé TP et extrait les questions avec barème | `statement`, `language`, `[max_grade]` |
| 8 | `generate_question_starter` | Génère une question avec commentaires + template code étudiant | `question_text`, `language` |
| 9 | `chat_with_student` | Chatbot socratique guidant l'étudiant sans donner les réponses | `question_text`, `language`, `student_message`, `[history]` |
| 10 | `generate_correction_criteria` | Génère des critères de correction détaillés | `statement`, `language` |

**LLM utilisés** :
- `gemini-2.5-flash` : tools standard
- `gemini-2.5-pro` (`_llm_robust`) : génération d'énoncés et corrections complexes

### 4.2 MCP Tools — Exam Agent (11 tools)

*Fichier* : `app/services/exam_mcp_tools.py`  
*Registre* : `EXAM_MCP_TOOL_DEFINITIONS`

| # | Nom | Description | Inputs requis |
|---|-----|-------------|---------------|
| 1 | `extract_exam_text` | Extrait le texte brut d'un fichier examen (PDF, DOCX, TXT) | `file_path` |
| 2 | `extract_exam_questions` | Parse le texte et extrait les questions structurées avec points | `exam_text`, `[language]` |
| 3 | `classify_questions_aa` | Classifie les questions par Apprentissages Attendus (AA/CLO) | `questions`, `aa_list` |
| 4 | `classify_questions_bloom` | Classifie les questions par niveau de Bloom | `questions` |
| 5 | `assess_question_difficulty` | Évalue la difficulté de chaque question relative au cours | `questions`, `[course_context]` |
| 6 | `compare_module_vs_exam` | Compare la distribution du syllabus vs l'examen | `questions`, `aa_list`, `[course_context]` |
| 7 | `generate_exam_feedback` | Génère un feedback pédagogique détaillé | `comparison_report`, `questions` |
| 8 | `suggest_exam_adjustments` | Suggère des ajustements pour améliorer l'équilibre et couverture AA | `feedback`, `questions`, `aa_list` |
| 9 | `generate_exam_latex` | Génère un document LaTeX complet et compile en PDF | `questions`, `[exam_title]`, `[course_name]` |
| 10 | `evaluate_exam_proposal` | Évalue la nouvelle proposition d'examen sur critères pédagogiques | `latex_source`, `[original_feedback]` |
| 11 | `generate_question_correction` | Génère une correction modèle pour une question | `question_text`, `question_type`, `points` |
| 12 | `correct_student_answer` | Évalue la réponse d'un étudiant et assigne un score | `question_text`, `student_answer`, `reference_correction` |

**Constantes pédagogiques** :
- `BLOOM_LEVELS` : Mémoriser, Comprendre, Appliquer, Analyser, Évaluer, Créer
- `DIFFICULTY_LEVELS` : Très facile → Très difficile (5 niveaux)
- `QUESTION_TYPES` : QCM, Ouvert, Pratique, Vrai/Faux, Calcul, Étude de cas
- Distribution Bloom idéale : 10% / 20% / 30% / 20% / 15% / 5%

### 4.3 Tools LangChain (@tool) — Assistant Agent (9 tools)

*Fichier* : `app/services/assistant_agent.py`

| # | Tool | Rôle cible | Description |
|---|------|-----------|-------------|
| 1 | `get_my_courses` | Tous | Cours de l'utilisateur avec rôle étudiant/enseignant |
| 2 | `get_calendar_activities` | Tous | Quiz, examens, séances, devoirs à venir |
| 3 | `get_course_details` | Tous | Chapitres, sections, documents d'un cours |
| 4 | `get_my_performance` | Étudiant | Scores quiz + analyse Bloom par niveau |
| 5 | `get_my_grades_summary` | Étudiant | Résumé notes modules (quiz, devoirs, présence) |
| 6 | `get_recommendations` | Étudiant | Plan d'étude et exercices recommandés (via Coach) |
| 7 | `get_at_risk_students` | Enseignant | Étudiants à risque (scores < 50%, absences > 40%) |
| 8 | `get_class_performance` | Enseignant | Performance globale de la classe |
| 9 | `suggest_quiz_for_student` | Enseignant | Quiz ciblés sur les faiblesses Bloom d'un étudiant |

### 4.4 MCP Server (JSON-RPC 2.0)

*Fichier* : `app/services/tp_mcp_server.py`  
**Transport** : stdio (JSON-RPC 2.0)  
**Status** : Implémenté mais non intégré en production

---

## 5. Skills Disponibles

Le **SkillManager** orchestre 12 skills modulaires.  
*Fichier* : `app/services/skill_manager.py` (430 lignes)  
*Skills* : `app/skills/*.py`

### Architecture du SkillManager

```python
SkillContext(user_id, course_id, role, agent_id, params)
    │
    ▼
SkillManager.execute(skill_id, context, input_data)
    │
    ├── Validation accès (role check)
    ├── Course config override (SkillCourseConfig)
    ├── Création SkillExecution (tracking)
    ├── Résolution dépendances
    ├── _load_skill_function() → module dynamique
    └── SkillResult(success, data, error, metadata)
```

**Méthodes clés** :
- `execute()` — Exécution d'un skill unique avec lifecycle complet
- `compose([skill_ids])` — Chaîne séquentielle (output N → input N+1)
- `as_langchain_tools()` — Conversion skills → LangChain StructuredTools pour agents ReAct
- `resolve_for_agent(agent_id, role)` — Résolution dynamique des skills disponibles
- `list_skills(agent_id, role, course_id)` — Liste filtrée par agent/rôle/cours

### Catalogue des 12 Skills

| # | ID | Nom | Catégorie | Agents | Rôles | Temp. |
|---|-----|-----|-----------|--------|-------|-------|
| 1 | `bloom-classifier` | Bloom Taxonomy Classifier | analysis | exam, tp, coach, assistant | student, teacher, admin | 0.1 |
| 2 | `syllabus-mapper` | Syllabus Outcome Mapper | analysis | exam, tp, coach | teacher, admin | 0.2 |
| 3 | `feedback-writer` | Pedagogical Feedback Writer | generation | exam, tp, coach, assistant | student, teacher, admin | 0.5 |
| 4 | `performance-scorer` | Performance Scorer | scoring | coach, assistant | student, teacher | 0.1 |
| 5 | `weakness-detector` | Skill Gap Detector | analysis | coach, assistant | student, teacher | 0.2 |
| 6 | `exercise-recommender` | Exercise Recommender | generation | coach, assistant | student, teacher | 0.4 |
| 7 | `study-planner` | Study Schedule Planner | planning | coach | student | 0.4 |
| 8 | `quiz-generator` | Quiz Generator | generation | assistant, tp | teacher, admin | 0.5 |
| 9 | `content-summarizer` | Content Summarizer | generation | assistant | student | 0.4 |
| 10 | `code-reviewer` | Pedagogical Code Reviewer | analysis | tp | student, teacher | 0.3 |
| 11 | `rubric-builder` | Rubric Builder | generation | exam, tp | teacher, admin | 0.3 |
| 12 | `language-adapter` | Language & Tone Adapter | generation | assistant, coach | student, teacher, admin | 0.3 |

### Descriptions Détaillées des Skills

#### `bloom-classifier` — Classifie selon la taxonomie de Bloom
- **Input** : `content` (texte), `content_type` (question/exercise/text)
- **Output** : `{bloom_level, confidence, justification}`
- **Niveaux** : remember, understand, apply, analyze, evaluate, create
- **Usage** : Partout — le skill le plus réutilisé du projet

#### `syllabus-mapper` — Mappe aux Acquis d'Apprentissage
- **Input** : `content`, `course_id`
- **Output** : AA/CLO correspondants avec justification
- **Usage** : Exam + TP + Coach pour aligner le contenu aux objectifs

#### `feedback-writer` — Génère des feedbacks pédagogiques
- **Input** : `performance_data`, `context`
- **Output** : Feedback constructif personnalisé
- **Usage** : Partout — feedback étudiant après quiz/TP/examen

#### `performance-scorer` — Calcule les scores de performance
- **Input** : `scores`, `bloom_data`
- **Output** : Scores par AA, Bloom et module
- **Usage** : Coach + Assistant pour diagnostics

#### `weakness-detector` — Détecte les lacunes
- **Input** : `performance_data`, `bloom_scores`
- **Output** : Liste de gaps prioritisés
- **Usage** : Coach pour identifier ce qu'il faut travailler

#### `exercise-recommender` — Recommande des exercices ciblés
- **Input** : `skill_gaps`, `course_id`
- **Output** : Exercices recommandés avec priorité
- **Usage** : Coach pour plan d'action concret

#### `study-planner` — Crée des plannings d'étude
- **Input** : `gaps`, `available_time`
- **Output** : Planning hebdomadaire adaptatif
- **Usage** : Coach uniquement, pour les étudiants

#### `quiz-generator` — Génère des questions de quiz
- **Input** : `content`, `bloom_level`, `difficulty`
- **Output** : Questions structurées avec réponses
- **Usage** : Assistant (étudiants/enseignants) + TP

#### `content-summarizer` — Résume le contenu de cours
- **Input** : `content`, `level` (étudiant/avancé)
- **Output** : Résumé adapté au niveau
- **Usage** : Assistant uniquement, pour les étudiants

#### `code-reviewer` — Review de code étudiant
- **Input** : `code`, `language`, `criteria`
- **Output** : Feedback pédagogique sur le code
- **Usage** : TP uniquement pour la correction

#### `rubric-builder` — Crée des grilles d'évaluation
- **Input** : `objectives`, `max_grade`
- **Output** : Rubric détaillée avec critères et points
- **Usage** : Exam + TP pour l'évaluation

#### `language-adapter` — Adapte langue et ton
- **Input** : `content`, `target_language`, `context`
- **Output** : Contenu adapté (FR/EN/Tunisien)
- **Usage** : Assistant + Coach pour adapter le registre

---

## 6. Architecture Globale — Graphe

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                         ESB-LEARNING PLATFORM                               ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║  ┌─────────────────────────────────────────────────────────────────────┐    ║
║  │                    FRONTEND (Next.js / TypeScript)                  │    ║
║  │   Pages: cours, quiz, TP, examens, chatbot, analytics, profil       │    ║
║  └─────────────────────────────┬───────────────────────────────────────┘    ║
║                                 │ HTTP/REST                                  ║
║  ┌─────────────────────────────▼───────────────────────────────────────┐    ║
║  │               BACKEND FLASK (Python 3.11+)                          │    ║
║  │   Routes: auth, courses, quiz, documents, evaluate, syllabus, ai    │    ║
║  │   Flask-Login • Flask-SQLAlchemy • Flask-Migrate • JWT              │    ║
║  └──────┬──────────┬────────────┬─────────────┬────────────────────────┘    ║
║         │          │            │             │                              ║
║  ┌──────▼──┐ ┌─────▼──┐ ┌──────▼────┐ ┌─────▼────────────────────────┐    ║
║  │ AGENT 1 │ │AGENT 2 │ │ AGENT 3   │ │        AGENT 4               │    ║
║  │Assistant│ │ Coach  │ │   Exam    │ │    TP (Dual Workflow)         │    ║
║  │  ReAct  │ │State   │ │ StateGraph│ │   StateGraph x2              │    ║
║  │         │ │Graph   │ │ 11 nodes  │ │   5+2 nodes                  │    ║
║  └────┬────┘ └────┬───┘ └─────┬─────┘ └──────────┬───────────────────┘    ║
║       │           │           │                    │                         ║
║  ┌────▼───────────▼───────────▼────────────────────▼────────────────────┐  ║
║  │                      SKILL MANAGER                                    │  ║
║  │   execute() • compose() • as_langchain_tools() • resolve_for_agent()  │  ║
║  │                                                                        │  ║
║  │  [bloom] [syllabus] [feedback] [perf] [gap] [exercise] [plan] [quiz] │  ║
║  │  [summarizer] [code-review] [rubric] [language]   (12 skills)        │  ║
║  └───────────────────────────────────────────────────────────────────────┘  ║
║                                                                              ║
║  ┌────────────────────────────┐   ┌──────────────────────────────────────┐  ║
║  │     MCP TOOLS (21 tools)   │   │         AI / LLM LAYER               │  ║
║  │  TP Tools (10)             │   │  Gemini 2.5-Flash (standard)         │  ║
║  │  Exam Tools (11)           │   │  Gemini 2.5-Pro (complex tasks)      │  ║
║  │  MCP Server (JSON-RPC 2.0) │   │  LangChain + LangGraph               │  ║
║  │  MCP-LangChain Bridge      │   │  TunBERT (Tunisian NLP)              │  ║
║  └────────────────────────────┘   └──────────────────────────────────────┘  ║
║                                                                              ║
║  ┌──────────────────────────────────────────────────────────────────────┐   ║
║  │                        RAG PIPELINE                                   │   ║
║  │  ChromaDB (VectorStore) ──── SentenceTransformer (all-MiniLM-L6-v2) │   ║
║  │  FAISS (faiss-cpu) ────────── Similarity search                      │   ║
║  │  BM25 (rank-bm25) ─────────── Hybrid keyword search                  │   ║
║  │  YouTube RAG ──────────────── Transcript + Gemini vision analysis    │   ║
║  │  CAG Layer ────────────────── Section summaries (fast retrieval)     │   ║
║  └──────────────────────────────────────────────────────────────────────┘   ║
║                                                                              ║
║  ┌─────────────────────────┐  ┌────────────────────────────────────────┐    ║
║  │   DATABASE (PostgreSQL) │  │          FILE STORAGE                  │    ║
║  │  SQLAlchemy ORM         │  │  PDFs, DOCX, images (uploads/)         │    ║
║  │  Models: Users, Courses,│  │  ChromaDB (instance/chroma_db)        │    ║
║  │  Quizzes, Exams, Skills,│  │  LaTeX/PDF générés (temp/)            │    ║
║  │  Enrollments, Syllabus  │  │  MinIO (object storage optionnel)     │    ║
║  └─────────────────────────┘  └────────────────────────────────────────┘    ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

### Flux de données Agent ↔ Skills ↔ Tools

```
User Request
    │
    ▼
Flask Route (app/routes/ai.py)
    │
    ▼
Agent Entry Point
    │
    ├─── Assistant: chat_with_assistant(user_id, message, history, role)
    ├─── Coach: analyze_student_performance(student_id)
    ├─── Exam: run_exam_evaluation_async(session_id)
    └─── TP: run_tp_creation(section_id, language) / run_tp_correction(submission_id)
         │
         ▼
    LangGraph StateGraph / ReAct Agent
         │
         ├──→ MCP Tools (exam_mcp_tools.py, mcp_tools.py)
         │      └──→ Gemini LLM + DB queries
         │
         └──→ Skills via SkillManager
                └──→ skill_manager.as_langchain_tools() → StructuredTool
                       └──→ app/skills/*.py → BaseSkill.call_llm_json()
```

---

## 7. Services Disponibles

### 7.1 Services IA Principaux

| Service | Fichier | Description |
|---------|---------|-------------|
| `assistant_agent` | `assistant_agent.py` | Agent conversationnel trilingue ReAct |
| `coach_agent` | `coach_agent.py` | Coach performance + planning étudiant |
| `exam_agent_graph` | `exam_agent_graph.py` | Évaluation et génération d'examens |
| `tp_agent_graph` | `tp_agent_graph.py` | Génération et correction de TP |
| `skill_manager` | `skill_manager.py` | Orchestrateur centralisé des skills |
| `mcp_langchain_bridge` | `mcp_langchain_bridge.py` | Bridge MCP → LangChain tools |

### 7.2 Services RAG / Documents

| Service | Fichier | Description |
|---------|---------|-------------|
| `vector_store` | `vector_store.py` | ChromaDB + SentenceTransformer embeddings |
| `document_pipeline` | `document_pipeline.py` | Pipeline complet traitement PDF |
| `document_processor` | `document_processor.py` | Extraction texte + images PDF |
| `document_manager` | `document_manager.py` | Gestion métadonnées documents |
| `smart_extraction_service` | `smart_extraction_service.py` | Extraction intelligente multi-format |
| `youtube_rag_service` | `youtube_rag_service.py` | RAG YouTube (transcript + Gemini vision) |
| `summarizer` | `summarizer.py` | Génération résumés sections (CAG) |

### 7.3 Services Pédagogiques

| Service | Fichier | Description |
|---------|---------|-------------|
| `ai_service` | `ai_service.py` | Service IA généraliste |
| `chat_service` | `chat_service.py` | Service de chat pédagogique |
| `evaluate_service` | `evaluate_service.py` | Évaluation quiz et soumissions |
| `feedback_service` | `feedback_service.py` | Génération feedback formatif |
| `practice_quiz_service` | `practice_quiz_service.py` | Quiz de pratique adaptatifs |
| `exercise_extractor_agent` | `exercise_extractor_agent.py` | Extraction exercices depuis documents |

### 7.4 Services Syllabus / Examens Tunisie

| Service | Fichier | Description |
|---------|---------|-------------|
| `syllabus_service` | `syllabus_service.py` | Gestion syllabus standard |
| `syllabus_tn_service` | `syllabus_tn_service.py` | Syllabus format Tunisie (AA/CLO) |
| `admin_syllabus_service` | `admin_syllabus_service.py` | Administration syllabi |
| `tn_exam_evaluation_service` | `tn_exam_evaluation_service.py` | Évaluation examens format TN |
| `tn_exam_report_service` | `tn_exam_report_service.py` | Rapports examens TN |
| `tn_latex_report_service` | `tn_latex_report_service.py` | Génération LaTeX/PDF rapports TN |
| `aap_definitions` | `aap_definitions.py` | Définitions AAP (Activités d'Apprentissage) |
| `program_extraction_service` | `program_extraction_service.py` | Extraction programmes pédagogiques |

### 7.5 Services Utilitaires

| Service | Fichier | Description |
|---------|---------|-------------|
| `video_service` | `video_service.py` | Traitement vidéos pédagogiques |
| `tunbert_service` | `tunbert_service.py` | NLP dialecte tunisien (TunBERT) |
| `piston_service` | `piston_service.py` | Exécution code (multi-langages) |
| `file_service` | `file_service.py` | Gestion upload/download fichiers |
| `extraction_report_service` | `extraction_report_service.py` | Rapports d'extraction |

### 7.6 Services MCP

| Service | Fichier | Description |
|---------|---------|-------------|
| `mcp_tools` | `mcp_tools.py` | 10 tools MCP pour les TP |
| `exam_mcp_tools` | `exam_mcp_tools.py` | 11 tools MCP pour les examens |
| `mcp_server` | `mcp_server.py` | Serveur MCP (JSON-RPC 2.0) |
| `tp_mcp_server` | `tp_mcp_server.py` | Serveur MCP spécialisé TP |

### 7.7 Routes API

| Route | Fichier | Endpoints |
|-------|---------|-----------|
| `/auth/*` | `auth.py` | Login, register, logout, JWT |
| `/courses/*` | `courses.py` | CRUD cours, enrollments |
| `/chapters/*` | `chapters.py` | Chapitres, sections |
| `/documents/*` | `documents.py` | Upload, traitement, RAG |
| `/quiz/*` | `quiz.py` | Génération, soumission, scores |
| `/evaluate/*` | `evaluate.py` | Évaluation examens et TP |
| `/ai/*` | `ai.py` | Endpoints agents IA |
| `/syllabus/*` | `syllabus.py` | Gestion syllabus |
| `/admin/*` | `admin.py` | Administration |
| `/superuser/*` | `superuser.py` | Super-admin |
| `/insights/*` | `insights_routes.py` | Analytics et insights |

---

## 8. Techniques RAG Utilisées

Le projet implémente une **architecture RAG hybride à 5 couches**.

### 8.1 RAG Standard — ChromaDB + SentenceTransformer

**Fichier** : `app/services/vector_store.py`  
**Modèle d'embedding** : `all-MiniLM-L6-v2` (SentenceTransformer)  
**Vector DB** : ChromaDB (persistant, `instance/chroma_db`)

```
Document PDF/DOCX
    │
    ▼
PDFProcessor → Extraction sections + images
    │
    ├──→ Text Chunks (add_text_chunks)
    │     └── batch_size=100, metadata: section_number, page_number
    │
    ├──→ Section Summaries (add_section_summaries) → CAG Layer
    │
    └──→ Image Descriptions (add_image_descriptions)
         │
         ▼
ChromaDB Collection (doc_{document_id})
    │
    └──→ Similarity Search (cosine distance)
         ├── search_summaries(query, n=5)
         ├── search_text_chunks(query, n=10, [section_filter])
         └── search_images(query, n=5)
```

**Types de contenu indexé** :
- `text` — chunks de texte brut
- `summary` — résumés de sections (CAG)
- `image` — descriptions d'images/figures
- `overview` — vue d'ensemble du document

### 8.2 CAG — Cached Augmented Generation

**Principe** : Les résumés de sections sont indexés séparément pour un accès rapide.  
`get_context_for_query()` récupère d'abord les résumés (vue d'ensemble), puis les chunks détaillés.

```python
context = summaries (CAG fast) + text_chunks (detail) + image_descriptions
max_chars = 8000 (configurable)
```

### 8.3 Hybrid RAG — Dense + Sparse

**FAISS** (`faiss-cpu`) : Recherche vectorielle dense rapide  
**BM25** (`rank-bm25`) : Recherche par mots-clés (sparse)  
**Combinaison** : Les deux résultats sont fusionnés pour une meilleure couverture sémantique + lexicale

### 8.4 YouTube RAG — Multimodal

**Fichier** : `app/services/youtube_rag_service.py`  
**Pipeline** :
1. **Transcript** : `youtube-transcript-api` (sous-titres SRT, multi-langue FR/EN/AR)
2. **Analyse visuelle** : Gemini 2.5 native YouTube URL (audio + frames)
3. **Fallback** : Analyse textuelle si la vidéo native échoue
4. **Chunking** : `CHUNK_SIZE=1400`, `CHUNK_OVERLAP=250`
5. **Indexation** : Chunks ChromaDB (transcript brut + transcription enrichie Gemini + résumé pédagogique + contenu visuel)

**Méthodes d'analyse** :
- `gemini_native_video` : Traitement URL YouTube natif (mode primaire)
- `gemini_transcript_analysis` : Analyse basée transcription (fallback)
- Extraction : `visual_summary`, `key_moments`, `visual_elements`, `topics_covered`, `pedagogical_summary`

### 8.5 Multi-Format Document Processing

**Formats supportés** : PDF, DOCX, TXT, PPTX, images (via vision LLM)  
**Librairies** : `pdfplumber`, `pypdf`, `python-docx`, `camelot-py` (tableaux PDF), `opencv`

**Pipeline** :
```
Upload → detect format → extract text/tables/images
    → chunk → embed → ChromaDB
    → generate summaries → CAG layer
    → register DocumentManager
```

### Résumé RAG

| Technique | Technologie | Usage |
|-----------|-------------|-------|
| Dense Retrieval | ChromaDB + all-MiniLM-L6-v2 | Recherche sémantique documents |
| Sparse Retrieval | BM25 (rank-bm25) | Recherche mots-clés exacts |
| Fast Retrieval | CAG (summaries layer) | Vue d'ensemble rapide |
| Video RAG | YouTube API + Gemini Vision | Analyse vidéos pédagogiques |
| Similarity Search | FAISS | Index vectoriel haute performance |
| Multi-type indexing | text + summary + image | Contenu multimodal unifié |

---

## 9. Stack Technique

### Backend
- **Python 3.11+** / **Flask 3.1.0**
- **LangGraph** (StateGraph, create_react_agent)
- **LangChain** (LangChain-Google-GenAI, StructuredTool)
- **Google Gemini 2.5-Flash / 2.5-Pro** (LLM principal)
- **SQLAlchemy 2.0** + **Flask-Migrate** + **PostgreSQL**
- **ChromaDB** + **FAISS** + **SentenceTransformers**
- **TunBERT** (NLP dialecte tunisien)

### Frontend
- **Next.js 15** / **TypeScript** / **React**
- **Tailwind CSS** + **shadcn/ui** (components.json)
- **KaTeX** (rendu LaTeX)

### AI/ML
- **LangChain** : Tool calling, StructuredTool, ReAct
- **LangGraph** : StateGraph, prebuilt agents
- **Transformers** (HuggingFace) : TunBERT, SentenceTransformer
- **NLTK** : Preprocessing
- **scikit-learn** : ML utilitaires

---

## 10. Matrice Skills × Agents

| Skill | Assistant | Coach | Exam | TP | Mode d'intégration |
|-------|:---------:|:-----:|:----:|:--:|-------------------|
| `bloom-classifier` | ✅ tool | ✅ ReAct | ✅ ReAct | ✅ ReAct | **Tool autonome** |
| `syllabus-mapper` | ❌ | ✅ ReAct | ✅ ReAct | ✅ ReAct | Teacher/Admin only |
| `feedback-writer` | ✅ tool | ✅ ReAct | ✅ ReAct | ✅ ReAct | **Tool autonome** |
| `performance-scorer` | ✅ tool | ✅ ReAct | ❌ | ❌ | Coach-centric |
| `weakness-detector` | ✅ tool | ✅ ReAct | ❌ | ❌ | Coach-centric |
| `exercise-recommender` | ✅ tool | ✅ ReAct | ❌ | ❌ | Coach-centric |
| `study-planner` | ❌ | ✅ ReAct | ❌ | ❌ | Student only |
| `quiz-generator` | ✅ tool | ❌ | ❌ | ✅ ReAct | Teacher/Admin |
| `content-summarizer` | ✅ tool | ❌ | ❌ | ❌ | Student only |
| `code-reviewer` | ❌ | ❌ | ❌ | ✅ ReAct | TP only |
| `rubric-builder` | ❌ | ❌ | ✅ ReAct | ✅ ReAct | Teacher/Admin |
| `language-adapter` | ✅ tool | ✅ ReAct | ❌ | ❌ | FR/EN/Tunisien |

---

## 11. Scores d'Audit Détaillés

| Critère | Score | Commentaire |
|---------|------:|-------------|
| MCP Tools définis | 9/10 | Schémas JSON complets pour 21 tools |
| MCP Server | 4/10 | Existe mais pas intégré en production |
| Pattern Agentic (Assistant) | 10/10 | ReAct parfait avec tool-calling autonome |
| Pattern Agentic (Coach) | 8/10 | StateGraph 5 nœuds avec ReAct sub-agents |
| Pattern Agentic (Exam) | 7/10 | 5 nœuds ReAct + 6 déterministes, fallback robuste |
| Pattern Agentic (TP) | 7/10 | Dual StateGraph avec fallback déterministe |
| Skills comme Tools | 8/10 | `as_langchain_tools()` utilisé partout sauf syllabus-mapper |
| State Management | 9/10 | TypedDict bien structurés par agent |
| Execution Tracking | 8/10 | SkillExecution model complet + analytics |
| RAG Architecture | 9/10 | Pipeline hybride multi-source sophistiqué |
| **TOTAL** | **79/100** | **B+ — Architecture hybride solide** |

---

## 12. Recommandations

### Priorité Haute

1. **Intégrer le serveur MCP en production** — Le `tp_mcp_server.py` (JSON-RPC 2.0 + stdio) existe mais n'est pas utilisé. Exposer via HTTP/SSE pour interopérabilité avec d'autres clients MCP.

2. **Étendre `syllabus-mapper` à l'Assistant** — Le skill est actuellement limité aux rôles `teacher/admin`. L'exposer aux étudiants permettrait des recommandations plus précises.

3. **Unifier les 2 serveurs MCP** — `mcp_server.py` et `tp_mcp_server.py` devraient fusionner pour couvrir les 21 tools (TP + Exam).

### Priorité Moyenne

4. **Monitoring SkillExecution** — Le modèle `SkillExecution` capture tout mais il n'y a pas de dashboard analytics. Créer une page `/admin/skills/analytics`.

5. **Caching LLM** — Les appels skills répétitifs (bloom-classifier sur le même contenu) pourraient bénéficier d'un cache Redis.

6. **Tests d'intégration agents** — Ajouter des tests automatisés pour les pipelines StateGraph complets.

### Priorité Basse

7. **FAISS vs ChromaDB** — Les deux systèmes coexistent. Unifier sur ChromaDB ou clarifier les cas d'usage de chacun.

8. **Streaming responses** — Les agents longs (Exam 11 nœuds) devraient streamer les résultats intermédiaires vers le frontend via SSE.

---

*Rapport généré par GitHub Copilot — Analyse automatique du code source ESB-Learning*  
*Date : 16 Avril 2026*
