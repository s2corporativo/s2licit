import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@sentry/node", () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

import * as Sentry from "@sentry/node";
import { initSentry, reportError, sentryEnabled, _resetForTests } from "./sentry";
import { logger } from "./logger";

describe("sentry gated", () => {
  beforeEach(() => {
    _resetForTests();
    vi.clearAllMocks();
    delete process.env.SENTRY_DSN;
  });

  afterEach(() => {
    _resetForTests();
    delete process.env.SENTRY_DSN;
  });

  it("sem SENTRY_DSN é no-op completo", () => {
    initSentry();
    expect(sentryEnabled()).toBe(false);
    expect(Sentry.init).not.toHaveBeenCalled();

    reportError("falha qualquer", new Error("boom"));
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it("com DSN inicializa sem PII e encaminha Error como exceção", () => {
    process.env.SENTRY_DSN = "https://chave@exemplo.ingest.sentry.io/1";
    initSentry();
    expect(sentryEnabled()).toBe(true);
    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({ dsn: process.env.SENTRY_DSN, sendDefaultPii: false }),
    );

    const erro = new Error("boom");
    reportError("contexto", erro);
    expect(Sentry.captureException).toHaveBeenCalledWith(erro, { extra: { message: "contexto" } });
  });

  it("logger.error alimenta o Sentry com o Error original (ponto único)", () => {
    process.env.SENTRY_DSN = "https://chave@exemplo.ingest.sentry.io/1";
    initSentry();

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const erro = new Error("job falhou");
    logger.error("[Scheduler] tick com falha", erro);
    consoleSpy.mockRestore();

    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect(Sentry.captureException).toHaveBeenCalledWith(erro, expect.anything());
  });

  it("logger.error sem DSN não toca o Sentry", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    logger.error("[Scheduler] tick com falha", new Error("job falhou"));
    consoleSpy.mockRestore();

    expect(Sentry.captureException).not.toHaveBeenCalled();
  });
});
