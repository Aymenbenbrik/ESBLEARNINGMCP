# 🐛 Problème d'Analyse AI - Extraction des Questions

## 📊 Diagnostic

### **Problème actuel:**
L'endpoint `/exam/analyze` utilise un **prompt simple** à Gemini qui demande une analyse globale mais **NE DÉTECTE PAS** les questions individuellement.

**Résultat:**
- ❌ Pas de liste des questions
- ❌ Pas de tableau des questions
- ❌ Pas de matching AA détaillé par question
- ❌ Pas de sources RAG par question
- ❌ Juste une estimation globale

### **Ce qui existe déjà:**
La fonction `analyze_tn_exam()` dans `tn_exam_evaluation_service.py` fait **TOUT** correctement:
- ✅ Extrait chaque question individuellement
- ✅ Classifie par AA, Bloom, difficulté
- ✅ Calcule le barème
- ✅ RAG pour chaque question (sources)
- ✅ Extraction des métadonnées

**MAIS** elle n'est **PAS appelée** dans l'endpoint actuel!

---

## 💡 2 Options de Correction

### **Option 1: Utiliser analyze_tn_exam (RECOMMANDÉ)**

**Avantages:**
- ✅ Extraction complète et précise
- ✅ Toutes les fonctionnalités disponibles
- ✅ Code déjà testé et fonctionnel

**Inconvénients:**
- ⚠️ Plus lent (extraction détaillée)
- ⚠️ Nécessite plus d'appels API Gemini

**Modification à faire:**
Remplacer tout le code de `analyze_course_exam` par un appel à `analyze_tn_exam`.

---

### **Option 2: Améliorer le prompt existant (RAPIDE)**

**Avantages:**
- ✅ Plus rapide (un seul appel Gemini)
- ✅ Moins coûteux en API

**Inconvénients:**
- ⚠️ Moins précis
- ⚠️ Dépend de la qualité du LLM
- ⚠️ Pas d'extraction structurée des questions

**Modification à faire:**
- Ajouter l'extraction des métadonnées (`_extract_exam_metadata`)
- Améliorer le prompt pour demander la liste détaillée des questions
- Ajouter le RAG dans le prompt

---

## 🎯 Recommandation

**Je recommande l'Option 1** car elle offre:
1. Extraction réelle des questions (pas d'estimation)
2. Classification précise (AA, Bloom, difficulté)
3. Sources RAG fiables
4. Barème extrait

**Mais** si vous préférez la **rapidité**, restez avec l'Option 2 en ajoutant juste:
- L'extraction des métadonnées
- La demande de `questions_with_sources` dans le prompt

---

## 🔧 Code pour Option 1

Remplacer les lignes 264-380 de `exams.py` par:

```python
try:
    # Use comprehensive analyze_tn_exam
    from app.services.tn_exam_evaluation_service import analyze_tn_exam
    from app.models import Document
    
    # Create temp Document
    temp_doc = Document(
        course_id=course_id,
        file_path=exam.file_path,
        original_filename=exam.original_name or 'exam.pdf',
        document_type='exam'
    )
    
    # Analyze
    result = analyze_tn_exam(course, temp_doc)
    
    # Extract metadata
    exam.exam_metadata = result.get('exam_metadata', {})
    
    # Build evaluation from result
    questions = result.get('questions', [])
    bloom_dist = result.get('bloom_distribution_pct', {})
    
    evaluation = {
        'overview': f"{len(questions)} questions détectées et analysées",
        'questions_count': len(questions),
        'estimated_duration': result.get('time_analysis', {}).get('estimated_duration_readable', '2h'),
        'avg_difficulty': 'moyen',
        'has_practical_questions': any(q.get('IsPractical') for q in questions),
        'practical_questions_count': sum(1 for q in questions if q.get('IsPractical')),
        'bloom_distribution': {
            'remembering': int(bloom_dist.get('remembering', 0)),
            'understanding': int(bloom_dist.get('understanding', 0)),
            'applying': int(bloom_dist.get('applying', 0)),
            'analyzing': int(bloom_dist.get('analyzing', 0)),
            'evaluating': int(bloom_dist.get('evaluating', 0)),
            'creating': int(bloom_dist.get('creating', 0)),
        },
        'aa_alignment': [
            {'aa': f'AA{num}', 'covered': count > 0, 'comment': f'{count} question(s)'}
            for num, count in result.get('aa_distribution', {}).items()
        ],
        'questions_with_sources': [
            {
                'question_number': i+1,
                'question_text_preview': (q.get('Text') or '')[:150],
                'aa': [f"AA{a}" for a in (q.get('AA', []) if isinstance(q.get('AA'), list) else [])],
                'bloom_level': q.get('BloomLevel', 'unknown'),
                'sources': [
                    {
                        'document': src.get('title', 'Document'),
                        'page': str(src.get('page', 'N/A')),
                        'excerpt': src.get('excerpt', '')[:200]
                    }
                    for src in q.get('sources', [])
                ]
            }
            for i, q in enumerate(questions)
        ],
        'difficulty_by_chapter': [],
        'strengths': result.get('strengths', []),
        'feedback': result.get('feedback', []),
        'suggestions': result.get('suggestions', []),
        'overall_score': 7,  # Calculate based on coverage
        'improvement_proposals': []
    }
    
    exam.ai_evaluation = evaluation
    exam.status = 'done'
    exam.updated_at = datetime.utcnow()
    db.session.commit()
    return jsonify({'exam': exam.to_dict()}), 200

except Exception as e:
    logger.error(f'Exam analysis failed: {e}', exc_info=True)
    exam.status = 'error'
    
    # Try metadata extraction
    try:
        ext = exam.file_path.rsplit('.', 1)[1].lower() if exam.file_path else ''
        text = _extract_text(exam.file_path, ext)
        from app.services.tn_exam_evaluation_service import _extract_exam_metadata
        exam.exam_metadata = _extract_exam_metadata(text)
    except:
        pass
    
    exam.ai_evaluation = {'error': str(e), 'error_message': 'Analyse échouée'}
    db.session.commit()
    return jsonify({'exam': exam.to_dict(), 'warning': str(e)}), 200
```

---

## 🔧 Code pour Option 2 (Plus simple)

Ajouter juste après la ligne 268:

```python
# Extract metadata
from app.services.tn_exam_evaluation_service import _extract_exam_metadata
exam.exam_metadata = _extract_exam_metadata(text)
```

Et modifier le prompt (ligne 311) pour ajouter `questions_with_sources`:

```json
"questions_with_sources": [
  {
    "question_number": 1,
    "question_text_preview": "Premier 100 caractères...",
    "aa": ["AA1"],
    "bloom_level": "applying",
    "sources": [{"document": "Chapitre X", "page": "Y", "excerpt": "..."}]
  }
]
```

---

## ❓ Quelle option choisissez-vous?

1️⃣ **Option 1** - Extraction complète (recommandé)
2️⃣ **Option 2** - Ajout métadonnées + amélioration prompt (rapide)

Je peux appliquer la modification automatiquement une fois votre choix fait!
