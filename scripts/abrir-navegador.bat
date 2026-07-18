@echo off
REM Espera o servidor do S2 subir (ele grava a porta real no arquivo .port)
REM e abre o navegador no endereco certo. Chamado pelo INICIAR.bat.
setlocal enabledelayedexpansion
set TENTATIVAS=0

:aguardar
if exist "%~dp0..\.port" goto abrir
set /a TENTATIVAS+=1
if !TENTATIVAS! geq 90 goto desistir
timeout /t 1 /nobreak >nul
goto aguardar

:abrir
set /p PORTA=<"%~dp0..\.port"
if "!PORTA!"=="" set PORTA=3000
start http://localhost:!PORTA!/login
exit /b 0

:desistir
REM Servidor nao subiu em 90s — abre a porta padrao como ultima tentativa
start http://localhost:3000/login
exit /b 0
