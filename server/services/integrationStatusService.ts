import { and, desc, eq, gte, inArray, isNotNull, max, or, sql } from "drizzle-orm";
import { apiLogs } from "../../drizzle/schema";
import { listConfiguredProviders } from "../_core/llm";
import { getDb } from "../db";
import {
  bootstrapEnvironmentNames,
  getEmailRuntimeConfig,
  getWhatsappRuntimeConfig,
  resolveCredentials,
} from "../integrations/core/credentialResolver";
import { listIntegrations } from "../integrations/core/integrationRegistry";
import type { IntegrationDescriptor, IntegrationHealthSnapshot } from "../integrations/core/types";

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

interface HealthAggregate {
  errors24h: number;
  lastSuccessAt: Date | null;
}

interface LatestEvent {
  success: boolean;
  statusCode: number | null;
  errorMessage: string | null;
  durationMs: number | null;
  createdAt: Date;
}

function looksLikeContractDrift(message: string | null | undefined): boolean {
  return /contract|contrato.*schema|schema|layout|html.*drift|non-json|json malformado|parse|parser/i.test(message ?? "");
}

function toDate(value: unknown): Date | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function sourceConfigured(
  definition: IntegrationDescriptor,
  providers: Array<{ kind: string; model: string }>,
  runtime: {
    email: Awaited<ReturnType<typeof getEmailRuntimeConfig>>;
    whatsapp: Awaited<ReturnType<typeof getWhatsappRuntimeConfig>>;
    generic: Record<string, string | undefined>;
  },
): { configured: boolean; mode?: string } {
  const code = definition.code;
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
  const keys = definition.configuredBy ?? [];
  if (!keys.length) return { configured: true };
  return { configured: keys.every((key) => Boolean(runtime.generic[key])) };
}

async function loadHealthTelemetry(
  codes: string[],
  since: Date,
): Promise<{
  aggregates: Map<string, HealthAggregate>;
  latest: Map<string, LatestEvent>;
}> {
  const db = await getDb().catch(() => null);
  if (!db || !codes.length) return { aggregates: new Map(), latest: new Map() };

  const filter = and(gte(apiLogs.createdAt, since), inArray(apiLogs.source, codes));
  const latestIds = db
    .select({
      source: apiLogs.source,
      latestId: max(apiLogs.id).as("latest_id"),
    })
    .from(apiLogs)
    .where(filter)
    .groupBy(apiLogs.source)
    .as("latest_api_log_ids");

  const [aggregateRows, latestRows] = await Promise.all([
    db
      .select({
        source: apiLogs.source,
        errors24h: sql<number>`SUM(CASE WHEN ${apiLogs.success} = 0 THEN 1 ELSE 0 END)`.mapWith(Number),
        lastSuccessAt: sql<Date | null>`MAX(CASE WHEN ${apiLogs.success} = 1 THEN ${apiLogs.createdAt} ELSE NULL END)`,
      })
      .from(apiLogs)
      .where(filter)
      .groupBy(apiLogs.source)
      .catch(() => []),
    db
      .select({
        source: apiLogs.source,
        success: apiLogs.success,
        statusCode: apiLogs.statusCode,
        errorMessage: apiLogs.errorMessage,
        durationMs: apiLogs.durationMs,
        createdAt: apiLogs.createdAt,
      })
      .from(apiLogs)
      .innerJoin(latestIds, eq(apiLogs.id, latestIds.latestId))
      .catch(() => []),
  ]);

  const aggregates = new Map<string, HealthAggregate>();
  for (const row of aggregateRows) {
    aggregates.set(row.source, {
      errors24h: Number(row.errors24h) || 0,
      lastSuccessAt: toDate(row.lastSuccessAt),
    });
  }

  const latest = new Map<string, LatestEvent>();
  for (const row of latestRows) {
    latest.set(row.source, {
      success: row.success,
      statusCode: row.statusCode,
      errorMessage: row.errorMessage,
      durationMs: row.durationMs,
      createdAt: row.createdAt,
    });
  }
  return { aggregates, latest };
}

/**
 * O banco reduz os logs de 24h para O(D) linhas, onde D é a quantidade fixa de
 * integrações registradas. Não há mais limite arbitrário de 1.500 eventos nem
 * filtragem O(L×D) em memória.
 */
export async function getIntegrationStatuses(): Promise<IntegrationStatus[]> {
  const definitions = listIntegrations();
  const codes = definitions.map((definition) => definition.code);
  const genericKeys = Array.from(new Set(definitions.flatMap((item) => item.configuredBy ?? [])));
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [providers, email, whatsapp, generic, telemetry] = await Promise.all([
    listConfiguredProviders(),
    getEmailRuntimeConfig(),
    getWhatsappRuntimeConfig(),
    resolveCredentials(genericKeys),
    loadHealthTelemetry(codes, since),
  ]);
  const checkedAt = new Date();

  return definitions.map((definition) => {
    const config = sourceConfigured(definition, providers, { email, whatsapp, generic });
    const aggregate = telemetry.aggregates.get(definition.code) ?? { errors24h: 0, lastSuccessAt: null };
    const latest = telemetry.latest.get(definition.code);
    let state: IntegrationStatus["state"] = config.configured ? "CONFIGURED" : "NOT_CONFIGURED";
    let detail = config.configured
      ? "Configurada; ainda sem telemetria suficiente para afirmar saúde operacional."
      : "Não configurada.";

    if (config.configured && latest) {
      if (latest.success) {
        if (aggregate.errors24h >= 3) {
          state = "DEGRADED";
          detail = `Última operação funcionou, mas houve ${aggregate.errors24h} falha(s) nas últimas 24h.`;
        } else {
          state = "HEALTHY";
          detail = "Última operação externa concluída com sucesso.";
        }
      } else if (looksLikeContractDrift(latest.errorMessage)) {
        state = "CONTRACT_DRIFT";
        detail = latest.errorMessage?.slice(0, 500) || "Possível alteração do contrato/layout da fonte.";
      } else if (aggregate.lastSuccessAt) {
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
      checkedAt,
      latencyMs: latest?.durationMs ?? undefined,
      lastSuccessAt: aggregate.lastSuccessAt,
      errors24h: aggregate.errors24h,
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
  const safeLimit = Math.max(1, Math.min(limit, 200));
  return db
    .select({
      source: apiLogs.source,
      operation: apiLogs.endpoint,
      statusCode: apiLogs.statusCode,
      errorMessage: apiLogs.errorMessage,
      durationMs: apiLogs.durationMs,
      createdAt: apiLogs.createdAt,
    })
    .from(apiLogs)
    .where(or(isNotNull(apiLogs.errorMessage), gte(apiLogs.statusCode, 400)))
    .orderBy(desc(apiLogs.createdAt))
    .limit(safeLimit)
    .catch(() => []);
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
