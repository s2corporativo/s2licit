@echo off
chcp 65001 >nul
title Sistema S2 - Instalacao
color 0A

set "PNPM_VERSION=10.4.1"

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
    echo  3. Baixe e instale o Node.js 22 LTS
    echo  4. REINICIE o computador
    echo  5. Clique duas vezes em INSTALAR.bat novamente
    echo.
    pause
    exit /b 1
)

for /f "tokens=1 delims=." %%V in ('node -p "process.versions.node"') do set "NODE_MAJOR=%%V"
IF %NODE_MAJOR% LSS 22 (
    color 0C
    echo.
    echo  [ERRO] Node.js 22 ou superior e obrigatorio.
    echo  Versao encontrada:
    node --version
    echo.
    echo  Atualize pelo site https://nodejs.org e execute novamente.
    echo.
    pause
    exit /b 1
)

echo  Node.js OK:
node --version
echo.

REM Instalar exatamente a versao declarada em package.json
pnpm --version >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
    echo  Instalando pnpm %PNPM_VERSION%...
    call npm install -g pnpm@%PNPM_VERSION% --quiet
    IF %ERRORLEVEL% NEQ 0 (
        color 0C
        echo.
        echo  [ERRO] Nao foi possivel instalar o pnpm %PNPM_VERSION%.
        echo  Verifique a conexao e as permissoes do Windows.
        echo.
        pause
        exit /b 1
    )
)

for /f "delims=" %%V in ('pnpm --version') do set "PNPM_INSTALLED=%%V"
IF NOT "%PNPM_INSTALLED%"=="%PNPM_VERSION%" (
    echo  Ajustando pnpm para a versao %PNPM_VERSION%...
    call npm install -g pnpm@%PNPM_VERSION% --quiet
    IF %ERRORLEVEL% NEQ 0 (
        color 0C
        echo.
        echo  [ERRO] Nao foi possivel fixar o pnpm %PNPM_VERSION%.
        echo.
        pause
        exit /b 1
    )
)

echo  pnpm OK: %PNPM_VERSION%
echo.

echo  Instalando dependencias do sistema pelo lockfile...
echo  (Aguarde, pode demorar alguns minutos)
echo.
call pnpm install --frozen-lockfile --ignore-scripts
IF %ERRORLEVEL% NEQ 0 (
    color 0C
    echo.
    echo  [ERRO] A instalacao das dependencias falhou.
    echo  O sistema nao usara npm como alternativa, pois isso criaria
    echo  uma arvore diferente do lockfile oficial.
    echo.
    pause
    exit /b 1
)

REM O sistema precisa do banco MySQL configurado no arquivo .env
IF NOT EXIST ".env" (
    color 0E
    echo.
    echo  [ATENCAO] Falta o arquivo de configuracao ".env".
    echo.
    echo  O sistema precisa de um banco de dados MySQL para funcionar.
    echo  Peca ao responsavel tecnico para:
    echo  1. Instalar o MySQL 8 ou usar um banco compativel
    echo  2. Copiar o arquivo .env.example para .env
    echo  3. Preencher DATABASE_URL, JWT_SECRET e ENCRYPTION_KEY
    echo.
    echo  Depois disso, rode este INSTALAR.bat novamente.
    echo.
    pause
    exit /b 1
)

echo.
echo  Aplicando migracoes do banco de dados...
call pnpm db:push
IF %ERRORLEVEL% NEQ 0 (
    color 0C
    echo.
    echo  [ERRO] Nao foi possivel aplicar as migracoes.
    echo.
    echo  Causas mais comuns:
    echo  - O MySQL nao esta instalado ou nao esta rodando
    echo  - A DATABASE_URL do arquivo .env esta incorreta
    echo  - O usuario do banco nao possui permissao para migrar
    echo.
    echo  Peca ajuda ao responsavel tecnico e execute novamente.
    echo.
    pause
    exit /b 1
)

echo.
color 0A
echo =============================================
echo  PRONTO! Instalacao concluida com sucesso!
echo =============================================
echo.
echo  Agora clique duas vezes em: INICIAR.bat
echo.
pause
