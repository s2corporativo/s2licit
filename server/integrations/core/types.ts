export type IntegrationResultStatus =
  | "SUCCESS"
  | "PARTIAL"
  | "NO_RESULTS"
  | "UNAVAILABLE"
  | "TIMEOUT"
  | "RATE_LIMITED"
  | "AUTH_ERROR"
  | "CONTRACT_ERROR"
  | "CONFIG_ERROR";

export type IntegrationErrorType =
  | "AUTHENTICATION"
  | "AUTHORIZATION"
  | "RATE_LIMIT"
  | "TIMEOUT"
  | "NETWORK"
  | "UPSTREAM"
  | "CONTRACT"
  | "PARSE"
  | "NOT_FOUND"
  | "CONFIGURATION"
  | "UNKNOWN";

export interface IntegrationErrorPayload {
  type: IntegrationErrorType;
  message: string;
  retryable: boolean;
  upstreamStatus?: number;
  code?: string;
}

export interface IntegrationMetadata {
  pages?: number;
  records?: number;
  sourceTotalPages?: number;
  sourceTotalRecords?: number;
  cached?: boolean;
  partial?: boolean;
  attempts?: number;
  schemaVersion?: string;
  sourceUrl?: string;
  payloadHash?: string;
}

export interface IntegrationResult<T> {
  source: string;
  operation: string;
  status: IntegrationResultStatus;
  data: T;
  fetchedAt: Date;
  durationMs: number;
  requestId: string;
  error?: IntegrationErrorPayload;
  metadata?: IntegrationMetadata;
}

export type IntegrationTransport =
  | "REST_API"
  | "HTML_SOURCE"
  | "BROWSER_AUTOMATION"
  | "SMTP"
  | "IMAP"
  | "LLM"
  | "WEBHOOK";

export type IntegrationStability = "OFFICIAL" | "STABLE" | "UNSTABLE" | "EXPERIMENTAL";

export interface IntegrationDescriptor {
  code: string;
  label: string;
  group: "compras_publicas" | "comunicacao" | "ia" | "fornecedores" | "infraestrutura";
  transport: IntegrationTransport;
  stability: IntegrationStability;
  configuredBy?: string[];
  documentationUrl?: string;
  critical?: boolean;
}

export interface IntegrationHealthSnapshot {
  code: string;
  label: string;
  configured: boolean;
  state: "NOT_CONFIGURED" | "CONFIGURED" | "CONNECTED" | "HEALTHY" | "DEGRADED" | "DOWN" | "CONTRACT_DRIFT";
  detail: string;
  checkedAt: Date;
  latencyMs?: number;
  lastSuccessAt?: Date | null;
  errors24h?: number;
  transport: IntegrationTransport;
  stability: IntegrationStability;
}

/**
 * `public-only` é o padrão seguro: cada hop HTTP/redirect é validado e hosts
 * locais/privados são bloqueados. `allow-private` deve ser explícito e restrito
 * a integrações administradas que realmente precisem alcançar uma rede interna.
 */
export type ExternalNetworkPolicy = "public-only" | "allow-private";

export interface ExternalHttpRequest {
  source: string;
  operation: string;
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: BodyInit | null;
  /** Timeout máximo de uma tentativa individual. */
  timeoutMs?: number;
  /** Orçamento total da operação, incluindo retries e backoff. */
  deadlineMs?: number;
  maxRetries?: number;
  /** Redirecionamentos GET/HEAD seguidos manualmente e validados. */
  maxRedirects?: number;
  accept?: string;
  expected?: "json" | "text" | "any";
  /** Operações com efeito colateral só recebem retry quando explicitamente idempotentes. */
  idempotent?: boolean;
  /** Limite de leitura do corpo. Evita carregar respostas acidentalmente gigantes. */
  maxBodyBytes?: number;
  /** Política de acesso de rede; por padrão somente destinos públicos. */
  networkPolicy?: ExternalNetworkPolicy;
}

export interface ExternalHttpResponse<T = unknown> {
  ok: boolean;
  source: string;
  operation: string;
  requestId: string;
  statusCode: number;
  contentType: string;
  data: T | null;
  text: string;
  fetchedAt: Date;
  durationMs: number;
  attempts: number;
  finalUrl?: string;
  error?: IntegrationErrorPayload;
}
