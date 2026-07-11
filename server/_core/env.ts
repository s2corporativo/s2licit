import crypto from "crypto";

const isProduction = process.env.NODE_ENV === "production";

/**
 * Em desenvolvimento, sem JWT_SECRET definido, gera um segredo aleatório
 * por processo (sessões não sobrevivem a restart — aceitável em dev).
 * Em produção a ausência é erro fatal: nunca assinar sessão com segredo
 * vazio ou previsível.
 */
function resolveCookieSecret(): string {
  const configured = process.env.JWT_SECRET ?? "";
  if (configured.length >= 32) return configured;

  if (isProduction) {
    throw new Error(
      "[ENV] JWT_SECRET é obrigatório em produção (mínimo 32 caracteres). " +
        "Gere um com: openssl rand -base64 48"
    );
  }

  if (configured) {
    console.warn(
      "[ENV] JWT_SECRET tem menos de 32 caracteres — usando segredo aleatório de desenvolvimento."
    );
  } else {
    console.warn(
      "[ENV] JWT_SECRET não definido — usando segredo aleatório de desenvolvimento (sessões expiram a cada restart)."
    );
  }
  return crypto.randomBytes(48).toString("base64");
}

function warnIfMissingInProduction(name: string, value: string, hint: string) {
  if (isProduction && !value) {
    console.warn(`[ENV] ${name} não definido em produção — ${hint}`);
  }
}

const databaseUrl = process.env.DATABASE_URL ?? "";
const encryptionKey = process.env.ENCRYPTION_KEY ?? "";

warnIfMissingInProduction(
  "DATABASE_URL",
  databaseUrl,
  "o sistema não conseguirá conectar ao banco."
);
warnIfMissingInProduction(
  "ENCRYPTION_KEY",
  encryptionKey,
  "credenciais de fornecedores não poderão ser criptografadas/descriptografadas."
);

export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: resolveCookieSecret(),
  databaseUrl,
  encryptionKey,
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction,
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  adminEmail: process.env.ADMIN_EMAIL ?? "",
  adminPassword: process.env.ADMIN_PASSWORD ?? "",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  anthropicModel: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5",
};
