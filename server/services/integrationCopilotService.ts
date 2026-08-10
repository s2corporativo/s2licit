import { invokeLLM, parseLlmJson } from "../_core/llm";
import { listIntegrations } from "../integrations/core/integrationRegistry";
import {
  getIntegrationStatuses,
  getRecentIntegrationFailures,
} from "./integrationStatusService";

export type IntegrationCopilotSeverity = "ok" | "atencao" | "critico";

export interface IntegrationCopilotDiagnosis {
  fonte: string;
  causaProvavel: string;
  evidencias: string[];
  acao: string;
  confianca: number;
}

export interface IntegrationCopilotReport {
  resumo: string;
  severidade: IntegrationCopilotSeverity;
  diagnosticos: IntegrationCopilotDiagnosis[];
  prioridades: string[];
  autonomia: string[];
  geradoEm: string;
}

const OUTPUT_SCHEMA = {
  name: "integration_copilot_report",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["resumo", "severidade", "diagnosticos", "prioridades", "autonomia"],
    properties: {
      resumo: { type: "string" },
      severidade: { type: "string", enum: ["ok", "atencao", "critico"] },
      diagnosticos: {
        type: "array",
        maxItems: 12,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["fonte", "causaProvavel", "evidencias", "acao", "confianca"],
          properties: {
            fonte: { type: "string" },
            causaProvavel: { type: "string" },
            evidencias: { type: "array", items: { type: "string" }, maxItems: 6 },
            acao: { type: "string" },
            confianca: { type: "number", minimum: 0, maximum: 1 },
          },
        },
      },
      prioridades: { type: "array", items: { type: "string" }, maxItems: 10 },
      autonomia: { type: "array", items: { type: "string" }, maxItems: 10 },
    },
  },
  strict: true,
} as const;

const SYSTEM_PROMPT = `Você é o S2 Integration Engineer, copiloto técnico interno do S2 Licit.
Sua especialidade é diagnosticar integrações de licitações, APIs públicas, e-mail, WhatsApp e provedores de IA.

REGRAS OBRIGATÓRIAS:
1. Use somente as evidências fornecidas no snapshot e nos logs. Nunca invente status, endpoint, credencial ou causa confirmada.
2. Diferencie rigorosamente NO_RESULTS de indisponibilidade. Zero registros após SUCCESS/NO_RESULTS é um resultado válido; DOWN/TIMEOUT/CONTRACT_DRIFT significa cobertura incompleta.
3. CONTRACT_DRIFT significa provável alteração de schema/layout e deve recomendar validar o contrato oficial ou adaptar o parser, não aumentar retries.
4. RATE_LIMITED deve recomendar respeitar Retry-After, reduzir concorrência/cadência e usar cache; não recomendar loop agressivo.
5. AUTH_ERROR deve recomendar revisar credencial/permissões sem jamais pedir ou imprimir o segredo.
6. Para fontes HTML/BROWSER_AUTOMATION, trate mudanças de layout como mais prováveis que em REST_API oficial.
7. Priorize: P0 perda silenciosa de oportunidades/segurança; P1 degradação operacional; P2 melhoria de eficiência.
8. Dê ações executáveis dentro do S2 quando possível e minimize dependência de GitHub/redeploy para parâmetros operacionais.
9. Nunca recomende alterar ENCRYPTION_KEY se já existem credenciais criptografadas.
10. Responda em português do Brasil e estritamente no JSON solicitado.

ARQUITETURA ATUAL:
IntegrationRegistry -> CredentialResolver -> ExternalHttpClient -> Adapters -> api_logs -> Diagnóstico/Consumers.
O ExternalHttpClient centraliza timeout, retry idempotente, Retry-After, backoff+jitter, circuit breaker, limite de resposta, request-id e redaction.
Credenciais administráveis ficam criptografadas no banco e usam o ambiente de boot apenas como fallback imutável.`;

function safeConfidence(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0.5;
  return Math.max(0, Math.min(1, number));
}

export async function analyzeIntegrationsWithAi(question?: string): Promise<IntegrationCopilotReport> {
  const [statuses, failures] = await Promise.all([
    getIntegrationStatuses(),
    getRecentIntegrationFailures(30),
  ]);
  const registry = listIntegrations().map((item) => ({
    code: item.code,
    label: item.label,
    group: item.group,
    transport: item.transport,
    stability: item.stability,
    critical: Boolean(item.critical),
  }));

  const snapshot = {
    question: question?.trim() || "Faça o diagnóstico técnico das integrações e priorize o que precisa de ação.",
    generatedAt: new Date().toISOString(),
    registry,
    statuses: statuses.map((status) => ({
      code: status.code,
      label: status.label,
      state: status.state,
      configured: status.configured,
      transport: status.transport,
      stability: status.stability,
      detail: status.detail,
      latencyMs: status.latencyMs ?? null,
      lastSuccessAt: status.lastSuccessAt?.toISOString?.() ?? status.lastSuccessAt ?? null,
      errors24h: status.errors24h ?? 0,
    })),
    recentFailures: failures.map((failure) => ({
      source: failure.source,
      operation: failure.operation,
      statusCode: failure.statusCode,
      errorMessage: failure.errorMessage,
      durationMs: failure.durationMs,
      createdAt: failure.createdAt?.toISOString?.() ?? failure.createdAt,
    })),
  };

  const result = await invokeLLM({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Analise este snapshot operacional do S2 Licit:\n${JSON.stringify(snapshot)}`,
      },
    ],
    maxTokens: 3000,
    outputSchema: OUTPUT_SCHEMA,
  });
  const raw = result.choices?.[0]?.message?.content;
  const text = typeof raw === "string" ? raw : JSON.stringify(raw ?? "");
  const parsed = parseLlmJson<Omit<IntegrationCopilotReport, "geradoEm">>(text);

  return {
    resumo: String(parsed.resumo ?? "Diagnóstico concluído."),
    severidade: ["ok", "atencao", "critico"].includes(parsed.severidade)
      ? parsed.severidade
      : "atencao",
    diagnosticos: Array.isArray(parsed.diagnosticos)
      ? parsed.diagnosticos.slice(0, 12).map((item) => ({
          fonte: String(item.fonte ?? "geral"),
          causaProvavel: String(item.causaProvavel ?? "Não determinada"),
          evidencias: Array.isArray(item.evidencias) ? item.evidencias.map(String).slice(0, 6) : [],
          acao: String(item.acao ?? "Revisar evidências operacionais."),
          confianca: safeConfidence(item.confianca),
        }))
      : [],
    prioridades: Array.isArray(parsed.prioridades) ? parsed.prioridades.map(String).slice(0, 10) : [],
    autonomia: Array.isArray(parsed.autonomia) ? parsed.autonomia.map(String).slice(0, 10) : [],
    geradoEm: new Date().toISOString(),
  };
}
