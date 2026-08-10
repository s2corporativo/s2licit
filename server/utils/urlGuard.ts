import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
]);

const BLOCKED_HOST_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".lan",
  ".home",
];

function parseIpv4(address: string): [number, number, number, number] | null {
  const match = address.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return null;

  const octets = match.slice(1).map(Number);
  if (octets.some((value) => value < 0 || value > 255)) return null;
  return octets as [number, number, number, number];
}

function isNonPublicIpv4(address: string): boolean {
  const parsed = parseIpv4(address);
  if (!parsed) return false;

  const [a, b, c] = parsed;

  if (a === 0) return true;
  if (a === 10) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0 && c === 0) return true;
  if (a === 192 && b === 0 && c === 2) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 198 && b === 51 && c === 100) return true;
  if (a === 203 && b === 0 && c === 113) return true;
  if (a >= 224) return true;

  return false;
}

function normalizeIpv6(address: string): string {
  return address
    .replace(/^\[|\]$/g, "")
    .split("%")[0]
    .toLowerCase();
}

function isNonPublicIpv6(address: string): boolean {
  const normalized = normalizeIpv6(address);
  if (!normalized.includes(":")) return false;

  if (normalized === "::" || normalized === "::1") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (/^fe[89ab]/.test(normalized)) return true;
  if (normalized.startsWith("ff")) return true;
  if (normalized.startsWith("2001:db8:")) return true;

  const mapped = normalized.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped) return isNonPublicIpv4(mapped[1]);

  return false;
}

export function isNonPublicIpAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isNonPublicIpv4(address);
  if (family === 6) return isNonPublicIpv6(address);
  return true;
}

function assertPublicHostname(hostname: string, context: string): void {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (!host) throw new Error(`${context} sem hostname.`);

  if (
    BLOCKED_HOSTNAMES.has(host) ||
    BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))
  ) {
    throw new Error(
      `${context} aponta para hostname interno/privado (${host}) — bloqueada por segurança.`,
    );
  }

  if (isIP(host) && isNonPublicIpAddress(host)) {
    throw new Error(
      `${context} aponta para endereço não público (${host}) — bloqueada por segurança.`,
    );
  }
}

/** Validação sintática/estática. Para requests server-side, use também a variante DNS. */
export function assertSafeExternalUrl(rawUrl: string, context = "URL"): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    // Não ecoar a entrada: URLs inválidas podem conter tokens/segredos em texto livre.
    throw new Error(`${context} inválida.`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(
      `${context} com protocolo não permitido (${url.protocol}) — use http/https.`,
    );
  }

  if (url.username || url.password) {
    throw new Error(`${context} não pode conter credenciais embutidas.`);
  }

  assertPublicHostname(url.hostname, context);
  return url;
}

/**
 * Resolve o hostname e rejeita o destino se QUALQUER endereço retornado for
 * loopback, privado, link-local, CGNAT, documentação, multicast ou reservado.
 * Rejeitar respostas mistas evita esconder IP interno entre A/AAAA públicos.
 */
export async function assertSafeExternalUrlResolved(
  rawUrl: string,
  context = "URL",
): Promise<URL> {
  const url = assertSafeExternalUrl(rawUrl, context);
  const host = url.hostname.toLowerCase();

  if (isIP(host)) {
    if (isNonPublicIpAddress(host)) {
      throw new Error(
        `${context} resolve para endereço não público (${host}) — bloqueada por segurança.`,
      );
    }
    return url;
  }

  let addresses: Awaited<ReturnType<typeof lookup>>;
  try {
    addresses = await lookup(host, { all: true, verbatim: true });
  } catch (error) {
    throw new Error(
      `${context} não pôde resolver DNS para ${host}: ${(error as Error).message}`,
    );
  }

  if (!Array.isArray(addresses) || addresses.length === 0) {
    throw new Error(`${context} não possui endereço DNS resolvível (${host}).`);
  }

  for (const entry of addresses) {
    if (isNonPublicIpAddress(entry.address)) {
      throw new Error(
        `${context} resolve para endereço não público (${entry.address}) — bloqueada por segurança.`,
      );
    }
  }

  return url;
}
