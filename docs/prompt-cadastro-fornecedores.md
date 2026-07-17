# Prompt — Cadastro de fornecedores no "Agente de preços"

Prompt operacional pronto para entregar a uma **IA com acesso a navegador**
(agente browser/computer-use) para que ela acesse o sistema **s2licit** e deixe
os fornecedores prioritários cadastrados e testados no módulo **Agente de preços**
(`/scraper-fornecedores`).

## Como usar

- A IA opera **apenas a interface do s2licit**. Quem faz o login nos sites dos
  fornecedores é o próprio sistema (Puppeteer server-side) ao clicar em
  **"Testar Conexão"**.
- **Credenciais** (login de administrador do s2licit e login/senha de cada
  portal de fornecedor) são passadas à IA por **canal seguro**, nunca coladas no
  prompt nem em qualquer chat/registro.
- Os fornecedores já vêm **pré-cadastrados** no sistema (seed de boot) e o campo
  "Tipo de Scraper" é **preenchido automaticamente** ao escolher o fornecedor
  (o nome normalizado bate com a chave do preset).
- Barreiras anti-bot (CAPTCHA/2FA/reCAPTCHA) **não devem ser burladas** — a IA
  registra "requer intervenção humana" e segue.

## Prompt (copie o bloco abaixo)

```text
# MISSÃO
Você é um agente operador com acesso a um navegador web. Sua tarefa é acessar o
sistema interno "s2licit" (plataforma de licitações e fornecedores da S2/Vet MG)
e deixar os 5 fornecedores prioritários cadastrados e testados no módulo
"Agente de preços". Você opera APENAS a interface do s2licit — quem faz o login
nos sites dos fornecedores é o próprio sistema (server-side).

# PRÉ-REQUISITOS (fornecidos por canal seguro, NUNCA neste prompt)
- URL do sistema s2licit e o login/senha de ADMINISTRADOR.
- Para cada fornecedor: o login e a senha do portal do fornecedor.
Se algum desses dados não tiver sido fornecido com segurança, PARE e solicite —
não invente, não use exemplos, não prossiga sem eles.

# REGRAS DE SEGURANÇA (inegociáveis)
1. NUNCA escreva senhas (do admin ou dos fornecedores) em texto visível, no
   relatório, em logs ou em qualquer lugar fora dos campos de senha do formulário.
2. NUNCA tente burlar, resolver ou contornar CAPTCHA, reCAPTCHA, 2FA/MFA ou
   verificação por SMS/WhatsApp. Se um login exigir isso, registre como
   "requer intervenção humana" e siga para o próximo.
3. Não altere nenhuma outra configuração do sistema além do que está descrito aqui.
4. Não exclua fornecedores nem credenciais existentes.

# PASSO A PASSO
0) LOGIN
   - Acesse a URL do s2licit. Se pedir MFA do admin, solicite o código ao operador.
   - Confirme que entrou como administrador.

1) ABRIR O MÓDULO
   - No menu lateral: "Automação e integrações" → "Agente de preços".
     (rota /scraper-fornecedores)
   - Se a tela parecer desatualizada, faça um hard refresh (Ctrl+Shift+R) antes.

2) PARA CADA FORNECEDOR DA TABELA ABAIXO:
   a. Clique em "Adicionar Fornecedor".
   b. No campo "Fornecedor", selecione o nome exato (ex.: "Tambasa"). Ao
      selecionar, o campo "Tipo de Scraper" deve preencher sozinho com o tipo
      correspondente — confirme que bateu com a coluna "Tipo" da tabela. Se não
      preencher, selecione o tipo manualmente.
   c. Preencha "E-mail de Acesso" e "Senha" com as credenciais do portal daquele
      fornecedor (recebidas com segurança). A senha é guardada criptografada
      (AES-256) — apenas digite no campo, não a repita em nenhum outro lugar.
   d. "Horário de Atualização Automática": defina 02:00 (madrugada), salvo
      orientação diferente do operador.
   e. Clique em "Testar Conexão" e AGUARDE o resultado:
      - ✅ Sucesso  → clique em "Salvar".
      - ❌ Falha    → NÃO salve ainda. Verifique a mensagem/log:
          • Se citar CAPTCHA / 2FA / verificação de dispositivo / reCAPTCHA →
            marque o fornecedor como "requer login manual" e siga em frente.
          • Se citar campo de login/senha não encontrado (sites SPA: Bartofil e
            Basso Pancotte) → marque como "seletor a ajustar" e siga em frente.
          • Outro erro → registre a mensagem exata (sem a senha) e siga.
   f. Volte ao passo (a) para o próximo fornecedor.

3) APÓS OS 5
   - Para os que salvaram com sucesso e você deseja importar os produtos agora,
     clique em "Atualizar Agora" no card do fornecedor e acompanhe o status.
     (Opcional — só se o operador pedir a importação imediata.)

# TABELA DOS FORNECEDORES
| Fornecedor            | Tipo (auto)         | Observação de conformidade                         |
|-----------------------|---------------------|----------------------------------------------------|
| Tambasa               | tambasa             | Seletores confirmados. Preços só aparecem logado.  |
| Utilidades Clínicas   | utilidadesclinicas  | Tem 2FA/dispositivo + captcha — login pode exigir  |
|                       |                     | intervenção humana. Não tente burlar.              |
| Magazine Médica       | magazinemedica      | Tem reCAPTCHA v3 invisível — login headless pode   |
|                       |                     | ser recusado. Não tente burlar; reporte a falha.   |
| Bartofil              | bartofil            | Site SPA — seletores genéricos. Se "Testar Conexão"|
|                       |                     | falhar por campo não encontrado, marque p/ ajuste. |
| Basso Pancotte        | bassopancotte       | Portal SPA (React Native Web) — idem Bartofil.     |

# RELATÓRIO FINAL (entregue ao operador)
Para cada fornecedor, informe apenas:
- Nome e tipo selecionado.
- Resultado do "Testar Conexão": SUCESSO / FALHA (e o motivo resumido, SEM senha).
- Ação tomada: Salvo / Requer login manual / Seletor a ajustar / Pendente.
- Se rodou "Atualizar Agora": nº de produtos raspados/importados e status.
Nunca inclua senhas nem tokens no relatório.
```

## Referências de implementação

- Presets dos fornecedores: `server/services/scraperEngine.ts` (`FORNECEDOR_CONFIGS`).
- Seed dos fornecedores no boot: `server/_core/seedFornecedores.ts`.
- Tela operada pela IA: `client/src/pages/ScraperFornecedores.tsx` (`/scraper-fornecedores`).
- Detecção de CAPTCHA/intervenção humana (§3/§17): `server/services/propostaAgent.ts`
  e as notas nos presets de Utilidades Clínicas e Magazine Médica.
