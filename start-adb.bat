@echo off
chcp 65001 >nul
cd /d "%~dp0"
title TabaTaba — телефон через ADB

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js не найден.
  echo Установите Node.js LTS: https://nodejs.org/
  echo.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo.
  echo npm не найден. Переустановите Node.js LTS.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\vite\package.json" (
  echo.
  echo Первый запуск: устанавливаю зависимости...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo Не удалось установить зависимости.
    pause
    exit /b 1
  )
)

set "ADB="
if defined TABATABA_ADB (
  if exist "%TABATABA_ADB%\adb.exe" set "ADB=%TABATABA_ADB%\adb.exe"
  if not defined ADB if exist "%TABATABA_ADB%" set "ADB=%TABATABA_ADB%"
)
if not defined ADB if exist "adb-path.txt" (
  for /f "usebackq delims=" %%p in ("adb-path.txt") do if not defined ADB (
    if exist "%%~p\adb.exe" (
      set "ADB=%%~p\adb.exe"
    ) else if exist "%%~p" (
      set "ADB=%%~p"
    )
  )
)
for /f "delims=" %%i in ('where adb 2^>nul') do if not defined ADB set "ADB=%%i"
if not defined ADB if exist "%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe" set "ADB=%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe"
if not defined ADB if exist "%USERPROFILE%\AppData\Local\Android\Sdk\platform-tools\adb.exe" set "ADB=%USERPROFILE%\AppData\Local\Android\Sdk\platform-tools\adb.exe"
if not defined ADB if exist "%ProgramFiles%\Android\platform-tools\adb.exe" set "ADB=%ProgramFiles%\Android\platform-tools\adb.exe"
if not defined ADB if exist "%ProgramFiles%\Android\Android Studio\jbr\bin\adb.exe" set "ADB=%ProgramFiles%\Android\Android Studio\jbr\bin\adb.exe"
if not defined ADB if exist "E:\platform-tools-latest-windows\platform-tools\adb.exe" set "ADB=E:\platform-tools-latest-windows\platform-tools\adb.exe"

if not defined ADB (
  echo.
  echo adb не найден.
  echo Создайте adb-path.txt с папкой platform-tools или полным путем к adb.exe,
  echo либо задайте переменную TABATABA_ADB, либо добавьте adb в PATH.
  echo Например: E:\platform-tools-latest-windows\platform-tools
  echo.
  pause
  exit /b 1
)

echo.
echo Собираю production-версию...
call npm run build
if errorlevel 1 (
  echo.
  echo Сборка завершилась с ошибкой.
  pause
  exit /b 1
)

echo.
echo Проверяю телефон через adb...
call "%ADB%" devices
call "%ADB%" reverse tcp:4173 tcp:4173
if errorlevel 1 (
  echo.
  echo Не удалось включить adb reverse.
  echo Проверьте, что телефон подключён, разблокирован и разрешил отладку по USB.
  echo Если в списке выше "unauthorized", подтвердите окно на телефоне.
  echo.
  pause
  exit /b 1
)

echo.
echo На телефоне откройте: http://localhost:4173/
echo Если страница не открылась, проверьте: adb reverse --list
echo.
start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://localhost:4173'"
call npm run preview:adb
if errorlevel 1 (
  echo.
  echo Сервер завершился с ошибкой.
  echo Если порт 4173 занят, закройте другой экземпляр.
  pause
)
