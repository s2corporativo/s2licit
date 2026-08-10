import type { IntegrationErrorPayload, IntegrationErrorType, IntegrationResultStatus } from "./types";

export class IntegrationError extends Error {
  readonly type: IntegrationErrorType;
  readonly retryable: boolean;
  readonly upstreamStatus?: number;
  readonly code?: string;

  constructor(
    message: string,
    options: {
      type?: IntegrationErrorType;
      retryable?: boolean;
      upstreamStatus?: number;
      code?: string;
      cause?: unknown;
    } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "IntegrationError";
    this.type = options.type ?? "UNKNOWN";
    this.retryable = options.retryable ?? false;
    this.upstreamStatus = options.upstreamStatus;
    this.code = options.code;
  }

  toPayload(): IntegrationErrorPayload {
    return {
      type: this.type,
      message: this.message,
      retryable: this.retryable,
      upstreamStatus: this.upstreamStatus,
      code: this.code,
    };
  }
}

export function classifyHttpFailure(status: number, message?: string): IntegrationError {
  const text = message || `Falha HTTP ${status}`;
  if (status === 401) {
    return new IntegrationError(text, { type: "AUTHENTICATION", upstreamStatus: status });
  }
  if (status === 403) {
    return new IntegrationError(text, { type: "AUTHORIZATION", upstreamStatus: status });
  }
  if (status === 404) {
    return new IntegrationError(text, { type: "NOT_FOUND", upstreamStatus: status });
  }
  if (status === 408 || status === 504) {
    return new IntegrationError(text, { type: "TIMEOUT", retryable: true, upstreamStatus: status });
  }
  if (status === 429) {
    return new IntegrationError(text, { type: "RATE_LIMIT", retryable: true, upstreamStatus: status });
  }
  if (status >= 500) {
    return new IntegrationError(text, { type: "UPSTREAM", retryable: true, upstreamStatus: status });
  }
  return new IntegrationError(text, { type: "UPSTREAM", upstreamStatus: status });
}

export function classifyThrownError(error: unknown): IntegrationError {
  if (error instanceof IntegrationError) return error;
  const err = error instanceof Error ? error : new Error(String(error));
  if (err.name === "AbortError" || /timeout|timed out|ETIMEDOUT/i.test(err.message)) {
    return new IntegrationError(err.message || "Timeout", {
      type: "TIMEOUT",
      retryable: true,
      cause: error,
    });
  }
  if (/ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|fetch failed|network/i.test(err.message)) {
    return new IntegrationError(err.message, {
      type: "NETWORK",
      retryable: true,
      cause: error,
    });
  }
  return new IntegrationError(err.message || "Falha desconhecida na integração", {
    type: "UNKNOWN",
    cause: error,
  });
}

export function statusFromError(error: IntegrationError): IntegrationResultStatus {
  switch (error.type) {
    case "AUTHENTICATION":
    case "AUTHORIZATION":
      return "AUTH_ERROR";
    case "RATE_LIMIT":
      return "RATE_LIMITED";
    case "TIMEOUT":
      return "TIMEOUT";
    case "CONTRACT":
    case "PARSE":
      return "CONTRACT_ERROR";
    case "CONFIGURATION":
      return "CONFIG_ERROR";
    case "NETWORK":
    case "UPSTREAM":
    case "UNKNOWN":
      return "UNAVAILABLE";
    case "NOT_FOUND":
      return "NO_RESULTS";
    default:
      return "UNAVAILABLE";
  }
}
