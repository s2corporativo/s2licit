#!/usr/bin/env node

import fs from "node:fs/promises";
import process from "node:process";
import { pathToFileURL } from "node:url";

export const EXPECTED_TITLE = "Sistema S2 — Licitações e Cotações";

export function normalizeBaseUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) throw new Error("URL pública do S2 não informada");
  const parsed = new URL(raw);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`Protocolo inválido para o S2: ${parsed.protocol}`);
  }
  return parsed.toString().replace(/\/$/, "");
}

export function validateStatusPayload(body, expectedStatus, endpoint) {
  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new Error(`${endpoint} não devolveu JSON; possível DNS/proxy apontando para outro site`);
  }
  if (payload?.status !== expectedStatus) {
    throw new Error(`${endpoint} devolveu status ${JSON.stringify(payload?.status)}; esperado ${expectedStatus}`);
  }
  return payload;
}

export function validateS2Html(html) {
  if (!html.includes(`<title>${EXPECTED_TITLE}</title>`)) {
    throw new Error(`Título do S2 ausente; esperado "${EXPECTED_TITLE}"`);
  }
  if (!html.includes('id="root"') && !html.includes("id='root'")) {
    throw new Error("Elemento raiz do frontend do S2 ausente");
  }
  return true;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchText(fetchImpl, url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": "S2-Licit-Public-Verifier/1.0" },
    });
    const body = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      finalUrl: response.url || url,
      contentType: response.headers?.get?.("content-type") || "",
      body,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function runCheck({ name, url, validate, fetchImpl, retries, delayMs, timeoutMs }) {
  const attempts = [];
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const startedAt = Date.now();
    try {
      const response = await fetchText(fetchImpl, url, timeoutMs);
      const record = {
        attempt,
        status: response.status,
        finalUrl: response.finalUrl,
        contentType: response.contentType,
        durationMs: Date.now() - startedAt,
        bodyPreview: response.body.slice(0, 500),
      };
      attempts.push(record);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const details = validate(response.body);
      return { name, url, ok: true, attempts, details };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const last = attempts.at(-1);
      if (!last || last.attempt !== attempt) {
        attempts.push({ attempt, durationMs: Date.now() - startedAt, error: message });
      } else {
        last.error = message;
      }
      if (attempt < retries) await delay(delayMs);
    }
  }
  return { name, url, ok: false, attempts };
}

export async function verifyPublicS2(options = {}) {
  const baseUrl = normalizeBaseUrl(options.baseUrl || process.env.S2_BASE_URL || process.env.SMOKE_BASE_URL);
  const retries = Number(options.retries ?? process.env.S2_VERIFY_RETRIES ?? 4);
  const delayMs = Number(options.delayMs ?? process.env.S2_VERIFY_DELAY_MS ?? 5000);
  const timeoutMs = Number(options.timeoutMs ?? process.env.S2_VERIFY_TIMEOUT_MS ?? 15000);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new Error("Fetch indisponível");

  const startedAt = new Date().toISOString();
  const checks = [];
  checks.push(await runCheck({
    name: "health",
    url: `${baseUrl}/healthz`,
    validate: (body) => validateStatusPayload(body, "ok", "/healthz"),
    fetchImpl, retries, delayMs, timeoutMs,
  }));
  checks.push(await runCheck({
    name: "readiness",
    url: `${baseUrl}/readyz`,
    validate: (body) => validateStatusPayload(body, "ready", "/readyz"),
    fetchImpl, retries, delayMs, timeoutMs,
  }));
  checks.push(await runCheck({
    name: "identity",
    url: `${baseUrl}/login`,
    validate: (body) => validateS2Html(body),
    fetchImpl, retries, delayMs, timeoutMs,
  }));

  const summary = {
    baseUrl,
    startedAt,
    finishedAt: new Date().toISOString(),
    ok: checks.every((check) => check.ok),
    checks,
  };
  return summary;
}

async function main() {
  let summary;
  try {
    summary = await verifyPublicS2();
  } catch (error) {
    summary = {
      baseUrl: process.env.S2_BASE_URL || process.env.SMOKE_BASE_URL || "",
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      ok: false,
      fatalError: error instanceof Error ? error.stack || error.message : String(error),
      checks: [],
    };
  }

  const outputPath = process.env.S2_VERIFY_OUTPUT || "artifacts/public-verification.json";
  await fs.mkdir(new URL(".", pathToFileURL(`${process.cwd()}/${outputPath}`)), { recursive: true }).catch(async () => {
    const directory = outputPath.includes("/") ? outputPath.slice(0, outputPath.lastIndexOf("/")) : ".";
    await fs.mkdir(directory, { recursive: true });
  });
  await fs.writeFile(outputPath, JSON.stringify(summary, null, 2));

  for (const check of summary.checks || []) {
    const suffix = check.ok ? "OK" : `FALHOU: ${check.attempts?.at(-1)?.error || "sem diagnóstico"}`;
    console.log(`${check.name}: ${suffix}`);
  }
  if (summary.fatalError) console.error(summary.fatalError);
  if (!summary.ok) process.exitCode = 1;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : error);
    process.exitCode = 1;
  });
}
