@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0upgrade.ps1" %*
if errorlevel 1 (
  echo.
  echo Upgrade failed. See the messages above.
  pause
  exit /b 1
)
echo.
pause
