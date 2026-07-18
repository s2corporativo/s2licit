import { ENV } from "./env";
import { logger } from "./logger";

export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type TextContent = {
  type: "text";
  text: string;
};

export type ImageContent = {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
};

export type FileContent = {
  type: "file_url";
  file_url: {
    url: string;
    mime_type?: "audio/mpeg" | "audio/wav" | "application/pdf" | "audio/mp4" | "video/mp4" ;
  };
};

export type MessageContent = string | TextContent | ImageContent | FileContent;

export type Message = {
  role: Role;
  content: MessageContent | MessageContent[];
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
};

export type Tool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type ToolChoicePrimitive = "none" | "auto" | "required";
export type ToolChoiceByName = { name: string };
export type ToolChoiceExplicit = {
  type: "function";
  function: {
    name: string;
  };
};

export type ToolChoice =
  | ToolChoicePrimitive
  | ToolChoiceByName
  | ToolChoiceExplicit;

export type InvokeParams = {
  messages: Message[];
  tools?: Tool[];
  toolChoice?: ToolChoice;
  tool_choice?: ToolChoice;
  maxTokens?: number;
  max_tokens?: number;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
};

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type InvokeResult = {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: Role;
      content: string | Array<TextContent | ImageContent | FileContent>;
      tool_calls?: ToolCall[];
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type JsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

export type OutputSchema = JsonSchema;

export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: JsonSchema };

const ensureArray = (
  value: MessageContent | MessageContent[]
): MessageContent[] => (Array.isArray(value) ? value : [value]);

const normalizeContentPart = (
  part: MessageContent
): TextContent | ImageContent | FileContent => {
  if (typeof part === "string") {
    return { type: "text", text: part };
  }

  if (part.type === "text") {
    return part;
  }

  if (part.type === "image_url") {
    return part;
  }

  if (part.type === "file_url") {
    return part;
  }

  throw new Error("Unsupported message content part");
};

const normalizeMessage = (message: Message) => {
  const { role, name, tool_call_id, tool_calls } = message;

  if (role === "tool" || role === "function") {
    const content = ensureArray(message.content)
      .map(part => (typeof part === "string" ? part : JSON.stringify(part)))
      .join("\n");

    return {
      role,
      name,
      tool_call_id,
      content,
    };
  }

  const contentParts = ensureArray(message.content).map(normalizeContentPart);

  // If there's only text content, collapse to a single string for compatibility
  if (contentParts.length === 1 && contentParts[0].type === "text") {
    return {
      role,
      name,
      content: contentParts[0].text,
      ...(tool_calls && tool_calls.length > 0 ? { tool_calls } : {}),
    };
  }

  return {
    role,
    name,
    content: contentParts,
    ...(tool_calls && tool_calls.length > 0 ? { tool_calls } : {}),
  };
};

const normalizeToolChoice = (
  toolChoice: ToolChoice | undefined,
  tools: Tool[] | undefined
): "none" | "auto" | ToolChoiceExplicit | undefined => {
  if (!toolChoice) return undefined;

  if (toolChoice === "none" || toolChoice === "auto") {
    return toolChoice;
  }

  if (toolChoice === "required") {
    if (!tools || tools.length === 0) {
      throw new Error(
        "tool_choice 'required' was provided but no tools were configured"
      );
    }

    if (tools.length > 1) {
      throw new Error(
        "tool_choice 'required' needs a single tool or specify the tool name explicitly"
      );
    }

    return {
      type: "function",
      function: { name: tools[0].function.name },
    };
  }

  if ("name" in toolChoice) {
    return {
      type: "function",
      function: { name: toolChoice.name },
    };
  }

  return toolChoice;
};

/**
 * Provedores de IA (todos usam endpoint compatível com OpenAI):
 * - anthropic: API da Anthropic (ANTHROPIC_API_KEY) — mais precisa.
 * - groq: GroqCloud (GROQ_API_KEY) — rápida, tem tier gratuito.
 * - forge: endpoint legado do Manus (BUILT_IN_FORGE_API_URL/KEY).
 *
 * A seleção é controlada por AI_PROVIDER ("anthropic"|"groq"|"auto").
 * Em "auto", tenta anthropic → groq → forge conforme as chaves presentes.
 */
export type LlmProviderKind = "anthropic" | "groq" | "forge";

interface LlmProvider {
  kind: LlmProviderKind;
  url: string;
  apiKey: string;
  model: string;
  /** Provedores que só aceitam response_format json_object (sem json_schema). */
  jsonObjectOnly: boolean;
}

/**
 * Config de IA em tempo de EXECUÇÃO: prioriza process.env (onde a config
 * salva pela interface é aplicada por aiConfigService), com ENV — capturado no
 * boot a partir do .env — como fallback. Assim colar a chave na Central de IA
 * passa a valer sem reiniciar o servidor.
 */
function aiEnv() {
  return {
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || ENV.anthropicApiKey,
    anthropicModel: process.env.ANTHROPIC_MODEL || ENV.anthropicModel,
    groqApiKey: process.env.GROQ_API_KEY || ENV.groqApiKey,
    groqModel: process.env.GROQ_MODEL || ENV.groqModel,
    forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL || ENV.forgeApiUrl,
    forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY || ENV.forgeApiKey,
    aiProvider: (process.env.AI_PROVIDER || ENV.aiProvider || "auto").toLowerCase(),
  };
}

function anthropicProvider(): LlmProvider | null {
  const env = aiEnv();
  if (!env.anthropicApiKey) return null;
  return {
    kind: "anthropic",
    url: "https://api.anthropic.com/v1/chat/completions",
    apiKey: env.anthropicApiKey,
    model: env.anthropicModel,
    jsonObjectOnly: false,
  };
}
function groqProvider(): LlmProvider | null {
  const env = aiEnv();
  if (!env.groqApiKey) return null;
  return {
    kind: "groq",
    url: "https://api.groq.com/openai/v1/chat/completions",
    apiKey: env.groqApiKey,
    model: env.groqModel,
    jsonObjectOnly: true,
  };
}
function forgeProvider(): LlmProvider | null {
  const env = aiEnv();
  if (!env.forgeApiUrl || !env.forgeApiKey) return null;
  return {
    kind: "forge",
    url: `${env.forgeApiUrl.replace(/\/$/, "")}/v1/chat/completions`,
    apiKey: env.forgeApiKey,
    model: "gemini-2.5-flash",
    jsonObjectOnly: false,
  };
}

/** Lista os provedores configurados (para diagnóstico/central de IA). */
export function listConfiguredProviders(): Array<{ kind: LlmProviderKind; model: string }> {
  return [anthropicProvider(), groqProvider(), forgeProvider()]
    .filter((p): p is LlmProvider => p != null)
    .map((p) => ({ kind: p.kind, model: p.model }));
}

/** Retorna o provedor ativo (respeitando AI_PROVIDER) ou null se nenhum. */
export function activeProvider(): LlmProvider | null {
  const pref = aiEnv().aiProvider;
  if (pref === "anthropic") return anthropicProvider() ?? groqProvider() ?? forgeProvider();
  if (pref === "groq") return groqProvider() ?? anthropicProvider() ?? forgeProvider();
  // auto
  return anthropicProvider() ?? groqProvider() ?? forgeProvider();
}

const resolveProvider = (): LlmProvider => {
  const p = activeProvider();
  if (p) return p;
  throw new Error(
    "Nenhum provedor de IA configurado. Defina ANTHROPIC_API_KEY ou GROQ_API_KEY " +
      "no ambiente para habilitar os recursos de IA (enriquecimento, classificação, agentes)."
  );
};

const normalizeResponseFormat = ({
  responseFormat,
  response_format,
  outputSchema,
  output_schema,
}: {
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
}):
  | { type: "json_schema"; json_schema: JsonSchema }
  | { type: "text" }
  | { type: "json_object" }
  | undefined => {
  const explicitFormat = responseFormat || response_format;
  if (explicitFormat) {
    if (
      explicitFormat.type === "json_schema" &&
      !explicitFormat.json_schema?.schema
    ) {
      throw new Error(
        "responseFormat json_schema requires a defined schema object"
      );
    }
    return explicitFormat;
  }

  const schema = outputSchema || output_schema;
  if (!schema) return undefined;

  if (!schema.name || !schema.schema) {
    throw new Error("outputSchema requires both name and schema");
  }

  return {
    type: "json_schema",
    json_schema: {
      name: schema.name,
      schema: schema.schema,
      ...(typeof schema.strict === "boolean" ? { strict: schema.strict } : {}),
    },
  };
};

/** Ordem de tentativa: provedor preferido primeiro, demais como fallback. */
function orderedProviders(): LlmProvider[] {
  const all = [anthropicProvider(), groqProvider(), forgeProvider()].filter(
    (p): p is LlmProvider => p != null
  );
  const pref = aiEnv().aiProvider;
  const rank = (p: LlmProvider) =>
    (pref === "anthropic" && p.kind === "anthropic") || (pref === "groq" && p.kind === "groq")
      ? 0
      : p.kind === "anthropic"
        ? 1
        : p.kind === "groq"
          ? 2
          : 3;
  return all.sort((a, b) => rank(a) - rank(b));
}

/** Erros transitórios que merecem retry/fallback (limite de taxa, 5xx, rede). */
function isTransientLlmError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /\b(429|500|502|503|504|529)\b|timeout|fetch failed|ECONNRESET|ETIMEDOUT/i.test(msg);
}

async function invokeProvider(
  provider: LlmProvider,
  params: InvokeParams
): Promise<InvokeResult> {
  const {
    messages,
    tools,
    toolChoice,
    tool_choice,
    outputSchema,
    output_schema,
    responseFormat,
    response_format,
    maxTokens,
    max_tokens,
  } = params;

  const payload: Record<string, unknown> = {
    model: provider.model,
    messages: messages.map(normalizeMessage),
  };

  if (tools && tools.length > 0) {
    payload.tools = tools;
  }

  const normalizedToolChoice = normalizeToolChoice(
    toolChoice || tool_choice,
    tools
  );
  if (normalizedToolChoice) {
    payload.tool_choice = normalizedToolChoice;
  }

  // Respeita o teto pedido pelo chamador (antes era fixo em 32768, inflando
  // custo/latência e ignorando a intenção de quem chamou).
  payload.max_tokens = Math.min(maxTokens ?? max_tokens ?? 8192, 32768);
  if (provider.kind === "forge") {
    // Parâmetro específico do endpoint legado (Manus Forge)
    payload.thinking = { budget_tokens: 128 };
  }

  let normalizedResponseFormat = normalizeResponseFormat({
    responseFormat,
    response_format,
    outputSchema,
    output_schema,
  });

  // Provedores que não suportam json_schema (ex.: Groq) recebem json_object.
  // O schema continua guiando via prompt/outputSchema; o cliente faz JSON.parse.
  if (normalizedResponseFormat?.type === "json_schema" && provider.jsonObjectOnly) {
    normalizedResponseFormat = { type: "json_object" };
  }

  if (normalizedResponseFormat) {
    payload.response_format = normalizedResponseFormat;
  }

  // Timeout: sem isto, uma chamada travada deixava a request tRPC pendurada
  // indefinidamente. Configurável por env (padrão 90s).
  const timeoutMs = Number(process.env.LLM_TIMEOUT_MS ?? 90000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(provider.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw new Error(`LLM invoke timeout após ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `LLM invoke failed: ${response.status} ${response.statusText} – ${errorText}`
    );
  }

  return (await response.json()) as InvokeResult;
}

/**
 * Tabela de preços por modelo (USD por 1M de tokens), usada para estimar o
 * custo de cada chamada. Modelos fora da tabela (ex.: tier gratuito do Groq)
 * contam custo 0 — o número de tokens continua registrado.
 */
const MODEL_PRICES_USD_PER_MTOK: Array<{ match: RegExp; input: number; output: number }> = [
  { match: /claude-opus/i, input: 15, output: 75 },
  { match: /claude-(3-7-|3-5-)?sonnet/i, input: 3, output: 15 },
  { match: /claude-(3-5-)?haiku/i, input: 0.8, output: 4 },
  { match: /llama-?3\.3-70b|llama-?3-70b/i, input: 0.59, output: 0.79 },
  { match: /llama-?3\.1-8b|llama-?3-8b/i, input: 0.05, output: 0.08 },
  { match: /gemini-2\.5-flash/i, input: 0.3, output: 2.5 },
  { match: /gpt-oss-120b/i, input: 0.15, output: 0.6 },
];

export function estimateCostUsd(model: string, promptTokens: number, completionTokens: number): number {
  const price = MODEL_PRICES_USD_PER_MTOK.find((p) => p.match.test(model));
  if (!price) return 0;
  return (promptTokens * price.input + completionTokens * price.output) / 1_000_000;
}

/** Cotação USD→BRL usada só para exibir o custo estimado em reais na UI. */
export function usdBrlRate(): number {
  const raw = Number(process.env.USD_BRL_RATE);
  return Number.isFinite(raw) && raw > 0 ? raw : 5.5;
}

/**
 * Contadores de consumo de IA desde o boot do servidor (em memória) +
 * persistência agregada por dia/provedor/modelo em `ai_usage_daily`.
 * O acumulado histórico e o custo estimado ficam visíveis na Central de IA
 * e sobrevivem a restart — antes o consumo zerava a cada boot.
 */
const usageTotals = {
  desde: new Date().toISOString(),
  chamadas: 0,
  promptTokens: 0,
  completionTokens: 0,
  custoUsd: 0,
  porProvedor: {} as Record<
    string,
    { chamadas: number; promptTokens: number; completionTokens: number; custoUsd: number }
  >,
};

async function persistUsage(
  providerKind: string,
  model: string,
  promptTokens: number,
  completionTokens: number,
  custoUsd: number
) {
  try {
    // Import dinâmico para não criar ciclo _core/llm → db → _core.
    const [{ getDb }, { aiUsageDaily }, { sql }] = await Promise.all([
      import("../db"),
      import("../../drizzle/schema"),
      import("drizzle-orm"),
    ]);
    const db = await getDb().catch(() => null);
    if (!db) return;
    const dia = new Date().toISOString().slice(0, 10);
    await db
      .insert(aiUsageDaily)
      .values({
        dia,
        provider: providerKind,
        model,
        chamadas: 1,
        promptTokens,
        completionTokens,
        custoUsd: custoUsd.toFixed(6),
      })
      .onDuplicateKeyUpdate({
        set: {
          chamadas: sql`${aiUsageDaily.chamadas} + 1`,
          promptTokens: sql`${aiUsageDaily.promptTokens} + ${promptTokens}`,
          completionTokens: sql`${aiUsageDaily.completionTokens} + ${completionTokens}`,
          custoUsd: sql`${aiUsageDaily.custoUsd} + ${custoUsd.toFixed(6)}`,
        },
      });
  } catch {
    // Registrar consumo nunca pode derrubar a chamada de IA em si.
  }
}

function recordUsage(provider: LlmProvider, result: InvokeResult) {
  usageTotals.chamadas += 1;
  const u = result.usage;
  const promptTokens = u?.prompt_tokens ?? 0;
  const completionTokens = u?.completion_tokens ?? 0;
  const model = result.model || provider.model;
  const custoUsd = estimateCostUsd(model, promptTokens, completionTokens);
  const porProv = (usageTotals.porProvedor[provider.kind] ??= {
    chamadas: 0,
    promptTokens: 0,
    completionTokens: 0,
    custoUsd: 0,
  });
  porProv.chamadas += 1;
  usageTotals.promptTokens += promptTokens;
  usageTotals.completionTokens += completionTokens;
  usageTotals.custoUsd += custoUsd;
  porProv.promptTokens += promptTokens;
  porProv.completionTokens += completionTokens;
  porProv.custoUsd += custoUsd;
  void persistUsage(provider.kind, model, promptTokens, completionTokens, custoUsd);
}

export function getUsageTotals() {
  return usageTotals;
}

/**
 * Invoca o LLM com resiliência: erro transitório (429/5xx/timeout/rede) tenta
 * mais uma vez no mesmo provedor e depois cai para o próximo configurado.
 * Um pico de rate-limit no tier gratuito do Groq deixa de perder a extração.
 */
export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  const providers = orderedProviders();
  if (providers.length === 0) {
    resolveProvider(); // lança o erro padrão "nenhum provedor configurado"
  }

  let lastError: unknown;
  for (const provider of providers) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const result = await invokeProvider(provider, params);
        recordUsage(provider, result);
        return result;
      } catch (err) {
        lastError = err;
        if (!isTransientLlmError(err)) {
          throw err; // erro de payload/schema/autorização: retry não ajuda
        }
        logger.warn(
          `[LLM] ${provider.kind} falhou (tentativa ${attempt}/2): ${(err as Error).message.slice(0, 200)}`
        );
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 1500 * attempt));
        }
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("LLM invoke failed em todos os provedores configurados");
}

/**
 * Faz o parse tolerante do JSON devolvido por um LLM: aceita resposta com
 * cerca de markdown (```json ... ```) ou texto ao redor do objeto/array.
 * Lança se não houver JSON válido.
 */
export function parseLlmJson<T = unknown>(raw: string): T {
  const text = raw.trim();
  try {
    return JSON.parse(text) as T;
  } catch {
    // segue para as heurísticas
  }
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim()) as T;
    } catch {
      // segue para o recorte bruto
    }
  }
  const firstBrace = Math.min(
    ...["{", "["].map((c) => (text.indexOf(c) === -1 ? Infinity : text.indexOf(c)))
  );
  const lastBrace = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
  if (firstBrace !== Infinity && lastBrace > firstBrace) {
    return JSON.parse(text.slice(firstBrace, lastBrace + 1)) as T;
  }
  throw new Error("Resposta do LLM não contém JSON válido");
}
