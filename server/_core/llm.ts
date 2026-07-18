import { ENV } from "./env";

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

function anthropicProvider(): LlmProvider | null {
  if (!ENV.anthropicApiKey) return null;
  return {
    kind: "anthropic",
    url: "https://api.anthropic.com/v1/chat/completions",
    apiKey: ENV.anthropicApiKey,
    model: ENV.anthropicModel,
    jsonObjectOnly: false,
  };
}
function groqProvider(): LlmProvider | null {
  if (!ENV.groqApiKey) return null;
  return {
    kind: "groq",
    url: "https://api.groq.com/openai/v1/chat/completions",
    apiKey: ENV.groqApiKey,
    model: ENV.groqModel,
    jsonObjectOnly: true,
  };
}
function forgeProvider(): LlmProvider | null {
  if (!ENV.forgeApiUrl || !ENV.forgeApiKey) return null;
  return {
    kind: "forge",
    url: `${ENV.forgeApiUrl.replace(/\/$/, "")}/v1/chat/completions`,
    apiKey: ENV.forgeApiKey,
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
  const pref = ENV.aiProvider;
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
  const pref = ENV.aiProvider;
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
 * Contadores de consumo de IA desde o boot do servidor (em memória).
 * Dão visibilidade de uso/custo na Central de IA — antes o campo `usage`
 * retornado pelos provedores era simplesmente descartado.
 */
const usageTotals = {
  desde: new Date().toISOString(),
  chamadas: 0,
  promptTokens: 0,
  completionTokens: 0,
  porProvedor: {} as Record<string, { chamadas: number; promptTokens: number; completionTokens: number }>,
};

function recordUsage(providerKind: string, result: InvokeResult) {
  usageTotals.chamadas += 1;
  const u = result.usage;
  const porProv = (usageTotals.porProvedor[providerKind] ??= {
    chamadas: 0,
    promptTokens: 0,
    completionTokens: 0,
  });
  porProv.chamadas += 1;
  if (u) {
    usageTotals.promptTokens += u.prompt_tokens ?? 0;
    usageTotals.completionTokens += u.completion_tokens ?? 0;
    porProv.promptTokens += u.prompt_tokens ?? 0;
    porProv.completionTokens += u.completion_tokens ?? 0;
  }
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
        recordUsage(provider.kind, result);
        return result;
      } catch (err) {
        lastError = err;
        if (!isTransientLlmError(err)) {
          throw err; // erro de payload/schema/autorização: retry não ajuda
        }
        console.warn(
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
