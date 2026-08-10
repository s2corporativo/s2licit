import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

async function source(relativePath: string): Promise<string> {
  return readFile(path.join(root, relativePath), "utf8");
}

function chromiumArgsContain(content: string, flag: string): boolean {
  const argsBlocks = content.match(/args\s*:\s*\[[\s\S]*?\]/g) ?? [];
  return argsBlocks.some((block) => block.includes(`"${flag}"`) || block.includes(`'${flag}'`));
}

describe("Integration Platform production readiness", () => {
  it("centralizes browser automation and never disables Chromium sandbox", async () => {
    const [foundation, institutional, renderer] = await Promise.all([
      source("server/services/portalOpportunitySyncService.ts"),
      source("server/services/s2PortalOpportunitySyncService.ts"),
      source("server/integrations/core/secureBrowserRenderer.ts"),
    ]);

    expect(foundation).not.toMatch(/from\s+["']puppeteer["']/);
    expect(institutional).not.toMatch(/from\s+["']puppeteer["']/);
    expect(foundation).toContain("renderPublicHtml");
    expect(institutional).toContain("renderPublicHtml");
    expect(renderer).toMatch(/from\s+["']puppeteer["']/);

    for (const [file, content] of [
      ["portalOpportunitySyncService.ts", foundation],
      ["s2PortalOpportunitySyncService.ts", institutional],
      ["secureBrowserRenderer.ts", renderer],
    ] as const) {
      expect(chromiumArgsContain(content, "--no-sandbox"), file).toBe(false);
      expect(chromiumArgsContain(content, "--disable-setuid-sandbox"), file).toBe(false);
    }
  });

  it("routes foundation HTTP/browser access through the integration platform", async () => {
    const content = await source("server/services/portalOpportunitySyncService.ts");
    expect(content).not.toMatch(/from\s+["']axios["']/);
    expect(content).not.toMatch(/from\s+["']puppeteer["']/);
    expect(content).toContain("externalHttpRequest");
    expect(content).toContain("renderPublicHtml");
    expect(content).toContain("db.transaction");
  });

  it("never treats an async SMTP configuration check as a boolean", async () => {
    const files = [
      "server/routers/emailQuotations.ts",
      "server/routers/proposals.ts",
    ];
    for (const file of files) {
      const content = await source(file);
      expect(content, `${file} must await isSmtpConfigured()`).not.toMatch(/if\s*\(\s*!\s*isSmtpConfigured\s*\(\s*\)\s*\)/);
    }
  });

  it("does not mutate process.env as runtime integration state", async () => {
    const files = [
      "server/integrations/core/credentialResolver.ts",
      "server/services/integrationSettingsService.ts",
      "server/services/aiConfigService.ts",
      "server/services/emailConfigService.ts",
    ];
    for (const file of files) {
      const content = await source(file);
      expect(content).not.toMatch(/process\.env\s*\[[^\]]+\]\s*=/);
      expect(content).not.toMatch(/delete\s+process\.env/);
    }
  });

  it("ships a real migration for integration_cache and registers it in the production journal", async () => {
    const [migration, journal] = await Promise.all([
      source("drizzle/0016_integration_cache.sql"),
      source("drizzle/meta/_journal.json"),
    ]);
    expect(migration).toContain("CREATE TABLE `integration_cache`");
    expect(migration).toContain("uq_integration_cache_source_operation_key");
    expect(journal).toContain('"tag": "0016_integration_cache"');
  });

  it("does not silently acknowledge IMAP before business persistence", async () => {
    const [inbox, sync] = await Promise.all([
      source("server/services/emailInboxService.ts"),
      source("server/services/emailQuotationSyncService.ts"),
    ]);
    expect(sync).toContain("acknowledgeEmailsSeen");
    expect(sync).toContain("db.transaction");
    const fetchFunction = inbox.match(/export async function fetchUnseenEmails[\s\S]*?\n}\n\n/)?.[0] ?? "";
    expect(fetchFunction).not.toContain("messageFlagsAdd");
  });
});
