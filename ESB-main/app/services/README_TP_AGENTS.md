# ESB-Learning — Architecture MCP + LangGraph (Travaux Pratiques)

## Vue d'ensemble

Le système de Travaux Pratiques (TP) code repose sur une architecture **MCP (Model Context Protocol) + LangGraph**
qui orchestre des agents IA pour :

1. **Génération de l'énoncé** à partir des documents de cours
2. **Suggestion des AA** (Apprentissages Attendus)
3. **Génération de la correction de référence**
4. **Correction automatique** des soumissions étudiantes
5. **Proposition de note** (scale 0–20)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Next.js 14)                         │
│                                                                       │
│  /tp/create      → Formulaire enseignant (4 étapes)                  │
│  /tp/[tpId]      → Éditeur de code étudiant                          │
│  /tp/[tpId]/review → Revue + validation des notes (enseignant)       │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ REST API (JWT cookies)
┌──────────────────────────▼──────────────────────────────────────────┐
│                   FLASK API — practical_work.py                      │
│                                                                       │
│  POST   /api/v1/sections/<id>/practical-work      Créer un TP        │
│  PUT    /api/v1/practical-work/<id>               Mettre à jour      │
│  POST   /api/v1/practical-work/<id>/generate-statement  IA: Énoncé  │
│  POST   /api/v1/practical-work/<id>/suggest-aa    IA: AA codes       │
│  POST   /api/v1/practical-work/<id>/generate-reference IA: Corr.    │
│  PUT    /api/v1/practical-work/<id>/publish       Publier            │
│  POST   /api/v1/practical-work/<id>/submit        Soumettre (étud.)  │
│  GET    /api/v1/practical-work/<id>/submissions   Liste soumissions  │
│  PUT    /api/v1/practical-work/submissions/<id>/grade  Valider note  │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ Python call (in-process)
┌──────────────────────────▼──────────────────────────────────────────┐
│          LangGraph StateGraph — tp_agent_graph.py                    │
│                                                                       │
│  WORKFLOW CRÉATION (enseignant) :                                    │
│  START → [get_context] → [generate_statement] → [suggest_aa]        │
│        → [generate_reference] → END                                  │
│                                                                       │
│  WORKFLOW CORRECTION (étudiant) :                                    │
│  START → [auto_correct] → [propose_grade] → END                     │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ Tool calls
┌──────────────────────────▼──────────────────────────────────────────┐
│                MCP Tools — mcp_tools.py                              │
│                                                                       │
│  get_section_context(section_id)                                     │
│    → Documents, transcripts YouTube, textes de la section            │
│                                                                       │
│  generate_tp_statement(context, language, hint)                      │
│    → Énoncé Markdown structuré                                       │
│                                                                       │
│  suggest_aa_codes(section_id, statement)                             │
│    → Liste de codes AA avec justification                            │
│                                                                       │
│  generate_reference_solution(statement, language, max_grade)         │
│    → Code de référence + grille de correction                        │
│                                                                       │
│  auto_correct_submission(statement, ref, code, language, criteria)   │
│    → Rapport de correction détaillé (Markdown)                       │
│                                                                       │
│  propose_grade(correction_report, max_grade)                         │
│    → Note numérique + justification                                  │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ Gemini API
                    Google Gemini 2.0 Flash
```

---

## Serveur MCP standalone

Le fichier `app/services/tp_mcp_server.py` expose tous les outils via le protocole **MCP stdio**
(JSON-RPC 2.0). Il peut être utilisé par tout client MCP compatible (Claude Desktop, etc.) :

```bash
# Lancer le serveur MCP (stdio)
cd ESB-main
python -m app.services.tp_mcp_server
```

Configuration dans un client MCP (ex. Claude Desktop `mcp_config.json`) :
```json
{
  "mcpServers": {
    "esb-tp": {
      "command": "python",
      "args": ["-m", "app.services.tp_mcp_server"],
      "cwd": "/chemin/vers/ESB-main"
    }
  }
}
```

### Outils MCP disponibles

| Outil | Description | Entrée | Sortie |
|-------|-------------|--------|--------|
| `get_section_context` | Récupère le contenu éducatif de la section | `section_id: int` | `{context, document_count, has_transcripts}` |
| `generate_tp_statement` | Génère un énoncé TP structuré | `context, language, hint` | `{title, statement}` |
| `suggest_aa_codes` | Suggère les AA correspondants | `section_id, statement` | `{aa_codes, justification}` |
| `generate_reference_solution` | Génère la correction de référence | `statement, language, max_grade` | `{reference_solution, correction_criteria}` |
| `auto_correct_submission` | Corrige automatiquement le code étudiant | `statement, reference_solution, student_code, language, correction_criteria, max_grade` | `{correction_report, score, max_score, detailed_feedback}` |
| `propose_grade` | Propose une note finale | `correction_report, max_grade` | `{proposed_grade, justification, confidence}` |

---

## Modèles de données

### `PracticalWork`

```
id                  INTEGER  PK
section_id          INTEGER  FK → tn_section.id
title               VARCHAR(200)
language            VARCHAR(20)  -- python|sql|r|java|c|cpp
max_grade           FLOAT    -- défaut 20.0
status              VARCHAR(20)  -- draft|published
statement           TEXT     -- Markdown
statement_source    VARCHAR(20)  -- teacher|ai
aa_codes            JSON     -- ["AA1.1", "AA1.2"]
reference_solution  TEXT     -- code de référence (caché aux étudiants)
reference_validated BOOLEAN
correction_criteria TEXT     -- grille d'évaluation
created_at          DATETIME
updated_at          DATETIME
```

### `PracticalWorkSubmission`

```
id                  INTEGER  PK
tp_id               INTEGER  FK → practical_work.id
student_id          INTEGER  FK → user.id
code                TEXT     -- code soumis par l'étudiant
attempt_number      INTEGER
submitted_at        DATETIME
correction_status   VARCHAR(20)  -- pending|correcting|done|failed
correction_report   TEXT     -- Markdown (rapport IA)
proposed_grade      FLOAT    -- note proposée par IA
status              VARCHAR(20)  -- submitted|correcting|graded
final_grade         FLOAT    -- note validée par l'enseignant
teacher_comment     TEXT
graded_at           DATETIME
graded_by_id        INTEGER  FK → user.id
```

---

## Workflow complet

### Côté enseignant — Création d'un TP

```
1. [POST /sections/{id}/practical-work]
   → Crée le TP en mode "draft" avec titre + langage

2. [POST /practical-work/{id}/generate-statement]
   → Agent LangGraph:
       get_section_context → collecte docs/transcripts
       generate_tp_statement → prompt Gemini avec contexte
   → Énoncé Markdown stocké en DB, source='ai'

3. (Optionnel) Modifier l'énoncé manuellement via [PUT /practical-work/{id}]

4. [POST /practical-work/{id}/suggest-aa]
   → suggest_aa_codes(section_id, statement)
   → Liste de codes AA suggérés avec justification

5. [PUT /practical-work/{id}]  (aa_codes validés)
   → Sauvegarde les AA sélectionnés

6. [POST /practical-work/{id}/generate-reference]
   → Agent LangGraph:
       generate_reference_solution(statement, language)
   → Code de référence + grille de correction stockés

7. [PUT /practical-work/{id}/publish]
   → status = 'published', visible aux étudiants
```

### Côté étudiant — Soumission

```
1. [GET /practical-work/{id}]
   → Voir l'énoncé (reference_solution cachée)

2. [POST /practical-work/{id}/submit]  { code: "..." }
   → Crée PracticalWorkSubmission (status=submitted)
   → Lance thread asynchrone :
       auto_correct_submission(statement, reference, code, language)
       propose_grade(correction_report)
   → Mise à jour correction_status, correction_report, proposed_grade

3. [GET /practical-work/{id}/my-submission]
   → Polling (5s) jusqu'à correction_status=done
   → Affichage du rapport + note proposée
```

### Côté enseignant — Correction

```
1. [GET /practical-work/{id}/submissions]
   → Liste toutes les soumissions avec statut

2. Voir le code étudiant + rapport IA + note proposée

3. [PUT /practical-work/submissions/{sub_id}/grade]
   { final_grade: 14.5, teacher_comment: "..." }
   → status = 'graded', final_grade enregistré
```

---

## Langages supportés

| Code | Affichage | Version cible |
|------|-----------|---------------|
| `python` | Python 3 | Python 3.10+ |
| `sql` | SQL (PostgreSQL) | PostgreSQL 14+ |
| `r` | R | R 4.x |
| `java` | Java 11+ | OpenJDK 11/17 |
| `c` | C (C11) | GCC C11 |
| `cpp` | C++ (C++17) | GCC C++17 |

---

## Variables d'environnement requises

```env
GOOGLE_API_KEY=...    # Clé API Google Gemini (dans ESB-main/.env)
```

---

## Structure des fichiers

```
ESB-main/
├── app/
│   ├── models.py                    # PracticalWork + PracticalWorkSubmission
│   ├── api/v1/
│   │   └── practical_work.py        # Routes REST API
│   └── services/
│       ├── mcp_tools.py             # 6 outils MCP (fonctions Python)
│       ├── tp_agent_graph.py        # LangGraph StateGraph
│       ├── tp_mcp_server.py         # Serveur MCP standalone (stdio)
│       └── README_TP_AGENTS.md      # Documentation agents (ce fichier)

esb-nextjs/
├── lib/
│   ├── types/practicalWork.ts       # Types TypeScript
│   ├── api/practicalWork.ts         # Client API
│   └── hooks/usePracticalWork.ts    # React Query hooks
└── app/(dashboard)/courses/[id]/chapters/[chapterId]/tp/
    ├── create/page.tsx              # Page création TP (enseignant)
    ├── [tpId]/page.tsx              # Page soumission code (étudiant)
    └── [tpId]/review/page.tsx       # Page revue corrections (enseignant)
```
