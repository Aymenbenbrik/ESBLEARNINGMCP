# Architecture Agentic AI — Plateforme ESB-Learning

## 1. Vue d'ensemble

La plateforme ESB-Learning implémente une architecture **Agentic AI multi-agents** orchestrée par des modèles de langage (LLM). Le système comporte **9 agents/services AI** interconnectés, utilisant principalement **Google Gemini** comme LLM d'orchestration et **LangGraph** comme framework d'agents.

### Technologies clés
| Technologie | Rôle |
|------------|------|
| **Google Gemini 2.5-Flash** | LLM principal (orchestration, génération, analyse) |
| **Google Gemini 2.5-Pro** | LLM avancé (examens, analyse approfondie) |
| **LangGraph** | Framework d'agents (StateGraph, ReAct) |
| **TunBERT** (tunis-ai/TunBERT) | Modèle BERT pré-entraîné sur le dialecte tunisien |
| **ChromaDB** | Base vectorielle pour RAG |
| **gTTS** | Synthèse vocale (Text-to-Speech) |
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

## 9. Services d'Extraction et Traitement

### 9.1 Smart Extraction Service
**Fichier** : `app/services/smart_extraction_service.py`

Extraction intelligente de contenu pour la génération de quiz, alignée sur les CLO et objectifs.

| Fonction | Description |
|----------|-------------|
| `smart_extract_from_attachments()` | Extraction multi-fichiers intelligente |
| `extract_meaningful_content()` | Scoring et classement de pertinence des sections |
| `identify_section_type()` | Classification (définition/exemple/application/concept) |
| `score_section()` | Score de pertinence basé sur mots-clés CLO/objectif |

### 9.2 Document Extraction Service
**Fichier** : `app/services/document_extraction_service.py`

Formats supportés : PDF, DOCX, Vidéo (MP4, MOV, MKV, AVI, WebM), TXT

### 9.3 Video Analysis Service
**Fichier** : `app/services/video_service.py`  
**Modèle** : Gemini 2.5-Flash (vision + audio)

Pipeline : Extraction frames → Transcription audio → Analyse visuelle → Timeline → Rapport PDF

### 9.4 Syllabus Service
**Fichier** : `app/services/syllabus_service.py`

Extraction des CLO (Course Learning Outcomes), plan hebdomadaire, PLO, TNE depuis les PDF syllabus.

### 9.5 Program Extraction Service
**Fichier** : `app/services/program_extraction_service.py`

Pipeline Agentic AI pour l'extraction automatique depuis le descriptif de formation :
- Extraction des AAP (Acquis d'Apprentissage Professionnels)
- Extraction des compétences
- Extraction des modules et organisation par semestre
- Création automatique des enseignants
- Affectation enseignants → cours

---

## 10. Diagramme d'architecture globale

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

## 11. Tableau récapitulatif des agents

| Agent | Type | Modèle | Pattern | Étapes | Outils | Point d'entrée |
|-------|------|--------|---------|--------|--------|----------------|
| **Assistant** | Conversationnel | Gemini Flash | ReAct | 1 cycle | 9 | `/assistant/chat` |
| **TunBERT** | Preprocessing | TunBERT (BERT) | Cosine similarity | 1 | 3 fonctions | Appelé par Assistant |
| **Coach** | Analytique | Gemini Flash | StateGraph | 4 | 2 fonctions | `/coach/analyze` |
| **Exam** | Pipeline | Gemini Flash/Pro | StateGraph async | 10 | 10 | `/exam/analyze` |
| **TP Création** | Pipeline | Gemini Flash | StateGraph | 5 | 8 | `/practical-work/{id}` |
| **TP Correction** | Pipeline | Gemini Flash | StateGraph | 2 | 3 | `/submissions/{id}/grade` |
| **Feedback** | Génératif | Gemini Flash | Appel direct | 1 | — | `/feedback/generate/{id}` |
| **RAG/Chat** | Retrieval | Gemini Flash + ChromaDB | CAG→RAG | 2 | — | `/ai/chat/{doc_id}` |
| **Program Extract** | Pipeline | Gemini Flash | Multi-agents | 5+ | — | `/programs/{id}/process` |

---

## 12. Stratégie de sélection des modèles

| Modèle | Cas d'usage | Caractéristiques |
|--------|-------------|------------------|
| **Gemini 2.5-Flash** | Défaut (chat, quiz, feedback) | Rapide, <3s, économique |
| **Gemini 2.5-Pro** | Examens, analyse approfondie | Raisonnement profond, complet |
| **TunBERT** | Dialecte tunisien | 768 dim, classification d'intentions |
| **ChromaDB embeddings** | RAG documentaire | Recherche sémantique vectorielle |
