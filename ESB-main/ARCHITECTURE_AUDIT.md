# 🔍 Audit d'Architecture — ESB-Learning SkillManager

**Date** : 11 Avril 2026  
**Projet** : ESB-Learning — Plateforme e-learning adaptative pour ESPRIT  
**Scope** : 4 Agents AI + SkillManager + MCP Tools

---

## Résumé Exécutif

Le projet ESB-Learning implémente une **architecture hybride** combinant LangGraph StateGraphs, des définitions MCP tools et un système de skills modulaire. L'audit révèle que **seul l'agent Assistant** suit une architecture véritablement agentic. Les 3 autres agents nécessitent des améliorations significatives.

**Score global : B+ (7/10)** — Bonne fondation, autonomie des agents insuffisante.

---

## 1. Analyse par Agent

### 1.1 Assistant Agent ✅ FULLY AGENTIC

| Critère | Statut |
|---------|--------|
| **Fichier** | `app/services/assistant_agent.py` (~893 lignes) |
| **Pattern** | ReAct Agent (`create_react_agent` de LangGraph) |
| **Tools** | 9 tools `@tool` décorés (role-based: common/student/teacher) |
| **Skills** | ✅ Injectés via `as_langchain_tools()` — autonomie totale |
| **Agentic** | ✅ OUI — boucle tool-calling autonome |

**Comment ça marche :**
```python
# L'agent reçoit les skills comme des LangChain tools
skill_tools = skill_manager.as_langchain_tools(agent_id='assistant', role=role, user_id=user_id)
all_tools = base_tools + skill_tools
agent = create_react_agent(llm, all_tools, prompt=system_prompt)
# → L'agent DÉCIDE lui-même quels tools/skills appeler
```

**Verdict** : Architecture exemplaire. Modèle à suivre pour les autres agents.

---

### 1.2 Coach Agent ❌ NOT AGENTIC

| Critère | Statut |
|---------|--------|
| **Fichier** | `app/services/coach_agent.py` (~342 lignes) |
| **Pattern** | Fonction Python séquentielle (pas de Graph) |
| **Tools** | Aucun — appels directs hardcodés |
| **Skills** | `compose()` séquentiel + enrichissements hardcodés |
| **Agentic** | ❌ NON — aucune autonomie |

**Problèmes :**
- Pas de `StateGraph` ni `create_react_agent`
- `analyze_student_performance()` est une simple fonction linéaire
- Skills appelés via `compose(['performance-scorer', 'weakness-detector', ...])` — séquence fixe
- 4 skills supplémentaires (bloom, syllabus, feedback, language) appelés en dur après le LLM
- L'agent ne peut pas **choisir** quels skills utiliser

**Verdict** : Doit être transformé en StateGraph avec tool-calling.

---

### 1.3 Exam Agent ⚠️ PARTIELLEMENT AGENTIC

| Critère | Statut |
|---------|--------|
| **Fichier** | `app/services/exam_agent_graph.py` (~384 lignes) |
| **Pattern** | StateGraph 10 nœuds linéaires |
| **Tools** | 9 MCP tools définis (`exam_mcp_tools.py`) mais appelés directement |
| **Skills** | 4 skills en enrichissement hardcodé |
| **Agentic** | ⚠️ PARTIEL — graph structuré mais pas de tool-calling |

**Pipeline :**
```
extract_text → extract_questions → classify_aa → classify_bloom
→ assess_difficulty → compare_content → analyze_feedback
→ suggest_adjustments → generate_latex → evaluate_proposal → END
```

**Problèmes :**
- Les nœuds sont des **fonctions Python pures** qui appellent les MCP tools directement
- Pas de boucle tool-calling — chaque nœud a un comportement fixe
- Skills (syllabus-mapper, bloom-classifier, feedback-writer, rubric-builder) sont des enrichissements hardcodés
- L'agent ne peut pas autonomement décider d'utiliser un skill

**Verdict** : Bon workflow mais les nœuds clés devraient utiliser le tool-calling.

---

### 1.4 TP Agent ⚠️ PARTIELLEMENT AGENTIC

| Critère | Statut |
|---------|--------|
| **Fichier** | `app/services/tp_agent_graph.py` (~361 lignes) |
| **Pattern** | 2 StateGraphs (création 5 nœuds, correction 2 nœuds) |
| **Tools** | 8 MCP tools définis (`mcp_tools.py`) mais appelés directement |
| **Skills** | 6 skills en enrichissement hardcodé |
| **Agentic** | ⚠️ PARTIEL — graph structuré mais pas de tool-calling |

**Creation Workflow :**
```
get_context → generate_statement → parse_questions → suggest_aa → generate_reference → END
```

**Correction Workflow :**
```
auto_correct → propose_grade → END
```

**Mêmes problèmes que l'Exam Agent.**

---

## 2. Analyse MCP

### 2.1 Définitions MCP Tools

| Fichier | Nb Tools | Schema JSON | Utilisé en production |
|---------|----------|-------------|----------------------|
| `mcp_tools.py` | 10 tools TP | ✅ `MCP_TOOL_DEFINITIONS` avec inputSchema | ❌ Appelés directement |
| `exam_mcp_tools.py` | 9 tools Exam | ✅ `EXAM_MCP_TOOL_DEFINITIONS` avec inputSchema | ❌ Appelés directement |

### 2.2 Serveur MCP

| Fichier | Statut |
|---------|--------|
| `tp_mcp_server.py` | ✅ Existe — JSON-RPC 2.0 + stdio transport |
| | ❌ **Non utilisé en production** |
| | ⚠️ Couvre uniquement les tools TP (pas Exam) |

**Le serveur MCP existe mais n'est pas intégré dans le flow de production.** Les tools sont appelés comme des fonctions Python classiques.

---

## 3. Analyse SkillManager

### 3.1 Architecture du SkillManager

| Composant | Statut |
|-----------|--------|
| `SkillManager` | ✅ Orchestrateur complet (430 lignes) |
| `SkillContext` | ✅ Contexte d'exécution (user, course, role, agent) |
| `SkillResult` | ✅ Résultat standardisé (success, data, error, metadata) |
| `BaseSkill` | ✅ Classe abstraite avec helpers LLM |
| 12 Skills | ✅ Tous implémentés et enregistrés |
| Seed data | ✅ 4 agents + 12 skills + mappings role/agent |
| API REST | ✅ 7 endpoints JWT-protégés |
| Tracking | ✅ `SkillExecution` model pour analytics |

### 3.2 Méthodes clés

| Méthode | Usage actuel | Usage idéal |
|---------|-------------|-------------|
| `execute()` | ✅ Utilisé partout | ✅ OK |
| `compose()` | Coach seulement | Tout agent séquentiel |
| `as_langchain_tools()` | **Assistant seulement** | **Tous les agents** |
| `resolve_for_agent()` | Via as_langchain_tools | Résolution dynamique partout |
| `get_usage_stats()` | API REST | Dashboard analytics |

### 3.3 Matrice Skills × Agents

| Skill | Assistant | Coach | Exam | TP | Mode d'intégration |
|-------|-----------|-------|------|----|-------------------|
| bloom-classifier | ✅ tool | ✅ hardcodé | ✅ hardcodé | ✅ hardcodé | Mixte |
| syllabus-mapper | ✅ tool | ✅ hardcodé | ✅ hardcodé | ✅ hardcodé | Mixte |
| feedback-writer | ✅ tool | ✅ hardcodé | ✅ hardcodé | ✅ hardcodé | Mixte |
| performance-scorer | ✅ tool | ✅ compose | — | — | Mixte |
| weakness-detector | ✅ tool | ✅ compose | — | — | Mixte |
| exercise-recommender | ✅ tool | ✅ compose | — | — | Mixte |
| study-planner | ✅ tool | ✅ compose | — | — | Mixte |
| quiz-generator | ✅ tool | — | — | ✅ hardcodé | Mixte |
| content-summarizer | ✅ tool | — | — | — | Tool only |
| code-reviewer | ✅ tool | — | — | ✅ hardcodé | Mixte |
| rubric-builder | ✅ tool | — | ✅ hardcodé | ✅ hardcodé | Mixte |
| language-adapter | ✅ tool | ✅ hardcodé | — | — | Mixte |

**Problème** : Seul l'Assistant utilise les skills comme des **tools autonomes**. Les 3 autres agents les utilisent en **appels directs hardcodés**.

---

## 4. Scores détaillés

| Critère | Score | Commentaire |
|---------|-------|-------------|
| MCP Tools définis | 9/10 | Schémas JSON complets pour 19 tools |
| MCP Server | 4/10 | Existe mais pas utilisé en production |
| Pattern Agentic (Assistant) | 10/10 | ReAct parfait avec tool-calling |
| Pattern Agentic (Coach) | 2/10 | Fonction séquentielle, pas d'autonomie |
| Pattern Agentic (Exam) | 5/10 | StateGraph OK mais nœuds non-agentic |
| Pattern Agentic (TP) | 5/10 | Idem Exam |
| Skills comme Tools | 4/10 | Seulement pour Assistant |
| State Management | 9/10 | StateGraphs bien structurés |
| Execution Tracking | 8/10 | SkillExecution model complet |
| **TOTAL** | **56/90 (62%)** | **B+ — Bonne fondation** |

---

## 5. Améliorations Recommandées

### 5.1 Coach Agent → StateGraph + Tool-calling
- Transformer la fonction séquentielle en StateGraph
- Créer des nœuds tool-calling pour les skills
- Utiliser `as_langchain_tools()` pour l'autonomie

### 5.2 Exam Agent → Nœuds Agentic
- Transformer les nœuds clés en sous-agents tool-calling
- Exposer les MCP tools + skills comme LangChain tools dans les nœuds
- Garder le pipeline StateGraph mais avec des nœuds intelligents

### 5.3 TP Agent → Nœuds Agentic
- Même approche que l'Exam Agent
- Les 2 workflows (création/correction) deviennent agentic

### 5.4 MCP Server → Production
- Intégrer le serveur MCP dans le flow de production
- Ajouter les tools Exam au serveur
- Exposer via HTTP/SSE pour interopérabilité

### 5.5 Skills → Tools Partout
- Utiliser `as_langchain_tools()` dans tous les agents
- Supprimer les appels hardcodés au profit du tool-calling
- L'agent décide autonomement quels skills utiliser

---

*Rapport généré automatiquement par l'audit d'architecture ESB-Learning.*
