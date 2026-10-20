@echo off
chcp 65001 >nul
cd /d "%~dp0"
title TabaTaba — PWA

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

echo.
echo Собираю production-версию и запускаю preview.
echo Адрес: http://localhost:4173/
echo Для установки и офлайна используйте Chrome или Edge.
echo Для телефона по USB через adb запустите start-adb.bat.
echo Песни этого режима хранятся отдельно от обычного запуска на порту 5173.
echo.
call npm run start:pwa
if errorlevel 1 (
  echo.
  echo Сборка или запуск завершились с ошибкой.
  echo Если порт 4173 занят, закройте другой экземпляр.
  pause
)
