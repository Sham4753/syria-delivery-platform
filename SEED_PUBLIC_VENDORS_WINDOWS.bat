@echo off
setlocal
cd /d "%~dp0"
set "FIRESTORE_EMULATOR_HOST=127.0.0.1:8080"
set "FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099"
set "GCLOUD_PROJECT=demo-syria-delivery"
where node >nul 2>nul || (echo Node.js is required.&pause&exit /b 1)
if not exist "functions\node_modules\firebase-admin" (
  pushd functions
  call npm install --no-audit --no-fund
  popd
)
echo سيتم إعادة زرع بيانات التجربة، بما فيها public_vendors...
node scripts\seed-emulator.js
if errorlevel 1 (echo فشل الزرع. تأكد أن Firebase Emulator يعمل على 8080 و9099.&pause&exit /b 2)
echo تم تجهيز كتالوج الزبون. أعد تحميل صفحة تطبيق الزبون بـ Ctrl+R.
pause
