#!/usr/bin/env node

/**
 * Smoke test de produção do S2 Licit.
 *
 * Valida:
 *  1. /healthz e /readyz;
 *  2. login real pela interface;
 *  3. carregamento das rotas críticas sem redirecionamento indevido,
 *     tela de erro ou falha de JavaScript.
 *
 * Variáveis:
 *  SMOKE_BASE_URL       URL do sistema (padrão: https://s2.s2corporativo.com.br)
 *  SMOKE_USER_EMAIL     usuário dedicado de smoke test
 *  SMOKE_USER_PASSWORD  senha do usuário
 *  SMOKE_MFA_TOKEN      token MFA opcional
 *  SMOKE_ROUTES         rotas separadas por vírgula
 *  SMOKE_SCREENSHOT_DIR diretório de evidências (padrão: artifacts/smoke)
 *  PUPPETEER_EXECUTABLE_PATH caminho do Chrome/Chromium, quando necessário
 */

import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import puppeteer from "puppeteer";

const baseUrl = (process.env.SMOKE_BASE_URL || "https://s2.s2corporativo.com.br").replace(/\/$/, "");
const email = process.env.SMOKE_USER_EMAIL || "";
const password = process.env.SMOKE_USER_PASSWORD || "";
const mfaToken = process.env.SMOKE_MFA_TOKEN || "";
const screenshotDir = process.env.SMOKE_SCREENSHOT_DIR || "artifacts/smoke";
const defaultRoutes = [
  "/",
  "/agenda",
  "/funil",
  "/produtos",
  "/fornecedores",
  "/propostas",
  "/edital",
  "/radar-pncp",
  "/comparacao",
  "/busca-global",
  "/pos-venda",
  "/analise-juridica",
];
const routes = (process.env.SMOKE_ROUTES || defaultRoutes.join(","))
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const fatalTextMarkers = [
  "página não encontrada",
  "erro inesperado",
  "não foi possível conectar ao servidor",
  "application error",
  "internal server error",
  "bad gateway",
  "service unavailable",
];

function sanitizeRoute(route) {
  if (route === "/") return "dashboard";
  return route.replace(/^\//, "").replace(/[^a-zA-Z0-9_-]+/g, "-") || "route";
}

async function checkEndpoint(endpoint) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${baseUrl}${endpoint}`, {
      headers: { "user-agent": "S2-Licit-Production-Smoke/1.0" },
      signal: controller.signal,
    });
    const body = await response.text();
    if (!response.ok) {
      throw new Error(`${endpoint} respondeu HTTP ${response.status}: ${body.slice(0, 300)}`);
    }
    return { endpoint, status: response.status, body: body.slice(0, 300) };
  } finally {
    clearTimeout(timer);
  }
}

function findBrowserExecutable() {
  const configured = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (configured && existsSync(configured)) return configured;

  const candidates = [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ];
  return candidates.find((candidate) => existsSync(candidate));
}

async function main() {
  await fs.mkdir(screenshotDir, { recursive: true });

  const summary = {
    baseUrl,
    startedAt: new Date().toISOString(),
    endpoints: [],
    routes: [],
    browserErrors: [],
  };

  summary.endpoints.push(await checkEndpoint("/healthz"));
  summary.endpoints.push(await checkEndpoint("/readyz"));

  if (!email || !password) {
    throw new Error(
      "SMOKE_USER_EMAIL e SMOKE_USER_PASSWORD são obrigatórios para o smoke test autenticado. " +
        "Use uma conta dedicada com papel editor e sem privilégios administrativos.",
    );
  }

  const executablePath = findBrowserExecutable();
  const browser = await puppeteer.launch({
    headless: true,
    executablePath,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1000 });
    page.setDefaultTimeout(20_000);
    page.setDefaultNavigationTimeout(35_000);

    page.on("pageerror", (error) => {
      summary.browserErrors.push(`pageerror: ${error.message}`);
    });
    page.on("console", (message) => {
      if (message.type() === "error") {
        summary.browserErrors.push(`console: ${message.text()}`);
      }
    });

    await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle2" });
    await page.waitForSelector("#email");
    await page.type("#email", email);
    await page.type("#password", password);
    await page.click('button[type="submit"]');

    await Promise.race([
      page.waitForFunction(() => window.location.pathname !== "/login", { timeout: 15_000 }),
      page.waitForSelector("#token", { timeout: 15_000 }).catch(() => null),
    ]);

    if (await page.$("#token")) {
      if (!mfaToken) {
        throw new Error("A conta de smoke exige MFA. Informe SMOKE_MFA_TOKEN ou use uma conta dedicada sem MFA.");
      }
      await page.type("#token", mfaToken);
      await page.click('button[type="submit"]');
      await page.waitForFunction(() => window.location.pathname !== "/login", { timeout: 15_000 });
    }

    if (new URL(page.url()).pathname === "/login") {
      const message = await page.$eval('[role="alert"]', (element) => element.textContent || "").catch(() => "");
      throw new Error(`Login não concluído${message ? `: ${message}` : ""}`);
    }

    for (const route of routes) {
      const startedAt = Date.now();
      const routeErrorsBefore = summary.browserErrors.length;
      const response = await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle2" });
      await new Promise((resolve) => setTimeout(resolve, 500));

      const currentPath = new URL(page.url()).pathname;
      const title = await page.title();
      const text = (await page.evaluate(() => document.body?.innerText || "")).trim();
      const normalizedText = text.toLocaleLowerCase("pt-BR");
      const fatalMarker = fatalTextMarkers.find((marker) => normalizedText.includes(marker));
      const routeErrors = summary.browserErrors.slice(routeErrorsBefore);

      const result = {
        route,
        currentPath,
        status: response?.status() ?? null,
        title,
        durationMs: Date.now() - startedAt,
        browserErrors: routeErrors,
      };
      summary.routes.push(result);

      if (currentPath === "/login") {
        throw new Error(`${route}: sessão perdida ou acesso redirecionado para login`);
      }
      if (response && response.status() >= 400) {
        throw new Error(`${route}: respondeu HTTP ${response.status()}`);
      }
      if (!text || text.length < 20) {
        throw new Error(`${route}: página sem conteúdo suficiente`);
      }
      if (fatalMarker) {
        throw new Error(`${route}: marcador de erro encontrado: ${fatalMarker}`);
      }
      if (routeErrors.length > 0) {
        throw new Error(`${route}: erro de JavaScript no navegador: ${routeErrors.join(" | ")}`);
      }

      await page.screenshot({
        path: path.join(screenshotDir, `${sanitizeRoute(route)}.png`),
        fullPage: false,
      });
      console.log(`OK ${route} (${result.durationMs} ms)`);
    }
  } catch (error) {
    summary.failedAt = new Date().toISOString();
    summary.error = error instanceof Error ? error.stack || error.message : String(error);
    throw error;
  } finally {
    summary.finishedAt = new Date().toISOString();
    await fs.writeFile(path.join(screenshotDir, "summary.json"), JSON.stringify(summary, null, 2));
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});
