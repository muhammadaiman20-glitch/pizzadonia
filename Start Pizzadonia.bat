@echo off
title Pizzadonia
cd /d "%~dp0"
rem NOTE: no round brackets inside messages - inside an IF block they end the block.
where npm >nul 2>&1
if errorlevel 1 (
  echo  [ERROR] Node.js / npm not found - install Node 20 or newer first.
  pause
  exit /b 1
)
if not exist "node_modules\" (
  echo  Installing packages - first run only...
  call npm install --no-audit --no-fund
  if errorlevel 1 goto :failed
)
echo  Building the shop page...
call npm run build
if errorlevel 1 goto :failed
echo.
node server.js
goto :eof

:failed
echo  [ERROR] Something failed above.
pause
exit /b 1
