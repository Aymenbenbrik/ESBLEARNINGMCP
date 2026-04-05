@echo off
echo ╔═══════════════════════════════════════════════════════════════╗
echo ║        🔧 MIGRATION BASE DE DONNÉES - EXAM_METADATA         ║
echo ╚═══════════════════════════════════════════════════════════════╝
echo.

cd ESB-main

echo 📋 Recherche de l'environnement virtuel...
echo.

REM Chercher le venv
if exist "venv\Scripts\activate.bat" (
    set VENV_PATH=venv
    goto :found_venv
)
if exist ".venv\Scripts\activate.bat" (
    set VENV_PATH=.venv
    goto :found_venv
)

echo ❌ Environnement virtuel introuvable!
pause
exit /b 1

:found_venv
echo ✅ Environnement trouvé: %VENV_PATH%
echo.

echo 🔧 Activation...
call %VENV_PATH%\Scripts\activate.bat

echo.
echo 📊 Vérification de la base de données actuelle...
echo.

REM Vérifier si la colonne existe
sqlite3 instance\app.db "PRAGMA table_info(course_exam);" | findstr "exam_metadata" >nul
if %errorlevel% equ 0 (
    echo ✅ La colonne exam_metadata existe déjà!
    echo    Rien à faire.
    echo.
    pause
    exit /b 0
)

echo ⚠️  La colonne exam_metadata n'existe pas encore.
echo.
echo 🔧 Exécution de la migration...
echo.

python migrations\add_exam_metadata.py

if %errorlevel% equ 0 (
    echo.
    echo ╔═══════════════════════════════════════════════════════════════╗
    echo ║           ✅ MIGRATION RÉUSSIE!                              ║
    echo ╚═══════════════════════════════════════════════════════════════╝
    echo.
    echo La colonne exam_metadata a été ajoutée à la table course_exam.
    echo.
    echo 🎯 Prochaine étape: Redémarrer le serveur Flask
    echo    python run.py
    echo.
) else (
    echo.
    echo ❌ Erreur lors de la migration!
    echo.
)

pause
