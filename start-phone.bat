@echo off
chcp 65001 >nul
cd /d "%~dp0"
title TabaTaba — телефон по Wi-Fi

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

set "LAN_IP="
for /f "delims=" %%i in ('node scripts\lan-ip.mjs') do set "LAN_IP=%%i"

echo.
if defined LAN_IP (
  echo Телефон и ПК должны быть в одной Wi-Fi сети.
  echo На телефоне откройте: http://%LAN_IP%:5173/
) else (
  echo Не удалось определить LAN-IP. Смотрите строку Network: в логе Vite.
)
echo При первом запуске разрешите Node.js в брандмауэре Windows.
echo.
call npm run dev:lan
if errorlevel 1 (
  echo.
  echo Сервер завершился с ошибкой. Проверьте, что порт 5173 свободен.
  pause
)
