@echo off
setlocal
cd /d "%~dp0"
call npm.cmd ci --ignore-scripts --no-audit --no-fund
if errorlevel 1 goto failed
call npx --yes wrangler@4 deploy
if errorlevel 1 goto failed
echo Updated. The existing API token and device registrations stay on Cloudflare.
pause
exit /b 0
:failed
echo Update did not finish. If you are not signed in, run: npx wrangler@4 login
pause
exit /b 1
