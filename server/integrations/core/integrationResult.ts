import { randomUUID } from "node:crypto";
import { IntegrationError, statusFromError } from "./integrationError";
import type { IntegrationMetadata, IntegrationResult, IntegrationResultStatus } from "./types";

export function successResult<T>(input: {
  source: string;
  operation: string;
  data: T;
  startedAt: number;
  requestId?: string;
  status?: IntegrationResultStatus;
  metadata?: IntegrationMetadata;
}): IntegrationResult<T> {
  const emptyArray = Array.isArray(input.data) && input.data.length === 0;
  return {
    source: input.source,
    operation: input.operation,
    status: input.status ?? (emptyArray ? "NO_RESULTS" : "SUCCESS"),
    data: input.data,
    fetchedAt: new Date(),
    durationMs: Math.max(0, Date.now() - input.startedAt),
    requestId: input.requestId ?? randomUUID(),
    metadata: input.metadata,
  };
}

export function failureResult<T>(input: {
  source: string;
  operation: string;
  data: T;
  startedAt: number;
  error: IntegrationError;
  requestId?: string;
  metadata?: IntegrationMetadata;
}): IntegrationResult<T> {
  return {
    source: input.source,
    operation: input.operation,
    status: statusFromError(input.error),
    data: input.data,
    fetchedAt: new Date(),
    durationMs: Math.max(0, Date.now() - input.startedAt),
    requestId: input.requestId ?? randomUUID(),
    error: input.error.toPayload(),
    metadata: input.metadata,
  };
}
