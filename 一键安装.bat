@echo off
chcp 65001 >nul 2>nul
title 文献译读 - 一键安装
cd /d "%~dp0"

echo.
echo ========================================
echo   文献译读 - 一键环境装配
echo   适合第一次在本机使用
echo ========================================
echo.
echo 将自动检查并安装：
echo   - Node.js 网站依赖
echo   - Python 翻译引擎与中英模型
echo.
echo 若缺少 Node / Python，会尝试用 winget 自动安装
echo （Windows 10/11 自带，需联网；无 winget 则打开下载页）
echo.
echo 需要联网。首次约 5~15 分钟，以后无需重复安装。
echo.
pause

call "%~dp0scripts\setup.bat"
set "RC=%ERRORLEVEL%"

echo.
if "%RC%"=="0" (
  echo 全部完成。可双击「一键启动.bat」开始使用。
) else (
  echo 安装未完全成功，请根据上方提示处理。
)
echo.
pause
exit /b %RC%
