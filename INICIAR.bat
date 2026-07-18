@echo off
chcp 65001 >nul
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

REM Abre o navegador na tela de login apos 5 segundos
start /b cmd /c "timeout /t 5 /nobreak >nul && start http://localhost:3000/login"

REM Inicia o servidor
call pnpm dev || call npx tsx server/_core/index.ts

pause
