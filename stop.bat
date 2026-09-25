@echo off
setlocal
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":4000 :5001 :8080 :9099" ^| findstr LISTENING') do taskkill /PID %%P /T /F >nul 2>nul
taskkill /FI "WINDOWTITLE eq Syria Delivery Firebase Emulator*" /T /F >nul 2>nul
echo تم إيقاف محاكيات Syria Delivery إن كانت تعمل.
pause
