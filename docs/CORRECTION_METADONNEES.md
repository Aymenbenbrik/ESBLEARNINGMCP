# 🔧 Correction - Extraction des Métadonnées d'Épreuve

## 🐛 Problème Identifié

**Symptôme:** Les métadonnées ne sont pas extraites lors de l'analyse d'une épreuve.

**Cause:** Import manquant dans `tn_exam_evaluation_service.py` - `HumanMessage` était utilisé mais non importé.

## ✅ Correction Appliquée

**Fichier:** `app/services/tn_exam_evaluation_service.py`

**Ligne 40 - Ajout de l'import:**
```python
from langchain_core.messages import HumanMessage
```

## 🚀 Étapes pour Activer les Métadonnées

### **Étape 1: Migration de la Base de Données**

```bash
cd C:\Users\aymen\OneDrive\Bureau\Developpement\ESB-Learning\ESB-main
python migrations/add_exam_metadata.py
```

**Résultat attendu:**
```
Adding exam_metadata column to course_exam table...
✅ Migration completed successfully!
```

---

### **Étape 2: Redémarrer le Serveur Backend**

```bash
# Arrêter le serveur actuel (Ctrl+C si en cours)
python run.py
```

---

### **Étape 3: Redémarrer le Frontend (si nécessaire)**

```bash
cd C:\Users\aymen\OneDrive\Bureau\Developpement\ESB-Learning\esb-nextjs
npm run dev
```

---

### **Étape 4: Tester l'Extraction**

1. **Uploader une épreuve PDF** dans l'interface
2. **Cliquer sur "Analyser avec l'IA"**
3. **Vérifier les métadonnées:**
   - Durée déclarée (devrait afficher la durée extraite)
   - Nom de l'épreuve, classe, date
   - Autorisations (calculatrice, documents, etc.)

---

## 📊 Ce Qui Devrait S'Afficher

### **Avant (Problème):**
```
Durée déclarée: — min
Nom de l'épreuve: [vide]
Classe: [vide]
```

### **Après (Corrigé):**
```
Durée déclarée: 90 min
Nom de l'épreuve: Algèbre Linéaire
Classe: L1 Info
Date: 15/01/2024
Enseignants: Dr. Aymen
Calculatrice: ✅ Autorisée
Documents: ❌ Non autorisés
```

---

## 🔍 Vérification en Cas de Problème

### **Si les métadonnées restent vides:**

1. **Vérifier les logs du serveur Flask:**
   ```bash
   # Chercher des erreurs dans la console où run.py s'exécute
   ```

2. **Vérifier que la colonne existe:**
   ```bash
   cd ESB-main
   sqlite3 instance/app.db "PRAGMA table_info(course_exam);"
   # Chercher exam_metadata dans la sortie
   ```

3. **Vérifier la réponse API:**
   - Ouvrir les DevTools du navigateur (F12)
   - Onglet Network
   - Analyser la réponse de `/api/v1/courses/{id}/exam/analyze`
   - Vérifier la présence de `exam_metadata` dans le JSON

---

## 🧪 Test de la Fonction Directement

Pour tester si `_extract_exam_metadata` fonctionne:

```python
# Dans un shell Python avec le contexte Flask
from app import create_app
from app.services.tn_exam_evaluation_service import _extract_exam_metadata

app = create_app()
with app.app_context():
    test_text = """
    École Supérieure de Commerce
    Examen Final - Algèbre Linéaire
    Classe: L1 Informatique
    Durée: 1h30
    Date: 15 Janvier 2024
    Enseignant: Dr. Aymen Ben Ahmed
    
    Calculatrice autorisée
    Documents non autorisés
    """
    
    result = _extract_exam_metadata(test_text)
    print(result)
```

**Résultat attendu:**
```python
{
    'exam_name': 'Algèbre Linéaire',
    'class_name': 'L1 Informatique',
    'declared_duration_min': 90,
    'exam_date': '15 Janvier 2024',
    'instructors': ['Dr. Aymen Ben Ahmed'],
    'calculator_allowed': True,
    'documents_allowed': False,
    'language': 'Français',
    # ...
}
```

---

## 📚 Documentation API

### **GET /api/v1/courses/{course_id}/exam/{exam_id}**

**Réponse après analyse:**
```json
{
  "exam": {
    "id": 123,
    "exam_metadata": {
      "exam_name": "Algèbre Linéaire",
      "class_name": "L1 Info",
      "declared_duration_min": 90,
      "exam_date": "15/01/2024",
      "instructors": ["Dr. Aymen"],
      "calculator_allowed": true,
      "documents_allowed": false,
      "computer_allowed": null,
      "internet_allowed": false,
      "num_pages": 4,
      "exam_type": "Mixte",
      "language": "Français",
      "department": "Informatique"
    },
    "ai_evaluation": {
      "questions_with_sources": [
        {
          "question_number": 1,
          "question_text_preview": "Définir une matrice...",
          "aa": ["AA1"],
          "bloom_level": "remembering",
          "sources": [
            {
              "document": "Chapitre 2: Matrices",
              "page": "12",
              "excerpt": "Une matrice est..."
            }
          ]
        }
      ],
      // ... reste de l'évaluation
    }
  }
}
```

---

## ✅ Checklist de Vérification

- [ ] Import HumanMessage ajouté
- [ ] Migration DB exécutée
- [ ] Serveur backend redémarré
- [ ] Frontend redémarré
- [ ] Épreuve uploadée et analysée
- [ ] Métadonnées visibles dans l'interface
- [ ] Section "Traçabilité RAG" affichée
- [ ] Bouton "Générer Rapport" présent

---

## 🆘 Support

Si le problème persiste:

1. Vérifier les logs du serveur
2. Vérifier la console du navigateur (F12)
3. Tester la fonction directement (voir ci-dessus)
4. Vérifier que Gemini 2.5 Pro est accessible

---

**Date de correction:** 29/03/2026 11:00
**Fichiers modifiés:** `app/services/tn_exam_evaluation_service.py`
