# Radar dos seis portais do S2 Licit

## Escopo operacional

O S2 Licit trabalha, nesta fase, exclusivamente com os seguintes conectores:

1. COPASA;
2. CEMIG;
3. Fundep;
4. Funarbe;
5. Compras MG;
6. FIEMG / SESI / SENAI.

Outros conectores existentes no código legado não são exibidos na operação atual. A inclusão futura de um portal deverá ser feita conscientemente no registro `S2_TARGET_PORTALS`.

## Fluxo único

```text
Portal público ou endereço configurado
→ captura da oportunidade
→ identificação do processo e do objeto
→ criação da cotação no S2
→ cruzamento com o catálogo Tambasa
→ confirmação humana do produto
→ geração da proposta
→ pré-preenchimento assistido no portal
→ confirmação humana
→ envio e evidências
```

## Descoberta pública e acesso autenticado

A captura automática usa somente páginas e dados disponibilizados publicamente. Quando um portal exigir autenticação, convite, CAPTCHA, 2FA ou outra autorização, o S2 não tenta contornar a proteção.

- **Fundep:** utiliza a listagem pública de grupos e lotes já integrada.
- **Funarbe:** utiliza HTML público com fallback de navegador renderizado.
- **Compras MG:** utiliza a área pública ou o endereço configurado para oportunidades.
- **FIEMG / SESI / SENAI:** utiliza o mural público do Sistema FIEMG.
- **CEMIG:** utiliza a pesquisa pública de processos.
- **COPASA:** tenta a fonte pública configurada; processos restritos ou por convite permanecem no fluxo autenticado assistido.

## Variáveis de ambiente

```env
PORTAL_OPPORTUNITY_SYNC_ENABLED=true
PORTAL_OPPORTUNITY_SYNC_CRON="0 7,12,17 * * *"

# Substituições opcionais caso o endereço público seja alterado
COPASA_OPPORTUNITIES_URL=""
CEMIG_OPPORTUNITIES_URL=""
COMPRASMG_OPPORTUNITIES_URL=""
FIEMG_OPPORTUNITIES_URL=""
```

O horário padrão é o de São Paulo. O cron padrão executa às 7h, 12h e 17h.

## Catálogo Tambasa

O matching considera somente produtos ativos associados ao fornecedor Tambasa. Um item encontrado nunca é considerado automaticamente confirmado:

- `matchConfirmado` permanece falso;
- o operador deve validar produto, apresentação, unidade e embalagem;
- preço e estoque devem ser revalidados antes da proposta;
- o envio final permanece dependente de aprovação humana.

## Deduplicação

Cada oportunidade utiliza uma chave no formato:

```text
portal:<fonte>:<identificador externo>
```

Quando o portal não fornece identificador claro, o S2 gera uma identificação estável a partir da fonte, URL e conteúdo público. Uma oportunidade já registrada é ignorada na nova captura.

## Credenciais

As credenciais continuam no cofre criptografado existente. O sistema nunca deve registrar senhas em logs, documentos, código-fonte ou mensagens de usuário.

O Agente de Propostas mostra somente os seis portais desta fase e interrompe o fluxo quando detectar CAPTCHA ou outro desafio que exija intervenção humana.

## Ativação em produção

Após o merge, a VPS deve:

1. atualizar o código da branch principal;
2. instalar dependências, quando necessário;
3. executar o typecheck e os testes;
4. gerar o build;
5. reiniciar o serviço;
6. executar uma busca manual de validação;
7. conferir logs e registros criados por portal.

O merge no GitHub, isoladamente, não comprova que o código já está ativo na VPS.
