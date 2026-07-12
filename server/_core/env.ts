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
  // Identificador da aplicação embutido no token de sessão. Era uma variável
  // da plataforma Manus (VITE_APP_ID); fora dela precisa de um valor padrão
  // NÃO VAZIO, senão verifySession rejeita toda sessão (exige appId não-vazio)
  // e o login "correto" nunca entra. O valor só precisa ser consistente.
  appId: process.env.VITE_APP_ID || "s2licit",
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
  groqApiKey: process.env.GROQ_API_KEY ?? "",
  groqModel: process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile",
  // Provedor de IA preferido: "anthropic" | "groq" | "auto" (padrão)
  aiProvider: (process.env.AI_PROVIDER ?? "auto").toLowerCase(),
};
