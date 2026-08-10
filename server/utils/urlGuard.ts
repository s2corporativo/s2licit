import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Guarda de URLs externas para navegação automatizada (Puppeteer) e fetch de
 * conteúdo remoto. Bloqueia alvos internos (SSRF): localhost, IPs privados,
 * link-local, faixas reservadas e metadados de nuvem.
 */

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
]);

function parseIpv4(host: string): number[] | null {
  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return parts;
}

function isNonPublicIpv4(host: string): boolean {
  const parts = parseIpv4(host);
  if (!parts) return true;
  const [a, b, c] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function mappedIpv4(host: string): string | null {
  const normalized = host.toLowerCase().split("%")[0];
  const dotted = normalized.match(/^::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) return dotted[1];
  if (!normalized.startsWith("::ffff:")) return null;
  const tail = normalized.slice("::ffff:".length).split(":");
  if (tail.length !== 2) return null;
  const high = Number.parseInt(tail[0], 16);
  const low = Number.parseInt(tail[1], 16);
  if (!Number.isInteger(high) || !Number.isInteger(low) || high < 0 || high > 0xffff || low < 0 || low > 0xffff) return null;
  return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`;
}

function isNonPublicIpv6(host: string): boolean {
  const normalized = host.replace(/^\[|\]$/g, "").toLowerCase().split("%")[0];
  if (normalized === "::1" || normalized === "::") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (/^fe[89ab]/.test(normalized)) return true;
  if (normalized.startsWith("ff")) return true;
  if (normalized.startsWith("2001:db8:")) return true;
  if (normalized.startsWith("::ffff:") || /^::\d+\.\d+\.\d+\.\d+$/.test(normalized)) {
    const ipv4 = mappedIpv4(normalized);
    return ipv4 ? isNonPublicIpv4(ipv4) : true;
  }
  return false;
}

export function isNonPublicIp(address: string): boolean {
  const family = isIP(address.replace(/^\[|\]$/g, ""));
  if (family === 4) return isNonPublicIpv4(address);
  if (family === 6) return isNonPublicIpv6(address);
  return true;
}

/**
 * Validação sintática rápida, adequada antes de montar uma navegação. Não faz
 * I/O de DNS; para executar a requisição use `assertPublicExternalUrl`.
 */
export function assertSafeExternalUrl(rawUrl: string, context = "URL"): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`${context} inválida.`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${context} com protocolo não permitido (${url.protocol}) — use http/https`);
  }
  if (url.username || url.password) {
    throw new Error(`${context} não pode conter credenciais embutidas.`);
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (
    !host ||
    BLOCKED_HOSTNAMES.has(host) ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    (isIP(host) !== 0 && isNonPublicIp(host))
  ) {
    throw new Error(`${context} aponta para endereço interno/privado (${host}) — bloqueada por segurança`);
  }
  return url;
}

/**
 * Valida também todas as respostas DNS do host. Se qualquer endereço resolvido
 * não for público, a URL é recusada. Isso reduz DNS rebinding e aliases de rede
 * interna em browser automation.
 */
export async function assertPublicExternalUrl(rawUrl: string, context = "URL"): Promise<URL> {
  const url = assertSafeExternalUrl(rawUrl, context);
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (isIP(host)) return url;

  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await lookup(host, { all: true, verbatim: true });
  } catch (error) {
    throw new Error(`${context}: falha ao resolver DNS de ${host}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!addresses.length) throw new Error(`${context}: ${host} não resolveu para nenhum endereço.`);
  const blocked = addresses.find((entry) => isNonPublicIp(entry.address));
  if (blocked) {
    throw new Error(`${context}: ${host} resolveu para endereço não público (${blocked.address}) — bloqueada por segurança.`);
  }
  return url;
}
