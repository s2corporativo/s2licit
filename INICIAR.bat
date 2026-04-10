@echo off
chcp 65001 >/dev/null
title Sistema S2 - Rodando...
color 0B

echo.
echo =============================================
echo    SISTEMA S2 - ABRINDO O SISTEMA...
echo =============================================
echo.
echo  Aguarde alguns segundos...
echo.
echo  O sistema vai abrir no seu navegador.
echo  NAO feche esta tela enquanto usar!
echo.
echo =============================================
echo.

REM Abre navegador com login automatico apos 5 segundos
start /b cmd /c "timeout /t 5 /nobreak >/dev/null && start http://localhost:5000/api/local-login"

REM Inicia o servidor
call pnpm dev 2>/dev/null || call npx tsx server/_core/index.ts

pause
