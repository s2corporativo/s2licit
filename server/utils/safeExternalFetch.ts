import { promises as dns } from "dns";
import { isIP } from "net";
import { assertSafeExternalUrl } from "./urlGuard";

function isPrivateIpv4(address: string): boolean {
  const p = address.split(".").map(Number);
  if (p.length !== 4 || p.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return false;
  return p[0] === 10 || p[0] === 127 || p[0] === 0 ||
    (p[0] === 169 && p[1] === 254) ||
    (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
    (p[0] === 192 && p[1] === 168) ||
    (p[0] === 100 && p[1] >= 64 && p[1] <= 127);
}

function isPrivateIp(address: string): boolean {
  const ip = address.replace(/^\[|\]$/g, "").toLowerCase();
  if (isIP(ip) === 4) return isPrivateIpv4(ip);
  if (isIP(ip) !== 6) return false;
  if (ip === "::1" || ip === "::" || ip.startsWith("fe80:") || ip.startsWith("fc") || ip.startsWith("fd")) return true;
  if (ip.startsWith("::ffff:")) {
    const mapped = ip.slice("::ffff:".length);
    return isIP(mapped) === 4 && isPrivateIpv4(mapped);
  }
  return false;
}

async function validateResolved(url: URL): Promise<void> {
  if (isIP(url.hostname)) {
    if (isPrivateIp(url.hostname)) throw new Error(`Host privado bloqueado: ${url.hostname}`);
    return;
  }
  const addresses = await dns.lookup(url.hostname, { all: true, verbatim: true });
  if (addresses.length === 0) throw new Error(`DNS sem endereço para ${url.hostname}`);
  if (addresses.some((entry) => isPrivateIp(entry.address))) {
    throw new Error(`DNS de ${url.hostname} resolveu para endereço privado — bloqueado por SSRF`);
  }
}

export async function safeExternalFetchText(
  rawUrl: string,
  options: {
    headers?: Record<string, string>;
    timeoutMs?: number;
    maxBytes?: number;
    maxRedirects?: number;
  } = {},
): Promise<{ url: string; status: number; ok: boolean; headers: Headers; text: string }> {
  const timeoutMs = Math.max(1000, Math.min(options.timeoutMs ?? 20_000, 60_000));
  const maxBytes = Math.max(1024, Math.min(options.maxBytes ?? 10 * 1024 * 1024, 30 * 1024 * 1024));
  const maxRedirects = Math.max(0, Math.min(options.maxRedirects ?? 5, 10));
  let current = rawUrl;

  for (let redirects = 0; redirects <= maxRedirects; redirects++) {
    const url = assertSafeExternalUrl(current, "URL externa");
    await validateResolved(url);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        headers: options.headers,
        redirect: "manual",
        signal: controller.signal,
      });

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location) throw new Error(`Redirect ${response.status} sem Location`);
        if (redirects === maxRedirects) throw new Error("Limite de redirects externos excedido");
        current = new URL(location, url).toString();
        continue;
      }

      const declared = Number(response.headers.get("content-length") || 0);
      if (Number.isFinite(declared) && declared > maxBytes) {
        throw new Error(`Resposta externa excede limite de ${maxBytes} bytes`);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > maxBytes) throw new Error(`Resposta externa excede limite de ${maxBytes} bytes`);
      return {
        url: url.toString(),
        status: response.status,
        ok: response.ok,
        headers: response.headers,
        text: buffer.toString("utf8"),
      };
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("Falha inesperada ao buscar URL externa");
}
