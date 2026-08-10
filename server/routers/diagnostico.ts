import cron from "node-cron";
import fs from "fs";
import path from "path";
import { count } from "drizzle-orm";
import { z } from "zod";
import { adminProcedure, editorProcedure, router } from "../_core/trpc";
import {
  isBackupFile,
  backupTimestamp,
  runDatabaseBackup,
  cleanupOldBackups,
} from "../services/backupService";
import { getDb } from "../db";
import {
  certidoes,
  emailQuotations,
  products,
  suppliers,
  taxRules,
} from "../../drizzle/schema";
import {
  configuredEnvironmentNames,
  getIntegrationStatuses,
  getRecentIntegrationFailures,
} from "../services/integrationStatusService";
import { analyzeIntegrationsWithAi } from "../services/integrationCopilotService";
import { resolveCredential, resolveCredentials } from "../integrations/core/credentialResolver";
import { logger } from "../_core/logger";

export type StatusCheck = "ok" | "atencao" | "erro";

export interface ItemDiagnostico {
  categoria: string;
  item: string;
  status: StatusCheck;
  detalhe: string;
  acao?: string;
  codigo?: string;
}

async function contar(db: any, tabela: any): Promise<number> {
  try {
    const [resultado] = await db.select({ n: count() }).from(tabela);
    return Number(resultado?.n ?? 0);
  } catch {
    return -1;
  }
}

function resumir(itens: ItemDiagnostico[]) {
  return {
    total: itens.length,
    ok: itens.filter((item) => item.status === "ok").length,
    atencao: itens.filter((item) => item.status === "atencao").length,
    erro: itens.filter((item) => item.status === "erro").length,
  };
}

function enabled(flag: string | undefined, defaultOn = true): boolean {
  if (flag == null || flag.trim() === "") return defaultOn;
  return flag !== "false" && flag !== "0";
}

function schedulerDiagnostic(input: {
  item: string;
  code: string;
  enabledValue: string | undefined;
  cronValue: string | undefined;
  defaultCron: string;
  dependencyConfigured?: boolean;
  dependencyMessage?: string;
}): ItemDiagnostico {
  const isEnabled = enabled(input.enabledValue);
  const expression = input.cronValue || input.defaultCron;
  if (!isEnabled) {
    return {
      categoria: "Automação",
      item: input.item,
      status: "atencao",
      detalhe: "Desativada por configuração runtime.",
      acao: "Ative a automação em Administração → Central de Integrações. Não é necessário redeploy.",
      codigo: input.code,
    };
  }
  if (!cron.validate(expression)) {
    return {
      categoria: "Automação",
      item: input.item,
      status: "erro",
      detalhe: `Expressão cron inválida: ${expression}.`,
      acao: "Corrija a agenda em Administração → Central de Integrações.",
      codigo: input.code,
    };
  }
  if (input.dependencyConfigured === false) {
    return {
      categoria: "Automação",
      item: input.item,
      status: "atencao",
      detalhe: input.dependencyMessage || "A automação está ligada, mas falta uma integração obrigatória.",
      acao: "Configure a dependência na Central de Integrações e teste novamente.",
      codigo: input.code,
    };
  }
  return {
    categoria: "Automação",
    item: input.item,
    status: "ok",
    detalhe: `Agendada por ${expression}; alterações podem ser aplicadas em runtime.`,
    codigo: input.code,
  };
}

function healthToDiagnosticStatus(state: string): StatusCheck {
  if (state === "HEALTHY" || state === "CONNECTED") return "ok";
  if (state === "DOWN" || state === "CONTRACT_DRIFT") return "erro";
  return "atencao";
}

function healthAction(state: string, code: string, configured: boolean): string | undefined {
  if (!configured) return "Configure esta integração em Administração → Central de Integrações.";
  if (state === "CONTRACT_DRIFT") return "Valide o contrato/layout atual da fonte e atualize o adapter antes de confiar nos resultados.";
  if (state === "DOWN") return "Abra a telemetria da fonte, valide a indisponibilidade externa e teste novamente após a correção.";
  if (state === "DEGRADED") return "Revise as falhas das últimas 24h; a cobertura pode estar parcial.";
  if (state === "CONFIGURED") return `Execute uma operação/teste de ${code} para confirmar saúde operacional.`;
  return undefined;
}

export const diagnosticoRouter = router({
  backupStatus: editorProcedure.query(() => {
    const destDir = process.env.BACKUP_DIR || "backups";
    let ultimo: { arquivo: string; em: string } | null = null;
    try {
      const files = fs.readdirSync(destDir).filter(isBackupFile);
      let best: { name: string; ts: number } | null = null;
      for (const name of files) {
        const ts = backupTimestamp(name);
        if (ts != null && (!best || ts > best.ts)) best = { name, ts };
      }
      if (best) ultimo = { arquivo: best.name, em: new Date(best.ts).toISOString() };
    } catch {
      // Nenhum backup ainda.
    }
    return { destDir, ultimo };
  }),

  backupAgora: adminProcedure.mutation(async () => {
    const destDir = process.env.BACKUP_DIR || "backups";
    const keepDays = Math.max(1, Number((await resolveCredential("BACKUP_KEEP_DAYS")) ?? 14) || 14);
    const result = await runDatabaseBackup({ destDir });
    if (result.success) {
      const removidos = cleanupOldBackups(destDir, keepDays, Date.now());
      return {
        ok: true as const,
        arquivo: path.basename(result.file ?? ""),
        removidosAntigos: removidos,
      };
    }
    return { ok: false as const, erro: result.error ?? "Falha desconhecida no backup." };
  }),

  /** Copiloto especializado, sempre fundamentado no snapshot operacional atual. */
  analisarIntegracoesIa: editorProcedure
    .input(z.object({ pergunta: z.string().max(1000).optional() }).optional())
    .mutation(async ({ input }) => analyzeIntegrationsWithAi(input?.pergunta)),

  verificar: editorProcedure.query(async () => {
    const itens: ItemDiagnostico[] = [];
    const db = await getDb();
    const [integrations, recentFailures, scheduler] = await Promise.all([
      getIntegrationStatuses(),
      getRecentIntegrationFailures(20),
      resolveCredentials([
        "EMAIL_SYNC_ENABLED",
        "EMAIL_SYNC_CRON",
        "ALERTS_ENABLED",
        "ALERTS_CRON",
        "SCRAPER_SCHEDULE_ENABLED",
        "SCRAPER_SCHEDULE_CRON",
        "PORTAL_OPPORTUNITY_SYNC_ENABLED",
        "PORTAL_OPPORTUNITY_SYNC_CRON",
        "BACKUP_ENABLED",
        "BACKUP_CRON",
      ]),
    ]);

    if (!db) {
      itens.push({
        categoria: "Banco de Dados",
        item: "Conexão MySQL",
        status: "erro",
        detalhe: "Não foi possível conectar ao banco de dados.",
        acao: "Confira o container de banco e a configuração DATABASE_URL da infraestrutura.",
        codigo: "database",
      });
      const configurados = configuredEnvironmentNames();
      return {
        itens,
        resumo: resumir(itens),
        integracoes: integrations,
        falhasRecentes: recentFailures,
        ambiente: {
          configurados,
          total: configurados.length,
          observacao: "Somente nomes de configurações de infraestrutura são exibidos; valores permanecem ocultos.",
        },
      };
    }

    itens.push({
      categoria: "Banco de Dados",
      item: "Conexão MySQL",
      status: "ok",
      detalhe: "Banco conectado e respondendo.",
      codigo: "database",
    });

    const [nProdutos, nFornecedores, nRegrasTributarias] = await Promise.all([
      contar(db, products),
      contar(db, suppliers),
      contar(db, taxRules),
    ]);
    itens.push({
      categoria: "Dados essenciais",
      item: "Catálogo de produtos",
      status: nProdutos > 0 ? "ok" : nProdutos === 0 ? "atencao" : "erro",
      detalhe: nProdutos > 0 ? `${nProdutos} produtos cadastrados.` : nProdutos === 0 ? "Nenhum produto no catálogo." : "Falha ao consultar o catálogo.",
      acao: nProdutos === 0 ? "Importe o catálogo em Catálogo → Importar planilha." : undefined,
      codigo: "products",
    });
    itens.push({
      categoria: "Dados essenciais",
      item: "Fornecedores",
      status: nFornecedores > 0 ? "ok" : nFornecedores === 0 ? "atencao" : "erro",
      detalhe: nFornecedores > 0 ? `${nFornecedores} fornecedores cadastrados.` : nFornecedores === 0 ? "Nenhum fornecedor cadastrado." : "Falha ao consultar fornecedores.",
      acao: nFornecedores === 0 ? "Cadastre fornecedores no módulo correspondente." : undefined,
      codigo: "suppliers",
    });
    itens.push({
      categoria: "Dados essenciais",
      item: "Regras tributárias",
      status: nRegrasTributarias > 0 ? "ok" : nRegrasTributarias === 0 ? "atencao" : "erro",
      detalhe: nRegrasTributarias > 0 ? `${nRegrasTributarias} regras cadastradas.` : nRegrasTributarias === 0 ? "Nenhuma regra tributária cadastrada." : "Falha ao consultar regras tributárias.",
      acao: nRegrasTributarias === 0 ? "Cadastre as incidências antes de calcular preços mínimos." : undefined,
      codigo: "taxes",
    });

    try {
      const registros = await db.select().from(certidoes);
      const now = new Date();
      const ativas = registros.filter((registro: any) => registro.ativa);
      const vencidas = ativas.filter((registro: any) => registro.dataValidade && new Date(registro.dataValidade) < now);
      itens.push({
        categoria: "Dados essenciais",
        item: "Certidões de habilitação",
        status: vencidas.length > 0 ? "erro" : ativas.length > 0 ? "ok" : "atencao",
        detalhe: vencidas.length > 0
          ? `${vencidas.length} certidão(ões) vencida(s) entre ${ativas.length} ativas.`
          : ativas.length > 0
            ? `${ativas.length} certidões ativas e válidas.`
            : "Nenhuma certidão cadastrada.",
        acao: vencidas.length > 0 ? "Renove as certidões vencidas antes de novas disputas." : undefined,
        codigo: "certificates",
      });
    } catch (error) {
      logger.error("[Diagnóstico] Falha ao consultar certidões:", error);
      itens.push({ categoria: "Dados essenciais", item: "Certidões de habilitação", status: "erro", detalhe: "Falha ao consultar certidões.", codigo: "certificates" });
    }

    for (const integration of integrations) {
      itens.push({
        categoria: "Integrações",
        item: integration.label,
        status: healthToDiagnosticStatus(integration.state),
        detalhe: `${integration.state}: ${integration.detail}${integration.errors24h ? ` Erros 24h: ${integration.errors24h}.` : ""}`,
        acao: healthAction(integration.state, integration.code, integration.configured),
        codigo: integration.code,
      });
    }

    const encryptionKeyOk = Boolean(process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_KEY.length >= 32);
    const jwtOk = Boolean(process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32);
    itens.push({
      categoria: "Segurança",
      item: "Criptografia de credenciais",
      status: encryptionKeyOk ? "ok" : "erro",
      detalhe: encryptionKeyOk ? "ENCRYPTION_KEY válida; credenciais persistidas permanecem protegidas." : "ENCRYPTION_KEY ausente ou curta.",
      acao: encryptionKeyOk ? undefined : "Restaure a chave original da infraestrutura; não gere outra se já houver credenciais salvas.",
      codigo: "encryption",
    });
    itens.push({
      categoria: "Segurança",
      item: "Sessões e autenticação",
      status: jwtOk ? "ok" : "erro",
      detalhe: jwtOk ? "JWT_SECRET válida." : "JWT_SECRET ausente ou curta.",
      acao: jwtOk ? undefined : "Corrija o secret de infraestrutura no servidor.",
      codigo: "jwt",
    });

    const integrationByCode = new Map(integrations.map((integration) => [integration.code, integration]));
    itens.push(
      schedulerDiagnostic({
        item: "Sincronização de e-mails",
        code: "email-scheduler",
        enabledValue: scheduler.EMAIL_SYNC_ENABLED,
        cronValue: scheduler.EMAIL_SYNC_CRON,
        defaultCron: "*/15 * * * *",
        dependencyConfigured: integrationByCode.get("imap")?.configured ?? false,
        dependencyMessage: "A sincronização está ligada, mas o recebimento IMAP não está configurado.",
      }),
      schedulerDiagnostic({
        item: "Alertas diários",
        code: "alerts-scheduler",
        enabledValue: scheduler.ALERTS_ENABLED,
        cronValue: scheduler.ALERTS_CRON,
        defaultCron: "0 8 * * *",
      }),
      schedulerDiagnostic({
        item: "Captura programada de fornecedores",
        code: "scraper-scheduler",
        enabledValue: scheduler.SCRAPER_SCHEDULE_ENABLED,
        cronValue: scheduler.SCRAPER_SCHEDULE_CRON,
        defaultCron: "* * * * *",
      }),
      schedulerDiagnostic({
        item: "Radar automático de portais",
        code: "portal-radar-scheduler",
        enabledValue: scheduler.PORTAL_OPPORTUNITY_SYNC_ENABLED,
        cronValue: scheduler.PORTAL_OPPORTUNITY_SYNC_CRON,
        defaultCron: "0 7,12,17 * * *",
      }),
      schedulerDiagnostic({
        item: "Backup automático",
        code: "backup-scheduler",
        enabledValue: scheduler.BACKUP_ENABLED,
        cronValue: scheduler.BACKUP_CRON,
        defaultCron: "0 3 * * *",
      }),
    );

    try {
      const cotacoes = await db.select().from(emailQuotations);
      const pendentes = cotacoes.filter((cotacao: any) => cotacao.status !== "respondida" && cotacao.status !== "descartada");
      const vencidas = pendentes.filter((cotacao: any) => cotacao.prazoResposta && new Date(cotacao.prazoResposta) < new Date());
      itens.push({
        categoria: "Operação",
        item: "Cotações pendentes",
        status: vencidas.length > 0 ? "erro" : pendentes.length > 0 ? "atencao" : "ok",
        detalhe: vencidas.length > 0 ? `${vencidas.length} cotação(ões) vencida(s) sem resposta.` : `${pendentes.length} cotação(ões) pendente(s).`,
        acao: pendentes.length > 0 ? "Abra Oportunidades → Cotações." : undefined,
        codigo: "quotations",
      });
    } catch (error) {
      logger.error("[Diagnóstico] Falha ao consultar cotações:", error);
      itens.push({ categoria: "Operação", item: "Cotações pendentes", status: "erro", detalhe: "Falha ao consultar cotações.", codigo: "quotations" });
    }

    const configurados = configuredEnvironmentNames();
    return {
      itens,
      resumo: resumir(itens),
      integracoes: integrations,
      falhasRecentes: recentFailures,
      ambiente: {
        configurados,
        total: configurados.length,
        observacao: "Somente nomes de configurações de infraestrutura são exibidos; credenciais runtime ficam no cofre do S2.",
      },
    };
  }),
});
