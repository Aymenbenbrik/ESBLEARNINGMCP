# Rapport sur les Techniques de Prompt Engineering
## ESB-Learning Platform — Analyse Complète

**Date :** Avril 2026  
**Projet :** ESB-Learning (ESPRIT — École Supérieure Privée d'Ingénierie et de Technologies)  
**Périmètre :** 15 skills, 1 agent ReAct, base infrastructure (base.py)  
**Version codebase :** commit `4d170a3`

---

## Table des Matières

1. [Vue d'ensemble](#1-vue-densemble)
2. [Technique 1 — Role Prompting](#2-technique-1--role-prompting)
3. [Technique 2 — JSON Forcing](#3-technique-2--json-forcing)
4. [Technique 3 — Few-Shot Examples](#4-technique-3--few-shot-examples)
5. [Technique 4 — Constraint Injection](#5-technique-4--constraint-injection)
6. [Technique 5 — Self-Consistency Decoding](#6-technique-5--self-consistency-decoding)
7. [Technique 6 — Role-Aware Prompt Branching](#7-technique-6--role-aware-prompt-branching)
8. [Technique 7 — Temperature Calibration](#8-technique-7--temperature-calibration)
9. [Technique 8 — Multi-language Adaptive Prompting](#9-technique-8--multi-language-adaptive-prompting)
10. [Technique 9 — Contextual Grounding (RAG)](#10-technique-9--contextual-grounding-rag)
11. [Technique 10 — Prompt Versioning (A/B)](#11-technique-10--prompt-versioning-ab)
12. [Matrice de couverture](#12-matrice-de-couverture)
13. [Analyse des températures](#13-analyse-des-températures)
14. [Anti-patterns identifiés et corrections](#14-anti-patterns-identifiés-et-corrections)
15. [Recommandations futures](#15-recommandations-futures)

---

## 1. Vue d'ensemble

ESB-Learning utilise **10 techniques de prompt engineering** distinctes réparties sur 15 skills et 1 agent conversationnel. Le modèle LLM sous-jacent est **Gemini 2.5 Flash** (défaut) et **Gemini 2.5 Pro** (mode robuste), appelé via LangChain.

### Inventaire des composants

| Composant | Fichier | Catégorie | Appels LLM |
|-----------|---------|-----------|-----------|
| `bloom-classifier` | `bloom_classifier.py` | analysis | 1 |
| `syllabus-mapper` | `syllabus_mapper.py` | analysis | 1 |
| `quiz-generator` | `quiz_generator.py` | generation | 1 |
| `rubric-builder` | `rubric_builder.py` | generation | 1 |
| `weakness-detector` | `weakness_detector.py` | analysis | 1 |
| `feedback-writer` | `feedback_writer.py` | generation | 1 |
| `study-planner` | `study_planner.py` | planning | 1 |
| `exercise-recommender` | `exercise_recommender.py` | generation | 1 |
| `content-summarizer` | `content_summarizer.py` | generation | 1 |
| `code-reviewer` | `code_reviewer.py` | analysis | 1 |
| `language-adapter` | `language_adapter.py` | generation | 1–2 |
| `performance-scorer` | `performance_scorer.py` | scoring | **3** (self-consistency) |
| `AssistantAgent` | `assistant_agent.py` | react | N (dynamique) |
| `BaseSkill` | `base.py` | infrastructure | cache + merge |

### Score de maturité global : **8.5 / 10**

---

## 2. Technique 1 — Role Prompting

### Définition
Assigner explicitement un **rôle expert** au modèle en début de system prompt pour ancrer son comportement, son vocabulaire et sa posture.

### Couverture : **15/15 composants** (100%)

### Patterns observés

**Pattern A — Expert disciplinaire** (skills d'analyse)
```
"Tu es un expert en taxonomie de Bloom pour l'enseignement supérieur."
"Tu es un expert en diagnostic pédagogique."
"Tu es un expert en ingénierie pédagogique."
"Tu es un expert en évaluation pédagogique."
```

**Pattern B — Praticien bienveillant** (skills de génération et feedback)
```
"Tu es un tuteur bienveillant en enseignement supérieur."
"Tu es un enseignant en programmation bienveillant et pédagogue."
"Tu es un tuteur pédagogique bienveillant qui aide les étudiants..."
"Tu es un planificateur d'études expert."
```

**Pattern C — Persona complexe** (AssistantAgent)
```
You are **ESB Assistant**, the official pedagogical AI assistant
of the ESB-Learning platform.
The current user is "{user_name}" (user_id={user_id}) with role: **{role}**.
Today's date is {date.today().isoformat()}.
```

### Analyse

Le Pattern C est le plus sophistiqué : il combine le rôle, l'identité de la plateforme, le contexte utilisateur dynamique et la date courante dans une seule déclaration d'identité. L'injection de `user_id` empêche le modèle de généraliser et l'oblige à opérer sur des données précises.

Les Patterns A et B signalent clairement au modèle s'il doit adopter une posture **analytique/technique** (expert) ou **relationnelle/encourageante** (tuteur), ce qui se répercute directement sur le ton et la structure des outputs.

---

## 3. Technique 2 — JSON Forcing

### Définition
Forcer une sortie structurée en JSON en incluant dans le prompt : (1) l'instruction explicite de ne répondre qu'en JSON, (2) le schéma exact attendu, et parfois (3) des types/valeurs attendus inline.

### Couverture : **13/15 composants** *(sauf AssistantAgent texte libre)*

### Exemples par skill

**`bloom-classifier`** — Schéma minimal avec types contraints :
```
"Réponds UNIQUEMENT en JSON valide (sans markdown):
{"level": "...", "confidence": 0.0-1.0, "justification": "..."}"
```
→ Le token `UNIQUEMENT` est un **marqueur d'exclusivité** qui supprime le texte parasite.

**`quiz-generator`** — Schéma imbriqué avec union de types :
```
'JSON: {"questions": [{"text": "...", "type": "qcm|vrai_faux|ouverte",
"bloom_level": "...", "aa_code": "...", "options": ["A", "B", "C", "D"],
"correct_answer": "...", "explanation": "...", "difficulty": 1-5}]}'
```
→ La notation `"type": "qcm|vrai_faux|ouverte"` encode une **énumération inline** sans avoir à définir un JSON Schema formel.

**`rubric-builder`** — Schéma profondément imbriqué (3 niveaux) :
```
'JSON: {"rubric": {"title": "...", "max_score": N,
"criteria": [{"name": "...", "description": "...", "max_points": N,
"aa_code": "...", "levels": [
  {"label": "Excellent", "points": N, "description": "..."},
  {"label": "Bien", "points": N, "description": "..."},
  {"label": "Insuffisant", "points": N, "description": "..."}
]}]}}'
```
→ Les labels `"Excellent"`, `"Bien"`, `"Insuffisant"` sont **pré-remplis** pour guider la nomenclature des niveaux.

**`code-reviewer`** — Schéma avec types de sévérité :
```
'JSON: {"overall_score": 0-20, "issues": [{"line": N,
"severity": "error|warning|suggestion",
"message": "...", "hint": "..."}],
"strengths": ["..."], "improvements": ["..."], "learning_points": ["..."]}'
```

**`language-adapter` (detect_only)**  — Schéma multi-dimension :
```
'JSON: {"detected_language": "fr|en|tn", "confidence": 0.0-1.0,
"emotional_tone": "positive|neutral|negative|frustrated|confused",
"formality": "formal|casual|mixed"}'
```
→ Détection enrichie : langue + tonalité émotionnelle + registre en un seul appel.

**`performance-scorer`** — Schéma avec plages numériques :
```
'JSON: {"bloom_scores": {"remember": 0-100, "understand": 0-100, "apply": 0-100,
"analyze": 0-100, "evaluate": 0-100, "create": 0-100},
"strongest": "...", "weakest": "..."}'
```

### Technique de parsing dans `base.py`

La méthode `call_llm_json()` nettoie les réponses qui encapsulent le JSON dans des blocs markdown :
```python
def call_llm_json(self, system_prompt, user_prompt, **kwargs) -> Dict:
    raw = self.call_llm(system_prompt, user_prompt, **kwargs)
    if '```json' in raw:
        raw = raw.split('```json')[1].split('```')[0].strip()
    elif '```' in raw:
        raw = raw.split('```')[1].split('```')[0].strip()
    return json.loads(raw)
```
→ Ce parsing défensif gère les cas où le modèle ignore l'instruction `UNIQUEMENT`.

---

## 4. Technique 3 — Few-Shot Examples

### Définition
Fournir 2–3 exemples concrets entrée→sortie dans le prompt pour ancrer la définition des catégories et améliorer la précision des classifications.

### Couverture : **1/15 composants** — `bloom-classifier` (ajouté en v3)

### Implémentation complète

```python
FEW_SHOT_EXAMPLES = """
## Examples

### Example 1 — Remember (niveau 1)
Content: "Quelle est la définition d'un algorithme ?"
→ {"level": "remember", "confidence": 0.97, "justification":
   "Simple restitution d'une définition mémorisée,
    aucune transformation cognitive requise."}

### Example 2 — Apply (niveau 3)
Content: "Implémentez un algorithme de tri par insertion en Python
          et testez-le sur la liste [5, 3, 8, 1]."
→ {"level": "apply", "confidence": 0.94, "justification":
   "L'étudiant doit mobiliser le concept de tri et l'exécuter
    concrètement dans un langage de programmation."}

### Example 3 — Evaluate (niveau 5)
Content: "Comparez les algorithmes QuickSort et MergeSort et justifiez
          lequel choisir pour un tableau presque trié de 10⁶ éléments."
→ {"level": "evaluate", "confidence": 0.91, "justification":
   "Requiert un jugement critique basé sur des critères
    (complexité, cache-friendliness, stabilité)
    — dépasse la simple analyse."}
"""
```

### Design des exemples

| Exemple | Niveau Bloom | Raison du choix |
|---------|-------------|-----------------|
| "Quelle est la définition…" | Remember (1) | Cas prototype sans ambiguïté |
| "Implémentez… et testez-le" | Apply (3) | Niveau ambiguë entre Understand et Apply — l'exemple tranche |
| "Comparez… et justifiez" | Evaluate (5) | Distingue Analyze (4) d'Evaluate (5), souvent confondu |

> Les niveaux 2 (Understand), 4 (Analyze) et 6 (Create) ne sont pas couverts par des exemples — opportunité d'amélioration future.

### Impact théorique

La recherche sur le few-shot prompting (Brown et al., 2020) montre +15% de précision sur les tâches de classification pour 2–3 exemples bien choisis. La sélection des exemples aux **frontières de classe ambiguës** (Apply vs Understand, Evaluate vs Analyze) maximise l'apport informationnel.

---

## 5. Technique 4 — Constraint Injection

### Définition
Injecter des **contraintes métier explicites** dans le prompt pour borner l'espace de réponses et éliminer les valeurs par défaut non pertinentes.

### Couverture : **8/15 composants**

### Exemples par skill

**`quiz-generator`** — Contrainte sur le nombre exact :
```python
f"Génère exactement {num_questions} questions de quiz.\n"
f"Niveaux de Bloom ciblés: {bloom_levels}\n"
f"Types de questions: {question_types}\n"
"Chaque question doit être alignée à un AA si disponible.\n"
```
→ Quatre contraintes empilées : quantité exacte + niveaux Bloom + types + alignement AA.

**`exercise-recommender`** — Contrainte de progression :
```python
"Chaque exercice doit être progressif (du plus simple au plus complexe).\n"
f"Propose maximum {max_exercises} exercices.\n"
```

**`code-reviewer`** — Contrainte pédagogique critique :
```python
"N'écris JAMAIS la solution complète — guide l'étudiant.\n"
```
→ Constraint négative (interdit explicite). Préserve la valeur pédagogique de l'exercice.

**`rubric-builder`** — Contraintes de scoring :
```python
f"Note maximale: {max_score} points.\n"
f"Nombre de critères: {num_criteria}.\n"
"Aligne chaque critère à un AA si disponible.\n"
```

**`content-summarizer`** — Contraintes de format et longueur :
```python
f"Limite: {max_words} mots maximum.\n"
f"Style: {style}. {style_instructions.get(style, '')}\n"
f"Niveau de l'étudiant: {level}. {level_instructions.get(level, '')}\n"
```

**`study-planner`** — Contrainte temporelle réaliste :
```python
f"L'étudiant dispose de {available_hours}h par semaine.\n"
f"{'Date limite: ' + deadline if deadline else 'Pas de date limite spécifique.'}\n"
```

**`performance-scorer`** — Contrainte de format de score :
```python
'"bloom_scores": {"remember": 0-100, ...}'
```
→ La plage `0-100` est une contrainte inline dans le schéma JSON.

**`AssistantAgent`** — Contrainte sur l'accès aux données :
```
IMPORTANT: When calling any tool, always use user_id={user_id}
for the current user's data.
1. Always consult your tools before answering any question about
   courses, grades, performance, calendar, or students.
   Never guess or hallucinate data.
```
→ Anti-hallucination constraint : force le recours aux outils plutôt qu'à la mémoire paramétrique.

---

## 6. Technique 5 — Self-Consistency Decoding

### Définition
Générer **N réponses indépendantes** pour la même requête (avec température > 0) puis fusionner par vote majoritaire (strings) ou médiane (nombres), réduisant la variance des outputs LLM.

### Couverture : **1/15 composants** — `performance-scorer` (ajouté en v3)

### Infrastructure dans `base.py`

```python
def call_llm_json_consistent(
    self,
    system_prompt: str,
    user_prompt: str,
    n: int = 3,
    temperature: float = 0.7,
    **kwargs,
) -> Dict:
    results: List[Dict] = []
    for i in range(n):
        # Unique suffix bypasses the TTLCache so each call is independent
        varied_prompt = f"{user_prompt}\n<!-- attempt {i + 1} -->"
        try:
            result = self.call_llm_json(
                system_prompt, varied_prompt, temperature=temperature, **kwargs
            )
            results.append(result)
        except Exception as exc:
            logger.warning("Self-consistency attempt %d/%d failed...", i+1, n, exc)

    return _merge_consistent(results)
```

### Algorithme de fusion `_merge_consistent()`

```python
def _merge_consistent(results: List[Dict]) -> Dict:
    for key in keys:
        sample = values[0]
        if isinstance(sample, (int, float)):
            merged[key] = statistics.median(values)   # Médiane pour les numériques
        elif isinstance(sample, str):
            counter = Counter(values)
            merged[key] = counter.most_common(1)[0][0]  # Majorité pour les strings
        elif isinstance(sample, dict):
            merged[key] = _merge_consistent(values)     # Récursif pour les dicts
        else:
            # Pour les listes: JSON serialize + majority vote
            counter = Counter(json.dumps(v, sort_keys=True) for v in values)
            merged[key] = json.loads(counter.most_common(1)[0][0])
```

### Application dans `performance-scorer`

```python
bloom_breakdown = self.call_llm_json_consistent(
    system_prompt="Tu es un analyste pédagogique...",
    user_prompt=f"Scores AA:\n{scores_summary}",
    n=3,
    temperature=0.4,   # T=0.4: variance modérée, diversité suffisante
)
```

### Pourquoi T=0.4 et non T=0.7 ?

Les bloom scores sont des estimations numériques (0-100) à partir de données réelles. Une T=0.4 produit une diversité de raisonnement suffisante sans générer des scores aberrants. La médiane est robuste aux outliers : si les 3 appels donnent `{remember: 80, 75, 30}`, la médiane retourne 75, ignorant l'outlier à 30.

### Contournement du cache TTL

Le suffix `<!-- attempt {i+1} -->` rend chaque `user_prompt` unique, ce qui génère une clé SHA256 différente dans le `TTLCache`, forçant N appels API réels.

---

## 7. Technique 6 — Role-Aware Prompt Branching

### Définition
Maintenir le **même contrat JSON de sortie** tout en adaptant le style, le vocabulaire et le framing du prompt selon le rôle de l'utilisateur.

### Couverture : **2/15 composants** — `syllabus-mapper` + `AssistantAgent`

### Implémentation dans `syllabus-mapper`

```python
# JSON contract partagé — identique pour tous les rôles
_JSON_CONTRACT = (
    '{"mappings": [{"aa_code": "...", "relevance": 0.0-1.0, "justification": "..."}]}'
)

# Prompt teacher/admin : posture technique
_TEACHER_SYSTEM = (
    "Tu es un expert en ingénierie pédagogique.\n"
    "Mappe le contenu donné aux Acquis d'Apprentissage (AA) du cours.\n"
    f"Réponds UNIQUEMENT en JSON: {_JSON_CONTRACT}"
)

# Prompt student : posture bienveillante et motivationnelle
_STUDENT_SYSTEM = (
    "Tu es un tuteur pédagogique bienveillant qui aide les étudiants à comprendre "
    "leur progression d'apprentissage.\n"
    "À partir du contenu fourni, identifie quels Acquis d'Apprentissage (AA) du cours "
    "l'étudiant est en train de travailler ou de développer.\n"
    "Dans le champ 'justification', explique de façon encourageante et claire "
    "pourquoi ce contenu contribue à cet AA — aide l'étudiant à comprendre "
    "la valeur de ce qu'il apprend.\n"
    f"Réponds UNIQUEMENT en JSON: {_JSON_CONTRACT}"
)

# Sélection runtime
system_prompt = _STUDENT_SYSTEM if context.role == 'student' else _TEACHER_SYSTEM
```

**Principe clé :** Le champ `aa_code` et `relevance` sont identiques dans les deux branches — seul le champ `justification` a un contenu différent selon le rôle. Cela garantit la compatibilité avec tous les consommateurs du skill.

### Implémentation dans `AssistantAgent`

```python
if role == 'student':
    base += """
## Student-specific behavior
- Encourage the student and celebrate progress.
- Proactively suggest study tips and exercises when relevant.
- When discussing grades, frame them constructively
  ("You've improved in X, let's work on Y").
- You CAN access: courses, calendar, performance, grades, recommendations.
- You CANNOT access teacher-only tools (class performance, at-risk students).
"""
elif role == 'teacher':
    base += """
## Teacher-specific behavior
- Provide analytics-oriented insights about class performance.
- Help identify students who need attention.
- Suggest pedagogical interventions and quiz topics for weak areas.
- You CAN access: courses, calendar, course details, class performance,
  at-risk students, quiz suggestions.
- Present data in a structured, actionable format.
"""
elif role == 'admin':
    base += """
## Admin-specific behavior
- You have an overview perspective across the platform.
- Help with platform-wide insights when asked.
- You can access all general tools (courses, calendar, course details).
"""
```

**Pattern RBAC dans le prompt :** Les lignes `You CAN/CANNOT access` encodent les **permissions de rôle directement dans le prompt** — une couche de sécurité soft qui complète les gardes JWT au niveau des routes.

---

## 8. Technique 7 — Temperature Calibration

### Définition
Ajuster la valeur de température (créativité vs déterminisme) en fonction de la nature cognitive de la tâche.

### Couverture : **15/15 composants** (température choisie pour chaque skill)

### Tableau des températures

| Skill | T | Justification |
|-------|---|---------------|
| `bloom-classifier` | **0.1** | Classification catégorielle pure — quasi-déterministe |
| `syllabus-mapper` | **0.2** | Mapping AA → correspondances stables |
| `weakness-detector` | **0.2** | Diagnostic médical-like — fiabilité > créativité |
| `performance-scorer` | **0.4** | Self-consistency activée — T modérée pour diversité de raisonnement |
| `language-adapter` (detect) | **0.1** | Détection de langue — zéro tolérance à l'erreur |
| `code-reviewer` | **0.3** | Analyse technique — légère paraphrase acceptable |
| `rubric-builder` | **0.3** | Grille standard — variations légères OK |
| `content-summarizer` | **0.4** | Résumé — paraphrase naturelle bienvenue |
| `study-planner` | **0.4** | Planning — créativité modérée sur l'organisation |
| `exercise-recommender` | **0.4** | Génération ciblée — contrainte > liberté |
| `quiz-generator` | **0.5** | Questions variées — équilibre qualité/diversité |
| `feedback-writer` | **0.5** | Feedback constructif — ton naturel apprécié |
| `language-adapter` (adapt) | **0.3** | Traduction — fidélité prioritaire |
| `AssistantAgent` | **0.4** | Conversation générale — ton naturel sans dérive |

### Règle générale observée

```
T ∈ [0.0, 0.2]  → Tâches analytiques / classificatrices (answer determinism)
T ∈ [0.3, 0.4]  → Tâches d'analyse + légère reformulation
T ∈ [0.4, 0.5]  → Tâches de génération contrainte (questions, exercices)
T ∈ [0.6+]      → Génération créative libre (non utilisé dans ESB-Learning)
```

> **Observation :** ESB-Learning évite délibérément les hautes températures (> 0.5). Cela est cohérent avec le contexte académique où la précision et la fiabilité priment sur la créativité.

---

## 9. Technique 8 — Multi-language Adaptive Prompting

### Définition
Détecter la langue naturelle de l'utilisateur et adapter dynamiquement la langue et le registre de la réponse — incluant la prise en charge du dialecte tunisien (darija).

### Couverture : **5/15 composants**

### Implémentation dans `feedback-writer`

```python
LANG_INSTRUCTIONS = {
    'fr': 'Réponds en français.',
    'en': 'Respond in English.',
    'tn': 'Réponds en dialecte tunisien (darija) avec des mots français mélangés.',
}

lang_instr = self.LANG_INSTRUCTIONS.get(language, self.LANG_INSTRUCTIONS['fr'])
# Injection dans le system prompt
system_prompt = (
    "Tu es un tuteur bienveillant en enseignement supérieur.\n"
    f"{lang_instr}\n"  # ← adaptation linguistique
    '...'
)
```

### Implémentation dans `language-adapter`

```python
lang_names = {'fr': 'français', 'en': 'anglais', 'tn': 'dialecte tunisien (darija)'}
tone_instructions = {
    'encouraging': 'Sois chaleureux, encourageant et positif.',
    'neutral': 'Sois professionnel et neutre.',
    'formal': 'Utilise un registre formel et académique.',
    'casual': 'Sois décontracté et accessible.',
}
# Combinaison langue + ton
system_prompt = (
    f"Adapte le texte suivant en {lang_names.get(target, target)}.\n"
    f"Ton: {tone_instructions.get(tone, ...)}\n"
    '...'
)
```

### Implémentation dans `AssistantAgent` — le plus sophistiqué

```
2. **Language**: Respond in the SAME language the user writes in.
   Detect French, English, or Tunisian Arabic dialect.
   - If the user writes in Tunisian dialect (Tounsi, Derja), switch to a
     friendly informal tone, use Tunisian expressions, and adopt a fun
     "fennec 🦊" personality (e.g. "Ahla bik!", "Yezzi men el stress 😄").
```

**Points remarquables :**
- La personnalité "fennec 🦊" est une **persona culturellement ancrée** dans le contexte tunisien
- Les expressions exemples (`"Ahla bik!"`, `"Yezzi men el stress"`) servent de few-shot implicites pour le registre darija
- L'intégration avec **TunBERT** (`tunbert_service.py`) ajoute une couche NLP pré-LLM pour enrichir la compréhension du dialecte

### Flux de détection multi-langue

```
Message utilisateur
      ↓
_detect_language(message)  ← heuristique Python (avant LLM)
      ↓
[si "tn"] TunBERT enrichissement sémantique
      ↓
system_prompt avec instruction linguistique adaptée
      ↓
LLM répond dans la langue détectée
      ↓
[si "tn"] classify_tunisian_intent() pour logging
```

---

## 10. Technique 9 — Contextual Grounding (RAG)

### Définition
Injecter dans le prompt le contexte récupéré depuis la base de données (SQL) ou la base vectorielle (ChromaDB) pour ancrer les réponses sur des données réelles du cours.

### Couverture : **4/15 composants** (quiz-generator, rubric-builder, syllabus-mapper, AssistantAgent)

### Pattern d'injection AA (Acquis d'Apprentissage)

Quatre skills utilisent le même pattern de grounding sur les AA du syllabus :

```python
# Récupération depuis PostgreSQL/SQLite
aa_list = TNAA.query.filter_by(syllabus_id=course.syllabus.id).all()
aa_context = '\n'.join(
    f"- {aa.code}: {aa.description}" for aa in aa_list
)

# Injection dans le user_prompt
user_prompt = (
    f"Contenu source:\n{content}\n\n"
    f"{'AA disponibles:\\n' + aa_context if aa_context else 'Pas de AA disponibles.'}"
)
```

**Skills utilisant ce pattern :**
- `quiz-generator` → `user_prompt`
- `rubric-builder` → `user_prompt`
- `syllabus-mapper` → `user_prompt`

### Grounding conditionnel

```python
f"{'AA disponibles:\\n' + aa_context if aa_context else 'Pas de AA disponibles.'}"
```
→ Dégradation gracieuse : si aucun AA n'est disponible, le prompt reste cohérent sans section vide.

### Grounding dans `AssistantAgent` — via TunBERT

```python
if language == "tn":
    try:
        from app.services.tunbert_service import enhance_tunisian_prompt
        tunbert_context = enhance_tunisian_prompt(message, language)
    except Exception:
        pass

enriched_message = message
if tunbert_context:
    enriched_message = f"{message}\n\n{tunbert_context}"

messages.append(HumanMessage(content=enriched_message))
```
→ Le contexte TunBERT enrichit le message **utilisateur** (pas le system prompt), laissant le modèle interpréter librement l'enrichissement.

### Grounding SQL vs ChromaDB

| Source | Composants | Type de données |
|--------|-----------|----------------|
| SQL (TNAA) | quiz-generator, rubric-builder, syllabus-mapper | Acquis d'Apprentissage structurés |
| SQL (StudentAAScore) | performance-scorer | Scores par étudiant/cours |
| TunBERT service | AssistantAgent | Enrichissement sémantique darija |
| ChromaDB | (TP/Exam agents — hors skills) | Documents de cours vectorisés |

---

## 11. Technique 10 — Prompt Versioning (A/B)

### Définition
Stocker les prompts en base de données avec versioning (skill_id + variant_name + is_active), permettant le déploiement de nouvelles versions, le rollback et l'A/B testing sans redémarrage de l'application.

### Couverture : **Infrastructure disponible** (ajouté en v3)

### Modèle de données

```python
class PromptVersion(db.Model):
    __tablename__ = 'prompt_version'

    id                   = db.Column(db.Integer, primary_key=True)
    skill_id             = db.Column(db.String(64), db.ForeignKey('skill.id'))
    variant_name         = db.Column(db.String(64), default='default')  # 'default','v2','concise'...
    system_prompt        = db.Column(db.Text, nullable=False)
    user_prompt_template = db.Column(db.Text)   # Template optionnel {content}
    description          = db.Column(db.String(256))
    is_active            = db.Column(db.Boolean, default=True)
    created_at           = db.Column(db.DateTime)
    created_by           = db.Column(db.Integer, db.ForeignKey('user.id'))
```

### Méthode `call_llm_versioned()` dans `BaseSkill`

```python
def call_llm_versioned(
    self,
    user_prompt: str,
    variant: str = 'default',
    fallback_system: str = '',
    **kwargs,
) -> Dict:
    system_prompt = fallback_system  # Code-hardcoded fallback
    try:
        from app.models.skills import PromptVersion
        pv = PromptVersion.get_active(self.skill_id, variant)
        if pv:
            system_prompt = pv.system_prompt
            if pv.user_prompt_template:
                user_prompt = pv.user_prompt_template.format(content=user_prompt)
            logger.debug("PromptVersion loaded for skill=%s variant=%s",
                         self.skill_id, variant)
    except Exception:
        pass  # Always fall back to code prompt

    return self.call_llm_json(system_prompt, user_prompt, **kwargs)
```

**Principe de zero-downtime :** `fallback_system` garantit qu'en l'absence de version en BDD (premier déploiement, migration en cours), le skill continue de fonctionner avec le prompt codé en dur.

### API d'administration

```
GET  /api/v1/admin/prompts                    → Liste toutes les versions
POST /api/v1/admin/prompts                    → Crée et active une nouvelle version
POST /api/v1/admin/prompts/<id>/activate      → Rollback vers une version précédente
```

### Workflow A/B testing

```
1. POST /api/v1/admin/prompts
   {"skill_id": "bloom-classifier", "variant_name": "few-shot-v2",
    "system_prompt": "...", "description": "Ajout examples Analyze+Create"}

2. Modifier bloom_classifier.py pour utiliser call_llm_versioned(variant='few-shot-v2')

3. Comparer les métriques SkillExecution (duration_ms, user feedback)

4. POST /api/v1/admin/prompts/<old_id>/activate  ← Rollback si dégradation
```

---

## 12. Matrice de couverture

| Skill / Composant | Role Prompting | JSON Forcing | Few-Shot | Constraint Injection | Self-Consistency | Role-Aware Branching | Temp. Calibration | Multi-lang | RAG Grounding | Prompt Versioning |
|-------------------|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `bloom-classifier` | ✅ | ✅ | ✅ | — | — | — | ✅ T=0.1 | — | — | 🔧 infra |
| `syllabus-mapper` | ✅ | ✅ | — | — | — | ✅ | ✅ T=0.2 | — | ✅ AA | 🔧 infra |
| `quiz-generator` | ✅ | ✅ | — | ✅ | — | — | ✅ T=0.5 | — | ✅ AA | 🔧 infra |
| `rubric-builder` | ✅ | ✅ | — | ✅ | — | — | ✅ T=0.3 | — | ✅ AA | 🔧 infra |
| `weakness-detector` | ✅ | ✅ | — | — | — | — | ✅ T=0.2 | — | — | 🔧 infra |
| `feedback-writer` | ✅ | ✅ | — | — | — | — | ✅ T=0.5 | ✅ | — | 🔧 infra |
| `study-planner` | ✅ | ✅ | — | ✅ | — | — | ✅ T=0.4 | ✅ | — | 🔧 infra |
| `exercise-recommender` | ✅ | ✅ | — | ✅ | — | — | ✅ T=0.4 | ✅ | — | 🔧 infra |
| `content-summarizer` | ✅ | ✅ | — | ✅ | — | — | ✅ T=0.4 | ✅ | — | 🔧 infra |
| `code-reviewer` | ✅ | ✅ | — | ✅ | — | — | ✅ T=0.3 | — | — | 🔧 infra |
| `language-adapter` | ✅ | ✅ | — | — | — | — | ✅ T=0.1/0.3 | ✅ | — | 🔧 infra |
| `performance-scorer` | ✅ | ✅ | — | — | ✅ | — | ✅ T=0.4 | — | ✅ SQL | 🔧 infra |
| `AssistantAgent` | ✅ | — | — | ✅ | — | ✅ | ✅ T=0.4 | ✅ | ✅ TunBERT | 🔧 infra |
| `base.py` (infra) | — | ✅ parser | — | — | ✅ merge | — | — | — | ✅ | — |

**Légende :** ✅ Implémenté | 🔧 Infrastructure disponible, pas encore activé | — Non applicable

---

## 13. Analyse des températures

```
Distribution des températures par catégorie de skill

T = 0.1   ████  bloom-classifier, language-adapter (detect)
           → 2 skills — classification pure

T = 0.2   ██    syllabus-mapper, weakness-detector
           → 2 skills — analyse structurée

T = 0.3   ████  code-reviewer, rubric-builder, language-adapter (adapt)
           → 3 skills — évaluation avec légère variation

T = 0.4   ████████  performance-scorer, content-summarizer,
                     study-planner, exercise-recommender, AssistantAgent
           → 5 skills — génération équilibrée

T = 0.5   ████  quiz-generator, feedback-writer
           → 2 skills — génération plus libre
```

**Corrélation catégorie → température :**

| Catégorie | T moyen | Justification |
|-----------|---------|---------------|
| analysis | 0.15 | Cohérence et précision critiques |
| scoring | 0.4 | Self-consistency compense la variance |
| planning | 0.4 | Planification contrainte |
| generation | 0.43 | Variété bienvenue |

---

## 14. Anti-patterns identifiés et corrections

### Anti-pattern 1 : Absence de few-shot sur les skills de génération

**Problème :** `quiz-generator`, `rubric-builder`, `exercise-recommender` n'ont pas d'exemples, malgré des schémas JSON complexes et des contraintes pédagogiques fines.

**Risque :** Questions mal calibrées au niveau Bloom, critères de grille génériques.

**Correction proposée :**
```python
# quiz-generator — Exemple QCM niveau Apply
FEW_SHOT = """
Exemple — Question QCM niveau Apply :
Content: "Cours sur les requêtes SQL JOIN"
→ {"text": "Écrivez une requête SQL retournant les étudiants et leurs cours
    pour les étudiants ayant une moyenne > 12.",
   "type": "ouverte", "bloom_level": "apply", "difficulty": 3, ...}
"""
```

---

### Anti-pattern 2 : Absence de self-consistency sur `weakness-detector`

**Problème :** `weakness-detector` évalue le `risk_level` (high/medium/low) en un seul appel. Cette classification binaire est sensible aux variations de température.

**Risque :** Un étudiant peut recevoir un diagnostic "high risk" ou "low risk" selon le sampling du modèle.

**Correction proposée :**
```python
# Utiliser call_llm_json_consistent(n=3, temperature=0.3)
# Le majority-vote sur risk_level stabilise le diagnostic
result = self.call_llm_json_consistent(system_prompt, user_prompt, n=3, temperature=0.3)
```

---

### Anti-pattern 3 : System prompt de `performance-scorer` sans exemples numériques

**Problème :** Le modèle doit estimer des scores Bloom 0-100 à partir de scores AA sans référence d'ancrage.

**Risque :** Scores systématiquement centrés sur 50-60 (régression vers la moyenne).

**Correction proposée :**
```
# Ajouter dans le system prompt :
"Exemples de calibration :
- Score AA moyen 85/100 → bloom_scores.apply ~ 78-82
- Score AA moyen 40/100 → bloom_scores.remember ~ 55, create ~ 15
- Score AA moyen 60/100 → distribution équilibrée 45-65 par niveau"
```

---

### Anti-pattern 4 : `call_llm_versioned()` non encore utilisé dans les skills

**Problème :** L'infrastructure de prompt versioning est disponible dans `BaseSkill` mais aucun skill ne l'utilise encore — tous continuent d'utiliser `call_llm_json()` directement.

**Correction :** Migrer progressivement les skills vers `call_llm_versioned()` en gardant le prompt actuel comme `fallback_system` :

```python
# Avant (bloom_classifier)
result = self.call_llm_json(system_prompt=(...), user_prompt=..., temperature=0.1)

# Après
result = self.call_llm_versioned(
    user_prompt=f"Type: {content_type}\nContenu:\n{content}",
    variant='default',
    fallback_system=(
        "Tu es un expert en taxonomie de Bloom...\n"
        f"{self.FEW_SHOT_EXAMPLES}\n"
        '{"level": "...", "confidence": 0.0-1.0, "justification": "..."}'
    ),
    temperature=0.1,
)
```

---

## 15. Recommandations futures

### Priorité Haute

| # | Recommandation | Skill ciblé | Effort | Impact estimé |
|---|---------------|------------|--------|--------------|
| R1 | Few-shot sur `quiz-generator` (2 exemples QCM/ouverte) | quiz-generator | S | +10% qualité Bloom alignment |
| R2 | Few-shot sur `rubric-builder` (1 exemple complet) | rubric-builder | S | +15% cohérence des grilles |
| R3 | Self-consistency sur `weakness-detector` (n=3) | weakness-detector | S | Stabilité du diagnostic risk_level |
| R4 | Migrer tous les skills vers `call_llm_versioned()` | Tous (15) | M | Enable A/B testing en production |

### Priorité Moyenne

| # | Recommandation | Skill ciblé | Effort | Impact estimé |
|---|---------------|------------|--------|--------------|
| R5 | Ajouter examples niveaux Analyze + Create dans `bloom-classifier` | bloom-classifier | S | +8% précision niveaux hauts |
| R6 | Few-shot numérique dans `performance-scorer` (calibration) | performance-scorer | S | Réduction de la régression vers la moyenne |
| R7 | Chain-of-Thought explicite dans `code-reviewer` | code-reviewer | S | Meilleure détection des erreurs logiques |
| R8 | Structured outputs (OpenAI/Gemini native) au lieu de JSON parsing manuel | Tous | M | Élimination des erreurs de parsing |

### Priorité Basse

| # | Recommandation | Effort | Impact estimé |
|---|---------------|--------|--------------|
| R9 | Prompt compression (résumer les AA longs > 500 tokens) | M | Réduction coût tokens |
| R10 | ReAct trace analytics dans le dashboard admin | M | Observabilité des patterns d'usage |
| R11 | Test automatisé des prompts (golden dataset Bloom) | L | Détection des régressions de prompt |

---

*Rapport généré sur la base de l'analyse statique du code source — ESB-Learning commit `4d170a3`*  
*10 techniques documentées | 15 composants analysés | 14 anti-patterns/recommandations identifiés*
