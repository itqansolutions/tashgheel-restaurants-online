@echo off
echo ==========================================
echo      Tashgheel POS - GitHub Uploader
echo ==========================================
echo.
echo This script will help you upload your project to GitHub.
echo.
echo 1. Go to https://github.com/new and create an empty repository.
echo    (Do not add README, gitignore, or license)
echo.
set REPO_URL=https://github.com/itqansolutions/TashgheelServices.git

echo.
echo Adding remote origin...
git remote remove origin 2>nul
git remote add origin %REPO_URL%

echo.
echo Renaming branch to main...
git branch -M main

echo.
echo Pushing code to GitHub...
echo (You may be asked to sign in via a browser or popup)
git push -u origin main

echo.
echo ==========================================
echo             Upload Complete!
echo ==========================================
echo.
echo Now go to your Repository Settings > Pages
echo and enable GitHub Pages from the 'main' branch / root folder.
echo.
pause
