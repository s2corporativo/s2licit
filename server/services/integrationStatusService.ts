import { desc, gte } from "drizzle-orm";
import { apiLogs } from "../../drizzle/schema";
import { getDb } from "../db";
import { listConfiguredProviders } from "../_core/llm";
import {
  bootstrapEnvironmentNames,
  getEmailRuntimeConfig,
  getWhatsappRuntimeConfig,
  resolveCredentials,
} from "../integrations/core/credentialResolver";
import { listIntegrations } from "../integrations/core/integrationRegistry";
import type { IntegrationHealthSnapshot } from "../integrations/core/types";

export type IntegrationStatus = IntegrationHealthSnapshot & {
  expectedConfiguration: string[];
  mode?: string;
};

const PUBLIC_NO_SECRET = new Set([
  "pncp",
  "comprasgov",
  "brasilapi",
  "fiemg",
  "fundep",
  "funarbe",
  "cemig",
  "copasa",
  "comprasmg",
]);

function looksLikeContractDrift(message: string | null | undefined): boolean {
  return /contract|contrato.*schema|schema|layout|html.*drift|non-json|json malformado|parse|parser/i.test(message ?? "");
}

function sourceConfigured(
  code: string,
  providers: Array<{ kind: string; model: string }>,
  runtime: {
    email: Awaited<ReturnType<typeof getEmailRuntimeConfig>>;
    whatsapp: Awaited<ReturnType<typeof getWhatsappRuntimeConfig>>;
    generic: Record<string, string | undefined>;
  },
): { configured: boolean; mode?: string } {
  if (PUBLIC_NO_SECRET.has(code)) return { configured: true, mode: "fonte pública" };
  if (code === "anthropic" || code === "groq" || code === "forge") {
    const provider = providers.find((item) => item.kind === code);
    return { configured: Boolean(provider), mode: provider?.model };
  }
  if (code === "imap") {
    const configured = Boolean(runtime.email.imap.host && runtime.email.imap.user && runtime.email.imap.password);
    return { configured, mode: configured ? runtime.email.imap.host : undefined };
  }
  if (code === "smtp") {
    const configured = Boolean(runtime.email.smtp.host && runtime.email.smtp.user && runtime.email.smtp.password);
    return { configured, mode: configured ? runtime.email.smtp.host : undefined };
  }
  if (code === "whatsapp") {
    const webhook = Boolean(runtime.whatsapp.webhookUrl && runtime.whatsapp.to);
    const meta = Boolean(runtime.whatsapp.phoneId && runtime.whatsapp.token && runtime.whatsapp.to);
    return { configured: webhook || meta, mode: webhook ? "webhook" : meta ? "Meta Cloud API" : undefined };
  }
  const descriptor = listIntegrations().find((item) => item.code === code);
  const keys = descriptor?.configuredBy ?? [];
  if (!keys.length) return { configured: true };
  return { configured: keys.every((key) => Boolean(runtime.generic[key])) };
}

export async function getIntegrationStatuses(): Promise<IntegrationStatus[]> {
  const [providers, email, whatsapp, db] = await Promise.all([
    listConfiguredProviders(),
    getEmailRuntimeConfig(),
    getWhatsappRuntimeConfig(),
    getDb().catch(() => null),
  ]);
  const definitions = listIntegrations();
  const genericKeys = Array.from(new Set(definitions.flatMap((item) => item.configuredBy ?? [])));
  const generic = await resolveCredentials(genericKeys);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const logs = db
    ? await db
        .select()
        .from(apiLogs)
        .where(gte(apiLogs.createdAt, since))
        .orderBy(desc(apiLogs.createdAt))
        .limit(1500)
        .catch(() => [])
    : [];

  return definitions.map((definition) => {
    const config = sourceConfigured(definition.code, providers, { email, whatsapp, generic });
    const sourceLogs = logs.filter((log) => log.source === definition.code);
    const latest = sourceLogs[0];
    const lastSuccess = sourceLogs.find((log) => log.success);
    const errors24h = sourceLogs.filter((log) => !log.success).length;
    let state: IntegrationStatus["state"] = config.configured ? "CONFIGURED" : "NOT_CONFIGURED";
    let detail = config.configured
      ? "Configurada; ainda sem telemetria suficiente para afirmar saúde operacional."
      : "Não configurada.";

    if (config.configured && latest) {
      if (latest.success) {
        if (errors24h >= 3) {
          state = "DEGRADED";
          detail = `Última operação funcionou, mas houve ${errors24h} falha(s) nas últimas 24h.`;
        } else {
          state = "HEALTHY";
          detail = "Última operação externa concluída com sucesso.";
        }
      } else if (looksLikeContractDrift(latest.errorMessage)) {
        state = "CONTRACT_DRIFT";
        detail = latest.errorMessage?.slice(0, 500) || "Possível alteração do contrato/layout da fonte.";
      } else if (lastSuccess) {
        state = "DEGRADED";
        detail = latest.errorMessage?.slice(0, 500) || "A fonte apresentou falha recente após já ter funcionado.";
      } else {
        state = "DOWN";
        detail = latest.errorMessage?.slice(0, 500) || "A fonte não apresenta execução bem-sucedida nas últimas 24h.";
      }
    }

    return {
      code: definition.code,
      label: definition.label,
      configured: config.configured,
      state,
      detail,
      checkedAt: new Date(),
      latencyMs: latest?.durationMs ?? undefined,
      lastSuccessAt: lastSuccess?.createdAt ?? null,
      errors24h,
      transport: definition.transport,
      stability: definition.stability,
      expectedConfiguration: definition.configuredBy ?? [],
      mode: config.mode,
    };
  });
}

export async function getRecentIntegrationFailures(limit = 30) {
  const db = await getDb().catch(() => null);
  if (!db) return [];
  const rows = await db
    .select({
      source: apiLogs.source,
      operation: apiLogs.endpoint,
      statusCode: apiLogs.statusCode,
      errorMessage: apiLogs.errorMessage,
      durationMs: apiLogs.durationMs,
      createdAt: apiLogs.createdAt,
    })
    .from(apiLogs)
    .orderBy(desc(apiLogs.createdAt))
    .limit(Math.max(limit * 4, 60))
    .catch(() => []);
  return rows.filter((row) => Boolean(row.errorMessage) || (row.statusCode != null && row.statusCode >= 400)).slice(0, limit);
}

/**
 * Somente nomes do ambiente de infraestrutura são expostos; valores nunca são
 * serializados. PRODEMGE_API_KEY foi removida por não possuir consumidor.
 */
export function configuredEnvironmentNames(): string[] {
  const allowList = new Set([
    "DATABASE_URL",
    "JWT_SECRET",
    "ENCRYPTION_KEY",
    "ADMIN_PASSWORD",
    "GROQ_API_KEY",
    "ANTHROPIC_API_KEY",
    "BUILT_IN_FORGE_API_URL",
    "BUILT_IN_FORGE_API_KEY",
    "IMAP_HOST",
    "IMAP_USER",
    "IMAP_PASSWORD",
    "SMTP_HOST",
    "SMTP_USER",
    "SMTP_PASSWORD",
    "WHATSAPP_PHONE_ID",
    "WHATSAPP_TOKEN",
    "WHATSAPP_WEBHOOK_URL",
    "WHATSAPP_TO",
  ]);
  return bootstrapEnvironmentNames().filter((name) => allowList.has(name)).sort();
}
