@echo off
echo Fixing PowerShell npm policy for current user...
powershell -NoProfile -Command "Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force"
echo Done. Close PowerShell and use: npm.cmd run dev
pause
