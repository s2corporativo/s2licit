import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { once } from "node:events";
import { afterEach, describe, expect, it } from "vitest";
import { externalHttpRequest, resetIntegrationCircuits } from "./externalHttpClient";

interface TestServer {
  url: string;
  close: () => Promise<void>;
}

async function startServer(
  handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>,
): Promise<TestServer> {
  const server = createServer((request, response) => {
    void Promise.resolve(handler(request, response)).catch((error) => {
      response.statusCode = 500;
      response.end(error instanceof Error ? error.message : String(error));
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Servidor de teste não recebeu porta TCP.");
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: async () => {
      server.close();
      await once(server, "close");
    },
  };
}

const openServers: TestServer[] = [];

afterEach(async () => {
  resetIntegrationCircuits();
  await Promise.all(openServers.splice(0).map((server) => server.close().catch(() => undefined)));
});

describe("externalHttpRequest", () => {
  it("does not retry a non-idempotent POST", async () => {
    let calls = 0;
    const server = await startServer((_request, response) => {
      calls += 1;
      response.statusCode = 503;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ error: "temporary" }));
    });
    openServers.push(server);

    const result = await externalHttpRequest({
      source: "test",
      operation: "post.non-idempotent",
      url: `${server.url}/send`,
      method: "POST",
      body: JSON.stringify({ value: 1 }),
      headers: { "content-type": "application/json" },
      expected: "json",
      maxRetries: 5,
      timeoutMs: 2_000,
      deadlineMs: 5_000,
      networkPolicy: "allow-private",
    });

    expect(result.ok).toBe(false);
    expect(result.attempts).toBe(1);
    expect(calls).toBe(1);
  });

  it("retries an idempotent GET on transient upstream failure", async () => {
    let calls = 0;
    const server = await startServer((_request, response) => {
      calls += 1;
      response.setHeader("content-type", "application/json");
      if (calls === 1) {
        response.statusCode = 503;
        response.end(JSON.stringify({ error: "temporary" }));
        return;
      }
      response.statusCode = 200;
      response.end(JSON.stringify({ ok: true }));
    });
    openServers.push(server);

    const result = await externalHttpRequest<{ ok: boolean }>({
      source: "test",
      operation: "get.retry",
      url: `${server.url}/resource`,
      expected: "json",
      maxRetries: 2,
      timeoutMs: 2_000,
      deadlineMs: 8_000,
      networkPolicy: "allow-private",
      validator: (payload) => {
        if (!payload || typeof payload !== "object" || (payload as { ok?: unknown }).ok !== true) {
          throw new Error("invalid contract");
        }
        return { ok: true };
      },
    });

    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ ok: true });
    expect(result.attempts).toBe(2);
    expect(calls).toBe(2);
  });

  it("fails closed when the runtime contract validator rejects the payload", async () => {
    const server = await startServer((_request, response) => {
      response.statusCode = 200;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ renamedField: "drift" }));
    });
    openServers.push(server);

    const result = await externalHttpRequest<{ requiredField: string }>({
      source: "test",
      operation: "contract.validation",
      url: `${server.url}/contract`,
      expected: "json",
      maxRetries: 0,
      timeoutMs: 2_000,
      deadlineMs: 3_000,
      networkPolicy: "allow-private",
      validator: (payload) => {
        const value = (payload as { requiredField?: unknown })?.requiredField;
        if (typeof value !== "string") throw new Error("requiredField missing");
        return { requiredField: value };
      },
    });

    expect(result.ok).toBe(false);
    expect(result.error?.type).toBe("CONTRACT");
    expect(result.error?.code).toBe("CONTRACT_VALIDATION_FAILED");
  });

  it("aborts responses that exceed maxBodyBytes", async () => {
    const server = await startServer((_request, response) => {
      const body = "x".repeat(32 * 1024);
      response.statusCode = 200;
      response.setHeader("content-type", "text/plain");
      response.setHeader("content-length", String(Buffer.byteLength(body)));
      response.end(body);
    });
    openServers.push(server);

    const result = await externalHttpRequest<string>({
      source: "test",
      operation: "body.limit",
      url: `${server.url}/large`,
      expected: "text",
      maxRetries: 0,
      timeoutMs: 2_000,
      deadlineMs: 3_000,
      maxBodyBytes: 4 * 1024,
      networkPolicy: "allow-private",
    });

    expect(result.ok).toBe(false);
    expect(result.error?.type).toBe("CONTRACT");
    expect(result.error?.code).toBe("BODY_TOO_LARGE");
  });
});
