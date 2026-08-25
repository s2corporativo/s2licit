# Smoke de produção

O smoke autenticado roda diariamente em runner externo ao host de produção. Deve validar login, permissões, carregamento das rotas críticas e ciclo operacional principal. Falha abre/atualiza incidente no GitHub; recuperação encerra o incidente com evidência do run.
