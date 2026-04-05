@echo off
echo ╔═══════════════════════════════════════════════════════════════╗
echo ║            ARRÊT DU PROJET ESB-LEARNING                      ║
echo ╚═══════════════════════════════════════════════════════════════╝
echo.

echo 🛑 Arrêt du Backend Flask...
taskkill /FI "WindowTitle eq ESB Backend Flask*" /T /F 2>nul
if %errorlevel% equ 0 (
    echo ✅ Backend arrêté
) else (
    echo ℹ️  Backend déjà arrêté ou introuvable
)
echo.

echo 🛑 Arrêt du Frontend Next.js...
taskkill /FI "WindowTitle eq ESB Frontend Next.js*" /T /F 2>nul
if %errorlevel% equ 0 (
    echo ✅ Frontend arrêté
) else (
    echo ℹ️  Frontend déjà arrêté ou introuvable
)
echo.

echo 🛑 Arrêt des processus Node.js (Next.js)...
taskkill /F /IM node.exe 2>nul
if %errorlevel% equ 0 (
    echo ✅ Processus Node arrêtés
) else (
    echo ℹ️  Aucun processus Node en cours
)
echo.

echo 🛑 Arrêt des processus Python (Flask)...
taskkill /F /IM python.exe 2>nul
if %errorlevel% equ 0 (
    echo ✅ Processus Python arrêtés
) else (
    echo ℹ️  Aucun processus Python en cours
)
echo.

echo ╔═══════════════════════════════════════════════════════════════╗
echo ║              ✅ PROJET ARRÊTÉ AVEC SUCCÈS!                   ║
echo ╚═══════════════════════════════════════════════════════════════╝
echo.
pause
