@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ========================================
echo       LEVEL UP CAMP OS
echo ========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js не установлен.
  echo Установите Node.js 22 или 24 LTS с сайта nodejs.org
  pause
  exit /b 1
)

if not exist .env copy .env.example .env >nul

if not exist node_modules (
  echo Устанавливаю зависимости...
  call npm install
  if errorlevel 1 goto error
)

echo Собираю приложение...
call npm run build
if errorlevel 1 goto error

echo.
echo Открывайте: http://localhost:3001
echo Не закрывайте это окно, пока используете CRM.
echo.
start "" http://localhost:3001
call npm run start
goto end

:error
echo.
echo Не удалось запустить приложение. Скопируйте текст ошибки и отправьте разработчику.
pause

:end
