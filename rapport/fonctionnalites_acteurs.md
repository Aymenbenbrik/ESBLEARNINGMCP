# Fonctionnalités par Acteur — Plateforme ESB-Learning

## 1. Vue d'ensemble des rôles

La plateforme ESB-Learning définit **3 rôles principaux** avec héritage de permissions :

```
SuperAdmin (is_superuser=true)
    └── hérite de → Enseignant (is_teacher=true)
        └── hérite de → Étudiant (défaut)
```

**Détection du rôle** : `AuthContext.tsx` → `user.is_teacher`, `user.is_superuser`

---

## 2. Acteur : Étudiant

### 2.1 Pages accessibles
| Route | Description |
|-------|-------------|
| `/dashboard` | Tableau de bord principal |
| `/student-dashboard` | Dashboard analytique avec IA |
| `/courses` | Liste des cours + inscription |
| `/courses/[id]` | Détails d'un cours |
| `/courses/[id]/chapters/[chapterId]` | Navigation dans les chapitres |
| `/courses/[id]/chapters/.../documents/[docId]` | Visualisation de documents |
| `/courses/[id]/chapters/.../quiz/[quizId]` | Passage de quiz |
| `/courses/[id]/chapters/.../practice-quiz` | Quiz d'entraînement |
| `/courses/[id]/chapters/.../tp/[tpId]` | Travaux pratiques |
| `/courses/[id]/chapters/.../assignment/[sectionId]` | Devoirs |
| `/courses/[id]/progress` | Suivi de progression |
| `/courses/[id]/exams` | Examens du cours |
| `/question-bank` | Banque de questions (approuvées) |
| `/absences` | Suivi des absences |
| `/grades` | Tableau des notes |
| `/profile` | Paramètres du compte |
| `/classes` | Mes classes |
| `/classes/[id]/chat` | Chat de groupe de classe |
| `/classes/[id]/dashboard` | Analytiques de classe |

### 2.2 Fonctionnalités détaillées

#### Apprentissage et contenu
- **Parcourir et s'inscrire aux cours** — Liste avec barres de progression
- **Navigation par chapitres** — Contenu structuré avec documents
- **Visualisation de documents** — PDFs, métadonnées, téléchargement
- **Activités interactives** — YouTube, PDF, quiz, textes, devoirs
- **Progression par chapitre** — Suivi de complétion en temps réel

#### Évaluations
| Fonctionnalité | Description |
|---------------|-------------|
| **Quiz** | Générés automatiquement depuis les documents, résultats immédiats |
| **Quiz d'entraînement** | Depuis la banque de questions, tentatives limitées, feedback immédiat |
| **Banque de questions** | Parcourir les questions approuvées, filtrer par Bloom/difficulté/CLO |
| **Examens** | Examens chronométrés avec proctoring (caméra, détection de triche) |
| **Travaux pratiques** | Soumission de code, aide IA (chatbot socratique), feedback |
| **Devoirs** | Soumission de fichiers, date limite, notation |

#### Notes et progression
| Fonctionnalité | Description |
|---------------|-------------|
| **Dashboard étudiant** | KPI personnalisés, calendrier, recommandations IA |
| **Page des notes** | Scores AA (par module), distribution Bloom, scores AAP (formation) |
| **Page des absences** | Heatmap visuelle par cours, alertes taux de présence |
| **Progression** | Par chapitre, par quiz, par TP, synthèse globale |

#### Fonctionnalités IA
| Fonctionnalité | Description |
|---------------|-------------|
| **Assistant IA** | Chat flottant bilingue (FR/TN), entrée/sortie vocale, historique |
| **Coach IA** | Analyse de performance, identification des lacunes, plan d'étude |
| **Chat documentaire** | Q&A sur les supports de cours via RAG (questions sur les PDFs) |
| **Chat chapitre** | Aide contextuelle sur un chapitre complet |
| **Chat de classe** | Discussions de groupe avec assistance IA |
| **Chatbot TP** | Aide sur les travaux pratiques (indices, guidance socratique) |

---

## 3. Acteur : Enseignant

### 3.1 Pages accessibles
*Toutes les pages étudiants + les suivantes :*

| Route | Description |
|-------|-------------|
| `/teacher-dashboard` | Dashboard analytique enseignant |
| `/courses/new` | Création de cours |
| `/courses/[id]/edit` | Édition de cours |
| `/courses/[id]/dashboard` | Analytiques du cours |
| `/courses/[id]/chapters/new` | Création de chapitre |
| `/courses/[id]/chapters/[id]/edit` | Édition de chapitre |
| `/courses/[id]/chapters/.../quiz/setup` | Configuration de quiz |
| `/courses/[id]/chapters/.../quiz/[id]/submissions` | Soumissions des étudiants |
| `/courses/[id]/chapters/.../quiz/[id]/results` | Analytiques du quiz |
| `/courses/[id]/chapters/.../quiz/[id]/disqualified` | Violations de triche |
| `/courses/[id]/chapters/.../documents/new` | Upload de documents |
| `/courses/[id]/chapters/.../tp/create` | Création de TP |
| `/courses/[id]/chapters/.../tp/[id]/edit` | Édition de TP |
| `/courses/[id]/course-review` | Paramètres du cours |
| `/courses/[id]/question-bank` | Gestion banque de questions |
| `/courses/[id]/exam` | Création d'examen |
| `/courses/[id]/exams` | Liste des examens |
| `/students` | Mes étudiants |
| `/question-bank` | Accès complet + approbation |

### 3.2 Fonctionnalités détaillées

#### Gestion des cours et chapitres
| Action | Description |
|--------|-------------|
| **Créer un cours** | Titre, description, upload de modules |
| **Éditer un cours** | Modification des métadonnées |
| **Créer un chapitre** | Ordre, sections, métadonnées |
| **Éditer un chapitre** | Mise à jour des propriétés et sections |
| **Générer un résumé** | Résumé IA depuis les documents |
| **Suggérer mapping AA** | Proposition IA des acquis d'apprentissage |

#### Gestion des documents
- Upload de PDFs aux chapitres
- Traitement RAG automatique
- Retraitement forcé des documents
- Suppression et téléchargement

#### Gestion des quiz
| Action | Description |
|--------|-------------|
| **Générer un quiz** | Auto-génération depuis un document + QA |
| **Configurer un quiz** | Révision/édition des questions, paramètres |
| **Voir les soumissions** | Toutes les tentatives étudiantes |
| **Analytiques** | Stats par question, distribution de performance |
| **Détection de triche** | Indicateurs de violations (copier/coller, changement d'onglet) |

#### Gestion de la banque de questions
| Action | Description |
|--------|-------------|
| **Générer des questions** | BGA (basé CLO) ou TN (basé document) |
| **Approuver/Rejeter** | Approbation en masse des questions générées |
| **Parcourir tout** | Accès à toutes les questions (pas seulement approuvées) |
| **Créer banque de cours** | Regrouper les questions par cours |

#### Gestion des travaux pratiques
| Action | Description |
|--------|-------------|
| **Créer un TP** | Énoncé + sections + questions |
| **Génération IA de l'énoncé** | Auto-création depuis des indices |
| **Suggestion IA des AA** | Proposition d'acquis d'apprentissage |
| **Génération IA de la solution** | Solution de référence + critères |
| **Voir les soumissions** | Liste des soumissions de code étudiantes |
| **Noter une soumission** | Score + feedback (manuel ou IA) |

#### Gestion des examens
| Action | Description |
|--------|-------------|
| **Créer un examen** | Q&A manuelles ou IA depuis document (TN) |
| **Éditer un examen** | Ajout/suppression de questions, paramètres |
| **Configurer le proctoring** | Face ID, caméra, plein écran, mot de passe |
| **Publier/Dépublier** | Rendre disponible aux étudiants |
| **Génération IA des réponses** | Auto-génération des réponses de référence |
| **Auto-correction** | Correction automatique des QCM |
| **Révision des sessions** | Voir tous les étudiants, violations |
| **Valider les scores** | Révision manuelle des réponses subjectives |
| **Passer en mode preview** | Vérifier le quiz sans noter |

#### Suivi des étudiants
| Action | Description |
|--------|-------------|
| **Liste des étudiants** | Tous les étudiants des cours de l'enseignant |
| **Dashboard individuel** | Analytiques, progression, scores AA |
| **Coach IA étudiant** | Analyse IA d'un étudiant spécifique |
| **Heatmap AA** | Visualisation des acquis par étudiant |
| **Calcul des scores AA** | Déclenchement du calcul depuis quiz/TP |
| **Distribution AA par cours** | Couverture des AA par les quiz |

#### Dashboard enseignant
- KPIs : quiz total, complétés, score moyen
- Distribution Bloom et difficulté
- Stats examens (total, analysés)
- Cartes par cours (étudiants, quiz, score moyen, score IA examen)

#### Fonctionnalités IA (enseignant)
| Fonctionnalité | Description |
|---------------|-------------|
| **Génération de quiz** | Auto-génération depuis les documents |
| **Génération de questions** | BGA ou TN |
| **Génération d'examens** | TN depuis documents |
| **Génération de TP** | Énoncés, solutions, suggestions AA |
| **Résumé de chapitre** | Auto-résumé d'apprentissage |
| **Détection de TP** | Suggestion d'endroits pour ajouter des TP |
| **Coach IA** | Analyse de performance des étudiants |
| **Chat documentaire** | Q&A sur les supports de cours |
| **Assistant IA** | Chat avec outils enseignant (at-risk, performance classe) |

---

## 4. Acteur : Administrateur (SuperAdmin)

### 4.1 Pages accessibles
*Toutes les pages enseignant + les suivantes :*

| Route | Description |
|-------|-------------|
| `/admin/programs` | Liste et création de programmes |
| `/admin/programs/[id]` | Détails du programme |
| `/admin/programs/[id]/dashboard` | Analytiques du programme |
| `/admin/classes` | Liste et création de classes |
| `/admin/classes/[id]` | Détails de la classe et étudiants |
| `/admin/students` | Gestion de tous les étudiants |
| `/admin/teachers` | Gestion de tous les enseignants |

### 4.2 Fonctionnalités détaillées

#### Gestion des programmes (formations)
| Action | Description |
|--------|-------------|
| **Créer un programme** | Titre, code, description, type (Licence/Master) |
| **Lister les programmes** | Tous les programmes du système |
| **Détails du programme** | Cours, classes, AAP, compétences |
| **Ajouter un cours** | Lier un cours au programme |
| **Retirer un cours** | Délier un cours du programme |
| **Créer une classe** | Dans le cadre d'un programme |
| **Upload descripteur** | Fiche descriptive (.docx) |
| **Extraction AAP** | Pipeline IA → acquis d'apprentissage professionnels |
| **Traitement complet** | Pipeline IA complet (AAP, compétences, modules, enseignants) |
| **Extraction syllabi** | Depuis les PDFs des cours |

#### Gestion des AAP et compétences
| Action | Description |
|--------|-------------|
| **Créer AAP** | Acquis d'apprentissage professionnel |
| **Modifier AAP** | Mise à jour d'un AAP |
| **Supprimer AAP** | Suppression d'un AAP |
| **Créer compétence** | Compétence/skill |
| **Modifier compétence** | Mise à jour |
| **Construire matrice** | Lien compétences ↔ AAP |

#### Gestion des classes
| Action | Description |
|--------|-------------|
| **Créer une classe** | Dans un programme |
| **Lister les classes** | Toutes les classes |
| **Détails de classe** | Étudiants, cours, enseignants |
| **Ajouter des étudiants** | Affectation en masse |
| **Retirer des étudiants** | Désaffectation |
| **Affecter des enseignants** | Lier enseignants aux cours de la classe |

#### Gestion des étudiants
| Action | Description |
|--------|-------------|
| **Lister tous les étudiants** | Avec filtres (classe, recherche) |
| **Générer des étudiants** | Création en masse avec credentials automatiques |
| **Réinitialiser mot de passe** | Nouveau mot de passe pour un étudiant |
| **Modifier un étudiant** | Changer classe, statut, email |
| **Exporter CSV** | Télécharger la liste avec credentials |
| **Changer le statut** | Actif/Inactif |

#### Gestion des enseignants
| Action | Description |
|--------|-------------|
| **Lister les enseignants** | Tous les enseignants |
| **Créer un enseignant** | Ajout d'un nouveau |
| **Modifier un enseignant** | Édition des détails |
| **Supprimer un enseignant** | Suppression |
| **Réinitialiser mot de passe** | Nouveau mot de passe |

#### Dashboard administrateur
- KPIs : Enseignants, Étudiants, Cours actifs, Classes, Programmes
- Tableau d'activité récente (nouveaux utilisateurs, nouvelles classes)
- Boutons d'action rapide

#### Fonctionnalités IA (admin)
*Toutes les fonctionnalités IA enseignant + :*
| Fonctionnalité | Description |
|---------------|-------------|
| **Traitement de descripteur** | IA extrait la structure du programme depuis les documents |
| **Extraction de syllabi** | IA construit le curriculum depuis les supports de cours |
| **Coach programme** | Analyse de performance au niveau programme |
| **Assistant IA** | Accès à tous les outils (étudiant + enseignant) |

---

## 5. Matrice des fonctionnalités

```
Fonctionnalité                    Étudiant   Enseignant   Admin
──────────────────────────────────────────────────────────────
Cours (voir)                         ✓          ✓          ✓
Cours (créer/éditer)                 —          ✓          ✓
Chapitres (voir)                     ✓          ✓          ✓
Chapitres (créer/éditer)             —          ✓          ✓
Documents (upload)                   —          ✓          ✓
Quiz (passer)                        ✓          ✓ (preview) ✓
Quiz (créer)                         —          ✓          ✓
Banque de questions (parcourir)      ✓ (appr.)  ✓ (tout)   ✓ (tout)
Banque de questions (générer)        —          ✓          ✓
Travaux pratiques (soumettre)        ✓          ✓          ✓
Travaux pratiques (créer/noter)      —          ✓          ✓
Examens (passer)                     ✓          ✓ (preview) ✓
Examens (créer/gérer)                —          ✓          ✓
Notes (voir les siennes)             ✓          ✓          ✓
Notes (voir celles des autres)       —          ✓ (ses étu.)✓ (tous)
Progression (suivre)                 ✓ (soi)    ✓ (ses étu.)✓ (tous)
Assistant IA                         ✓          ✓          ✓
Coach IA                             ✓ (soi)    ✓ (ses étu.)✓ (tous)
Programmes (gérer)                   —          —          ✓
Classes (gérer)                      —          —          ✓
Étudiants (gérer)                    —          —          ✓
Enseignants (gérer)                  —          —          ✓
AAP/Compétences (gérer)              —          —          ✓
Descripteur (upload/parse)           —          —          ✓
```

---

## 6. Fonctionnalités transversales IA

| Fonctionnalité | Étudiants | Enseignants | Admins | API |
|---------------|-----------|-------------|--------|-----|
| **Assistant IA** | ✓ (chat+voix) | ✓ | ✓ | `/assistant/chat` |
| **Coach IA** | ✓ (soi) | ✓ (étudiants) | ✓ | `/coach/analyze` |
| **Chat documentaire** | ✓ | ✓ | ✓ | `/ai/chat/*` |
| **Chat chapitre** | ✓ | ✓ | ✓ | `/ai/chapter-chat/*` |
| **Chat de classe** | ✓ | ✓ | ✓ | `/ai/class-chat/*` |
| **Génération de quiz** | — | ✓ | ✓ | `/quiz/setup/*` |
| **Génération de questions** | — | ✓ | ✓ | `/question-bank/generate*` |
| **Génération d'examens** | — | ✓ | ✓ | `/exam-bank/generate-from-tn` |
| **Génération de TP** | — | ✓ | ✓ | `/practical-work/generate-*` |
| **Traitement descripteur** | — | — | ✓ | `/programs/[id]/extract-descriptor` |
