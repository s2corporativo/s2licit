@echo off
chcp 65001 >nul
title Sistema S2 - Instalacao
color 0A

echo.
echo =============================================
echo    SISTEMA S2 - INSTALACAO AUTOMATICA
echo =============================================
echo.

REM Verificar se Node.js esta instalado
node --version >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
    color 0C
    echo.
    echo  [ERRO] Node.js nao esta instalado!
    echo.
    echo  Faca isso:
    echo  1. Abra o Chrome ou Edge
    echo  2. Acesse: https://nodejs.org
    echo  3. Clique no botao verde "LTS"
    echo  4. Instale o arquivo baixado
    echo  5. REINICIE o computador
    echo  6. Clique duas vezes em INSTALAR.bat novamente
    echo.
    pause
    exit /b 1
)

echo  Node.js OK:
node --version
echo.

REM Instalar pnpm via npm
echo  Instalando gerenciador de pacotes (pnpm)...
call npm install -g pnpm --quiet
echo  OK!
echo.

REM Instalar dependencias do sistema
echo  Instalando dependencias do sistema...
echo  (Aguarde, pode demorar 3-5 minutos)
echo.
call pnpm install --ignore-scripts

IF %ERRORLEVEL% NEQ 0 (
    echo.
    echo  Tentando com npm...
    call npm install --legacy-peer-deps
)

echo.
echo  Criando banco de dados...
call pnpm db:push 2>nul || call npx drizzle-kit migrate 2>nul
echo.

color 0A
echo =============================================
echo  PRONTO! Instalacao concluida com sucesso!
echo =============================================
echo.
echo  Agora clique duas vezes em: INICIAR.bat
echo.
pause
