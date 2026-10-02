@echo off
setlocal EnableExtensions
cd /d "%~dp0"
set "SILENT_CHECK=1"
call check-requirements.bat
if errorlevel 1 exit /b 1
if not exist functions\node_modules\firebase-admin (
  echo تثبيت اعتماديات Cloud Functions لأول مرة...
  pushd functions
  call npm install
  if errorlevel 1 (popd & exit /b 1)
  popd
)
set "FIRESTORE_EMULATOR_HOST=127.0.0.1:8080"
set "FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099"
set "GCLOUD_PROJECT=syria-delivery-2026-majed"
start "Syria Delivery Firebase Emulator" cmd /k "cd /d %~dp0 && firebase emulators:start --project syria-delivery-2026-majed --only auth,firestore,functions"
echo انتظار جاهزية المحاكي فعليًا على المنفذ 8080 (حد أقصى 90 ثانية)...
set /a WAIT_COUNT=0
:wait_loop
powershell -NoProfile -ExecutionPolicy Bypass -Command "$c=New-Object Net.Sockets.TcpClient; try {$c.Connect('127.0.0.1',8080); exit 0} catch {exit 1} finally {$c.Dispose()}" >nul 2>&1
if not errorlevel 1 goto emulator_ready
set /a WAIT_COUNT+=1
if %WAIT_COUNT% GEQ 45 goto emulator_timeout
timeout /t 2 /nobreak >nul
goto wait_loop

:emulator_timeout
echo خطأ: لم يصبح Firestore Emulator جاهزًا خلال 90 ثانية.
echo راجع نافذة Firebase Emulator وتأكد من Java وFirebase CLI والمنافذ 8080 و9099 و5001.
exit /b 1

:emulator_ready
echo المحاكي جاهز.
node scripts\seed-emulator.js
if errorlevel 1 (
  echo فشل seed. تحقق من نافذة Emulator وأعد المحاولة بعد جاهزيتها.
  exit /b 1
)
echo.
echo === Syria Delivery جاهز ===
echo Emulator UI: http://127.0.0.1:4000
echo Admin: admin@test.local / test123456
echo Vendor: vendor@test.local / test123456
echo Courier: courier@test.local / test123456
echo Customer: customer@test.local / test123456
if not exist admin-dashboard\node_modules (
  echo تثبيت اعتماديات لوحة الإدارة لأول مرة...
  pushd admin-dashboard
  call npm install
  if errorlevel 1 (popd & exit /b 1)
  popd
)
start "Syria Delivery Admin" cmd /k "cd /d %~dp0admin-dashboard && set VITE_USE_FIREBASE_EMULATORS=true&& npm run dev -- --host 127.0.0.1 --port 5173 --strictPort"
timeout /t 5 /nobreak >nul
start "" http://localhost:5173

echo تشغيل تطبيق العميل على Chrome...
start "Customer App Chrome" cmd /k "cd /d %~dp0customer_app && flutter run -d chrome --web-port=3000 --dart-define=USE_FIREBASE_EMULATORS=true --dart-define=EMULATOR_HOST=127.0.0.1"
echo تشغيل تطبيق المندوب على Chrome...
start "Courier App Chrome" cmd /k "cd /d %~dp0courier_app && flutter run -d chrome --web-port=3001 --dart-define=USE_FIREBASE_EMULATORS=true --dart-define=EMULATOR_HOST=127.0.0.1"
echo تشغيل تطبيق التاجر على Chrome...
start "Merchant App Chrome" cmd /k "cd /d %~dp0merchant_app && flutter run -d chrome --web-port=3002 --dart-define=USE_FIREBASE_EMULATORS=true --dart-define=EMULATOR_HOST=127.0.0.1"
echo.
echo تم إطلاق النوافذ. اترك هذه النافذة مفتوحة أثناء التشغيل.
pause
