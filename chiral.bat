@echo off
chcp 65001 >nul

REM Chiral Controller CLI for CMD
set "CHIRAL_ROOT=C:\Users\li\Documents\GitHub\Chiral-Controller"
set "KIMI_CLI=kimi-superpowers"

if /I "%1"=="-Normal" (
    set "KIMI_CLI=kimi"
)

if /I "%1"=="run" (
    if /I "%2"=="dev" (
        echo Starting Chiral Controller (%KIMI_CLI%)...
        start "Chiral Server" cmd /k "cd /d %CHIRAL_ROOT%\skill ^&^& set KIMI_CLI=%KIMI_CLI% ^&^& node_modules\.bin\tsx src\server.ts"
        timeout /t 2 /nobreak >nul
        start "Chiral Client" cmd /k "cd /d %CHIRAL_ROOT%\mobile ^&^& npm run dev"
        echo.
        echo Services started!
        echo Local:  http://localhost:5173
        echo Mobile: http://192.168.31.17:5173
        goto :end
    )
    if /I "%2"=="server" (
        cd /d %CHIRAL_ROOT%\skill
        set KIMI_CLI=%KIMI_CLI%
        node_modules\.bin\tsx src\server.ts
        goto :end
    )
    if /I "%2"=="client" (
        cd /d %CHIRAL_ROOT%\mobile
        npm run dev
        goto :end
    )
)

if /I "%1"=="stop" (
    taskkill /F /FI "WINDOWTITLE eq Chiral Server" 2>nul
    taskkill /F /FI "WINDOWTITLE eq Chiral Client" 2>nul
    echo Stopped.
    goto :end
)

if /I "%1"=="status" (
    netstat -ano | findstr ":3777" >nul && echo Server: Running || echo Server: Stopped
    netstat -ano | findstr ":5173" >nul && echo Client: Running || echo Client: Stopped
    goto :end
)

echo Usage: chiral run dev [-Normal]
echo        chiral run server
echo        chiral run client
echo        chiral stop
echo        chiral status

:end
