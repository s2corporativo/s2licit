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
echo  O sistema vai abrir no seu navegador
echo  assim que terminar de carregar.
echo  NAO feche esta tela enquanto usar!
echo.
echo =============================================
echo.

REM Remove o registro de porta da execucao anterior (o servidor grava o novo)
del ".port" >nul 2>nul

REM Abre o navegador na porta REAL assim que o servidor subir
start /b "" "%~dp0scripts\abrir-navegador.bat"

REM Inicia o servidor
call pnpm dev || call npx tsx server/_core/index.ts

pause
