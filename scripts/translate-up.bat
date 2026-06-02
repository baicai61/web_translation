@echo off
cd /d "%~dp0.."
where docker >nul 2>&1
if errorlevel 1 (
  echo ERROR: docker not found. Install Docker Desktop or use translate-up-python.bat
  pause
  exit /b 1
)
docker compose up -d
echo LibreTranslate Docker started on port 5000
pause
