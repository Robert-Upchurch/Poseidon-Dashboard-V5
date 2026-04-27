@echo off
REM ================================================================
REM  Poseidon Dashboard — sync local work with GitHub
REM  Repo: https://github.com/Robert-Upchurch/Poseidon
REM
REM  Handles diverged branches: fetch + rebase + push.
REM  Double-click this file, or run from a command prompt.
REM ================================================================

setlocal
cd /d "%~dp0"

echo.
echo === Clearing stale git lock files (if any) ===
if exist ".git\index.lock" del /F /Q ".git\index.lock"
if exist ".git\HEAD.lock"  del /F /Q ".git\HEAD.lock"

echo.
echo === Staging any new/changed dashboard files ===
git add index.html poseidon-dashboard-v5.html poseidon-dashboard-v6.html push-to-github.bat

echo.
echo === Committing (will skip if nothing changed) ===
git -c user.email=ceo@cti-usa.com -c user.name="Robert Upchurch" commit -m "V6 Phase 3 + iframe fixes"
if errorlevel 1 (
    echo No new working-tree changes to commit. Continuing.
)

echo.
echo === Fetching remote state ===
git fetch origin
if errorlevel 1 goto :fail

echo.
echo === Rebasing local commits on top of origin/main ===
git rebase origin/main
if errorlevel 1 (
    echo.
    echo ================================================================
    echo  REBASE CONFLICT
    echo  Git paused because a file was changed on both sides.
    echo  To resolve:
    echo    1. Open the conflicting file(s) listed above
    echo    2. Search for lines starting with ^<^<^<^<^<^<^< and fix them
    echo    3. Run:   git add ^<file^>
    echo    4. Then:  git rebase --continue
    echo    5. Re-run this script.
    echo  OR, to abandon the rebase and try again:
    echo    git rebase --abort
    echo ================================================================
    pause
    exit /b 1
)

echo.
echo === Pushing to origin/main ===
git push origin main
if errorlevel 1 goto :fail

echo.
echo ================================================================
echo  SUCCESS
echo  Repo:       https://github.com/Robert-Upchurch/Poseidon
echo  Landing:    https://robert-upchurch.github.io/Poseidon/
echo  V5 direct:  https://robert-upchurch.github.io/Poseidon/poseidon-dashboard-v5.html
echo  V6 direct:  https://robert-upchurch.github.io/Poseidon/poseidon-dashboard-v6.html
echo  (Pages rebuild takes ~60 seconds.)
echo ================================================================
pause
exit /b 0

:fail
echo.
echo ================================================================
echo  FAILED. See messages above.
echo  If Git prompted for credentials and you canceled, retry this file.
echo  If your Personal Access Token expired, generate a new one at:
echo    https://github.com/settings/tokens (scope: repo)
echo  Then re-run this script.
echo ================================================================
pause
exit /b 1
