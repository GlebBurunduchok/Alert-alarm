@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 22 LTS or newer from https://nodejs.org/ then run this file again.
  pause
  exit /b 1
)
echo Installing the Web Push dependency...
call npm.cmd ci --ignore-scripts --no-audit --no-fund
if errorlevel 1 goto failed
echo Step 1: Sign in to your Cloudflare account in the browser.
call npx --yes wrangler@4 login
if errorlevel 1 goto failed
echo Step 2: Deploy the website and API coordinator.
call npx --yes wrangler@4 deploy
if errorlevel 1 goto failed
echo Step 3: Paste your alerts.in.ua token into the secret prompt. Do not share it in chat.
call npx --yes wrangler@4 secret put ALERTS_TOKEN
if errorlevel 1 goto failed
echo Done. Open the workers.dev address shown above. Select your region and enable sound.
pause
exit /b 0
:failed
echo Setup did not finish. Keep the error text but do not share the API token.
pause
exit /b 1
