import { describe, expect, it, vi } from "vitest";
import {
  EXPECTED_TITLE,
  normalizeBaseUrl,
  validateS2Html,
  validateStatusPayload,
  verifyPublicS2,
} from "./verify-public-s2.mjs";

describe("verificador público do Sistema S2", () => {
  it("normaliza somente URLs HTTP/HTTPS", () => {
    expect(normalizeBaseUrl("https://s2.example.com/")).toBe("https://s2.example.com");
    expect(() => normalizeBaseUrl("ftp://s2.example.com")).toThrow("Protocolo inválido");
    expect(() => normalizeBaseUrl("")).toThrow("não informada");
  });

  it("rejeita HTML de outro site e aceita a identidade do S2", () => {
    expect(() => validateS2Html("<html><title>Site institucional</title></html>"))
      .toThrow("Título do S2 ausente");

    expect(validateS2Html(
      `<!doctype html><html><head><title>${EXPECTED_TITLE}</title></head><body><div id="root"></div></body></html>`,
    )).toBe(true);
  });

  it("exige JSON e status semântico correto nos endpoints", () => {
    expect(validateStatusPayload('{"status":"ok"}', "ok", "/healthz"))
      .toEqual({ status: "ok" });
    expect(() => validateStatusPayload("<html></html>", "ok", "/healthz"))
      .toThrow("não devolveu JSON");
    expect(() => validateStatusPayload('{"status":"not_ready"}', "ready", "/readyz"))
      .toThrow("esperado ready");
  });

  it("valida health, readiness e identidade em conjunto", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/healthz")) {
        return new Response('{"status":"ok"}', { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.endsWith("/readyz")) {
        return new Response('{"status":"ready","database":"ok"}', { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(
        `<!doctype html><html><head><title>${EXPECTED_TITLE}</title></head><body><div id="root"></div></body></html>`,
        { status: 200, headers: { "content-type": "text/html" } },
      );
    });

    const result = await verifyPublicS2({
      baseUrl: "https://s2.example.com",
      retries: 1,
      delayMs: 0,
      timeoutMs: 1000,
      fetchImpl,
    });

    expect(result.ok).toBe(true);
    expect(result.checks.map((check) => check.name)).toEqual(["health", "readiness", "identity"]);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("classifica como falha quando o domínio entrega o site institucional", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/healthz")) return new Response('{"status":"ok"}', { status: 200 });
      if (url.endsWith("/readyz")) return new Response('{"status":"ready"}', { status: 200 });
      return new Response("<html><title>S2 Corporativo</title><body>Site</body></html>", { status: 200 });
    });

    const result = await verifyPublicS2({
      baseUrl: "https://s2.example.com",
      retries: 1,
      delayMs: 0,
      timeoutMs: 1000,
      fetchImpl,
    });

    expect(result.ok).toBe(false);
    expect(result.checks.find((check) => check.name === "identity")?.attempts.at(-1)?.error)
      .toContain("Título do S2 ausente");
  });
});
