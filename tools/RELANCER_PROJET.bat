@echo off
echo ╔═══════════════════════════════════════════════════════════════╗
echo ║     RELANCE DU PROJET ESB-LEARNING AVEC CORRECTIONS          ║
echo ╚═══════════════════════════════════════════════════════════════╝
echo.

echo 📋 Étape 1/3 - Migration de la base de données...
echo.
cd ESB-main

REM Activer l'environnement virtuel
if exist "venv\Scripts\activate.bat" (
    call venv\Scripts\activate.bat
) else if exist ".venv\Scripts\activate.bat" (
    call .venv\Scripts\activate.bat
) else (
    echo ⚠️  Environnement virtuel non trouvé, tentative sans activation...
)

python migrations\add_exam_metadata.py
if %errorlevel% neq 0 (
    echo ❌ Erreur lors de la migration!
    pause
    exit /b 1
)
echo.
echo ✅ Migration terminée!
echo.

echo 📋 Étape 2/3 - Démarrage du serveur Backend Flask...
echo.
echo 🔥 Le serveur Flask va démarrer dans une nouvelle fenêtre...
echo.
start "ESB Backend Flask" cmd /k "cd ESB-main && (if exist venv\Scripts\activate.bat (call venv\Scripts\activate.bat) else if exist .venv\Scripts\activate.bat (call .venv\Scripts\activate.bat)) && python run.py"
timeout /t 3 /nobreak >nul
echo ✅ Backend démarré!
echo.

echo 📋 Étape 3/3 - Démarrage du Frontend Next.js...
echo.
cd ..\esb-nextjs
echo 🔥 Le frontend Next.js va démarrer dans une nouvelle fenêtre...
echo.
start "ESB Frontend Next.js" cmd /k "npm run dev"
timeout /t 3 /nobreak >nul
echo ✅ Frontend démarré!
echo.

echo ╔═══════════════════════════════════════════════════════════════╗
echo ║                  🎉 PROJET LANCÉ AVEC SUCCÈS!                ║
echo ╚═══════════════════════════════════════════════════════════════╝
echo.
echo 🌐 Accédez à l'application:
echo    Frontend: http://localhost:3000
echo    Backend:  http://localhost:5000
echo.
echo 📝 Deux fenêtres ont été ouvertes:
echo    - ESB Backend Flask (serveur Python)
echo    - ESB Frontend Next.js (interface web)
echo.
echo 🧪 Pour tester l'extraction des métadonnées:
echo    1. Ouvrir http://localhost:3000
echo    2. Se connecter en tant qu'enseignant
echo    3. Aller dans un cours
echo    4. Uploader une épreuve PDF
echo    5. Cliquer sur "Analyser avec l'IA"
echo    6. Vérifier que les métadonnées s'affichent
echo.
echo 💡 Appuyez sur une touche pour fermer cette fenêtre...
pause >nul
