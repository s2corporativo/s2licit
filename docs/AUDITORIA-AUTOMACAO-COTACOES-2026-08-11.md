# Auditoria operacional — automação de cotações e propostas

Data: 11/08/2026

## Conclusão executiva

O módulo já possui a maior parte da arquitetura necessária para o fluxo automático **captura → matching → precificação → proposta → revisão/envio**. O trabalho restante é predominantemente de **homologação operacional em produção**, não de criação de um novo módulo paralelo.

A recomendação é manter a geração automática de propostas ativa e o protocolo/envio final supervisionado até que os conectores autenticados tenham histórico real suficiente.

## O que já está implementado

### E-mail

- leitura automática por IMAP;
- sincronização agendada a cada 15 minutos por padrão;
- extração de cotações do corpo e anexos processáveis;
- matching de itens com catálogo;
- confirmação automática de match determinístico ou de alta confiança;
- bloqueio quando há item sem match, sem preço positivo ou com preço consultado vencido;
- geração automática de PDF;
- envio por e-mail disponível por opt-in explícito;
- auditoria das confirmações automáticas e medição de taxa de acerto.

### Portais

Escopo operacional vigente:

1. COPASA;
2. CEMIG;
3. Fundep;
4. Funarbe;
5. Compras MG;
6. FIEMG / SESI / SENAI.

Já existem:

- radar público;
- fallback com navegador renderizado;
- descoberta autenticada com credenciais do cofre;
- criptografia de senha e cookies de sessão;
- reutilização de sessão;
- bloqueio após falhas consecutivas confirmadas de credencial;
- tratamento de CAPTCHA sem tentativa de bypass;
- teste de fumaça de login no backend;
- handoff da cotação para o Agente de Propostas;
- preenchimento assistido no portal, mantendo confirmação final humana.

### Automação ponta a ponta

O pipeline automático já executa:

1. recebe/importa a cotação;
2. extrai os itens;
3. faz matching;
4. confirma automaticamente apenas os matches permitidos;
5. verifica preço e frescor;
6. aplica margem comercial;
7. gera a proposta em PDF;
8. registra a oportunidade no funil;
9. deixa a proposta pronta para revisão/envio.

## Pontos críticos encontrados

### P0 — Smoke real dos portais ainda não comprovado

O código está implementado, porém os seletores reais de login/navegação ainda precisam ser confirmados em produção com credenciais válidas, principalmente nos portais cujo layout pode mudar.

Critério de aceite por portal:

- login confirmado;
- sessão autenticada confirmada;
- página de oportunidades encontrada;
- pelo menos uma oportunidade real ou página vazia legítima identificada sem falso positivo;
- itens e prazo extraídos corretamente;
- nenhuma ação de envio executada durante o teste.

### P0 — Descoberta autenticada precisa validar a página realmente privada

Hoje o serviço autentica e, depois, coleta uma URL definida para o radar. Em alguns portais essa URL pode continuar sendo um mural público, ainda que a sessão esteja autenticada.

Na homologação, é obrigatório confirmar que o HTML processado corresponde efetivamente à área de oportunidades do fornecedor. Se não corresponder, cadastrar uma rota autenticada específica por portal ou adaptar a navegação pós-login.

Não considerar um portal “homologado” apenas porque o login retornou sucesso.

### P0 — Configuração real de e-mail

Confirmar no ambiente de produção:

- IMAP ativo e autenticando;
- SMTP ativo, caso o envio por e-mail seja utilizado;
- caixa correta;
- remetente correto;
- limites de anexo;
- deduplicação por Message-ID;
- primeira cotação real capturada sem intervenção.

### P1 — PDF digitalizado sem camada de texto

A extração de imagem já possui OCR, mas PDF exclusivamente rasterizado deve ser testado separadamente. Se o parser não obtiver texto útil, o fluxo deve rasterizar as páginas necessárias e aplicar OCR antes da extração de itens.

### P1 — Diagnóstico manual de acesso

Foi adicionada nesta branch uma procedure administrativa `portalCredentials.testarAcesso` que reutiliza `checkPortalLoginHealth` e permite testar o login do portal sem coletar oportunidades, preencher campos de proposta ou enviar dados.

Também foi fixado no router do cofre o escopo explícito dos seis portais operacionais, evitando que tipos legados do agente sejam oferecidos no cadastro.

A ligação dessa procedure a um botão de diagnóstico na interface deve ser feita em alteração visual separada se o arquivo da tela do cofre não puder ser modificado no ambiente atual.

## Plano de homologação recomendado

### Fase 1 — E-mail

1. confirmar status IMAP;
2. enviar uma cotação controlada para a caixa real;
3. verificar captura automática;
4. conferir itens extraídos;
5. validar matching;
6. conferir preço e margem;
7. confirmar PDF gerado;
8. manter envio automático desligado no primeiro ciclo.

### Fase 2 — Portais, um por vez

Ordem sugerida:

1. Funarbe;
2. FIEMG;
3. Compras MG;
4. Fundep;
5. CEMIG;
6. COPASA.

Para cada portal:

1. cadastrar/confirmar a credencial no cofre;
2. executar teste de login;
3. validar CAPTCHA/MFA quando houver;
4. confirmar a rota autenticada de oportunidades;
5. executar captura limitada;
6. conferir uma oportunidade manualmente no portal;
7. comparar itens, quantidade e prazo com o que o sistema importou;
8. testar geração da proposta;
9. testar apenas o pré-preenchimento;
10. não confirmar envio/protocolo durante a homologação.

### Fase 3 — Autonomia controlada

Somente após os testes reais:

- manter auto-match com limiar conservador;
- manter bloqueio por preço vencido;
- manter envio final humano para portais;
- medir correções humanas do matching;
- liberar automações adicionais somente para fluxos com baixa taxa de exceção.

## Critério para considerar o módulo operacional

O módulo poderá ser classificado como homologado quando houver evidência real de que:

- e-mail captura cotação automaticamente;
- pelo menos uma cotação percorre todo o pipeline até PDF;
- os seis portais possuem login testado ou impedimento documentado;
- a descoberta autenticada lê a área correta;
- não há falso envio/protocolo;
- CAPTCHA/MFA interrompem o robô corretamente;
- preços vencidos e matches incertos bloqueiam a proposta;
- cada evento relevante permanece auditável.
