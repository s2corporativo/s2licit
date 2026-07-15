import { afterEach, describe, expect, it } from "vitest";
import {
  configuredEnvironmentNames,
  getIntegrationStatuses,
} from "./integrationStatusService";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) delete process.env[key];
  }
  Object.assign(process.env, ORIGINAL_ENV);
});

describe("integrationStatusService", () => {
  it("retorna apenas nomes de variáveis configuradas, sem seus valores", () => {
    process.env.IMAP_HOST = "mail.example.test";
    process.env.IMAP_USER = "user@example.test";
    process.env.IMAP_PASSWORD = "valor-que-nao-pode-ser-retornado";

    const names = configuredEnvironmentNames();

    expect(names).toContain("IMAP_HOST");
    expect(names).toContain("IMAP_USER");
    expect(names).toContain("IMAP_PASSWORD");
    expect(JSON.stringify(names)).not.toContain("valor-que-nao-pode-ser-retornado");
  });

  it("reconhece WhatsApp por webhook sem exigir configuração da Meta", () => {
    delete process.env.WHATSAPP_PHONE_ID;
    delete process.env.WHATSAPP_TOKEN;
    process.env.WHATSAPP_WEBHOOK_URL = "https://example.test/webhook";
    process.env.WHATSAPP_TO = "5531999999999";

    const whatsapp = getIntegrationStatuses().find((item) => item.code === "whatsapp");

    expect(whatsapp?.configured).toBe(true);
    expect(whatsapp?.mode).toBe("webhook");
  });

  it("não considera e-mail configurado quando falta autenticação", () => {
    process.env.IMAP_HOST = "imap.example.test";
    process.env.IMAP_USER = "user@example.test";
    delete process.env.IMAP_PASSWORD;
    process.env.SMTP_HOST = "smtp.example.test";
    process.env.SMTP_USER = "user@example.test";
    delete process.env.SMTP_PASSWORD;

    const statuses = getIntegrationStatuses();

    expect(statuses.find((item) => item.code === "imap")?.configured).toBe(false);
    expect(statuses.find((item) => item.code === "smtp")?.configured).toBe(false);
  });
});
