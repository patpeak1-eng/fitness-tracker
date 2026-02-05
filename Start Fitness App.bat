@echo off
echo Starting Fitness Tracker App...
echo.

echo Checking for Node.js...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: Node.js is not installed or not in your PATH.
    echo Please download and install it from https://nodejs.org/
    echo.
    pause
    exit /b
)

if exist "node_modules\.bin\vite.cmd" (
    echo node_modules found and validated. Skipping install...
) else (
    echo Installing dependencies - this may take a moment...
    call npm install
    if errorlevel 1 (
        echo Error installing dependencies.
        pause
        exit /b
    )
)

echo.
echo Starting Development Server...
echo Your browser should open automatically, or go to http://localhost:5173
echo.
call npm run dev -- --host

pause
