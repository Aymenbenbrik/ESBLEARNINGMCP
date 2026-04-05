"""
Script de test pour vérifier l'extraction des métadonnées.
Usage: python test_extraction_metadata.py
"""
import os
import sys
import json

# Ajouter le répertoire parent au path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import create_app
from app.services.tn_exam_evaluation_service import _extract_exam_metadata

# Texte de test simulant un en-tête d'examen
test_text = """
École Supérieure de Commerce - Département IMA
Examen Final - Algèbre Linéaire
Classe: 1LMAD (L1 Informatique et Mathématiques Appliquées)
Durée: 2 heures (120 minutes)
Date: 12 Mars 2026
Enseignants: Aymen Ben Brik, Prof. Dupont
Nombre de pages: 2

Documents autorisés: Non
Calculatrice: Autorisée
Ordinateur: Non autorisé
Internet: Non autorisé

Répondre sur la feuille d'examen
"""

def test_extraction():
    print("=" * 70)
    print("🔍 TEST D'EXTRACTION DES MÉTADONNÉES")
    print("=" * 70)
    print()
    
    app = create_app()
    with app.app_context():
        print("📄 Texte de test:")
        print("-" * 70)
        print(test_text)
        print("-" * 70)
        print()
        
        print("🤖 Extraction en cours avec Gemini 2.5 Pro...")
        print()
        
        try:
            result = _extract_exam_metadata(test_text)
            
            print("📊 RÉSULTAT DE L'EXTRACTION:")
            print("=" * 70)
            print(json.dumps(result, indent=2, ensure_ascii=False))
            print("=" * 70)
            print()
            
            # Vérification des champs
            print("✅ VÉRIFICATION DES CHAMPS:")
            print("-" * 70)
            
            fields_to_check = [
                ('exam_name', 'Nom de l\'épreuve'),
                ('class_name', 'Classe'),
                ('declared_duration_min', 'Durée (min)'),
                ('exam_date', 'Date'),
                ('instructors', 'Enseignants'),
                ('num_pages', 'Nombre de pages'),
                ('calculator_allowed', 'Calculatrice'),
                ('documents_allowed', 'Documents'),
                ('computer_allowed', 'Ordinateur'),
                ('internet_allowed', 'Internet'),
                ('language', 'Langue'),
                ('department', 'Département')
            ]
            
            extracted_count = 0
            for field, label in fields_to_check:
                value = result.get(field)
                if value is not None and value != '' and value != []:
                    print(f"✅ {label:25} → {value}")
                    extracted_count += 1
                else:
                    print(f"❌ {label:25} → NON EXTRAIT")
            
            print("-" * 70)
            print(f"\n📊 Score: {extracted_count}/{len(fields_to_check)} champs extraits")
            
            if extracted_count >= 8:
                print("\n🎉 SUCCÈS! L'extraction fonctionne correctement.")
                return True
            elif extracted_count >= 4:
                print("\n⚠️  PARTIEL: Certains champs ne sont pas extraits.")
                print("   Vérifiez le prompt ou le format du texte d'examen.")
                return False
            else:
                print("\n❌ ÉCHEC: Très peu de champs extraits.")
                print("   Vérifiez que GOOGLE_API_KEY est configuré.")
                return False
                
        except Exception as e:
            print(f"\n❌ ERREUR lors de l'extraction:")
            print(f"   {type(e).__name__}: {e}")
            print()
            print("   Causes possibles:")
            print("   - GOOGLE_API_KEY manquant ou invalide")
            print("   - Problème de connexion à l'API Gemini")
            print("   - Import manquant (langchain_google_genai)")
            return False

if __name__ == '__main__':
    success = test_extraction()
    sys.exit(0 if success else 1)
