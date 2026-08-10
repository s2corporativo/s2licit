import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 10_000;

function isPrivateIpv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
    return true;
  }
  const [a, b] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isNonPublicIpv6(address: string): boolean {
  const value = address.toLowerCase();
  if (value === "::" || value === "::1") return true;
  if (value.startsWith("fc") || value.startsWith("fd")) return true; // ULA fc00::/7
  if (/^fe[89ab]/.test(value)) return true; // link-local fe80::/10
  if (value.startsWith("ff")) return true; // multicast
  if (value.startsWith("2001:db8:")) return true; // documentação
  if (value.startsWith("::ffff:")) {
    const mapped = value.slice("::ffff:".length);
    if (isIP(mapped) === 4) return isPrivateIpv4(mapped);
  }
  return false;
}

export function isPublicIp(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !isPrivateIpv4(address);
  if (family === 6) return !isNonPublicIpv6(address);
  return false;
}

async function resolvePublicAddress(hostname: string): Promise<{ address: string; family: 4 | 6 }> {
  const literalFamily = isIP(hostname);
  if (literalFamily) {
    if (!isPublicIp(hostname)) throw new Error("Destino de imagem não público.");
    return { address: hostname, family: literalFamily as 4 | 6 };
  }

  const records = await lookup(hostname, { all: true, verbatim: true });
  if (records.length === 0) throw new Error("Hostname de imagem sem resolução DNS.");
  if (records.some((record) => !isPublicIp(record.address))) {
    // Política conservadora: se QUALQUER resposta DNS apontar para rede não
    // pública, a origem inteira é bloqueada. Evita alternância/rebinding.
    throw new Error("Hostname de imagem resolve para endereço não público.");
  }
  const selected = records[0];
  return { address: selected.address, family: selected.family as 4 | 6 };
}

function validateUrl(rawUrl: string): URL {
  const parsed = new URL(rawUrl);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Protocolo de imagem não permitido.");
  }
  if (parsed.username || parsed.password) {
    throw new Error("Credenciais embutidas em URL de imagem não são permitidas.");
  }
  if (!parsed.hostname) throw new Error("Hostname de imagem ausente.");
  return parsed;
}

/**
 * Busca imagem remota com DNS pinning. A conexão é feita ao IP público já
 * validado, enquanto Host/SNI preservam o hostname original. Não segue
 * redirects automaticamente: cada novo destino precisaria ser revalidado.
 */
export async function fetchRemoteImageBuffer(rawUrl: string): Promise<Buffer> {
  const parsed = validateUrl(rawUrl);
  const resolved = await resolvePublicAddress(parsed.hostname);
  const client = parsed.protocol === "https:" ? https : http;

  return new Promise<Buffer>((resolve, reject) => {
    const request = client.get(
      {
        protocol: parsed.protocol,
        hostname: resolved.address,
        family: resolved.family,
        port: parsed.port || undefined,
        path: `${parsed.pathname}${parsed.search}`,
        headers: {
          Host: parsed.host,
          Accept: "image/*",
          "User-Agent": "S2Licit/1.0",
        },
        ...(parsed.protocol === "https:" ? { servername: parsed.hostname } : {}),
        timeout: REQUEST_TIMEOUT_MS,
      },
      (response) => {
        const status = response.statusCode ?? 0;
        if (status < 200 || status >= 300) {
          response.resume();
          reject(new Error(`Imagem remota respondeu HTTP ${status}.`));
          return;
        }
        const contentType = String(response.headers["content-type"] ?? "").toLowerCase();
        if (!contentType.startsWith("image/")) {
          response.resume();
          reject(new Error("Resposta remota não é uma imagem."));
          return;
        }

        const declaredLength = Number(response.headers["content-length"] ?? 0);
        if (Number.isFinite(declaredLength) && declaredLength > MAX_IMAGE_BYTES) {
          response.resume();
          reject(new Error("Imagem excede o limite de 5 MB."));
          return;
        }

        let total = 0;
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => {
          total += chunk.length;
          if (total > MAX_IMAGE_BYTES) {
            request.destroy(new Error("Imagem excede o limite de 5 MB."));
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => resolve(Buffer.concat(chunks)));
        response.on("error", reject);
      },
    );
    request.on("timeout", () => request.destroy(new Error("Timeout ao buscar imagem.")));
    request.on("error", reject);
  });
}
