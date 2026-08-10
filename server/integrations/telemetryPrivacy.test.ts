import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

async function externalClientSource(): Promise<string> {
  return readFile(path.join(root, "server/integrations/core/externalHttpClient.ts"), "utf8");
}

describe("integration telemetry privacy", () => {
  it("does not persist raw upstream response bodies on failed requests", async () => {
    const source = await externalClientSource();
    expect(source).not.toMatch(/success:\s*false,[\s\S]{0,500}?sample:\s*text\b/);
    expect(source).not.toMatch(/errorMessage:\s*[^\n]*redactText\(text\)/);
  });

  it("does not use an unsanitized arbitrary URL as the persisted request URL", async () => {
    const source = await externalClientSource();
    expect(source).toContain("redactUrl");
    // Webhook paths may themselves be bearer secrets. A production-safe
    // sanitizer must intentionally normalize/redact sensitive path material,
    // not only query parameters.
    expect(source).toMatch(/redact(?:Url|TelemetryUrl)[\s\S]*pathname/);
  });
});
