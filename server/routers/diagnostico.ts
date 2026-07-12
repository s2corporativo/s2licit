import { count } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  certidoes,
  emailQuotations,
  funilOportunidades,
  products,
  suppliers,
  taxRules,
} from "../../drizzle/schema";
import { isImapConfigured } from "../services/emailInboxService";
import { isSmtpConfigured } from "../services/emailSenderService";
import { isWhatsappConfigured } from "../services/whatsappService";
import { listConfiguredProviders } from "../_core/llm";

/**
 * Central de Diagnóstico ("central eletrônica"): roda verificações reais e
 * READ-ONLY sobre o sistema — banco, integrações, dados, segurança e
 * agendador — e devolve o estado de cada uma com o que fazer quando há
 * problema. Nada aqui altera dados; é um painel de saúde.
 */

export type StatusCheck = "ok" | "atencao" | "erro";

export interface ItemDiagnostico {
  categoria: string;
  item: string;
  status: StatusCheck;
  detalhe: string;
  acao?: string; // o que o operador deve fazer
}

async function contar(db: any, tabela: any): Promise<number> {
  try {
    const [r] = await db.select({ n: count() }).from(tabela);
    return Number(r?.n ?? 0);
  } catch {
    return -1;
  }
}

export const diagnosticoRouter = router({
  verificar: protectedProcedure.query(async () => {
    const itens: ItemDiagnostico[] = [];
    const db = await getDb();

    // ── Banco de dados ────────────────────────────────────────────────────
    if (!db) {
      itens.push({
        categoria: "Banco de Dados",
        item: "Conexão",
        status: "erro",
        detalhe: "Não foi possível conectar ao banco de dados.",
        acao: "Verifique a variável DATABASE_URL e se o container do MySQL está no ar.",
      });
      // Sem banco, o resto não roda — devolve o que temos
      return { itens, resumo: resumir(itens) };
    }
    itens.push({
      categoria: "Banco de Dados",
      item: "Conexão",
      status: "ok",
      detalhe: "Conectado e respondendo.",
    });

    // ── Dados & Conteúdo ──────────────────────────────────────────────────
    const nProdutos = await contar(db, products);
    itens.push({
      categoria: "Dados & Conteúdo",
      item: "Catálogo de produtos",
      status: nProdutos > 0 ? "ok" : "atencao",
      detalhe: nProdutos > 0 ? `${nProdutos} produtos cadastrados.` : "Nenhum produto no catálogo.",
      acao: nProdutos > 0 ? undefined : "Importe seu catálogo em Importar Planilha (menu IA & Sistema).",
    });

    const nFornecedores = await contar(db, suppliers);
    itens.push({
      categoria: "Dados & Conteúdo",
      item: "Fornecedores",
      status: nFornecedores > 0 ? "ok" : "atencao",
      detalhe: nFornecedores > 0 ? `${nFornecedores} fornecedores cadastrados.` : "Nenhum fornecedor cadastrado.",
      acao: nFornecedores > 0 ? undefined : "Cadastre fornecedores em Fornecedores & Captura → Fornecedores.",
    });

    const nRegrasTributarias = await contar(db, taxRules);
    itens.push({
      categoria: "Dados & Conteúdo",
      item: "Regras tributárias",
      status: nRegrasTributarias > 0 ? "ok" : "atencao",
      detalhe: nRegrasTributarias > 0 ? `${nRegrasTributarias} regras cadastradas.` : "Nenhuma regra tributária.",
      acao: nRegrasTributarias > 0 ? undefined : "Cadastre a alíquota do Simples e o DIFAL em Preços → Motor Tributário — sem elas o preço-piso não desconta imposto.",
    });

    // Certidões vencidas (risco de perder habilitação)
    try {
      const certs = await db.select().from(certidoes);
      const hoje = new Date();
      const ativas = certs.filter((c: any) => c.ativa);
      const vencidas = ativas.filter((c: any) => c.dataValidade && new Date(c.dataValidade) < hoje);
      itens.push({
        categoria: "Dados & Conteúdo",
        item: "Certidões",
        status: vencidas.length > 0 ? "erro" : ativas.length > 0 ? "ok" : "atencao",
        detalhe:
          vencidas.length > 0
            ? `${vencidas.length} certidão(ões) VENCIDA(S) de ${ativas.length} ativas.`
            : ativas.length > 0
              ? `${ativas.length} certidões ativas, todas válidas.`
              : "Nenhuma certidão cadastrada.",
        acao:
          vencidas.length > 0
            ? "Renove as certidões vencidas em Habilitação → Certidões (perder habilitação por certidão vencida é o erro mais caro)."
            : ativas.length > 0
              ? undefined
              : "Cadastre suas certidões em Habilitação → Certidões para receber alertas de vencimento.",
      });
    } catch {
      /* ignora */
    }

    // ── Integrações ───────────────────────────────────────────────────────
    const provedores = listConfiguredProviders();
    itens.push({
      categoria: "Integrações",
      item: "Inteligência Artificial",
      status: provedores.length > 0 ? "ok" : "atencao",
      detalhe:
        provedores.length > 0
          ? `Ativa: ${provedores.map((p) => p.kind).join(", ")}.`
          : "Nenhum provedor de IA configurado.",
      acao: provedores.length > 0 ? undefined : "Cadastre o secret GROQ_API_KEY (chave gratuita) ou ANTHROPIC_API_KEY.",
    });

    const imap = isImapConfigured();
    itens.push({
      categoria: "Integrações",
      item: "Recebimento de cotações (e-mail)",
      status: imap ? "ok" : "atencao",
      detalhe: imap ? "IMAP configurado — cotações entram sozinhas." : "IMAP não configurado.",
      acao: imap ? undefined : "Configure IMAP_* (senha de app do Gmail) para as cotações entrarem automaticamente.",
    });

    const smtp = isSmtpConfigured();
    itens.push({
      categoria: "Integrações",
      item: "Envio de respostas (e-mail)",
      status: smtp ? "ok" : "atencao",
      detalhe: smtp ? "SMTP configurado — respostas saem com PDF anexo." : "SMTP não configurado.",
      acao: smtp ? undefined : "Configure SMTP_* para responder cotações por e-mail com o orçamento em PDF.",
    });

    itens.push({
      categoria: "Integrações",
      item: "Alertas por WhatsApp",
      status: isWhatsappConfigured() ? "ok" : "atencao",
      detalhe: isWhatsappConfigured() ? "WhatsApp configurado." : "WhatsApp não configurado (opcional).",
      acao: isWhatsappConfigured() ? undefined : "Opcional: configure WHATSAPP_* para receber os alertas diários no celular.",
    });

    // ── Segurança ─────────────────────────────────────────────────────────
    const temEnc = Boolean(process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_KEY.length >= 16);
    const temJwt = Boolean(process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 16);
    itens.push({
      categoria: "Segurança",
      item: "Chave de criptografia",
      status: temEnc ? "ok" : temJwt ? "atencao" : "erro",
      detalhe: temEnc
        ? "ENCRYPTION_KEY definida — credenciais de portais protegidas."
        : temJwt
          ? "Usando JWT_SECRET como fallback (funciona, mas defina ENCRYPTION_KEY)."
          : "Nenhuma chave de criptografia definida.",
      acao: temEnc ? undefined : "Defina ENCRYPTION_KEY (openssl rand -base64 48) para proteger as senhas dos portais.",
    });
    itens.push({
      categoria: "Segurança",
      item: "Segredo de sessão (JWT)",
      status: temJwt ? "ok" : "erro",
      detalhe: temJwt ? "JWT_SECRET definido." : "JWT_SECRET ausente — sessões expiram a cada reinício.",
      acao: temJwt ? undefined : "Defina JWT_SECRET no .env da VPS.",
    });

    // ── Agendador ─────────────────────────────────────────────────────────
    const emailSyncOn = imap && process.env.EMAIL_SYNC_ENABLED !== "false";
    itens.push({
      categoria: "Agendador",
      item: "Sincronização de cotações",
      status: emailSyncOn ? "ok" : "atencao",
      detalhe: emailSyncOn
        ? "Rodando a cada 15 min."
        : imap
          ? "Desativada (EMAIL_SYNC_ENABLED=false)."
          : "Depende do IMAP, que não está configurado.",
    });
    const alertsOn = process.env.ALERTS_ENABLED !== "false";
    itens.push({
      categoria: "Agendador",
      item: "Alertas diários",
      status: alertsOn ? "ok" : "atencao",
      detalhe: alertsOn ? "Alertas de certidões e prazos ativos (8h)." : "Desativados (ALERTS_ENABLED=false).",
    });

    // ── Operação (pendências) ─────────────────────────────────────────────
    try {
      const cots = await db.select().from(emailQuotations);
      const pendentes = cots.filter((q: any) => q.status !== "respondida" && q.status !== "descartada");
      const vencidas = pendentes.filter(
        (q: any) => q.prazoResposta && new Date(q.prazoResposta) < new Date(),
      );
      if (cots.length > 0) {
        itens.push({
          categoria: "Operação",
          item: "Cotações a responder",
          status: vencidas.length > 0 ? "erro" : pendentes.length > 0 ? "atencao" : "ok",
          detalhe:
            vencidas.length > 0
              ? `${vencidas.length} com prazo VENCIDO sem resposta.`
              : `${pendentes.length} pendentes de resposta.`,
          acao: pendentes.length > 0 ? "Veja em Oportunidades → Cotações Recebidas." : undefined,
        });
      }
    } catch {
      /* ignora */
    }

    void funilOportunidades; // reservado para métricas futuras do funil

    return { itens, resumo: resumir(itens) };
  }),
});

function resumir(itens: ItemDiagnostico[]) {
  return {
    total: itens.length,
    ok: itens.filter((i) => i.status === "ok").length,
    atencao: itens.filter((i) => i.status === "atencao").length,
    erro: itens.filter((i) => i.status === "erro").length,
  };
}
