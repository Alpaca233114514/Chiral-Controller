@echo off
chcp 65001
cls
echo.
echo ================================================
echo          Chiral Controller - Dev Mode
echo ================================================
echo.

set "PROJECT_ROOT=%~dp0"
set "LOCAL_IP="

for /f "tokens=2 delims=[]" %%a in ('ping -4 -n 1 %computername% ^| findstr "["') do (
    set "LOCAL_IP=%%a"
    goto :found_ip
)
:found_ip
if "%LOCAL_IP%"=="" set "LOCAL_IP=127.0.0.1"

echo Project: %PROJECT_ROOT%
echo.

node --version >nul 2>&1
if errorlevel 1 (
    echo Error: Node.js not found
    pause
    exit /b 1
)

echo Node.js: OK
echo.

:: Check deps and start both in one window using START

cd /d "%PROJECT_ROOT%\skill"
if not exist "node_modules" (
    echo Installing skill deps...
    call npm install
    if errorlevel 1 (
        echo Failed to install skill deps
        pause
        exit /b 1
    )
)

cd /d "%PROJECT_ROOT%\mobile"
if not exist "node_modules" (
    echo Installing mobile deps...
    call npm install
    if errorlevel 1 (
        echo Failed to install mobile deps
        pause
        exit /b 1
    )
)

cd /d "%PROJECT_ROOT%"

echo Starting MCP Server on port 3777...
start "Chiral Server" cmd /k "cd skill && npm run dev"

timeout /t 2 /nobreak >nul

echo Starting Web Client on port 5173...
start "Chiral Client" cmd /k "cd mobile && npm run dev"

timeout /t 3 /nobreak >nul

echo.
echo ================================================
echo                 Started!
echo ================================================
echo.
echo Local:   http://localhost:5173
echo Mobile:  http://%LOCAL_IP%:5173
echo Server:  http://%LOCAL_IP%:3777
echo.
echo 1. Open browser on phone
echo 2. Go to http://%LOCAL_IP%:5173
echo 3. Connect to http://%LOCAL_IP%:3777
echo 4. Send prompts!
echo.
pause
