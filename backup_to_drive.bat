@echo off
set "SOURCE=C:\Users\PC\Documents\fitness-tracker"
set "DEST=G:\My Drive\fitness-tracker-backups"
set "TIMESTAMP=%date:~-4,4%-%date:~-10,2%-%date:~-7,2%_%time:~0,2%-%time:~3,2%"
set "TIMESTAMP=%TIMESTAMP: =0%"
set "ZIPNAME=fitness_backup_%TIMESTAMP%.zip"

echo ========================================================
echo   Backing up Fitness Tracker to Google Drive
echo ========================================================
echo.
echo Source: %SOURCE%
echo Dest:   %DEST%\%ZIPNAME%
echo.

if not exist "%DEST%" mkdir "%DEST%"

echo Zipping project files (skipping node_modules)...
powershell -command "Get-ChildItem -Path '%SOURCE%' | Where-Object { $_.Name -ne 'node_modules' -and $_.Name -ne '.git' -and $_.Name -ne 'dist' } | Compress-Archive -DestinationPath '%DEST%\%ZIPNAME%'"

if %errorlevel% equ 0 (
    echo.
    echo [SUCCESS] Backup created successfully!
) else (
    echo.
    echo [ERROR] Backup failed.
)

echo.
pause
