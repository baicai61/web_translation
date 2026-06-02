@echo off
pushd "%~dp0.."
set "ROOT=%CD%"

where node >nul 2>&1
if errorlevel 1 (
  echo ERROR: Node.js not found. Install from https://nodejs.org/
  pause
  exit /b 1
)

if not exist "node_modules\vite\bin\vite.js" (
  echo Installing npm packages...
  call npm.cmd install
  if errorlevel 1 (
    echo ERROR: npm install failed
    pause
    exit /b 1
  )
)

echo.
echo ========================================
echo  Literature Reader - Web App
echo ========================================
echo.
echo Browser will open automatically.
echo If not, check the URL shown below (Local: http://localhost:5173)
echo.
echo For translation, also run: scripts\translate-up-python.bat
echo DO NOT CLOSE this window while using the app.
echo.

cd /d "%ROOT%"
node node_modules\vite\bin\vite.js

echo.
echo Server stopped.
popd
pause
