import { z } from "zod";
import { logger } from "./logger";
import {
  getAiRuntimeConfig,
  resolveCredential,
} from "../integrations/core/credentialResolver";
import { externalHttpRequest } from "../integrations/core/externalHttpClient";
import { IntegrationError } from "../integrations/core/integrationError";
import type { IntegrationErrorType } from "../integrations/core/types";

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
export type LlmProviderKind = "anthropic" | "groq" | "forge";

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
  provider?: LlmProviderKind;
  allowProviderFallback?: boolean;
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

interface LlmProvider {
  kind: LlmProviderKind;
  url: string;
  apiKey: string;
  model: string;
  protocol: "anthropic-messages" | "openai-chat";
  jsonObjectOnly: boolean;
}

interface ConfiguredProviderSet {
  providers: LlmProvider[];
  preference: "auto" | LlmProviderKind;
  timeoutMs: number;
}

const RoleSchema = z.enum(["system", "user", "assistant", "tool", "function"]);
const ToolCallSchema = z.object({
  id: z.string().min(1),
  type: z.literal("function"),
  function: z.object({
    name: z.string().min(1),
    arguments: z.string(),
  }),
}).passthrough();

const OpenAiContentPartSchema = z.union([
  z.object({ type: z.literal("text"), text: z.string() }).passthrough(),
  z.object({
    type: z.literal("image_url"),
    image_url: z.object({ url: z.string(), detail: z.enum(["auto", "low", "high"]).optional() }).passthrough(),
  }).passthrough(),
  z.object({
    type: z.literal("file_url"),
    file_url: z.object({ url: z.string(), mime_type: z.string().optional() }).passthrough(),
  }).passthrough(),
]);

const OpenAiResponseSchema = z.object({
  id: z.string().min(1),
  created: z.number().int().nonnegative().optional().default(() => Math.floor(Date.now() / 1000)),
  model: z.string().min(1),
  choices: z.array(z.object({
    index: z.number().int().nonnegative(),
    message: z.object({
      role: RoleSchema.optional().default("assistant"),
      content: z.union([z.string(), z.array(OpenAiContentPartSchema), z.null()]).optional().default(""),
      tool_calls: z.array(ToolCallSchema).optional(),
    }).passthrough(),
    finish_reason: z.string().nullable().optional().default(null),
  }).passthrough()).min(1),
  usage: z.object({
    prompt_tokens: z.number().int().nonnegative().optional().default(0),
    completion_tokens: z.number().int().nonnegative().optional().default(0),
    total_tokens: z.number().int().nonnegative().optional(),
  }).passthrough().optional(),
}).passthrough();

type OpenAiResponse = z.infer<typeof OpenAiResponseSchema>;

const AnthropicTextBlockSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
}).passthrough();
const AnthropicToolUseBlockSchema = z.object({
  type: z.literal("tool_use"),
  id: z.string().min(1),
  name: z.string().min(1),
  input: z.unknown(),
}).passthrough();
const AnthropicOtherBlockSchema = z.object({ type: z.string().min(1) }).passthrough();
const AnthropicResponseSchema = z.object({
  id: z.string().min(1),
  model: z.string().min(1),
  content: z.array(z.union([
    AnthropicTextBlockSchema,
    AnthropicToolUseBlockSchema,
    AnthropicOtherBlockSchema,
  ])).default([]),
  stop_reason: z.enum([
    "end_turn",
    "max_tokens",
    "stop_sequence",
    "tool_use",
    "pause_turn",
    "refusal",
    "model_context_window_exceeded",
  ]).nullable(),
  usage: z.object({
    input_tokens: z.number().int().nonnegative().optional().default(0),
    output_tokens: z.number().int().nonnegative().optional().default(0),
    cache_creation_input_tokens: z.number().int().nonnegative().optional(),
    cache_read_input_tokens: z.number().int().nonnegative().optional(),
  }).passthrough().optional(),
}).passthrough();

type AnthropicResponse = z.infer<typeof AnthropicResponseSchema>;

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
    if (tools.length > 1) throw new Error("tool_choice 'required' needs a single tool or specify the tool name explicitly");
    return { type: "function", function: { name: tools[0].function.name } };
  }
  if ("name" in toolChoice) return { type: "function", function: { name: toolChoice.name } };
  return toolChoice;
}

function normalizeProviderPreference(value: string): "auto" | LlmProviderKind {
  const normalized = value.trim().toLowerCase();
  if (normalized === "anthropic" || normalized === "groq" || normalized === "forge") return normalized;
  return "auto";
}

async function configuredProviders(): Promise<ConfiguredProviderSet> {
  const config = await getAiRuntimeConfig();
  const providers: LlmProvider[] = [];
  if (config.anthropicApiKey) providers.push({ kind: "anthropic", url: "https://api.anthropic.com/v1/messages", apiKey: config.anthropicApiKey, model: config.anthropicModel, protocol: "anthropic-messages", jsonObjectOnly: false });
  if (config.groqApiKey) providers.push({ kind: "groq", url: "https://api.groq.com/openai/v1/chat/completions", apiKey: config.groqApiKey, model: config.groqModel, protocol: "openai-chat", jsonObjectOnly: true });
  if (config.forgeApiUrl && config.forgeApiKey) providers.push({ kind: "forge", url: `${config.forgeApiUrl.replace(/\/$/, "")}/v1/chat/completions`, apiKey: config.forgeApiKey, model: "gemini-2.5-flash", protocol: "openai-chat", jsonObjectOnly: false });
  return { providers, preference: normalizeProviderPreference(config.provider), timeoutMs: config.timeoutMs };
}

function defaultProviderOrder(providers: LlmProvider[]): LlmProvider[] {
  const rank: Record<LlmProviderKind, number> = { anthropic: 0, groq: 1, forge: 2 };
  return [...providers].sort((a, b) => rank[a.kind] - rank[b.kind]);
}

function selectProviders(providers: LlmProvider[], preference: "auto" | LlmProviderKind, params: InvokeParams): LlmProvider[] {
  const target = params.provider ?? (preference === "auto" ? undefined : preference);
  if (!target) return defaultProviderOrder(providers);
  const selected = providers.find((provider) => provider.kind === target);
  if (!selected) throw new IntegrationError(`Provedor de IA ${target} não está configurado.`, { type: "CONFIGURATION", code: "LLM_PROVIDER_NOT_CONFIGURED" });
  const allowFallback = params.allowProviderFallback ?? (params.provider == null && preference === "auto");
  if (!allowFallback) return [selected];
  return [selected, ...defaultProviderOrder(providers).filter((provider) => provider.kind !== selected.kind)];
}

export async function listConfiguredProviders(): Promise<Array<{ kind: LlmProviderKind; model: string }>> {
  const { providers } = await configuredProviders();
  return providers.map(({ kind, model }) => ({ kind, model }));
}

export async function activeProvider(): Promise<{ kind: LlmProviderKind; model: string } | null> {
  const { providers, preference } = await configuredProviders();
  if (!providers.length) return null;
  if (preference === "auto") {
    const selected = defaultProviderOrder(providers)[0];
    return selected ? { kind: selected.kind, model: selected.model } : null;
  }
  const selected = providers.find((provider) => provider.kind === preference);
  return selected ? { kind: selected.kind, model: selected.model } : null;
}

function normalizeResponseFormat({ responseFormat, response_format, outputSchema, output_schema }: { responseFormat?: ResponseFormat; response_format?: ResponseFormat; outputSchema?: OutputSchema; output_schema?: OutputSchema }): ResponseFormat | undefined {
  const explicit = responseFormat || response_format;
  if (explicit) {
    if (explicit.type === "json_schema" && !explicit.json_schema?.schema) throw new Error("responseFormat json_schema requires a defined schema object");
    return explicit;
  }
  const schema = outputSchema || output_schema;
  if (!schema) return undefined;
  if (!schema.name || !schema.schema) throw new Error("outputSchema requires both name and schema");
  return { type: "json_schema", json_schema: { name: schema.name, schema: schema.schema, ...(typeof schema.strict === "boolean" ? { strict: schema.strict } : {}) } };
}

function anthropicImageBlock(url: string): Record<string, unknown> {
  const dataUri = url.match(/^data:([^;,]+);base64,(.+)$/s);
  return dataUri ? { type: "image", source: { type: "base64", media_type: dataUri[1], data: dataUri[2] } } : { type: "image", source: { type: "url", url } };
}

function anthropicContentBlocks(message: Message): Array<Record<string, unknown>> {
  const blocks: Array<Record<string, unknown>> = [];
  for (const part of ensureArray(message.content)) {
    if (typeof part === "string") blocks.push({ type: "text", text: part });
    else if (part.type === "text") blocks.push({ type: "text", text: part.text });
    else if (part.type === "image_url") blocks.push(anthropicImageBlock(part.image_url.url));
    else if (part.type === "file_url") throw new IntegrationError("O adapter Anthropic não aceita file_url genérico. Converta o arquivo para texto/imagem ou use o pipeline documental antes do LLM.", { type: "CONFIGURATION", code: "ANTHROPIC_FILE_URL_UNSUPPORTED" });
  }
  if (message.role === "assistant" && message.tool_calls?.length) {
    for (const call of message.tool_calls) {
      let input: unknown = {};
      try { input = JSON.parse(call.function.arguments || "{}"); } catch { input = { raw: call.function.arguments }; }
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
      const text = ensureArray(message.content).map((part) => (typeof part === "string" ? part : part.type === "text" ? part.text : "")).filter(Boolean).join("\n");
      if (text) systemParts.push(text);
      continue;
    }
    if (message.role === "tool" || message.role === "function") {
      const resultText = ensureArray(message.content).map((part) => (typeof part === "string" ? part : JSON.stringify(part))).join("\n");
      converted.push({ role: "user", content: [{ type: "tool_result", tool_use_id: message.tool_call_id ?? message.name ?? "tool", content: resultText }] });
      continue;
    }
    converted.push({ role: message.role === "assistant" ? "assistant" : "user", content: anthropicContentBlocks(message) });
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
  if (format.type === "json_object") return "Responda exclusivamente com um objeto JSON válido, sem markdown ou texto adicional.";
  return "Responda exclusivamente com JSON válido que obedeça ao seguinte JSON Schema, sem markdown ou texto adicional:\n" + JSON.stringify(format.json_schema.schema);
}

function adaptAnthropicResponse(raw: AnthropicResponse, provider: LlmProvider): InvokeResult {
  const textBlocks = raw.content.filter((block): block is z.infer<typeof AnthropicTextBlockSchema> => block.type === "text" && "text" in block && typeof block.text === "string");
  const toolBlocks = raw.content.filter((block): block is z.infer<typeof AnthropicToolUseBlockSchema> => block.type === "tool_use" && "id" in block && "name" in block);
  const toolCalls: ToolCall[] = toolBlocks.map((block) => ({ id: block.id, type: "function", function: { name: block.name, arguments: JSON.stringify(block.input ?? {}) } }));
  const inputTokens = raw.usage?.input_tokens ?? 0;
  const outputTokens = raw.usage?.output_tokens ?? 0;
  const finishReason = raw.stop_reason === "tool_use" ? "tool_calls" : raw.stop_reason === "max_tokens" || raw.stop_reason === "model_context_window_exceeded" ? "length" : raw.stop_reason === "end_turn" || raw.stop_reason === "stop_sequence" ? "stop" : raw.stop_reason === "refusal" ? "content_filter" : raw.stop_reason;
  return { id: raw.id, created: Math.floor(Date.now() / 1000), model: raw.model || provider.model, choices: [{ index: 0, message: { role: "assistant", content: textBlocks.map((block) => block.text).join("\n"), ...(toolCalls.length ? { tool_calls: toolCalls } : {}) }, finish_reason: finishReason }], usage: { prompt_tokens: inputTokens, completion_tokens: outputTokens, total_tokens: inputTokens + outputTokens } };
}

function adaptOpenAiResponse(raw: OpenAiResponse): InvokeResult {
  return { id: raw.id, created: raw.created, model: raw.model, choices: raw.choices.map((choice) => ({ index: choice.index, message: { role: choice.message.role, content: choice.message.content == null ? "" : choice.message.content as InvokeResult["choices"][number]["message"]["content"], ...(choice.message.tool_calls?.length ? { tool_calls: choice.message.tool_calls } : {}) }, finish_reason: choice.finish_reason })), ...(raw.usage ? { usage: { prompt_tokens: raw.usage.prompt_tokens, completion_tokens: raw.usage.completion_tokens, total_tokens: raw.usage.total_tokens ?? raw.usage.prompt_tokens + raw.usage.completion_tokens } } : {}) };
}

function responseIntegrationError(provider: LlmProvider, response: { statusCode: number; error?: { type: IntegrationErrorType; message: string; retryable: boolean; code?: string } }): IntegrationError {
  return new IntegrationError(`${provider.kind} LLM falhou${response.statusCode ? ` (${response.statusCode})` : ""}: ${response.error?.message ?? "resposta inválida"}`, { type: response.error?.type ?? "UPSTREAM", retryable: response.error?.retryable ?? false, upstreamStatus: response.statusCode || undefined, code: response.error?.code });
}

async function invokeAnthropicProvider(provider: LlmProvider, params: InvokeParams, timeoutMs: number): Promise<InvokeResult> {
  const conversation = buildAnthropicConversation(params.messages);
  const format = normalizeResponseFormat(params);
  const jsonInstruction = anthropicJsonInstruction(format);
  const payload: Record<string, unknown> = { model: provider.model, max_tokens: Math.min(params.maxTokens ?? params.max_tokens ?? 8192, 32768), messages: conversation.messages };
  const system = [conversation.system, jsonInstruction].filter(Boolean).join("\n\n");
  if (system) payload.system = system;
  if (params.tools?.length) {
    payload.tools = params.tools.map((tool) => ({ name: tool.function.name, description: tool.function.description, input_schema: tool.function.parameters ?? { type: "object", properties: {} } }));
    const choice = anthropicToolChoice(params.toolChoice || params.tool_choice, params.tools);
    if (choice) payload.tool_choice = choice;
  }
  const response = await externalHttpRequest<AnthropicResponse>({ source: "anthropic", operation: "messages.create", url: provider.url, method: "POST", headers: { "content-type": "application/json", "x-api-key": provider.apiKey, "anthropic-version": "2023-06-01" }, body: JSON.stringify(payload), expected: "json", timeoutMs, deadlineMs: timeoutMs, maxRetries: 0, idempotent: false, maxBodyBytes: 10 * 1024 * 1024, validator: (data) => AnthropicResponseSchema.parse(data) });
  if (!response.ok || !response.data) throw responseIntegrationError(provider, response);
  return adaptAnthropicResponse(response.data, provider);
}

async function invokeOpenAiProvider(provider: LlmProvider, params: InvokeParams, timeoutMs: number): Promise<InvokeResult> {
  const payload: Record<string, unknown> = { model: provider.model, messages: params.messages.map(normalizeOpenAiMessage), max_tokens: Math.min(params.maxTokens ?? params.max_tokens ?? 8192, 32768) };
  if (params.tools?.length) payload.tools = params.tools;
  const choice = normalizeToolChoice(params.toolChoice || params.tool_choice, params.tools);
  if (choice) payload.tool_choice = choice;
  if (provider.kind === "forge") payload.thinking = { budget_tokens: 128 };
  let format = normalizeResponseFormat(params);
  if (format?.type === "json_schema" && provider.jsonObjectOnly) format = { type: "json_object" };
  if (format) payload.response_format = format;
  const response = await externalHttpRequest<OpenAiResponse>({ source: provider.kind, operation: "chat.completions.create", url: provider.url, method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${provider.apiKey}` }, body: JSON.stringify(payload), expected: "json", timeoutMs, deadlineMs: timeoutMs, maxRetries: 0, idempotent: false, maxBodyBytes: 10 * 1024 * 1024, validator: (data) => OpenAiResponseSchema.parse(data) });
  if (!response.ok || !response.data) throw responseIntegrationError(provider, response);
  return adaptOpenAiResponse(response.data);
}

async function invokeProvider(provider: LlmProvider, params: InvokeParams, timeoutMs: number): Promise<InvokeResult> {
  return provider.protocol === "anthropic-messages" ? invokeAnthropicProvider(provider, params, timeoutMs) : invokeOpenAiProvider(provider, params, timeoutMs);
}

function isTransientLlmError(error: unknown): boolean {
  if (error instanceof IntegrationError) return error.retryable || ["TIMEOUT", "NETWORK", "UPSTREAM", "RATE_LIMIT"].includes(error.type);
  const message = error instanceof Error ? error.message : String(error);
  return /timeout|ECONNRESET|ETIMEDOUT|EAI_AGAIN|fetch failed/i.test(message);
}

const MODEL_PRICES_USD_PER_MTOK: Array<{ match: RegExp; input: number; output: number }> = [
  { match: /claude-sonnet-5/i, input: 3, output: 15 },
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

const usageTotals = { desde: new Date().toISOString(), chamadas: 0, promptTokens: 0, completionTokens: 0, custoUsd: 0, porProvedor: {} as Record<string, { chamadas: number; promptTokens: number; completionTokens: number; custoUsd: number }> };

async function persistUsage(providerKind: string, model: string, promptTokens: number, completionTokens: number, custoUsd: number): Promise<void> {
  try {
    const [{ getDb }, { aiUsageDaily }, { sql }] = await Promise.all([import("../db"), import("../../drizzle/schema"), import("drizzle-orm")]);
    const db = await getDb().catch(() => null);
    if (!db) return;
    const dia = new Date().toISOString().slice(0, 10);
    await db.insert(aiUsageDaily).values({ dia, provider: providerKind, model, chamadas: 1, promptTokens, completionTokens, custoUsd: custoUsd.toFixed(6) }).onDuplicateKeyUpdate({ set: { chamadas: sql`${aiUsageDaily.chamadas} + 1`, promptTokens: sql`${aiUsageDaily.promptTokens} + ${promptTokens}`, completionTokens: sql`${aiUsageDaily.completionTokens} + ${completionTokens}`, custoUsd: sql`${aiUsageDaily.custoUsd} + ${custoUsd.toFixed(6)}` } });
  } catch {
    // Telemetria de consumo nunca derruba a chamada principal.
  }
}

function recordUsage(provider: LlmProvider, result: InvokeResult): void {
  usageTotals.chamadas += 1;
  const usage = result.usage;
  const promptTokens = usage?.prompt_tokens ?? 0;
  const completionTokens = usage?.completion_tokens ?? 0;
  const model = result.model || provider.model;
  const custoUsd = estimateCostUsd(model, promptTokens, completionTokens);
  const providerTotals = (usageTotals.porProvedor[provider.kind] ??= { chamadas: 0, promptTokens: 0, completionTokens: 0, custoUsd: 0 });
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
  return { ...usageTotals, porProvedor: Object.fromEntries(Object.entries(usageTotals.porProvedor).map(([key, value]) => [key, { ...value }])) };
}

export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  const { providers, preference, timeoutMs } = await configuredProviders();
  const selectedProviders = selectProviders(providers, preference, params);
  if (!selectedProviders.length) throw new IntegrationError("Nenhum provedor de IA configurado. Cadastre Anthropic ou Groq na Central de Integrações.", { type: "CONFIGURATION", code: "NO_LLM_PROVIDER" });
  let lastError: unknown;
  for (const provider of selectedProviders) {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const result = await invokeProvider(provider, params, timeoutMs);
        recordUsage(provider, result);
        return result;
      } catch (error) {
        lastError = error;
        if (!isTransientLlmError(error)) throw error;
        logger.warn(`[LLM] ${provider.kind} falhou (tentativa ${attempt}/2): ${(error instanceof Error ? error.message : String(error)).slice(0, 200)}`);
        if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 1_000 * attempt + Math.floor(Math.random() * 500)));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Falha de IA em todos os provedores autorizados para esta chamada.");
}

export function parseLlmJson<T = unknown>(raw: string): T {
  const text = raw.trim();
  try { return JSON.parse(text) as T; } catch { /* segue */ }
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) { try { return JSON.parse(fenced[1].trim()) as T; } catch { /* segue */ } }
  const firstBrace = Math.min(...["{", "["].map((char) => (text.indexOf(char) === -1 ? Infinity : text.indexOf(char))));
  const lastBrace = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
  if (firstBrace !== Infinity && lastBrace > firstBrace) return JSON.parse(text.slice(firstBrace, lastBrace + 1)) as T;
  throw new Error("Resposta do LLM não contém JSON válido");
}
