@echo off
rem Build iCareTele debug APK (Windows). Web/Lovable build is untouched: these env vars only live in this window.
cd /d "%~dp0"
set CAPACITOR_BUILD=1
set CARE_LOCAL_REVIEW=1
set NODE_OPTIONS=--max-old-space-size=4096
echo === START %date% %time% > build-apk-log.txt
taskkill /f /im node.exe >nul 2>&1
echo === npm run build:apk >> build-apk-log.txt
call npm.cmd run build:apk >> build-apk-log.txt 2>&1 || goto fail
if not exist ".output\public\index.html" (echo index.html missing >> build-apk-log.txt & goto fail)
echo === cap sync >> build-apk-log.txt
call npx.cmd cap sync android >> build-apk-log.txt 2>&1 || goto fail
echo === gradle >> build-apk-log.txt
pushd android
call gradlew.bat assembleDebug >> ..\build-apk-log.txt 2>&1 || (popd & goto fail)
popd
copy /y "android\app\build\outputs\apk\debug\app-debug.apk" "%USERPROFILE%\Desktop\iCareTele-oauth-debug.apk" >> build-apk-log.txt
echo === git status >> build-apk-log.txt
git status --short >> build-apk-log.txt 2>&1
echo === DONE OK %date% %time% >> build-apk-log.txt
echo BUILD OK
pause
exit /b 0
:fail
echo === FAILED %date% %time% >> build-apk-log.txt
echo BUILD FAILED - see build-apk-log.txt
pause
exit /b 1
