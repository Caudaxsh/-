@echo off
chcp 65001 >nul
rem 在 Windows 上啟動 WorkHorse(需要 Python 或 Node.js 其中之一),並用 Edge 開成小視窗。
cd /d "%~dp0public"
set PORT=8123
where py >nul 2>nul && (start "WorkHorse server" /min py -m http.server %PORT% & goto open)
where python >nul 2>nul && (start "WorkHorse server" /min python -m http.server %PORT% & goto open)
where npx >nul 2>nul && (start "WorkHorse server" /min npx --yes serve -l %PORT% . & goto open)
echo 找不到 Python 或 Node.js。也可以直接雙擊 public\index.html(部分功能如安裝成 App 需要用本機伺服器)。
pause & exit /b
:open
timeout /t 2 >nul
where msedge >nul 2>nul && (start "" msedge --app=http://localhost:%PORT%/ --window-size=416,580 & exit /b)
start "" http://localhost:%PORT%/
