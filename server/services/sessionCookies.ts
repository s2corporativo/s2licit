/**
 * sessionCookies.ts
 *
 * Conversão entre os cookies do Puppeteer e o formato armazenado no cofre de
 * sessões (SupplierSessionService guarda Record<nome, valor>). Base para o
 * reuso de sessão do scraper (§4: renovação/reuso de sessão), evitando novo
 * login a cada execução.
 *
 * Puro e testável (sem Puppeteer nem I/O).
 */

export interface PuppeteerCookieLike {
  name: string;
  value: string;
}

export interface PuppeteerSetCookie {
  name: string;
  value: string;
  url: string;
}

/** Converte os cookies do navegador para o formato de armazenamento (nome→valor). */
export function puppeteerCookiesToRecord(
  cookies: PuppeteerCookieLike[] | null | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!Array.isArray(cookies)) return out;
  for (const c of cookies) {
    if (c && typeof c.name === "string" && c.name && typeof c.value === "string") {
      out[c.name] = c.value;
    }
  }
  return out;
}

/**
 * Converte o Record armazenado de volta para cookies aplicáveis via
 * page.setCookie. Como o formato guarda apenas nome→valor (sem domínio/path),
 * cada cookie é aplicado à URL alvo.
 */
export function recordToPuppeteerCookies(
  record: Record<string, string> | null | undefined,
  url: string,
): PuppeteerSetCookie[] {
  if (!record || !url) return [];
  return Object.entries(record)
    .filter(([name, value]) => name && typeof value === "string")
    .map(([name, value]) => ({ name, value, url }));
}
