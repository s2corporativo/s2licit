import cron from "node-cron";
import fs from "fs";
import path from "path";
import { count } from "drizzle-orm";
import { adminProcedure, editorProcedure, router } from "../_core/trpc";
import { isBackupFile, backupTimestamp, runDatabaseBackup, cleanupOldBackups } from "../services/backupService";
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
} from "../services/integrationStatusService";

/**
 * Central de Diagnóstico: verificações reais e somente leitura sobre banco,
 * integrações, dados, segurança e agendadores. Valores sensíveis nunca são
 * devolvidos; somente os nomes das configurações presentes no container.
 */

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
  envEnabled: string | undefined;
  envCron: string | undefined;
  defaultCron: string;
  dependencyConfigured?: boolean;
  dependencyMessage?: string;
}): ItemDiagnostico {
  const isEnabled = enabled(input.envEnabled);
  const expression = input.envCron || input.defaultCron;

  if (!isEnabled) {
    return {
      categoria: "Automação",
      item: input.item,
      status: "atencao",
      detalhe: "Desativada por configuração.",
      acao: "Ative a automação no GitHub e execute novamente o Deploy VPS.",
      codigo: input.code,
    };
  }

  if (!cron.validate(expression)) {
    return {
      categoria: "Automação",
      item: input.item,
      status: "erro",
      detalhe: `Expressão cron inválida: ${expression}.`,
      acao: "Corrija a expressão cron cadastrada no GitHub antes do próximo deploy.",
      codigo: input.code,
    };
  }

  if (input.dependencyConfigured === false) {
    return {
      categoria: "Automação",
      item: input.item,
      status: "atencao",
      detalhe: input.dependencyMessage || "A automação está ligada, mas falta uma integração obrigatória.",
      acao: "Configure a integração obrigatória e execute novamente o Deploy VPS.",
      codigo: input.code,
    };
  }

  return {
    categoria: "Automação",
    item: input.item,
    status: "ok",
    detalhe: `Agendada por ${expression}.`,
    codigo: input.code,
  };
}

export const diagnosticoRouter = router({
  /** Situação dos backups: último arquivo gerado e onde ficam gravados. */
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
      // diretório ainda não existe — nenhum backup foi feito
    }
    return { destDir, ultimo };
  }),

  /** Dispara um backup do banco agora (mysqldump + gzip + retenção). */
  backupAgora: adminProcedure.mutation(async () => {
    const destDir = process.env.BACKUP_DIR || "backups";
    const result = await runDatabaseBackup({ destDir });
    if (result.success) {
      const removidos = cleanupOldBackups(destDir, 14, Date.now());
      return {
        ok: true as const,
        arquivo: path.basename(result.file ?? ""),
        removidosAntigos: removidos,
      };
    }
    return { ok: false as const, erro: result.error ?? "Falha desconhecida no backup." };
  }),

  // O frontend já restringe a tela a Editor, mas a autorização precisa existir
  // também no backend para impedir acesso direto ao endpoint por Viewer/User.
  verificar: editorProcedure.query(async () => {
    const itens: ItemDiagnostico[] = [];
    const db = await getDb();

    if (!db) {
      itens.push({
        categoria: "Banco de Dados",
        item: "Conexão MySQL",
        status: "erro",
        detalhe: "Não foi possível conectar ao banco de dados.",
        acao: "Confira o container sistema-s2-db e a variável DATABASE_URL.",
        codigo: "database",
      });
      const configurados = configuredEnvironmentNames();
      return {
        itens,
        resumo: resumir(itens),
        ambiente: {
          configurados,
          total: configurados.length,
          observacao: "Somente os nomes são exibidos; os valores permanecem ocultos.",
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

    const nProdutos = await contar(db, products);
    itens.push({
      categoria: "Dados essenciais",
      item: "Catálogo de produtos",
      status: nProdutos > 0 ? "ok" : nProdutos === 0 ? "atencao" : "erro",
      detalhe:
        nProdutos > 0
          ? `${nProdutos} produtos cadastrados.`
          : nProdutos === 0
            ? "Nenhum produto no catálogo."
            : "Não foi possível consultar o catálogo.",
      acao: nProdutos === 0 ? "Importe o catálogo em Catálogo → Importar planilha." : undefined,
      codigo: "products",
    });

    const nFornecedores = await contar(db, suppliers);
    itens.push({
      categoria: "Dados essenciais",
      item: "Fornecedores",
      status: nFornecedores > 0 ? "ok" : nFornecedores === 0 ? "atencao" : "erro",
      detalhe:
        nFornecedores > 0
          ? `${nFornecedores} fornecedores cadastrados.`
          : nFornecedores === 0
            ? "Nenhum fornecedor cadastrado."
            : "Não foi possível consultar os fornecedores.",
      acao:
        nFornecedores === 0
          ? "Cadastre os fornecedores no módulo Catálogo → Fornecedores."
          : undefined,
      codigo: "suppliers",
    });

    const nRegrasTributarias = await contar(db, taxRules);
    itens.push({
      categoria: "Dados essenciais",
      item: "Regras tributárias",
      status:
        nRegrasTributarias > 0 ? "ok" : nRegrasTributarias === 0 ? "atencao" : "erro",
      detalhe:
        nRegrasTributarias > 0
          ? `${nRegrasTributarias} regras cadastradas.`
          : nRegrasTributarias === 0
            ? "Nenhuma regra tributária cadastrada."
            : "Não foi possível consultar as regras tributárias.",
      acao:
        nRegrasTributarias === 0
          ? "Cadastre Simples Nacional, DIFAL e demais incidências antes de calcular preços mínimos."
          : undefined,
      codigo: "taxes",
    });

    try {
      const registros = await db.select().from(certidoes);
      const hoje = new Date();
      const ativas = registros.filter((registro: any) => registro.ativa);
      const vencidas = ativas.filter(
        (registro: any) => registro.dataValidade && new Date(registro.dataValidade) < hoje,
      );
      itens.push({
        categoria: "Dados essenciais",
        item: "Certidões de habilitação",
        status: vencidas.length > 0 ? "erro" : ativas.length > 0 ? "ok" : "atencao",
        detalhe:
          vencidas.length > 0
            ? `${vencidas.length} certidão(ões) vencida(s) entre ${ativas.length} ativas.`
            : ativas.length > 0
              ? `${ativas.length} certidões ativas e válidas.`
              : "Nenhuma certidão cadastrada.",
        acao:
          vencidas.length > 0
            ? "Renove as certidões vencidas antes de participar de novas disputas."
            : ativas.length === 0
              ? "Cadastre as certidões em Propostas → Habilitação."
              : undefined,
        codigo: "certificates",
      });
    } catch (error) {
      console.error("[Diagnóstico] Falha ao consultar certidões:", error);
      itens.push({
        categoria: "Dados essenciais",
        item: "Certidões de habilitação",
        status: "erro",
        detalhe: "Falha ao consultar as certidões no banco de dados.",
        codigo: "certificates",
      });
    }

    const integrations = getIntegrationStatuses();
    const integrationByCode = new Map(integrations.map((integration) => [integration.code, integration]));

    for (const integration of integrations) {
      itens.push({
        categoria: "Integrações",
        item: integration.label,
        status: integration.configured ? "ok" : "atencao",
        detalhe: integration.detail,
        acao: integration.configured
          ? undefined
          : `Cadastre no GitHub: ${integration.expectedConfiguration.join(", ")}; depois execute o Deploy VPS.`,
        codigo: integration.code,
      });
    }

    const encryptionKeyOk = Boolean(
      process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_KEY.length >= 32,
    );
    const jwtOk = Boolean(process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32);
    itens.push({
      categoria: "Segurança",
      item: "Criptografia de credenciais",
      status: encryptionKeyOk ? "ok" : "erro",
      detalhe: encryptionKeyOk
        ? "ENCRYPTION_KEY válida; acessos de portais e fornecedores são protegidos."
        : "ENCRYPTION_KEY ausente ou curta.",
      acao: encryptionKeyOk
        ? undefined
        : "Restaure a chave original do .env da VPS; não gere outra se já houver credenciais salvas.",
      codigo: "encryption",
    });
    itens.push({
      categoria: "Segurança",
      item: "Sessões e autenticação",
      status: jwtOk ? "ok" : "erro",
      detalhe: jwtOk ? "JWT_SECRET válida." : "JWT_SECRET ausente ou curta.",
      acao: jwtOk ? undefined : "Confira o .env gerado pelo bootstrap da VPS.",
      codigo: "jwt",
    });

    itens.push(
      schedulerDiagnostic({
        item: "Sincronização de e-mails",
        code: "email-scheduler",
        envEnabled: process.env.EMAIL_SYNC_ENABLED,
        envCron: process.env.EMAIL_SYNC_CRON,
        defaultCron: "*/15 * * * *",
        dependencyConfigured: integrationByCode.get("imap")?.configured ?? false,
        dependencyMessage: "A sincronização está ligada, mas o recebimento IMAP não está configurado.",
      }),
    );
    itens.push(
      schedulerDiagnostic({
        item: "Alertas diários",
        code: "alerts-scheduler",
        envEnabled: process.env.ALERTS_ENABLED,
        envCron: process.env.ALERTS_CRON,
        defaultCron: "0 8 * * *",
      }),
    );
    itens.push(
      schedulerDiagnostic({
        item: "Captura programada de fornecedores",
        code: "scraper-scheduler",
        envEnabled: process.env.SCRAPER_SCHEDULE_ENABLED,
        envCron: process.env.SCRAPER_SCHEDULE_CRON,
        defaultCron: "* * * * *",
      }),
    );

    try {
      const cotacoes = await db.select().from(emailQuotations);
      const pendentes = cotacoes.filter(
        (cotacao: any) => cotacao.status !== "respondida" && cotacao.status !== "descartada",
      );
      const vencidas = pendentes.filter(
        (cotacao: any) => cotacao.prazoResposta && new Date(cotacao.prazoResposta) < new Date(),
      );
      itens.push({
        categoria: "Operação",
        item: "Cotações pendentes",
        status: vencidas.length > 0 ? "erro" : pendentes.length > 0 ? "atencao" : "ok",
        detalhe:
          vencidas.length > 0
            ? `${vencidas.length} cotação(ões) vencida(s) sem resposta.`
            : `${pendentes.length} cotação(ões) pendente(s).`,
        acao: pendentes.length > 0 ? "Abra Oportunidades → Cotações." : undefined,
        codigo: "quotations",
      });
    } catch (error) {
      console.error("[Diagnóstico] Falha ao consultar cotações:", error);
      itens.push({
        categoria: "Operação",
        item: "Cotações pendentes",
        status: "erro",
        detalhe: "Falha ao consultar as cotações no banco de dados.",
        codigo: "quotations",
      });
    }

    const configurados = configuredEnvironmentNames();
    return {
      itens,
      resumo: resumir(itens),
      ambiente: {
        configurados,
        total: configurados.length,
        observacao: "Somente os nomes são exibidos; os valores permanecem ocultos.",
      },
    };
  }),
});
