# Readiness

Endpoints públicos de saúde não devem devolver stack trace, mensagem SQL, host, credenciais ou detalhe de exceção. Em falha, a resposta externa é genérica (`status=not_ready`, `database=error`); o detalhe completo fica somente no logger/observabilidade autenticada.
