# Architecture Agentic AI — Plateforme ESB-Learning

## 1. Vue d'ensemble

La plateforme ESB-Learning implémente une architecture **Agentic AI multi-agents** orchestrée par des modèles de langage (LLM). Le système comporte **24 composants IA distincts** répartis en :
- **5 agents autonomes** (LangGraph StateGraph / ReAct avec prise de décision autonome)
- **17 services LLM** (appels directs à Gemini pour des tâches spécifiques)
- **2 modèles ML spécialisés** (TunBERT pour le dialecte tunisien, SentenceTransformer pour les embeddings)

L'ensemble utilise principalement **Google Gemini** comme LLM d'orchestration et **LangGraph** comme framework d'agents.

### Technologies clés
| Technologie | Rôle |
|------------|------|
| **Google Gemini 2.5-Flash** | LLM principal (orchestration, génération, analyse) |
| **Google Gemini 2.5-Pro** | LLM avancé (examens, analyse approfondie) |
| **Google Gemini 2.0+** | Analyse vidéo native (vision + audio + YouTube) |
| **LangGraph** | Framework d'agents (StateGraph, ReAct) |
| **TunBERT** (tunis-ai/TunBERT) | Modèle BERT pré-entraîné sur le dialecte tunisien |
| **SentenceTransformer** (all-MiniLM-L6-v2) | Embeddings vectoriels pour RAG |
| **ChromaDB** | Base vectorielle persistante pour RAG |
| **gTTS** | Synthèse vocale (Text-to-Speech) |
| **PyTorch + Transformers** | Inférence TunBERT |
| **Piston** | Sandbox d'exécution de code (Python, SQL, R, Java, C, C++) |
| **PyTorch + Transformers** | Inférence TunBERT |

---

## 2. Agent Conversationnel (Assistant Agent)

**Fichier** : `app/services/assistant_agent.py`  
**API** : `POST /api/v1/assistant/chat`  
**Pattern** : LangGraph ReAct Agent (function calling)  
**LLM** : Gemini 2.5-Flash (temperature: 0.4)

### Description
Agent conversationnel intelligent qui s'adapte au rôle de l'utilisateur (étudiant, enseignant, administrateur) et communique en **français**, **anglais** et **dialecte tunisien**. Il utilise le pattern ReAct (Reasoning + Acting) pour décider quels outils appeler en fonction de la requête.

### Tools (Outils)

#### Outils communs (tous les rôles)
| Outil | Description | Entrée | Sortie |
|-------|-------------|--------|--------|
| `get_my_courses` | Récupère les cours de l'utilisateur (inscrits ou enseignés) | `user_id` | Liste JSON des cours avec métadonnées |
| `get_calendar_activities` | Calendrier des activités à venir (quiz, examens, devoirs) | `user_id` | Liste d'activités avec dates/deadlines |
| `get_course_details` | Informations détaillées d'un cours (chapitres, documents, progression) | `course_id` | Métadonnées du cours + détails chapitres |

#### Outils étudiants
| Outil | Description | Entrée | Sortie |
|-------|-------------|--------|--------|
| `get_my_performance` | Scores des quiz, moyennes, répartition taxonomie de Bloom | `student_id` | Résumé de performance par cours |
| `get_my_grades_summary` | Notes par module (quiz, devoirs, présence) | `student_id` | Résumé des notes avec taux |
| `get_recommendations` | Recommandations d'étude générées par l'IA (via Coach Agent) | `student_id` | Lacunes, exercices, plan d'étude |

#### Outils enseignants
| Outil | Description | Entrée | Sortie |
|-------|-------------|--------|--------|
| `get_at_risk_students` | Détection des étudiants en difficulté | `teacher_id` | Liste des étudiants à risque + raisons |
| `get_class_performance` | Statistiques globales de la classe | `teacher_id` | Analytiques agrégées de la classe |
| `suggest_quiz_for_student` | Proposition de quiz adapté pour un étudiant | `student_id` | Quiz personnalisé selon les lacunes |

### Flux d'exécution
```
Message utilisateur
    ├─→ Détection de langue (keyword-based)
    ├─→ [Si tunisien] Enrichissement TunBERT (intents sémantiques)
    ├─→ Construction du prompt système (rôle, nom, user_id)
    ├─→ Sélection des outils selon le rôle
    ├─→ Agent ReAct (Gemini function calling)
    │   ├─→ Raisonnement : analyse la requête
    │   ├─→ Action : appel d'un ou plusieurs outils
    │   ├─→ Observation : résultat de l'outil
    │   └─→ Réponse finale : synthèse en langage naturel
    └─→ Retour : {response, language, tools_used, tunbert_intents}
```

### Endpoints associés
- `POST /api/v1/assistant/chat` — Chat principal
- `POST /api/v1/assistant/tts` — Synthèse vocale (gTTS)
- `POST /api/v1/assistant/stt` — Reconnaissance vocale (Gemini audio)
- `GET /api/v1/assistant/tunbert-status` — État du modèle TunBERT

---

## 3. Service TunBERT (Compréhension du dialecte tunisien)

**Fichier** : `app/services/tunbert_service.py`  
**Pattern** : Singleton lazy-loaded + Classification par similarité cosinus  
**Modèle** : tunis-ai/TunBERT (BERT-base, 768 dimensions, 440 Mo)

### Description
Service de compréhension du dialecte tunisien utilisant le modèle TunBERT pré-entraîné. Intégré comme **agent de preprocessing** dans le pipeline de l'assistant conversationnel. Quand un message en dialecte tunisien est détecté, TunBERT analyse l'intention éducative et enrichit le prompt envoyé à Gemini.

### Fonctionnalités

| Fonction | Description | Entrée | Sortie |
|----------|-------------|--------|--------|
| `classify_tunisian_intent(text, top_k)` | Classification d'intention par similarité cosinus | Texte tunisien | Top-k intentions avec score de confiance |
| `enhance_tunisian_prompt(text, language)` | Enrichissement du prompt avec contexte sémantique | Texte + langue | Contexte d'enrichissement pour Gemini |
| `get_tunbert_status()` | Vérification de l'état du modèle | — | État de chargement, nombre d'intentions |

### Intentions éducatives supportées (9)

| Intention | Description FR | Exemples en tunisien |
|-----------|---------------|---------------------|
| `ask_courses` | Demande d'informations sur les cours | "chnou el cours mte3i", "cours win houma" |
| `ask_grades` | Demande de notes/résultats | "chnou el notes mte3i", "resultat mte3i" |
| `ask_schedule` | Demande de calendrier/horaires | "wakteh el exam", "el planning mte3i" |
| `ask_recommendations` | Demande de conseils d'étude | "chnou lazem na9ra", "kifech nethasn" |
| `ask_performance` | Demande de niveau/progression | "kif niveau mte3i", "el progression mte3i" |
| `greeting` | Salutation tunisienne | "ahla bik", "salam 3likom" |
| `ask_help` | Demande d'aide | "3awni", "ki nesta3mel" |
| `teacher_at_risk` | Étudiants en difficulté (enseignant) | "chkoun el talaba fi danger" |
| `teacher_class_performance` | Performance de la classe (enseignant) | "kif el classe" |

### Architecture technique
```
Première requête tunisienne
    ├─→ Chargement lazy du modèle (440 Mo, une seule fois)
    ├─→ Remapping des clés (strip "BertModel." prefix)
    ├─→ Pré-calcul des embeddings d'ancrage (9 intentions × 5-7 phrases)
    └─→ Modèle prêt en mémoire (singleton)

Requête suivante
    ├─→ Tokenisation du texte (BertTokenizer)
    ├─→ Embedding CLS (768 dimensions)
    ├─→ Similarité cosinus avec les ancrages
    ├─→ Seuil de confiance (0.75)
    └─→ Enrichissement du prompt si confiance suffisante
```

---

## 4. Coach Agent (Analyse de performance)

**Fichier** : `app/services/coach_agent.py`  
**API** : `GET /api/v1/coach/analyze`, `GET /api/v1/coach/analyze/<student_id>`  
**Pattern** : LangGraph StateGraph (pipeline 4 étapes)  
**LLM** : Gemini 2.5-Flash (temperature: 0.3)

### Description
Agent d'analyse des performances étudiantes utilisant un pipeline séquentiel. Collecte les données de quiz et examens, identifie les lacunes par compétence et niveau de Bloom, puis génère des recommandations personnalisées et un plan d'étude.

### Pipeline

| Étape | Fonction | Description |
|-------|----------|-------------|
| 1 | `_collect_performance_data` | Agrégation des scores quiz par cours, calcul Bloom |
| 2 | Analyse LLM | Envoi des données à Gemini pour analyse approfondie |
| 3 | Génération recommandations | skill_gaps, recommendations, study_plan |
| 4 | Formatage sortie | JSON structuré avec niveaux de sévérité |

### Sortie structurée
```json
{
  "performance": {
    "courses": [...],
    "overall_avg": 72.5,
    "bloom_scores": {"remember": 80, "understand": 75, "apply": 60, ...}
  },
  "skill_gaps": [
    {"area": "Algèbre", "severity": "high", "score": 35}
  ],
  "recommendations": [
    {"title": "Exercices équations linéaires", "type": "exercise", "priority": "urgent"}
  ],
  "study_plan": {
    "activities": [
      {"day_offset": 0, "title": "Révision algèbre", "duration_min": 30}
    ]
  }
}
```

### Fonctions associées
- `analyze_student_performance(student_id, course_ids)` — Analyse complète
- `generate_skill_map(student_id, course_id)` — Données radar chart Bloom

---

## 5. Exam Agent Graph (Évaluation multi-agents d'examens)

**Fichier** : `app/services/exam_agent_graph.py`  
**API** : `POST /courses/<id>/exam/analyze`  
**Pattern** : LangGraph StateGraph (pipeline 10 étapes asynchrone)  
**LLM** : Gemini 2.5-Flash / Pro  
**État** : `ExamEvaluationState` (TypedDict persistant)

### Description
Système multi-agents pour l'analyse pédagogique complète d'un examen. Extrait les questions, les classifie par AA et taxonomie de Bloom, compare avec le syllabus, génère des feedbacks et des propositions d'amélioration, puis compile un document LaTeX.

### Pipeline (10 étapes)

| # | Étape | Fonction | Description |
|---|-------|----------|-------------|
| 1 | Extraction texte | `extract_text` | PDF/DOCX → texte brut |
| 2 | Extraction questions | `extract_questions` | Parsing des questions avec points |
| 3 | Classification AA | `classify_aa` | Mapping vers les Acquis d'Apprentissage |
| 4 | Classification Bloom | `classify_bloom` | Niveau taxonomique (Remember→Create) |
| 5 | Évaluation difficulté | `assess_difficulty` | Difficulté relative au cours |
| 6 | Comparaison contenu | `compare_content` | Alignement Syllabus ↔ Examen |
| 7 | Analyse feedback | `analyze_feedback` | Feedback pédagogique |
| 8 | Suggestions ajustements | `suggest_adjustments` | Améliorations par question |
| 9 | Génération LaTeX | `generate_latex` | Document LaTeX + compilation PDF |
| 10 | Évaluation proposition | `evaluate_proposal` | Évaluation pédagogique finale |

### Tools (depuis `exam_mcp_tools.py`)

| Outil | Description |
|-------|-------------|
| `extract_exam_text(file_path)` | Extraction texte multi-format |
| `extract_exam_questions(exam_text, language)` | Parsing structuré des questions |
| `classify_questions_aa(questions, aa_list)` | Classification par AA |
| `classify_questions_bloom(questions)` | Classification Bloom |
| `assess_question_difficulty(questions, course_context)` | Évaluation de difficulté |
| `compare_module_vs_exam(questions, aa_list, context)` | Analyse d'alignement |
| `generate_exam_feedback(comparison_report, questions)` | Génération de feedback |
| `suggest_exam_adjustments(feedback, questions, aa_list)` | Propositions d'ajustement |
| `generate_exam_latex(questions, adjustments, exam_title, course_name)` | Génération LaTeX |
| `evaluate_exam_proposal(latex_source, feedback, aa_list)` | Évaluation finale |

### Persistance
- Progression sauvegardée dans `ExamAnalysisSession.progress` (0-100%)
- Label de l'agent courant pour l'UI
- Questions extraites persistées dans `ExamExtractedQuestion`
- État complet sauvegardé en JSON dans `state_json`

---

## 6. TP Agent Graph (Travaux Pratiques)

**Fichier** : `app/services/tp_agent_graph.py`  
**Pattern** : LangGraph StateGraph (2 workflows distincts)  
**LLM** : Gemini 2.5-Flash

### Description
Double workflow d'agents pour la gestion des travaux pratiques : un workflow de **création** (enseignant) et un workflow de **correction** (automatique).

### Workflow Création (Enseignant — 5 étapes)

| # | Étape | Description |
|---|-------|-------------|
| 1 | `get_context` | Récupération du contexte de la section (documents) |
| 2 | `generate_statement` | Génération IA de l'énoncé du TP |
| 3 | `parse_questions` | Extraction des questions structurées |
| 4 | `suggest_aa` | Suggestion des codes AA |
| 5 | `generate_reference` | Solution de référence + critères de correction |

### Workflow Correction (Automatique — 2 étapes)

| # | Étape | Description |
|---|-------|-------------|
| 1 | `auto_correct` | Analyse soumission vs référence |
| 2 | `propose_grade` | Finalisation de la note numérique |

### Tools (depuis `mcp_tools.py`)

| Outil | Description |
|-------|-------------|
| `get_section_context(section_id)` | Récupération contenu éducatif |
| `generate_tp_statement(context, language, hint)` | Génération d'énoncé |
| `parse_tp_questions(statement, language, max_grade)` | Extraction de questions |
| `suggest_aa_codes(section_id, statement)` | Suggestion AA |
| `generate_reference_solution(statement, language, max_grade)` | Solution de référence |
| `auto_correct_submission(statement, reference, student_code, ...)` | Correction automatique |
| `propose_grade(correction_report, max_grade)` | Proposition de note |
| `chat_with_student(question_text, language, student_message, history)` | Tutorat socratique |

### Langages supportés
Python, SQL, R, Java, C, C++

---

## 7. Service de Feedback (Post-Évaluation)

**Fichier** : `app/services/feedback_service.py`  
**API** : `POST /api/v1/feedback/generate/<exam_session_id>`  
**Pattern** : Appel LLM direct (JSON output)  
**LLM** : Gemini 2.5-Flash (temperature: 0.4)

### Description
Génère automatiquement un feedback pédagogique personnalisé après chaque épreuve. Analyse les réponses de l'étudiant, identifie forces et faiblesses, et propose des recommandations.

### Sortie
```json
{
  "strengths": ["Bonne maîtrise de Q1", "Compréhension des concepts"],
  "weaknesses": ["Erreurs de calcul Q3", "Gestion du temps"],
  "recommendations": ["Pratiquer exercices de calcul", "Réviser manipulation algébrique"],
  "feedback_markdown": "## Performance globale\nVous avez obtenu 72/100..."
}
```

---

## 8. Services RAG (Chat documentaire)

**Fichiers** : `app/services/chat_service.py`, `app/services/vector_store.py`, `app/services/document_pipeline.py`  
**API** : `POST /api/v1/ai/chat/<document_id>`  
**Pattern** : RAG (Retrieval-Augmented Generation) avec CAG  
**LLM** : Gemini 2.5-Flash  
**Base vectorielle** : ChromaDB

### Description
Système de chat intelligent sur les documents de cours utilisant le pattern RAG. Permet aux étudiants de poser des questions sur les documents PDF et obtenir des réponses contextualisées avec citations.

### Pipeline
```
Question utilisateur
    ├─→ CAG (Context-Aware Generation) : recherche dans les résumés
    ├─→ RAG (Retrieval-Augmented Generation) : recherche détaillée dans les vecteurs
    ├─→ Consolidation des passages pertinents avec citations
    ├─→ Génération LLM avec contexte enrichi
    └─→ Sauvegarde dans ChatMessage
```

### Support multi-documents
- Chat par document individuel
- Chat par chapitre (agrège tous les documents)
- Citations croisées avec sources identifiées

---

## 9. Services IA — Appels LLM directs

### 9.1 AI Service (Génération de quiz et évaluation)
**Fichier** : `app/services/ai_service.py` (~2500 lignes)  
**LLM** : Gemini 2.5-Flash  

Service central massif avec **31+ fonctions IA** pour :
- **Génération de quiz** (5 types : QCM, vrai/faux, drag-drop, ouvertes, code)
- **Évaluation de réponses** (simple, améliorée, avec contexte, batch)
- **Génération de réponses modèles** et rubrics de correction
- **Extraction de concepts clés** depuis le contenu
- **Analyse de patterns d'activité** (score_question_activity_alignment)

Fonctions clés : `generate_quiz_questions()`, `evaluate_quiz_answer()`, `evaluate_open_ended_with_context()`, `batch_evaluate_open_ended()`, `generate_detailed_model_answer()`, `create_evaluation_criteria_for_question()`, `extract_key_concepts()`

### 9.2 Summarizer Service (Index CAG)
**Fichier** : `app/services/summarizer.py`  
**LLM** : Gemini 2.5-Flash  

Génère des résumés de sections et des vues d'ensemble de documents pour l'indexation CAG dans ChromaDB.

Fonctions clés : `create_section_summaries()`, `_generate_section_summary()`, `create_document_overview_from_summaries()`

### 9.3 Evaluate Service (Classification d'examens)
**Fichier** : `app/services/evaluate_service.py`  
**LLM** : Gemini 2.5-Flash  

Extraction et classification de questions d'examens par Bloom, CLO et type de question.

Fonctions clés : `extract_questions_from_text()`, `classify_questions_bloom()`

### 9.4 MCP Tools — Outils TP
**Fichier** : `app/services/mcp_tools.py`  
**LLM** : Gemini 2.5-Flash + Gemini Pro (fallback robuste)  

Suite de 8 outils MCP pour les workflows TP :
`get_section_context()`, `generate_tp_statement()`, `parse_tp_questions()`, `suggest_aa_codes()`, `generate_reference_solution()`, `auto_correct_submission()`, `propose_grade()`, `chat_with_student()` (tutorat socratique)

### 9.5 Exam MCP Tools — Outils Examen
**Fichier** : `app/services/exam_mcp_tools.py`  
**LLM** : Gemini 2.5-Flash / Gemini Pro  

Suite de 11 outils MCP pour le pipeline d'évaluation d'examens :
`extract_exam_text()`, `extract_exam_questions()`, `classify_questions_aa()`, `classify_questions_bloom()`, `assess_question_difficulty()`, `compare_module_vs_exam()`, `generate_exam_feedback()`, `suggest_exam_adjustments()`, `generate_exam_latex()`, `evaluate_exam_proposal()`

### 9.6 TN Exam Evaluation Service
**Fichier** : `app/services/tn_exam_evaluation_service.py`  
**LLM** : Gemini 2.5-Pro  

Analyse des examens tunisiens : extraction de métadonnées, questions, classification par AA, évaluation de difficulté, génération de rapports pédagogiques.

Fonctions clés : `analyze_tn_exam()`, `_extract_exam_metadata()`

### 9.7 Video Analysis Service
**Fichier** : `app/services/video_service.py`  
**LLM** : Gemini 2.0+ (Vision + Audio)  

Analyse de vidéos éducatives : extraction de frames, analyse visuelle via Gemini Vision, transcription audio, génération d'analyse slide-by-slide.

Fonctions clés : `VideoAnalysisService.analyze_video_complete()`

### 9.8 YouTube RAG Service
**Fichier** : `app/services/youtube_rag_service.py`  
**LLM** : Gemini 2.0+ (support natif YouTube)  

Enrichissement de vidéos YouTube pour RAG : transcriptions, analyse visuelle/audio, chunking pour indexation ChromaDB.

Fonctions clés : `fetch_transcript()`, analyse native YouTube via Gemini

### 9.9 Syllabus Service
**Fichier** : `app/services/syllabus_service.py`  
**LLM** : Gemini 2.5-Flash  

Extraction des CLO (Course Learning Outcomes), plan hebdomadaire, PLO, TNE depuis les PDF syllabus.

### 9.10 Syllabus TN Service
**Fichier** : `app/services/syllabus_tn_service.py`  
**LLM** : Gemini 2.5-Flash + Tesseract OCR  

Extraction des tableaux AAP depuis les PDF tunisiens via OCR + Gemini Vision.

### 9.11 Smart Extraction Service
**Fichier** : `app/services/smart_extraction_service.py`  
**Type** : Heuristique (sans LLM)  

Extraction intelligente de contenu par scoring de pertinence (définitions: 2.0x, formules: 1.7x, exemples: 1.4x), alignée sur CLO/objectifs.

### 9.12 Program Extraction Service
**Fichier** : `app/services/program_extraction_service.py`  
**Type** : Parsing structurel (regex + tables DOCX)  

Extraction des AAP, compétences, matrices depuis les fiches descriptives de formation Word.

---

## 10. Services IA intégrés dans les API

### 10.1 Chapters API — Résumés et AA
**Fichier** : `app/api/v1/chapters.py`  
**LLM** : Gemini 2.5-Flash  
4 fonctions IA inline : génération de résumé, matching AA, détection TP, génération de description

### 10.2 Chapter Pipeline API — Pipeline 10 agents
**Fichier** : `app/api/v1/chapter_pipeline.py`  
**LLM** : Gemini 2.5-Flash  
Orchestrateur de **10 sous-agents** : content_detector, exercise_detector, aa_mapper, difficulty_assessor, bloom_classifier, practice_scorer, coherence_checker, retrieval_validator, exercise_generator, refinement_agent

### 10.3 Code Execution API — Explication de code
**Fichier** : `app/api/v1/code_execution.py`  
**LLM** : Gemini 2.5-Flash  
Exécution de code via sandbox Piston + génération IA de réponses modèles pour les questions de programmation

### 10.4 Course Question Bank API — Génération de questions
**Fichier** : `app/api/v1/course_question_bank.py`  
**LLM** : Gemini 2.5-Flash  
Génération de 5 types de questions (QCM, vrai/faux, drag-drop, ouvertes, code) via Gemini

### 10.5 Class Chat API — Chatbot de groupe
**Fichier** : `app/api/v1/class_chat.py`  
**LLM** : Gemini 2.5-Flash  
Chatbot de classe activé par @bot/@assistant/@chatbot, détection de langue (FR/AR/EN), redaction PII

### 10.6 Exams API — Analyse pédagogique
**Fichier** : `app/api/v1/exams.py`  
**LLM** : Gemini Flash + Pro (dual-model)  
Analyse pédagogique d'examens uploadés via Gemini

### 10.7 Exam Bank API — Auto-correction et Safe Exam
**Fichier** : `app/api/v1/exam_bank.py`  
**LLM** : Gemini 2.5-Pro / Flash  
Génération automatique de réponses, auto-correction des QCM, analyse IA des questions ouvertes, proctoring intégré

### 10.8 Section Content API — Génération de contenu
**Fichier** : `app/api/v1/section_content.py`  
**LLM** : Gemini 2.5-Flash  
Génération de contenu éducatif structuré en Markdown pour les sections TN

### 10.9 Section Activities API — Quiz de section
**Fichier** : `app/api/v1/section_activities.py`  
**LLM** : Gemini 2.5-Flash  
Génération IA de quiz pour les sections, gestion des activités YouTube

### 10.10 TN Exams API — Examens tunisiens
**Fichier** : `app/api/v1/tn_exams.py`  
**LLM** : Gemini Flash + Pro  
Upload, analyse multi-agents, génération de rapports LaTeX, correction automatique des examens TN

### 10.11 Assistant API — STT via Gemini
**Fichier** : `app/api/v1/assistant.py`  
**LLM** : Gemini (audio natif)  
Speech-to-Text via compréhension audio native de Gemini

### 10.12 Syllabus Versions API — Comparaison IA
**Fichier** : `app/api/v1/syllabus_versions.py`  
**LLM** : Gemini 2.5-Flash  
Comparaison IA entre versions de syllabus

---

## 11. Modèles ML spécialisés

### 11.1 TunBERT (Dialecte tunisien)
**Fichier** : `app/services/tunbert_service.py`  
**Modèle** : tunis-ai/TunBERT (BERT-base, 768 dim, 440 Mo)  
Classification d'intentions tunisiennes par similarité cosinus (9 intentions éducatives)

### 11.2 SentenceTransformer (Embeddings vectoriels)
**Fichier** : `app/services/vector_store.py`  
**Modèle** : all-MiniLM-L6-v2  
Embeddings pour la base vectorielle ChromaDB (RAG documentaire)

---

## 12. Diagramme d'architecture globale

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (Next.js)                     │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ Assistant     │  │ Dashboard    │  │ Course/Exam   │  │
│  │ Widget       │  │ Étudiant     │  │ Pages         │  │
│  │ (Chat+Voice) │  │ (Calendar,   │  │ (Quiz, TP,    │  │
│  │              │  │  KPI, Reco)  │  │  Exams)       │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬────────┘  │
└─────────┼──────────────────┼──────────────────┼──────────┘
          │ REST API         │                  │
          ▼                  ▼                  ▼
┌─────────────────────────────────────────────────────────┐
│                   Backend (Flask)                         │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │           Orchestrateur LLM (Gemini)             │    │
│  │                                                   │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │    │
│  │  │ Assistant │ │ Coach    │ │ Exam Agent       │ │    │
│  │  │ ReAct    │ │ StateGraph│ │ 10-stage pipeline│ │    │
│  │  │ 9 tools  │ │ 4 étapes │ │ 10 tools         │ │    │
│  │  └────┬─────┘ └──────────┘ └──────────────────┘ │    │
│  │       │                                           │    │
│  │  ┌────▼─────┐ ┌──────────┐ ┌──────────────────┐ │    │
│  │  │ TunBERT  │ │ TP Agent │ │ Feedback Service │ │    │
│  │  │ Tunisien │ │ 2 workflows│ │ Post-évaluation │ │    │
│  │  │ 9 intents│ │ 8 tools  │ │                  │ │    │
│  │  └──────────┘ └──────────┘ └──────────────────┘ │    │
│  │                                                   │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │    │
│  │  │ RAG/Chat │ │ Smart    │ │ Program Extract  │ │    │
│  │  │ ChromaDB │ │ Extract  │ │ Agentic Pipeline │ │    │
│  │  └──────────┘ └──────────┘ └──────────────────┘ │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │              Base de données (SQLite/PostgreSQL)  │    │
│  │  Users, Courses, Chapters, Documents, Quizzes,   │    │
│  │  Exams, Programs, AAP, Competences, Evaluations  │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

---

## 13. Tableau récapitulatif complet

### 13.1 Agents autonomes (LangGraph / ReAct)

| # | Agent | Fichier | Pattern | Modèle | Étapes | Outils | Point d'entrée |
|---|-------|---------|---------|--------|--------|--------|----------------|
| 1 | **Assistant conversationnel** | `assistant_agent.py` | ReAct (LangGraph) | Gemini Flash | 1 cycle boucle | 9 tools + TunBERT | `/assistant/chat` |
| 2 | **Coach pédagogique** | `coach_agent.py` | StateGraph 4 nœuds | Gemini Flash | 4 étapes | 2 fonctions | `/coach/analyze` |
| 3 | **Exam Analyzer** | `exam_agent_graph.py` | StateGraph async | Gemini Flash+Pro | 10 étapes | 11 tools MCP | `/exam/analyze` |
| 4 | **TP Agent (Création)** | `tp_agent_graph.py` | StateGraph | Gemini Flash | 5 étapes | 8 tools MCP | `/practical-work/{id}` |
| 5 | **TP Agent (Correction)** | `tp_agent_graph.py` | StateGraph | Gemini Flash | 2 étapes | 3 tools MCP | `/submissions/{id}/grade` |

### 13.2 Services IA (appels LLM directs)

| # | Service | Fichier | Modèle | Fonctions clés | Description |
|---|---------|---------|--------|----------------|-------------|
| 6 | **AI Service** (Quiz+Éval) | `ai_service.py` | Gemini Flash | 31+ fonctions | Génération quiz 5 types, évaluation, rubrics |
| 7 | **Feedback Service** | `feedback_service.py` | Gemini Flash | `generate_feedback()` | Feedback post-évaluation personnalisé |
| 8 | **Chat RAG** | `chat_service.py` | Gemini Flash | CAG+RAG pipeline | Chat documentaire avec citations |
| 9 | **Summarizer** | `summarizer.py` | Gemini Flash | Résumés + overview | Indexation CAG pour ChromaDB |
| 10 | **Evaluate Service** | `evaluate_service.py` | Gemini Flash | Extract+Classify | Classification Bloom + CLO |
| 11 | **MCP Tools (TP)** | `mcp_tools.py` | Gemini Flash+Pro | 8 outils | Génération TP, correction, tutorat |
| 12 | **Exam MCP Tools** | `exam_mcp_tools.py` | Gemini Flash+Pro | 11 outils | Extraction, classification, LaTeX |
| 13 | **TN Exam Evaluation** | `tn_exam_evaluation_service.py` | Gemini Pro | Analyse complète | Examens tunisiens + rapports |
| 14 | **Video Analysis** | `video_service.py` | Gemini 2.0+ Vision | Frames+Audio+Timeline | Analyse vidéo multimodale |
| 15 | **YouTube RAG** | `youtube_rag_service.py` | Gemini 2.0+ | Transcripts+Analyse | Enrichissement YouTube |
| 16 | **Syllabus Service** | `syllabus_service.py` | Gemini Flash | CLO+PLO+TNE | Extraction syllabus PDF |
| 17 | **Syllabus TN** | `syllabus_tn_service.py` | Gemini Flash+OCR | AAP+AA+Chapitres | Syllabus tunisiens (vision) |
| 18 | **Program Extraction** | `program_extraction_service.py` | Parsing DOCX | AAP+Compétences+Modules | Pipeline formation |

### 13.3 Services IA intégrés dans les API

| # | API | Fichier | Modèle | Fonctions IA | Description |
|---|-----|---------|--------|--------------|-------------|
| 19 | **Chapters** | `chapters.py` | Gemini Flash | 4 fonctions inline | Résumés, AA matching, TP detect |
| 20 | **Chapter Pipeline** | `chapter_pipeline.py` | Gemini Flash | **10 sous-agents** | content/exercise/AA/Bloom/difficulty |
| 21 | **Code Execution** | `code_execution.py` | Gemini Flash | Réponses modèles | Sandbox Piston + IA |
| 22 | **Question Bank** | `course_question_bank.py` | Gemini Flash | 5 types questions | Génération QCM/code/etc. |
| 23 | **Class Chat** | `class_chat.py` | Gemini Flash | @bot chatbot | Chatbot classe multilingue |
| 24 | **Exams** | `exams.py` | Gemini Flash+Pro | Analyse pédagogique | Upload + analyse |
| 25 | **Exam Bank** | `exam_bank.py` | Gemini Pro/Flash | Auto-correction | Safe exam + proctoring |
| 26 | **Section Content** | `section_content.py` | Gemini Flash | Génération contenu | Markdown éducatif |
| 27 | **Section Activities** | `section_activities.py` | Gemini Flash | Quiz génération | Quiz + YouTube |
| 28 | **TN Exams** | `tn_exams.py` | Gemini Flash+Pro | Multi-agents | Analyse + LaTeX + correction |
| 29 | **Assistant STT** | `assistant.py` | Gemini Audio | Speech-to-Text | Compréhension audio native |
| 30 | **Syllabus Versions** | `syllabus_versions.py` | Gemini Flash | Comparaison IA | Diff entre versions |

### 13.4 Modèles ML spécialisés

| # | Modèle | Fichier | Type | Description |
|---|--------|---------|------|-------------|
| 31 | **TunBERT** | `tunbert_service.py` | BERT tunisien (768 dim) | 9 intentions par similarité cosinus |
| 32 | **SentenceTransformer** | `vector_store.py` | all-MiniLM-L6-v2 | Embeddings vectoriels ChromaDB |

### 13.5 Infrastructure IA

| # | Service | Fichier | Technologie | Description |
|---|---------|---------|-------------|-------------|
| 33 | **Vector Store** | `vector_store.py` | ChromaDB | Base vectorielle persistante RAG |
| 34 | **Document Processor** | `document_processor.py` | NLTK+regex | Chunking + vectorisation |
| 35 | **Document Pipeline** | `document_pipeline.py` | Orchestrateur | Pipeline ingestion docs |
| 36 | **Document Manager** | `document_manager.py` | CRUD | Gestion documents + index |
| 37 | **File Service** | `file_service.py` | PyPDF2+docx+OCR | Extraction texte multi-format |

---

**Total : 37 composants IA** dont :
- **5 agents autonomes** avec boucle de décision (LangGraph)
- **13 services IA** avec appels LLM directs
- **12 API avec IA intégrée** (dont 1 pipeline de 10 sous-agents)
- **2 modèles ML** spécialisés
- **5 services d'infrastructure** IA

---

## 14. Stratégie de sélection des modèles

| Modèle | Cas d'usage | Caractéristiques |
|--------|-------------|------------------|
| **Gemini 2.5-Flash** | Défaut (chat, quiz, feedback, extraction) | Rapide, <3s, économique |
| **Gemini 2.5-Pro** | Examens, analyse approfondie, correction | Raisonnement profond, complet |
| **Gemini 2.0+ Vision** | Vidéos, images, YouTube | Multimodal (vision + audio) |
| **Gemini Audio** | Speech-to-Text | Compréhension audio native |
| **TunBERT** | Dialecte tunisien | 768 dim, classification d'intentions |
| **SentenceTransformer** | Embeddings RAG | all-MiniLM-L6-v2, 384 dim |
| **ChromaDB** | Stockage vectoriel | Recherche sémantique persistante |
