@echo off
chcp 65001 >nul
cd /d "%~dp0"
title TabaTaba — запуск

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
echo Запускаю TabaTaba: http://localhost:5173/
echo Песни этого режима хранятся отдельно от PWA-режима на порту 4173.
echo.
call npm run dev:open
if errorlevel 1 (
  echo.
  echo Сервер завершился с ошибкой. Проверьте, что порт 5173 свободен.
  pause
)
