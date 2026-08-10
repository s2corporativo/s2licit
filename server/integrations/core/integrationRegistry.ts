import type { IntegrationDescriptor } from "./types";

const DEFINITIONS: IntegrationDescriptor[] = [
  {
    code: "pncp",
    label: "PNCP",
    group: "compras_publicas",
    transport: "REST_API",
    stability: "OFFICIAL",
    documentationUrl: "https://pncp.gov.br/manual/pt-br/latest/",
    critical: true,
  },
  {
    code: "comprasgov",
    label: "Compras.gov.br",
    group: "compras_publicas",
    transport: "REST_API",
    stability: "OFFICIAL",
    documentationUrl: "https://www.gov.br/compras/pt-br/cidadao/portal-de-dados-abertos/portal-de-dados-abertos",
    critical: true,
  },
  {
    code: "brasilapi",
    label: "BrasilAPI",
    group: "infraestrutura",
    transport: "REST_API",
    stability: "STABLE",
    documentationUrl: "https://brasilapi.com.br/docs",
  },
  {
    code: "fiemg",
    label: "Sistema S / FIEMG",
    group: "compras_publicas",
    transport: "HTML_SOURCE",
    stability: "UNSTABLE",
    configuredBy: ["FIEMG_LICITACOES_URL"],
  },
  {
    code: "fundep",
    label: "FUNDEP",
    group: "compras_publicas",
    transport: "HTML_SOURCE",
    stability: "UNSTABLE",
  },
  {
    code: "funarbe",
    label: "FUNARBE",
    group: "compras_publicas",
    transport: "HTML_SOURCE",
    stability: "UNSTABLE",
  },
  {
    code: "cemig",
    label: "CEMIG",
    group: "compras_publicas",
    transport: "HTML_SOURCE",
    stability: "UNSTABLE",
  },
  {
    code: "copasa",
    label: "COPASA",
    group: "compras_publicas",
    transport: "HTML_SOURCE",
    stability: "UNSTABLE",
  },
  {
    code: "comprasmg",
    label: "Compras MG",
    group: "compras_publicas",
    transport: "HTML_SOURCE",
    stability: "UNSTABLE",
  },
  {
    code: "imap",
    label: "Recebimento de e-mails",
    group: "comunicacao",
    transport: "IMAP",
    stability: "STABLE",
    configuredBy: ["IMAP_HOST", "IMAP_USER", "IMAP_PASSWORD"],
  },
  {
    code: "smtp",
    label: "Envio de e-mails",
    group: "comunicacao",
    transport: "SMTP",
    stability: "STABLE",
    configuredBy: ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD"],
  },
  {
    code: "whatsapp",
    label: "WhatsApp",
    group: "comunicacao",
    transport: "WEBHOOK",
    stability: "STABLE",
    configuredBy: ["WHATSAPP_TO"],
  },
  {
    code: "anthropic",
    label: "Anthropic Claude",
    group: "ia",
    transport: "LLM",
    stability: "OFFICIAL",
    configuredBy: ["ANTHROPIC_API_KEY"],
    documentationUrl: "https://docs.anthropic.com/en/api/messages",
  },
  {
    code: "groq",
    label: "Groq",
    group: "ia",
    transport: "LLM",
    stability: "OFFICIAL",
    configuredBy: ["GROQ_API_KEY"],
  },
  {
    code: "forge",
    label: "Forge",
    group: "ia",
    transport: "LLM",
    stability: "EXPERIMENTAL",
    configuredBy: ["BUILT_IN_FORGE_API_URL", "BUILT_IN_FORGE_API_KEY"],
  },
];

const REGISTRY = new Map(DEFINITIONS.map((definition) => [definition.code, Object.freeze(definition)]));

export function listIntegrations(): IntegrationDescriptor[] {
  return Array.from(REGISTRY.values());
}

export function getIntegrationDescriptor(code: string): IntegrationDescriptor | undefined {
  return REGISTRY.get(code);
}

export function integrationLabel(code: string): string {
  return REGISTRY.get(code)?.label ?? code;
}
