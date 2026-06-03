@echo off
cd /d "%~dp0.."

echo ========================================
echo  LibreTranslate Docker (local MIT)
echo ========================================
echo.

where docker >nul 2>&1
if errorlevel 1 (
  echo ERROR: Docker Desktop not found
  echo Install: https://www.docker.com/products/docker-desktop/
  echo Or use: scripts\translate-up-python.bat
  pause
  exit /b 1
)

echo First start downloads en/zh models (5-15 min)...
docker compose up -d
if errorlevel 1 (
  echo ERROR: docker compose failed
  pause
  exit /b 1
)

echo.
echo LibreTranslate: http://127.0.0.1:5000
echo Logs: docker compose logs -f libretranslate
echo Web: set mode LOCAL or AUTO, then F5
echo.
pause
