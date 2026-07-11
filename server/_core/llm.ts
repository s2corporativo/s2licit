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
  const { role, name, tool_call_id } = message;

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
    };
  }

  return {
    role,
    name,
    content: contentParts,
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

export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  const provider = resolveProvider();

  const {
    messages,
    tools,
    toolChoice,
    tool_choice,
    outputSchema,
    output_schema,
    responseFormat,
    response_format,
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

  payload.model = provider.model;
  payload.max_tokens = 32768;
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

  const response = await fetch(provider.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `LLM invoke failed: ${response.status} ${response.statusText} – ${errorText}`
    );
  }

  return (await response.json()) as InvokeResult;
}
