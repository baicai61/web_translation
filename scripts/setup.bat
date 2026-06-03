@echo off
setlocal EnableExtensions
chcp 65001 >nul 2>nul
cd /d "%~dp0.."
set "ROOT=%CD%"
set "PY_OK=1"

echo.
echo ========================================
echo   Literature Reader - Setup
echo   %ROOT%
echo ========================================
echo.

call :refresh_path
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8

echo.
echo [STEP] Check Node.js
call :ensure_node
if errorlevel 1 exit /b 1
for /f "delims=" %%v in ('node -v 2^>nul') do echo     [OK] Node.js %%v

echo.
echo [STEP] Check Python 3.10 - 3.12
call :ensure_python
if errorlevel 1 exit /b 1
echo     [OK] Python - %PY_EXE%

echo.
echo [1/3] npm install - web app dependencies
if exist "node_modules\vite\bin\vite.js" (
  echo     [OK] node_modules already exists, skip
  goto python_setup
)
echo         First time about 1-3 min, please wait...
call npm.cmd install
if errorlevel 1 (
  echo     [X] npm install failed
  echo         Try scripts\fix-powershell-npm.bat then retry
  exit /b 1
)
echo     [OK] npm install done

:python_setup
echo.
echo [2/3] Python engine + zh/en models
echo         First time about 5-15 min, need internet, ~140MB once
echo.
%PY_EXE% -X utf8 scripts\fix_encoding.py
echo.
%PY_EXE% -X utf8 scripts\install_local_translate.py
if errorlevel 1 (
  echo     [!!] Local engine not fully ready - use ONLINE mode on web
  set "PY_OK=0"
) else (
  echo     [OK] Translation engine ready
)

echo.
echo [3/3] Setup finished
echo.
echo   Next steps:
echo     A - Double-click 一键启动.bat
echo     B - Double-click 启动翻译引擎.bat then 启动网站.bat
echo.
echo   Browser: http://localhost:5173
echo   LOCAL mode = offline Chinese/English
echo   ONLINE mode = need internet
echo.
if "%PY_OK%"=="0" echo   [!!] Re-run setup later for offline mode
exit /b 0

REM ---------- helpers ----------

:refresh_path
set "PATH=%PATH%;%ProgramFiles%\nodejs"
set "PATH=%PATH%;%ProgramFiles(x86)%\nodejs"
for %%V in (312 311 310) do (
  set "PATH=%PATH%;%LocalAppData%\Programs\Python\Python%%V"
  set "PATH=%PATH%;%LocalAppData%\Programs\Python\Python%%V\Scripts"
)
exit /b 0

:has_winget
where winget >nul 2>&1
exit /b %ERRORLEVEL%

:ensure_node
where node >nul 2>&1
if not errorlevel 1 exit /b 0

echo     [X] Node.js not found
call :has_winget
if errorlevel 1 goto node_manual

echo     Installing Node.js LTS via winget...
echo         May take a few minutes, please wait...
winget install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements --disable-interactivity
call :refresh_path
where node >nul 2>&1
if not errorlevel 1 exit /b 0

echo     [!!] winget finished but node not in PATH yet
echo         Close this window and run 一键安装.bat again
exit /b 1

:node_manual
echo         winget not available - open browser to install
echo         Or install from https://nodejs.org/
start https://nodejs.org/
exit /b 1

:detect_python
set "PY_EXE="
py -3.12 -c "import sys" 1>nul 2>nul && set "PY_EXE=py -3.12"
if not defined PY_EXE py -3.11 -c "import sys" 1>nul 2>nul && set "PY_EXE=py -3.11"
if not defined PY_EXE py -3.10 -c "import sys" 1>nul 2>nul && set "PY_EXE=py -3.10"
if defined PY_EXE exit /b 0
exit /b 1

:ensure_python
call :detect_python
if not errorlevel 1 exit /b 0

echo     [X] Python not found
call :has_winget
if errorlevel 1 goto python_manual

echo     Installing Python 3.12 via winget...
echo         May take a few minutes, please wait...
winget install --id Python.Python.3.12 -e --accept-package-agreements --accept-source-agreements --disable-interactivity
call :refresh_path
call :detect_python
if not errorlevel 1 exit /b 0

echo     [!!] winget finished but Python not detected yet
echo         Close this window and run 一键安装.bat again
echo         Do NOT install Python 3.11 separately if 3.12 is already installed
exit /b 1

:python_manual
echo         winget not available - open browser to install
echo         Check Add to PATH during install
start https://www.python.org/downloads/
exit /b 1
