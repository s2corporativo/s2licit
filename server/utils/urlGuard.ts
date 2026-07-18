/**
 * Guarda de URLs externas para navegação automatizada (Puppeteer) e fetch de
 * conteúdo remoto. Bloqueia alvos internos (SSRF): localhost, IPs privados,
 * link-local e metadados de nuvem.
 */

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
]);

function isPrivateIpv4(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (a === 127 || a === 10 || a === 0) return true; // loopback, RFC1918, "this host"
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
  if (a === 192 && b === 168) return true; // RFC1918
  if (a === 169 && b === 254) return true; // link-local / metadados de nuvem
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

function isPrivateIpv6(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (!h.includes(":")) return false;
  if (h === "::1" || h === "::") return true; // loopback / unspecified
  if (h.startsWith("fe80:")) return true; // link-local
  if (h.startsWith("fc") || h.startsWith("fd")) return true; // ULA fc00::/7
  if (h.startsWith("::ffff:")) return isPrivateIpv4(h.slice("::ffff:".length)); // IPv4-mapped
  return false;
}

/**
 * Valida uma URL informada em configuração/entrada de usuário antes de
 * navegá-la com o browser do servidor. Lança Error com mensagem amigável
 * quando o alvo é interno ou o protocolo não é http(s).
 */
export function assertSafeExternalUrl(rawUrl: string, context = "URL"): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`${context} inválida: ${rawUrl}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${context} com protocolo não permitido (${url.protocol}) — use http/https`);
  }
  const host = url.hostname.toLowerCase();
  if (
    BLOCKED_HOSTNAMES.has(host) ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    isPrivateIpv4(host) ||
    isPrivateIpv6(host)
  ) {
    throw new Error(`${context} aponta para endereço interno/privado (${host}) — bloqueada por segurança`);
  }
  return url;
}
