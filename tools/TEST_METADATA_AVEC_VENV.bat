@echo off
echo ╔═══════════════════════════════════════════════════════════════╗
echo ║        🔍 TEST D'EXTRACTION DES MÉTADONNÉES                  ║
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
if exist "..\venv\Scripts\activate.bat" (
    set VENV_PATH=..\venv
    goto :found_venv
)

echo ❌ Environnement virtuel introuvable!
echo.
echo Créez un environnement virtuel:
echo   python -m venv venv
echo   venv\Scripts\activate
echo   pip install -r requirements.txt
echo.
pause
exit /b 1

:found_venv
echo ✅ Environnement virtuel trouvé: %VENV_PATH%
echo.

echo 🔧 Activation de l'environnement virtuel...
call %VENV_PATH%\Scripts\activate.bat

echo.
echo 🔍 Vérification de Flask...
python -c "import flask; print('✅ Flask version:', flask.__version__)" 2>nul
if %errorlevel% neq 0 (
    echo ❌ Flask n'est pas installé dans cet environnement!
    echo.
    echo Installez les dépendances:
    echo   pip install -r requirements.txt
    echo.
    pause
    exit /b 1
)

echo.
echo ╔═══════════════════════════════════════════════════════════════╗
echo ║              🧪 EXÉCUTION DU TEST                            ║
echo ╚═══════════════════════════════════════════════════════════════╝
echo.

python test_extraction_metadata.py

echo.
echo ╔═══════════════════════════════════════════════════════════════╗
echo ║                  ✅ TEST TERMINÉ                             ║
echo ╚═══════════════════════════════════════════════════════════════╝
echo.
pause
