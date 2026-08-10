import { logger } from "./logger";
import {
  getAiRuntimeConfig,
  resolveCredential,
} from "../integrations/core/credentialResolver";
import { externalHttpRequest } from "../integrations/core/externalHttpClient";

export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type TextContent = { type: "text"; text: string };
export type ImageContent = {
  type: "image_url";
  image_url: { url: string; detail?: "auto" | "low" | "high" };
};
export type FileContent = {
  type: "file_url";
  file_url: {
    url: string;
    mime_type?: "audio/mpeg" | "audio/wav" | "application/pdf" | "audio/mp4" | "video/mp4";
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
  function: { name: string };
};
export type ToolChoice = ToolChoicePrimitive | ToolChoiceByName | ToolChoiceExplicit;

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
  function: { name: string; arguments: string };
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

export type LlmProviderKind = "anthropic" | "groq" | "forge";

interface LlmProvider {
  kind: LlmProviderKind;
  url: string;
  apiKey: string;
  model: string;
  protocol: "anthropic-messages" | "openai-chat";
  jsonObjectOnly: boolean;
}

const ensureArray = (value: MessageContent | MessageContent[]): MessageContent[] =>
  Array.isArray(value) ? value : [value];

const normalizeContentPart = (part: MessageContent): TextContent | ImageContent | FileContent => {
  if (typeof part === "string") return { type: "text", text: part };
  return part;
};

const normalizeOpenAiMessage = (message: Message) => {
  const { role, name, tool_call_id, tool_calls } = message;
  if (role === "tool" || role === "function") {
    return {
      role,
      name,
      tool_call_id,
      content: ensureArray(message.content)
        .map((part) => (typeof part === "string" ? part : JSON.stringify(part)))
        .join("\n"),
    };
  }
  const contentParts = ensureArray(message.content).map(normalizeContentPart);
  if (contentParts.length === 1 && contentParts[0].type === "text") {
    return {
      role,
      name,
      content: contentParts[0].text,
      ...(tool_calls?.length ? { tool_calls } : {}),
    };
  }
  return {
    role,
    name,
    content: contentParts,
    ...(tool_calls?.length ? { tool_calls } : {}),
  };
};

function normalizeToolChoice(
  toolChoice: ToolChoice | undefined,
  tools: Tool[] | undefined,
): "none" | "auto" | ToolChoiceExplicit | undefined {
  if (!toolChoice) return undefined;
  if (toolChoice === "none" || toolChoice === "auto") return toolChoice;
  if (toolChoice === "required") {
    if (!tools?.length) throw new Error("tool_choice 'required' was provided but no tools were configured");
    if (tools.length > 1) {
      throw new Error("tool_choice 'required' needs a single tool or specify the tool name explicitly");
    }
    return { type: "function", function: { name: tools[0].function.name } };
  }
  if ("name" in toolChoice) {
    return { type: "function", function: { name: toolChoice.name } };
  }
  return toolChoice;
}

async function configuredProviders(): Promise<{ providers: LlmProvider[]; preference: string; timeoutMs: number }> {
  const config = await getAiRuntimeConfig();
  const providers: LlmProvider[] = [];
  if (config.anthropicApiKey) {
    providers.push({
      kind: "anthropic",
      url: "https://api.anthropic.com/v1/messages",
      apiKey: config.anthropicApiKey,
      model: config.anthropicModel,
      protocol: "anthropic-messages",
      jsonObjectOnly: false,
    });
  }
  if (config.groqApiKey) {
    providers.push({
      kind: "groq",
      url: "https://api.groq.com/openai/v1/chat/completions",
      apiKey: config.groqApiKey,
      model: config.groqModel,
      protocol: "openai-chat",
      jsonObjectOnly: true,
    });
  }
  if (config.forgeApiUrl && config.forgeApiKey) {
    providers.push({
      kind: "forge",
      url: `${config.forgeApiUrl.replace(/\/$/, "")}/v1/chat/completions`,
      apiKey: config.forgeApiKey,
      model: "gemini-2.5-flash",
      protocol: "openai-chat",
      jsonObjectOnly: false,
    });
  }
  return { providers, preference: config.provider, timeoutMs: config.timeoutMs };
}

function orderProviders(providers: LlmProvider[], preference: string): LlmProvider[] {
  const rank = (provider: LlmProvider) => {
    if (provider.kind === preference) return 0;
    if (provider.kind === "anthropic") return 1;
    if (provider.kind === "groq") return 2;
    return 3;
  };
  return [...providers].sort((a, b) => rank(a) - rank(b));
}

export async function listConfiguredProviders(): Promise<Array<{ kind: LlmProviderKind; model: string }>> {
  const { providers } = await configuredProviders();
  return providers.map(({ kind, model }) => ({ kind, model }));
}

export async function activeProvider(): Promise<LlmProvider | null> {
  const { providers, preference } = await configuredProviders();
  return orderProviders(providers, preference)[0] ?? null;
}

function normalizeResponseFormat({
  responseFormat,
  response_format,
  outputSchema,
  output_schema,
}: {
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
}): ResponseFormat | undefined {
  const explicit = responseFormat || response_format;
  if (explicit) {
    if (explicit.type === "json_schema" && !explicit.json_schema?.schema) {
      throw new Error("responseFormat json_schema requires a defined schema object");
    }
    return explicit;
  }
  const schema = outputSchema || output_schema;
  if (!schema) return undefined;
  if (!schema.name || !schema.schema) throw new Error("outputSchema requires both name and schema");
  return {
    type: "json_schema",
    json_schema: {
      name: schema.name,
      schema: schema.schema,
      ...(typeof schema.strict === "boolean" ? { strict: schema.strict } : {}),
    },
  };
}

function anthropicImageBlock(url: string): Record<string, unknown> {
  const dataUri = url.match(/^data:([^;,]+);base64,(.+)$/s);
  if (dataUri) {
    return {
      type: "image",
      source: { type: "base64", media_type: dataUri[1], data: dataUri[2] },
    };
  }
  return { type: "image", source: { type: "url", url } };
}

function anthropicContentBlocks(message: Message): Array<Record<string, unknown>> {
  const blocks: Array<Record<string, unknown>> = [];
  for (const part of ensureArray(message.content)) {
    if (typeof part === "string") blocks.push({ type: "text", text: part });
    else if (part.type === "text") blocks.push({ type: "text", text: part.text });
    else if (part.type === "image_url") blocks.push(anthropicImageBlock(part.image_url.url));
    else if (part.type === "file_url") {
      blocks.push({ type: "text", text: `[Arquivo fornecido: ${part.file_url.url}]` });
    }
  }
  if (message.role === "assistant" && message.tool_calls?.length) {
    for (const call of message.tool_calls) {
      let input: unknown = {};
      try {
        input = JSON.parse(call.function.arguments || "{}");
      } catch {
        input = { raw: call.function.arguments };
      }
      blocks.push({ type: "tool_use", id: call.id, name: call.function.name, input });
    }
  }
  return blocks;
}

function buildAnthropicConversation(messages: Message[]) {
  const systemParts: string[] = [];
  const converted: Array<{ role: "user" | "assistant"; content: Array<Record<string, unknown>> }> = [];

  for (const message of messages) {
    if (message.role === "system") {
      const text = ensureArray(message.content)
        .map((part) => (typeof part === "string" ? part : part.type === "text" ? part.text : ""))
        .filter(Boolean)
        .join("\n");
      if (text) systemParts.push(text);
      continue;
    }

    if (message.role === "tool" || message.role === "function") {
      const resultText = ensureArray(message.content)
        .map((part) => (typeof part === "string" ? part : JSON.stringify(part)))
        .join("\n");
      converted.push({
        role: "user",
        content: [{ type: "tool_result", tool_use_id: message.tool_call_id ?? message.name ?? "tool", content: resultText }],
      });
      continue;
    }

    converted.push({
      role: message.role === "assistant" ? "assistant" : "user",
      content: anthropicContentBlocks(message),
    });
  }

  return { system: systemParts.join("\n\n"), messages: converted };
}

function anthropicToolChoice(choice: ToolChoice | undefined, tools: Tool[] | undefined): Record<string, unknown> | undefined {
  if (!choice) return undefined;
  if (choice === "auto") return { type: "auto" };
  if (choice === "none") return { type: "none" };
  if (choice === "required") {
    if (!tools?.length) throw new Error("tool_choice 'required' was provided but no tools were configured");
    return tools.length === 1 ? { type: "tool", name: tools[0].function.name } : { type: "any" };
  }
  const name = "name" in choice ? choice.name : choice.function.name;
  return { type: "tool", name };
}

function anthropicJsonInstruction(format: ResponseFormat | undefined): string {
  if (!format || format.type === "text") return "";
  if (format.type === "json_object") {
    return "Responda exclusivamente com um objeto JSON válido, sem markdown ou texto adicional.";
  }
  return (
    "Responda exclusivamente com JSON válido que obedeça ao seguinte JSON Schema, sem markdown ou texto adicional:\n" +
    JSON.stringify(format.json_schema.schema)
  );
}

interface AnthropicResponse {
  id: string;
  model: string;
  content?: Array<
    | { type: "text"; text: string }
    | { type: "tool_use"; id: string; name: string; input: unknown }
    | Record<string, unknown>
  >;
  stop_reason?: string | null;
  usage?: { input_tokens?: number; output_tokens?: number };
}

function adaptAnthropicResponse(raw: AnthropicResponse, provider: LlmProvider): InvokeResult {
  const text = (raw.content ?? [])
    .filter((block): block is { type: "text"; text: string } => block.type === "text" && typeof (block as any).text === "string")
    .map((block) => block.text)
    .join("\n");
  const toolCalls: ToolCall[] = (raw.content ?? [])
    .filter((block): block is { type: "tool_use"; id: string; name: string; input: unknown } => block.type === "tool_use")
    .map((block) => ({
      id: block.id,
      type: "function" as const,
      function: { name: block.name, arguments: JSON.stringify(block.input ?? {}) },
    }));
  const input = raw.usage?.input_tokens ?? 0;
  const output = raw.usage?.output_tokens ?? 0;
  const finishReason =
    raw.stop_reason === "tool_use"
      ? "tool_calls"
      : raw.stop_reason === "max_tokens"
        ? "length"
        : raw.stop_reason === "end_turn" || raw.stop_reason === "stop_sequence"
          ? "stop"
          : raw.stop_reason ?? null;
  return {
    id: raw.id || `anthropic-${Date.now()}`,
    created: Math.floor(Date.now() / 1000),
    model: raw.model || provider.model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: text,
          ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
        },
        finish_reason: finishReason,
      },
    ],
    usage: {
      prompt_tokens: input,
      completion_tokens: output,
      total_tokens: input + output,
    },
  };
}

async function invokeAnthropicProvider(
  provider: LlmProvider,
  params: InvokeParams,
  timeoutMs: number,
): Promise<InvokeResult> {
  const conversation = buildAnthropicConversation(params.messages);
  const format = normalizeResponseFormat(params);
  const jsonInstruction = anthropicJsonInstruction(format);
  const payload: Record<string, unknown> = {
    model: provider.model,
    max_tokens: Math.min(params.maxTokens ?? params.max_tokens ?? 8192, 32768),
    messages: conversation.messages,
  };
  const system = [conversation.system, jsonInstruction].filter(Boolean).join("\n\n");
  if (system) payload.system = system;
  if (params.tools?.length) {
    payload.tools = params.tools.map((tool) => ({
      name: tool.function.name,
      description: tool.function.description,
      input_schema: tool.function.parameters ?? { type: "object", properties: {} },
    }));
    const choice = anthropicToolChoice(params.toolChoice || params.tool_choice, params.tools);
    if (choice) payload.tool_choice = choice;
  }

  const response = await externalHttpRequest<AnthropicResponse>({
    source: "anthropic",
    operation: "messages.create",
    url: provider.url,
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": provider.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(payload),
    expected: "json",
    timeoutMs,
    maxRetries: 0,
    idempotent: false,
    maxBodyBytes: 10 * 1024 * 1024,
  });
  if (!response.ok || !response.data) {
    throw new Error(
      `Anthropic Messages API falhou${response.statusCode ? ` (${response.statusCode})` : ""}: ${response.error?.message ?? "resposta inválida"}`,
    );
  }
  return adaptAnthropicResponse(response.data, provider);
}

async function invokeOpenAiProvider(
  provider: LlmProvider,
  params: InvokeParams,
  timeoutMs: number,
): Promise<InvokeResult> {
  const payload: Record<string, unknown> = {
    model: provider.model,
    messages: params.messages.map(normalizeOpenAiMessage),
    max_tokens: Math.min(params.maxTokens ?? params.max_tokens ?? 8192, 32768),
  };
  if (params.tools?.length) payload.tools = params.tools;
  const choice = normalizeToolChoice(params.toolChoice || params.tool_choice, params.tools);
  if (choice) payload.tool_choice = choice;
  if (provider.kind === "forge") payload.thinking = { budget_tokens: 128 };

  let format = normalizeResponseFormat(params);
  if (format?.type === "json_schema" && provider.jsonObjectOnly) format = { type: "json_object" };
  if (format) payload.response_format = format;

  const response = await externalHttpRequest<InvokeResult>({
    source: provider.kind,
    operation: "chat.completions.create",
    url: provider.url,
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify(payload),
    expected: "json",
    timeoutMs,
    maxRetries: 0,
    idempotent: false,
    maxBodyBytes: 10 * 1024 * 1024,
  });
  if (!response.ok || !response.data) {
    throw new Error(
      `${provider.kind} LLM falhou${response.statusCode ? ` (${response.statusCode})` : ""}: ${response.error?.message ?? "resposta inválida"}`,
    );
  }
  return response.data;
}

async function invokeProvider(provider: LlmProvider, params: InvokeParams, timeoutMs: number): Promise<InvokeResult> {
  return provider.protocol === "anthropic-messages"
    ? invokeAnthropicProvider(provider, params, timeoutMs)
    : invokeOpenAiProvider(provider, params, timeoutMs);
}

function isTransientLlmError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /\b(408|429|500|502|503|504|529)\b|timeout|fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN|circuit breaker/i.test(msg);
}

const MODEL_PRICES_USD_PER_MTOK: Array<{ match: RegExp; input: number; output: number }> = [
  { match: /claude-opus-4/i, input: 15, output: 75 },
  { match: /claude-sonnet-4/i, input: 3, output: 15 },
  { match: /claude-(3-7-|3-5-)?sonnet/i, input: 3, output: 15 },
  { match: /claude-(3-5-)?haiku/i, input: 0.8, output: 4 },
  { match: /llama-?3\.3-70b|llama-?3-70b/i, input: 0.59, output: 0.79 },
  { match: /llama-?3\.1-8b|llama-?3-8b/i, input: 0.05, output: 0.08 },
  { match: /gemini-2\.5-flash/i, input: 0.3, output: 2.5 },
  { match: /gpt-oss-120b/i, input: 0.15, output: 0.6 },
];

export function estimateCostUsd(model: string, promptTokens: number, completionTokens: number): number {
  const price = MODEL_PRICES_USD_PER_MTOK.find((entry) => entry.match.test(model));
  if (!price) return 0;
  return (promptTokens * price.input + completionTokens * price.output) / 1_000_000;
}

export async function usdBrlRate(): Promise<number> {
  const raw = Number((await resolveCredential("USD_BRL_RATE")) ?? "");
  return Number.isFinite(raw) && raw > 0 ? raw : 5.5;
}

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
  custoUsd: number,
) {
  try {
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
    // Telemetria de consumo nunca derruba a chamada principal.
  }
}

function recordUsage(provider: LlmProvider, result: InvokeResult) {
  usageTotals.chamadas += 1;
  const usage = result.usage;
  const promptTokens = usage?.prompt_tokens ?? 0;
  const completionTokens = usage?.completion_tokens ?? 0;
  const model = result.model || provider.model;
  const custoUsd = estimateCostUsd(model, promptTokens, completionTokens);
  const providerTotals = (usageTotals.porProvedor[provider.kind] ??= {
    chamadas: 0,
    promptTokens: 0,
    completionTokens: 0,
    custoUsd: 0,
  });
  providerTotals.chamadas += 1;
  usageTotals.promptTokens += promptTokens;
  usageTotals.completionTokens += completionTokens;
  usageTotals.custoUsd += custoUsd;
  providerTotals.promptTokens += promptTokens;
  providerTotals.completionTokens += completionTokens;
  providerTotals.custoUsd += custoUsd;
  void persistUsage(provider.kind, model, promptTokens, completionTokens, custoUsd);
}

export function getUsageTotals() {
  return usageTotals;
}

/**
 * Gateway único de IA. Faz retry controlado apenas para erros transitórios e,
 * depois, fallback para outro provedor configurado. Cada protocolo fica isolado
 * no adapter correspondente.
 */
export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  const { providers, preference, timeoutMs } = await configuredProviders();
  const ordered = orderProviders(providers, preference);
  if (!ordered.length) {
    throw new Error(
      "Nenhum provedor de IA configurado. Cadastre Anthropic ou Groq na Central de Integrações.",
    );
  }

  let lastError: unknown;
  for (const provider of ordered) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const result = await invokeProvider(provider, params, timeoutMs);
        recordUsage(provider, result);
        return result;
      } catch (err) {
        lastError = err;
        if (!isTransientLlmError(err)) throw err;
        logger.warn(
          `[LLM] ${provider.kind} falhou (tentativa ${attempt}/2): ${(err as Error).message.slice(0, 200)}`,
        );
        if (attempt < 2) {
          const delay = 1_000 * attempt + Math.floor(Math.random() * 500);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Falha de IA em todos os provedores configurados.");
}

export function parseLlmJson<T = unknown>(raw: string): T {
  const text = raw.trim();
  try {
    return JSON.parse(text) as T;
  } catch {
    // segue para heurísticas tolerantes
  }
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim()) as T;
    } catch {
      // segue para recorte do primeiro JSON
    }
  }
  const firstBrace = Math.min(
    ...["{", "["].map((char) => (text.indexOf(char) === -1 ? Infinity : text.indexOf(char))),
  );
  const lastBrace = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
  if (firstBrace !== Infinity && lastBrace > firstBrace) {
    return JSON.parse(text.slice(firstBrace, lastBrace + 1)) as T;
  }
  throw new Error("Resposta do LLM não contém JSON válido");
}
