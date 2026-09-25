@echo off
setlocal EnableExtensions
cd /d "%~dp0"
where node >nul 2>nul
if not %errorlevel%==0 (
  echo [ERROR] Node.js LTS is required.
  pause
  exit /b 2
)
where npm >nul 2>nul
if not %errorlevel%==0 (
  echo [ERROR] npm is required and normally ships with Node.js.
  pause
  exit /b 3
)

pushd admin-dashboard
if not exist node_modules (
  echo Installing dashboard dependencies...
  call npm ci --no-audit --no-fund
  if errorlevel 1 goto :failed
)
echo Building dashboard...
call npm run build
if errorlevel 1 goto :failed
popd

echo Build completed. Double-click START_HERE.bat to run the demo.
pause
exit /b 0

:failed
popd
 echo [ERROR] Build failed. Review the output above.
pause
exit /b 4
