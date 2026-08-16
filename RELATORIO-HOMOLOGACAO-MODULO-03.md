# Homologação — Módulo 03: Autenticação e Segurança

**Sistema:** S2 Licít (s2corporativo/s2licit) · **Data:** 16/08/2026 · **Execução:** sandbox + produção (VPS Contabo) · **Status: HOMOLOGADO_COM_RESSALVA**

## Resultado Final Direto

O módulo de autenticação e segurança do S2 Licít foi integralmente verificado, com uma falha operacional crítica encontrada e corrigida durante a execução: a produção estava servindo uma versão desatualizada do código (commit `04654e6`, de 18/07), o que fazia o endpoint de login local (`POST /api/auth/login`) retornar **404** — ou seja, o recurso existia no código da main mas **não estava presente na produção**, por falha silenciosa do `git pull` na VPS (credencial GitHub expirada, erro engolido pelo script de bootstrap). O código validado da main foi reimposto, a imagem Docker reconstruída e o login foi testado com prova de execução real em produção.

## Verificações Executadas com Prova

| Verificação | Evidência de execução | Resultado |
|---|---|---|
| Login (corpo vazio) | `POST /api/auth/login {}` → 400 "Informe e-mail e senha." | Aprovado |
| Login (senha incorreta) | `POST /api/auth/login` → 401 "E-mail ou senha incorretos." | Aprovado |
| Login válido (produção) | Node lê `.env` sem expor senha; → 200 `success:true`, usuário admin, role admin, cookie emitido | Aprovado |
| Brute force (lockout) | Suíte `localAuth.lockout.test.ts`: bloqueio após 5 tentativas, janela de 15 min, contador zerado no sucesso | 19/19 testes aprovados |
| Rate limit | `authRateLimiter` 10 tentativas/min por IP + `apiRateLimiter` 600/min, com header `Retry-After` | Aprovado (código + testes) |
| JWT/sessão | Cookie httpOnly, TTL de 7 dias (`SESSION_TTL_MS`), assinatura via SDK central | Aprovado |
| Revogação | Logout incrementa `sessionVersion` — tokens antigos morrem imediatamente, em vez de sobreviverem os 7 dias | Aprovado |
| MFA (TOTP) | `mfaRouter` (status/setup/enable/disable), segredo cifrado no banco, código MFA exigido antes da sessão, falha de MFA conta para o lockout | Aprovado |
| Não-revelação de contas | Mensagem única para e-mail inexistente e senha errada | Aprovado |
| Contas desativadas | Bloqueio de login mesmo com senha correta, com auditoria | Aprovado |
| Roles | Hierarquia `user < viewer < editor < admin` aplicada no backend (`requireRole` em `index.ts`, protegido por `authenticatedProcedure` no tRPC) e espelhada no frontend (`RequireAuth`, `hasMinimumRole`) | Aprovado |
| Trilha de auditoria | `login_sucesso`, `login_falha`, `login_bloqueado` registrados com origem da requisição | Aprovado |
| Gates de qualidade | `tsc` exit 0, `lint` exit 0, suítes de auth/sessão/RBAC 19/19 | Aprovado |

## Causa Raiz da Falha Encontrada

A instabilidade de autenticação relatada ("não está funcionando") era causada por **produção defasada**: o repositório local da VPS permanecia no commit `04654e6` porque a credencial Git expirou e o script de bootstrap silenciosa o erro do `pull`; consequentemente, os deploys subsequentes rebuildavam a imagem a partir do código antigo, que não registra a rota de login local no servidor Express.

## Correção Realizada

Reposição do código validado da main (`8c56b3c`) sobre `/opt/s2licit` via tarball autenticado (preservando `.env` e backups), rebuild da imagem Docker, reinicialização do container e validação em produção nos três cenários (corpo vazio, senha errada, login válido).

## Ressalvas Registradas

A porta 3000 exposta pelo compose é um remanescente legado que responde com comportamento antigo (404); o acesso público correto é pela porta 8088, que está validada. O lockout não foi testado fisicamente em produção para não bloquear a conta real do administrador por 15 minutos — a prova está na suíte de testes (19/19). O rate limiter é em memória: adequado para instância única, mas exigiria Redis em cenário de réplicas múltiplas (limitação já documentada no código).

## Próximo Passo (Módulo 04 — RBAC e Perfis Públicos)

Testar acesso a editais, propostas, contratos, documentos restritos e fases de licitação por perfil (órgão público, fornecedor, pregoeiro, jurídico interno, auditor, administrador).
