# ESB Learning Platform

Plateforme e-learning adaptative développée pour l'École Supérieure des Beaux-Arts (ESB), combinant un backend Flask et un frontend Next.js.

---

## 🏗️ Architecture

```
ESB-Learning/
├── ESB-main/          # Backend Flask (Python)
└── esb-nextjs/        # Frontend Next.js (TypeScript)
```

---

## ✨ Fonctionnalités

### 👨‍🏫 Enseignant
- **Gestion des cours** : création, édition, import de syllabus (DOCX/PDF)
- **Banque de questions** : ajout manuel (LaTeX), génération AI via RAG (Gemini)
- **Quiz** : configuration avec pondération des questions, correction automatique (IA) + validation manuelle
- **Devoirs** : création avec description, livrables attendus, deadline, tentatives permises, notation + feedback
- **Chapitres** : présentation générée par AI (validée par l'enseignant), résumé, documents, sections
- **Activités** : vidéos YouTube, quiz, devoirs par section

### 👨‍🎓 Étudiant
- **Dashboard** : performances, résultats et feedbacks des quiz
- **Chapitres** : layout 3 colonnes (documents | contenu | activités), sidebars rétractables
- **Quiz** : passer les quiz, voir les résultats et corrections
- **Devoirs** : soumettre des fichiers (PDF, DOCX, images, ZIP…), historique des tentatives
- **Notifications** : quiz en attente, notes disponibles

### 🤖 Intelligence Artificielle
- Génération de questions via **RAG** (documents du cours + Gemini)
- Correction automatique des questions ouvertes (Gemini)
- Génération de la présentation et des objectifs d'un chapitre
- Chatbot pédagogique par cours

---

## 🛠️ Stack Technique

| Couche | Technologie |
|---|---|
| Backend | Flask, SQLAlchemy, SQLite |
| Frontend | Next.js 14, TypeScript, Tailwind CSS, shadcn/ui |
| IA | Google Gemini 1.5 Flash, LangChain |
| Auth | JWT (Flask-JWT-Extended) |
| Upload | Werkzeug (multipart/form-data) |

---

## 🚀 Lancement

### Backend (Flask)

```bash
cd ESB-main
python -m venv venv
venv\Scripts\activate          # Windows
pip install -r requirements.txt
python run.py
# → http://localhost:5000
```

### Frontend (Next.js)

```bash
cd esb-nextjs
npm install
npm run dev
# → http://localhost:3000
```

---

## 🔐 Comptes de test

| Rôle | Email | Mot de passe |
|---|---|---|
| Enseignant | aymenbenbrik@gmail.com | *(configuré)* |
| Étudiant | sarah.mansouri@esprit.tn | Test1234! |
| Étudiant | karim.trabelsi@esprit.tn | Test1234! |

---

## 📁 Structure Backend

```
ESB-main/app/
├── api/v1/
│   ├── auth.py              # Authentification JWT
│   ├── courses.py           # Gestion des cours
│   ├── chapters.py          # Chapitres + présentation AI
│   ├── section_activities.py # YouTube, Quiz
│   ├── assignments.py       # Devoirs (nouveau)
│   ├── question_bank.py     # Banque de questions
│   ├── notifications.py     # Notifications calculées
│   └── ...
├── models.py                # Tous les modèles SQLAlchemy
└── uploads/                 # Fichiers uploadés
```

## 📁 Structure Frontend

```
esb-nextjs/
├── app/(dashboard)/
│   ├── courses/[id]/        # Page module (tabs: Description / Contenu / Dashboard)
│   └── courses/[id]/chapters/[chapterId]/  # Page chapitre 3 colonnes
├── components/
│   ├── chapters/
│   │   ├── SectionActivities.tsx      # Activités (quiz, vidéo, devoir)
│   │   ├── SectionAssignmentManager.tsx  # Interface enseignant (devoirs)
│   │   ├── SectionAssignmentTaker.tsx    # Interface étudiant (devoirs)
│   │   ├── ChapterPresentation.tsx       # Présentation AI du chapitre
│   │   └── ...
│   └── shared/
│       └── NotificationBell.tsx      # Cloche de notifications
└── lib/
    ├── api/references.ts    # Clients API
    ├── hooks/useReferences.ts # React Query hooks
    └── types/references.ts  # Types TypeScript
```

---

## 📝 Variables d'environnement

Créer `ESB-main/.env` :

```env
SECRET_KEY=your-secret-key
JWT_SECRET_KEY=your-jwt-secret
GEMINI_API_KEY=your-gemini-api-key
MAIL_USERNAME=your-email@gmail.com
MAIL_PASSWORD=your-app-password
```

---

## 📄 Licence

Projet académique — ESB Learning Platform
