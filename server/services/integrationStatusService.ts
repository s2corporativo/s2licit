import { activeProvider, listConfiguredProviders } from "../_core/llm";
import { isImapConfigured } from "./emailInboxService";
import { isSmtpConfigured } from "./emailSenderService";
import { isWhatsappConfigured } from "./whatsappService";

export type IntegrationCode = "ai" | "imap" | "smtp" | "whatsapp";

export interface IntegrationStatus {
  code: IntegrationCode;
  label: string;
  configured: boolean;
  detail: string;
  expectedConfiguration: string[];
  mode?: string;
}

export function getIntegrationStatuses(): IntegrationStatus[] {
  const providers = listConfiguredProviders();
  const active = activeProvider();
  const whatsappMode = process.env.WHATSAPP_WEBHOOK_URL
    ? "webhook"
    : process.env.WHATSAPP_PHONE_ID && process.env.WHATSAPP_TOKEN
      ? "Meta Cloud API"
      : undefined;

  return [
    {
      code: "ai",
      label: "Inteligência Artificial",
      configured: providers.length > 0,
      detail: providers.length
        ? `Ativo: ${active?.kind ?? "automático"}. Disponíveis: ${providers
            .map((provider) => `${provider.kind} (${provider.model})`)
            .join(", ")}.`
        : "Nenhum provedor de IA foi disponibilizado ao container.",
      expectedConfiguration: ["GROQ_API_KEY ou ANTHROPIC_API_KEY"],
      mode: active?.kind,
    },
    {
      code: "imap",
      label: "Recebimento de cotações",
      configured: isImapConfigured(),
      detail: isImapConfigured()
        ? `Leitura automática habilitada para ${process.env.IMAP_USER ?? "a conta configurada"}.`
        : "A leitura automática de e-mails está desabilitada.",
      expectedConfiguration: ["EMAIL_USER", "EMAIL_PASSWORD"],
      mode: process.env.IMAP_HOST,
    },
    {
      code: "smtp",
      label: "Envio de propostas",
      configured: isSmtpConfigured(),
      detail: isSmtpConfigured()
        ? `Envio habilitado com remetente ${process.env.SMTP_FROM || process.env.SMTP_USER}.`
        : "O envio automático de propostas por e-mail está desabilitado.",
      expectedConfiguration: ["EMAIL_USER", "EMAIL_PASSWORD"],
      mode: process.env.SMTP_HOST,
    },
    {
      code: "whatsapp",
      label: "Alertas por WhatsApp",
      configured: isWhatsappConfigured(),
      detail: isWhatsappConfigured()
        ? `Alertas habilitados via ${whatsappMode}.`
        : "Os alertas permanecem no sistema, mas não são encaminhados ao WhatsApp.",
      expectedConfiguration:
        whatsappMode === "webhook"
          ? ["WHATSAPP_WEBHOOK_URL", "WHATSAPP_TO"]
          : ["WHATSAPP_PHONE_ID", "WHATSAPP_TOKEN", "WHATSAPP_TO"],
      mode: whatsappMode,
    },
  ];
}

/**
 * Retorna somente nomes de variáveis presentes no processo. O valor nunca é
 * serializado, registrado ou devolvido ao navegador.
 */
export function configuredEnvironmentNames(): string[] {
  const names = [
    "DATABASE_URL",
    "JWT_SECRET",
    "ENCRYPTION_KEY",
    "ADMIN_PASSWORD",
    "GROQ_API_KEY",
    "ANTHROPIC_API_KEY",
    "BUILT_IN_FORGE_API_URL",
    "BUILT_IN_FORGE_API_KEY",
    "IMAP_HOST",
    "IMAP_USER",
    "IMAP_PASSWORD",
    "SMTP_HOST",
    "SMTP_USER",
    "SMTP_PASSWORD",
    "WHATSAPP_PHONE_ID",
    "WHATSAPP_TOKEN",
    "WHATSAPP_WEBHOOK_URL",
    "WHATSAPP_TO",
    "PRODEMGE_API_KEY",
  ];
  return names.filter((name) => Boolean(process.env[name]?.trim())).sort();
}
