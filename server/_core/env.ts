import crypto from "crypto";
import fs from "fs";
import { logger } from "./logger";

const isProduction = process.env.NODE_ENV === "production";

/**
 * Lê um segredo do ambiente com suporte a Docker/Compose secrets: se
 * `NOME_FILE` estiver definido, o valor é lido do arquivo apontado (padrão
 * `/run/secrets/...`) — a chave-mestra não precisa viver em variável de
 * ambiente visível em `docker inspect`.
 */
function readSecret(name: string): string {
  const filePath = process.env[`${name}_FILE`];
  if (filePath) {
    try {
      return fs.readFileSync(filePath, "utf-8").trim();
    } catch (err) {
      logger.error(`[ENV] Falha ao ler ${name}_FILE (${filePath}):`, err);
      return "";
    }
  }
  return process.env[name] ?? "";
}

/**
 * Em desenvolvimento, sem JWT_SECRET definido, gera um segredo aleatório
 * por processo (sessões não sobrevivem a restart — aceitável em dev).
 * Em produção a ausência é erro fatal: nunca assinar sessão com segredo
 * vazio ou previsível.
 */
function resolveCookieSecret(): string {
  const configured = readSecret("JWT_SECRET");
  if (configured.length >= 32) return configured;

  if (isProduction) {
    throw new Error(
      "[ENV] JWT_SECRET é obrigatório em produção (mínimo 32 caracteres). " +
        "Gere um com: openssl rand -base64 48"
    );
  }

  if (configured) {
    logger.warn(
      "[ENV] JWT_SECRET tem menos de 32 caracteres — usando segredo aleatório de desenvolvimento."
    );
  } else {
    logger.warn(
      "[ENV] JWT_SECRET não definido — usando segredo aleatório de desenvolvimento (sessões expiram a cada restart)."
    );
  }
  return crypto.randomBytes(48).toString("base64");
}

function warnIfMissingInProduction(name: string, value: string, hint: string) {
  if (isProduction && !value) {
    logger.warn(`[ENV] ${name} não definido em produção — ${hint}`);
  }
}

const databaseUrl = readSecret("DATABASE_URL");
const encryptionKey = readSecret("ENCRYPTION_KEY");

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
  // Só com este interruptor o boot sobrescreve a senha de um admin que já tem
  // senha definida. Sem ele, uma troca feita na tela de usuários sobrevive ao
  // restart (antes era desfeita silenciosamente a cada boot).
  adminPasswordForceReset: process.env.ADMIN_PASSWORD_FORCE_RESET === "true",
  // DESATIVA autenticação completamente. Com AUTH_DISABLED=true, qualquer
  // requisição é aceita como admin. Usar SOMENTE em desenvolvimento sem dados
  // sensíveis. NUNCA use em produção.
  authDisabled: process.env.AUTH_DISABLED === "true",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  anthropicModel: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5",
  groqApiKey: process.env.GROQ_API_KEY ?? "",
  groqModel: process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile",
  // Provedor de IA preferido: "anthropic" | "groq" | "auto" (padrão)
  aiProvider: (process.env.AI_PROVIDER ?? "auto").toLowerCase(),
};

// Guarda: AUTH_DISABLED=true não é permitido em produção
if (ENV.authDisabled && ENV.isProduction) {
  throw new Error(
    "[ENV] AUTH_DISABLED=true não é permitido em produção. " +
    "Remova a flag do .env ou defina NODE_ENV=development."
  );
}
