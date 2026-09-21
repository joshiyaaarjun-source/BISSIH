@echo off
cd /d "%~dp0"
echo ==============================================
echo           BIS COMPASS - LOCAL HOST
echo ==============================================
echo.
if not exist node_modules (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo.
    echo npm install failed. Please check your Node.js/npm installation.
    pause
    exit /b 1
  )
)
echo.
echo Starting BIS COMPASS...
echo If port 3000 is busy, the app will automatically try 3001, 3002, etc.
echo Keep this window open while using the app.
echo.
call npm start
pause
