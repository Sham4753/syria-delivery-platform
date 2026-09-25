@echo off
setlocal
cd /d "%~dp0"
echo === Syria Delivery - فحص متطلبات Windows ===
where node >nul 2>nul && (echo [OK] Node.js) || (echo [MISSING] Node.js - https://nodejs.org/)
where npm >nul 2>nul && (echo [OK] npm) || (echo [MISSING] npm)
where firebase >nul 2>nul && (echo [OK] Firebase CLI) || (echo [MISSING] Firebase CLI: npm install -g firebase-tools)
where flutter >nul 2>nul && (echo [OK] Flutter) || (echo [MISSING] Flutter - https://docs.flutter.dev/get-started/install/windows)
where adb >nul 2>nul && (echo [OK] adb) || (echo [MISSING] Android Platform Tools / Android Studio)
if exist firebase.json (echo [OK] firebase.json) else (echo [MISSING] firebase.json)
if exist scripts\seed-emulator.js (echo [OK] seed script) else (echo [MISSING] scripts\seed-emulator.js)
if exist scripts\adb-reverse-setup.js (echo [OK] adb reverse script) else (echo [MISSING] scripts\adb-reverse-setup.js)
echo.
echo Emulator ports: UI=4000 Firestore=8080 Auth=9099 Functions=5001
if not "%SILENT_CHECK%"=="1" pause
