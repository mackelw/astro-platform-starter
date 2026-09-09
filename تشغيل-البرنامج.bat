@echo off
chcp 65001 >nul
rem تشغيل سيرفر مركز رينج على هذا الجهاز (ويندوز) - انقر نقرا مزدوجا
cd /d "%~dp0"
if "%PORT%"=="" set PORT=4321
rem 0.0.0.0 حتى تفتح بقية اجهزة الشبكة على هذا الجهاز
if "%HOST%"=="" set HOST=0.0.0.0

echo == مركز رينج للعلاج الطبيعي والتاهيل ==
echo.

where node >nul 2>&1
if errorlevel 1 (
    echo لم يتم العثور على Node.js
    echo نزله من https://nodejs.org ثم شغل هذا الملف مرة اخرى
    pause
    exit /b 1
)

if not exist node_modules (
    echo تجهيز البرنامج لاول مرة - قد يستغرق بضع دقائق...
    call npm install
    if errorlevel 1 ( pause & exit /b 1 )
)

if not exist dist\server\entry.mjs (
    echo بناء النسخة النهائية...
    call npm run build:server
    if errorlevel 1 ( pause & exit /b 1 )
)

echo.
echo البرنامج شغال. افتح:
echo    برنامج الموظفين : http://localhost:%PORT%/app
echo    موقع المركز     : http://localhost:%PORT%
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do echo    من الموبايل   : http://%%a:%PORT%
echo.
echo (الموبايل لازم يكون على نفس شبكة الواي فاي)
echo لايقاف البرنامج: اغلق هذه النافذة او اضغط Ctrl+C
echo.
start "" http://localhost:%PORT%/app
call npm run start:server
pause
