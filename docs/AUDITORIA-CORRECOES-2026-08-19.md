# S2 Licit — saneamento da auditoria 2026-08-19

Este branch consolida as correções dos achados 3–15 e 19–31 da auditoria técnica.

## Objetivos inegociáveis

- formação de preço deve considerar custo, frete, tributos estimados e margem;
- auto-match não pode depender apenas de similaridade nominal/vetorial em itens técnicos;
- preço histórico sem data não pode ser tratado como fresco para automação;
- RAG não pode declarar auto-match sem validação determinística dos atributos técnicos;
- migrações aplicadas são imutáveis; drift deve falhar em produção;
- operações de saneamento são administrativas;
- scraping só atualiza custo após validações de plausibilidade;
- deploy de produção depende de validação integral e usa SSH por chave, sem root/senha;
- smoke test de produção volta a ser agendado;
- auditoria produzida pelo cliente é separada logicamente de eventos de servidor;
- backup precisa admitir cópia externa;
- segurança de dependências/SAST passa a ser versionada;
- readiness não expõe erro interno;
- documentação de cookies deve refletir o comportamento real;
- relatório automático por e-mail é removido na origem, mantendo SMTP apenas para propostas/respostas.
