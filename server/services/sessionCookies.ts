/**
 * sessionCookies.ts
 *
 * Serialização retrocompatível de cookies do Puppeteer. O formato v2 guarda
 * domínio/path/expiração/SameSite/Secure/HttpOnly para reaproveitar sessões
 * autenticadas modernas sem transformar todo cookie em um par nome→valor preso
 * à URL de login. Registros legados continuam funcionando normalmente.
 */

export const COOKIE_JAR_V2_KEY = "__s2_cookie_jar_v2__";

export type CaptureCookieSameSite = "Strict" | "Lax" | "None" | "Default";

export interface PuppeteerCookieLike {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  session?: boolean;
  sameSite?: CaptureCookieSameSite;
  priority?: "Low" | "Medium" | "High";
  /** Metadado legado/depreciado: preservado no jar, mas não reenviado ao Puppeteer. */
  sameParty?: boolean;
  sourceScheme?: "Unset" | "NonSecure" | "Secure";
  /** Metadado de leitura do CDP; não pertence a CookieParam e não é restaurado. */
  sourcePort?: number;
}

/** Subconjunto compatível com Puppeteer CookieParam. */
export interface PuppeteerSetCookie {
  name: string;
  value: string;
  url?: string;
  domain?: string;
  path?: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: CaptureCookieSameSite;
  priority?: "Low" | "Medium" | "High";
  sourceScheme?: "Unset" | "NonSecure" | "Secure";
}

function validCookie(cookie: unknown): cookie is PuppeteerCookieLike {
  if (!cookie || typeof cookie !== "object") return false;
  const value = cookie as Partial<PuppeteerCookieLike>;
  return (
    typeof value.name === "string" &&
    value.name.length > 0 &&
    typeof value.value === "string"
  );
}

function compactCookie(cookie: PuppeteerCookieLike): PuppeteerCookieLike {
  const result: PuppeteerCookieLike = {
    name: cookie.name,
    value: cookie.value,
  };
  if (cookie.domain) result.domain = cookie.domain;
  if (cookie.path) result.path = cookie.path;
  if (
    typeof cookie.expires === "number" &&
    Number.isFinite(cookie.expires) &&
    cookie.expires > 0
  ) {
    result.expires = cookie.expires;
  }
  if (typeof cookie.httpOnly === "boolean") result.httpOnly = cookie.httpOnly;
  if (typeof cookie.secure === "boolean") result.secure = cookie.secure;
  if (cookie.sameSite) result.sameSite = cookie.sameSite;
  if (cookie.priority) result.priority = cookie.priority;
  if (typeof cookie.sameParty === "boolean") result.sameParty = cookie.sameParty;
  if (cookie.sourceScheme) result.sourceScheme = cookie.sourceScheme;
  if (
    typeof cookie.sourcePort === "number" &&
    Number.isFinite(cookie.sourcePort)
  ) {
    result.sourcePort = cookie.sourcePort;
  }
  return result;
}

/**
 * Mantém pares nome→valor para compatibilidade e adiciona, em uma chave
 * reservada, o cookie jar v2 completo. O campo inteiro continua criptografado
 * pelo SupplierSessionService.
 */
export function puppeteerCookiesToRecord(
  cookies: readonly PuppeteerCookieLike[] | null | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!Array.isArray(cookies)) return out;

  const jar: PuppeteerCookieLike[] = [];
  for (const cookie of cookies) {
    if (!validCookie(cookie)) continue;
    out[cookie.name] = cookie.value;
    jar.push(compactCookie(cookie));
  }
  if (jar.some((cookie) => Object.keys(cookie).length > 2)) {
    out[COOKIE_JAR_V2_KEY] = JSON.stringify(jar);
  }
  return out;
}

function parseJar(record: Record<string, string>): PuppeteerCookieLike[] | null {
  const raw = record[COOKIE_JAR_V2_KEY];
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const valid = parsed.filter(validCookie).map(compactCookie);
    return valid.length ? valid : null;
  } catch {
    return null;
  }
}

/**
 * Restaura somente propriedades aceitas pelo CookieParam atual. Metadados de
 * leitura/depreciados (sameParty/sourcePort) permanecem armazenados para
 * auditoria/compatibilidade, mas não são enviados de volta ao navegador.
 */
export function recordToPuppeteerCookies(
  record: Record<string, string> | null | undefined,
  url: string,
): PuppeteerSetCookie[] {
  if (!record || !url) return [];
  const jar = parseJar(record);

  if (jar) {
    return jar.map((cookie) => {
      const restored: PuppeteerSetCookie = {
        name: cookie.name,
        value: cookie.value,
      };
      if (cookie.domain) restored.domain = cookie.domain;
      else restored.url = url;
      if (cookie.path) restored.path = cookie.path;
      if (typeof cookie.expires === "number") restored.expires = cookie.expires;
      if (typeof cookie.httpOnly === "boolean") restored.httpOnly = cookie.httpOnly;
      if (typeof cookie.secure === "boolean") restored.secure = cookie.secure;
      if (cookie.sameSite) restored.sameSite = cookie.sameSite;
      if (cookie.priority) restored.priority = cookie.priority;
      if (cookie.sourceScheme) restored.sourceScheme = cookie.sourceScheme;
      return restored;
    });
  }

  return Object.entries(record)
    .filter(
      ([name, value]) =>
        name &&
        name !== COOKIE_JAR_V2_KEY &&
        typeof value === "string",
    )
    .map(([name, value]) => ({ name, value, url }));
}

/** Usado quando uma sessão precisa virar cabeçalho Cookie para HTTP direto. */
export function cookieRecordToHeader(
  record: Record<string, string> | null | undefined,
): string {
  if (!record) return "";
  return Object.entries(record)
    .filter(
      ([name, value]) =>
        name &&
        name !== COOKIE_JAR_V2_KEY &&
        typeof value === "string",
    )
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}
