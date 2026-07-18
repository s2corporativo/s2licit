// Armazenamento de arquivos (logos, anexos).
//
// Dois modos, escolhidos automaticamente:
//  - Proxy legado (Manus/Forge): quando BUILT_IN_FORGE_API_URL/KEY existem.
//  - Disco local (padrão em VPS): grava em UPLOAD_DIR (padrão ./uploads) e
//    serve em /uploads/<chave> (rota estática registrada no boot).

import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { ENV } from './_core/env';

type StorageConfig = { baseUrl: string; apiKey: string };

/** Diretório local de uploads (persistido via volume no docker-compose). */
export function localUploadDir(): string {
  return process.env.UPLOAD_DIR || path.resolve(process.cwd(), "uploads");
}

function hasForgeProxy(): boolean {
  return Boolean(ENV.forgeApiUrl && ENV.forgeApiKey);
}

function getStorageConfig(): StorageConfig {
  const baseUrl = ENV.forgeApiUrl;
  const apiKey = ENV.forgeApiKey;

  if (!baseUrl || !apiKey) {
    throw new Error(
      "Storage proxy credentials missing: set BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY"
    );
  }

  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey };
}

function buildUploadUrl(baseUrl: string, relKey: string): URL {
  const url = new URL("v1/storage/upload", ensureTrailingSlash(baseUrl));
  url.searchParams.set("path", normalizeKey(relKey));
  return url;
}

async function buildDownloadUrl(
  baseUrl: string,
  relKey: string,
  apiKey: string
): Promise<string> {
  const downloadApiUrl = new URL(
    "v1/storage/downloadUrl",
    ensureTrailingSlash(baseUrl)
  );
  downloadApiUrl.searchParams.set("path", normalizeKey(relKey));
  const response = await fetch(downloadApiUrl, {
    method: "GET",
    headers: buildAuthHeaders(apiKey),
    signal: AbortSignal.timeout(30_000),
  });
  return (await response.json()).url;
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function toFormData(
  data: Buffer | Uint8Array | string,
  contentType: string,
  fileName: string
): FormData {
  const blob =
    typeof data === "string"
      ? new Blob([data], { type: contentType })
      : new Blob([data as any], { type: contentType });
  const form = new FormData();
  form.append("file", blob, fileName || "file");
  return form;
}

function buildAuthHeaders(apiKey: string): HeadersInit {
  return { Authorization: `Bearer ${apiKey}` };
}

/** Grava no disco local e devolve a URL pública relativa (/uploads/...). */
async function localPut(
  relKey: string,
  data: Buffer | Uint8Array | string,
): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  // Bloqueia path traversal (../../etc) na chave
  const safeKey = key.split("/").filter((p) => p && p !== "." && p !== "..").join("/");
  const filePath = path.join(localUploadDir(), safeKey);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, typeof data === "string" ? Buffer.from(data) : Buffer.from(data));
  return { key: safeKey, url: `/uploads/${safeKey}` };
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  if (!hasForgeProxy()) {
    return localPut(relKey, data);
  }
  const { baseUrl, apiKey } = getStorageConfig();
  const key = normalizeKey(relKey);
  const uploadUrl = buildUploadUrl(baseUrl, key);
  const formData = toFormData(data, contentType, key.split("/").pop() ?? key);
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: buildAuthHeaders(apiKey),
    body: formData,
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(
      `Storage upload failed (${response.status} ${response.statusText}): ${message}`
    );
  }
  const url = (await response.json()).url;
  return { key, url };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string; }> {
  if (!hasForgeProxy()) {
    const key = normalizeKey(relKey);
    return { key, url: `/uploads/${key}` };
  }
  const { baseUrl, apiKey } = getStorageConfig();
  const key = normalizeKey(relKey);
  return {
    key,
    url: await buildDownloadUrl(baseUrl, key, apiKey),
  };
}
