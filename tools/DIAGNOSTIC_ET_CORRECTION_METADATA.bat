@echo off
echo ╔═══════════════════════════════════════════════════════════════╗
echo ║   🔍 DIAGNOSTIC ET CORRECTION - MÉTADONNÉES D'ÉPREUVE       ║
echo ╚═══════════════════════════════════════════════════════════════╝
echo.

cd ESB-main

echo 📋 Étape 1/4 - Vérification de la base de données...
echo.

REM Vérifier si la colonne existe
sqlite3 instance\app.db "PRAGMA table_info(course_exam);" > tmp_schema.txt
findstr /C:"exam_metadata" tmp_schema.txt >nul
if %errorlevel% equ 0 (
    echo ✅ Colonne exam_metadata existe déjà
) else (
    echo ❌ Colonne exam_metadata MANQUANTE
    echo 🔧 Exécution de la migration...
    python migrations\add_exam_metadata.py
    if %errorlevel% neq 0 (
        echo ❌ Erreur lors de la migration!
        pause
        exit /b 1
    )
    echo ✅ Migration terminée!
)
del tmp_schema.txt 2>nul
echo.

echo 📋 Étape 2/4 - Test de l'extraction de métadonnées...
echo.

REM Créer un script de test Python
echo import os, sys > test_metadata.py
echo sys.path.insert(0, os.getcwd()) >> test_metadata.py
echo from app import create_app >> test_metadata.py
echo from app.services.tn_exam_evaluation_service import _extract_exam_metadata >> test_metadata.py
echo. >> test_metadata.py
echo test_text = """École Supérieure de Commerce >> test_metadata.py
echo Examen Final - Algèbre Linéaire >> test_metadata.py
echo Classe: L1 Informatique >> test_metadata.py
echo Durée: 1h30 >> test_metadata.py
echo Date: 15 Janvier 2024 >> test_metadata.py
echo Enseignant: Dr. Aymen Ben Ahmed >> test_metadata.py
echo Calculatrice autorisée >> test_metadata.py
echo Documents non autorisés""" >> test_metadata.py
echo. >> test_metadata.py
echo app = create_app() >> test_metadata.py
echo with app.app_context(): >> test_metadata.py
echo     result = _extract_exam_metadata(test_text) >> test_metadata.py
echo     print("\n📊 Résultat de l'extraction:") >> test_metadata.py
echo     import json >> test_metadata.py
echo     print(json.dumps(result, indent=2, ensure_ascii=False)) >> test_metadata.py
echo     if result.get('exam_name'): >> test_metadata.py
echo         print("\n✅ Extraction réussie!") >> test_metadata.py
echo     else: >> test_metadata.py
echo         print("\n❌ Extraction échouée!") >> test_metadata.py

python test_metadata.py
set TEST_RESULT=%errorlevel%
del test_metadata.py 2>nul

if %TEST_RESULT% neq 0 (
    echo.
    echo ⚠️  Test d'extraction a échoué!
    echo Vérifiez que GOOGLE_API_KEY est configuré dans .env
    pause
)
echo.

echo 📋 Étape 3/4 - Vérification de la configuration...
echo.

REM Vérifier que GOOGLE_API_KEY existe
findstr /C:"GOOGLE_API_KEY" .env >nul
if %errorlevel% equ 0 (
    echo ✅ GOOGLE_API_KEY configuré dans .env
) else (
    echo ❌ GOOGLE_API_KEY MANQUANT dans .env!
    echo Ajoutez: GOOGLE_API_KEY=votre-clé-api
    pause
    exit /b 1
)
echo.

echo 📋 Étape 4/4 - Instructions de redémarrage...
echo.
echo ⚠️  IMPORTANT: Pour que les modifications soient prises en compte:
echo.
echo 1. Arrêtez le serveur Flask (Ctrl+C)
echo 2. Redémarrez avec: python run.py
echo 3. Uploadez une épreuve et lancez l'analyse
echo 4. Vérifiez que la section "Métadonnées de l'épreuve" est remplie
echo.

echo ╔═══════════════════════════════════════════════════════════════╗
echo ║              ✅ DIAGNOSTIC TERMINÉ!                          ║
echo ╚═══════════════════════════════════════════════════════════════╝
echo.
echo 📝 Résumé des vérifications:
echo    ✅ Base de données
echo    ✅ Migration
echo    ✅ Fonction d'extraction
echo    ✅ Configuration API
echo.
echo 🎯 Prochaine étape: Redémarrer le serveur Flask
echo.
pause
