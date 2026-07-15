import { describe, expect, it } from "vitest";
import {
  maskNotificationDestination,
  validateNotificationDestination,
} from "./notificationService";

describe("segurança dos canais de notificação", () => {
  it("aceita e normaliza destinatário de e-mail", () => {
    expect(validateNotificationDestination("email", " COMPRAS@EXAMPLE.COM ")).toBe(
      "compras@example.com",
    );
  });

  it("rejeita texto que não seja e-mail", () => {
    expect(() => validateNotificationDestination("email", "https://example.com")).toThrow(
      "Endereço de e-mail inválido",
    );
  });

  it("aceita somente webhook HTTPS oficial do Slack", () => {
    expect(
      validateNotificationDestination(
        "slack",
        "https://hooks.slack.com/services/T000/B000/SECRET",
      ),
    ).toContain("hooks.slack.com/services/");

    expect(() =>
      validateNotificationDestination("slack", "http://hooks.slack.com/services/test"),
    ).toThrow("HTTPS");
    expect(() =>
      validateNotificationDestination("slack", "http://127.0.0.1:3000/admin"),
    ).toThrow();
    expect(() =>
      validateNotificationDestination("slack", "https://example.com/webhook"),
    ).toThrow("webhook oficial do Slack");
  });

  it("oculta o token do Slack ao serializar para a interface", () => {
    const original = "https://hooks.slack.com/services/T000/B000/SECRET";
    const masked = maskNotificationDestination("slack", original);
    expect(masked).toBe("https://hooks.slack.com/••••••••");
    expect(masked).not.toContain("SECRET");
  });
});
