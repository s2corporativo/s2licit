# Validação pós-refatoração — 16/08/2026

Este registro existe para disparar e documentar os gates automáticos após a refatoração operacional incorporada no PR #118.

Escopo validado pelo CI:

- lint do frontend/backend/shared;
- TypeScript (`tsc --noEmit`);
- suíte Vitest;
- build de produção.

O Dockerfile de produção também executa `pnpm check` antes do build da imagem, impedindo publicação de imagem quando houver erro de tipos.
