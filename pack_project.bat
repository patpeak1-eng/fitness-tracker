@echo off
echo Packing project for transfer...
echo This will create a timestamped zip file (e.g., 'FitnessProject_Source_2026-01-26...zip').
echo.

powershell -ExecutionPolicy Bypass -Command "$date = Get-Date -Format 'yyyy-MM-dd_HHmm'; $zipName = 'FitnessProject_Source_' + $date + '.zip'; Get-ChildItem -Path . -Exclude 'node_modules', '.git', 'dist', '*.zip' | Compress-Archive -DestinationPath $zipName -Force; Write-Host 'Created: ' $zipName"

if %errorlevel% neq 0 (
    echo Error creating zip file.
    pause
    exit /b
)

echo.
echo Success! Backup created.
echo Upload this file to your Google Drive.
echo.
echo ON THE NEW COMPUTER:
echo 1. Unzip this file.
echo 2. Open the folder in VS Code / Antigravity.
echo 3. Double-click 'start_app.bat' (it will auto-reinstall the missing node_modules).
echo.
pause
