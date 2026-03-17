# ESB Adaptive Learning Platform (TN + BGA)

Plateforme d’apprentissage adaptatif pour **ESPRIT / ESB**.

Le projet supporte **2 formats de syllabus** :

- **TN (Tunisie)** : structure par chapitres/sections + **AAA (Acquis d’Apprentissage du module)** + **AAP (Acquis d’Apprentissage du Programme)**
- **BGA** : structure par semaines + **CLO (Course Learning Outcomes)** + **PLO (Program Learning Outcomes)**

L’objectif est de :
- structurer automatiquement un module (chapitres/semaines)
- générer des **quizzes** alignés (AAA/CLO, Bloom, difficulté)
- analyser des **examens TN** (AAA, Bloom, difficulté + recommandations)
- fournir des **dashboards** (enseignant / étudiant / classe)

---

## Tech Stack

- **Backend** : Flask, SQLAlchemy, Flask‑Login, Flask‑Migrate
- **Frontend** : Bootstrap 5 + thème “Bolt-like” (CSS custom)
- **DB** : PostgreSQL (Supabase recommandé) ou SQLite (dev)
- **IA** : Google Gemini API pour extraction/summarization/quiz generation

---

## Installation (local)

### 1) Prérequis

- Python 3.10+ recommandé
- pip

### 2) Setup

```bash
python -m venv venv
# Windows
venv\Scripts\activate
# Linux/Mac
source venv/bin/activate

pip install -r requirements.txt
```

### 3) Variables d’environnement

Créer un fichier `.env` (ou configurer vos variables système) :

- `SECRET_KEY`
- `DATABASE_URL` (Postgres) **ou** laisser SQLite
- `GOOGLE_API_KEY` (obligatoire pour les fonctions IA)


### 4) Migrations

```bash
flask db init
flask db migrate -m "init"
flask db upgrade
```

### 5) Run

```bash
flask run
# ou
python run.py
```

Puis ouvrir : `http://127.0.0.1:5000`

---

## Comptes & Rôles

- **Teacher** : crée les cours, upload syllabus, génère quizzes/exam analysis, voit dashboards
- **Student** : s’inscrit, passe les quizzes, suit progression
- **Admin/Superuser** : gère profs/étudiants/classes (si activé dans votre déploiement)


---

## Workflow recommandé

### A) Créer un module (Course)

1. Connectez‑vous comme **teacher**
2. Créez un cours (module)
3. Accédez au module : vous verrez la page **Module View** avec les actions

### B) Upload syllabus

Dans le module : **Upload syllabus**.

Le système détecte / traite :
- **TN** : admin info + chapitres + sections + AAA + AAP
- **BGA** : weekly plan + CLO + PLO

> Après upload, l’app lance un workflow : extraction → classification/structure.

---

## TN (Tunisie)

### TN — Concepts

- **AAA (AAx)** : acquis d’apprentissage du **module**
- **AAP (AAPx)** : acquis d’apprentissage du **programme**
- **Chapitre/Section** : plan du module

### TN — Page module (Acquis & Programme)

Dans chaque module TN, vous avez :

- **Distribution AAA** : importance estimée (fréquence des AA dans sections/chapitres)
- **Couverture AAP** : AAP sélectionnés vs non sélectionnés

Ces blocs servent à :
- juger si le syllabus est bien structuré
- orienter la génération de quiz/exam (alignement AAA/AAP)

### TN — Quiz

Menu : Module → **Setup Quiz TN**

Modes :
- **Par chapitre/sections** : sélection de contenu (chapitre(s) / section(s))
- **Par AA** : générer selon un ou plusieurs acquis

Paramètres :
- nombre de questions (MCQ + open)
- distribution Bloom
- difficulté

Sortie :
- un document quiz stocké côté module
- passage par l’étudiant via l’interface “Take quiz”

### TN — Examens

Menu : **Examens TN**

- upload / sélection d’un examen
- analyse : distribution AAA/Bloom/difficulté
- interprétation générale + recommandations (ex: trop difficile, Bloom déséquilibré, AA manquants)
- (option) export PDF

---

## BGA

### BGA — Concepts

- **Weekly plan** : semaines, topics, activités
- **CLO** : objectifs d’apprentissage du cours
- **PLO** : objectifs programme

### BGA — Quiz multi-week

Menu : Module → **Quiz multi-week**

- sélectionner plusieurs semaines
- choisir distribution CLO, difficulté, Bloom
- générer un quiz unique sur plusieurs semaines

---

## Dashboards

- **Teacher dashboard** : vue globale modules / progression / résultats
- **Student dashboard** : progression, notes, succès par acquis
- **Class dashboard** (si activé) : performance par matière / acquis / Bloom

---

## Fichiers & types supportés

Upload : PDF / DOCX / PPTX / images / (option) vidéo

Les documents sont stockés et taggés :

- `syllabus` (TN ou BGA)
- `module_attachment`
- `quiz`
- `tn_exam` (examen TN)

---


## Structure du projet

```text
app/
  __init__.py
  config.py
  models.py
  routes/
  services/
  templates/
  static/
```

---



