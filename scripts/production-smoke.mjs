#!/usr/bin/env node

/**
 * Smoke test de produção do S2 Licit.
 *
 * Valida:
 *  1. identidade pública do domínio e endpoints /healthz e /readyz;
 *  2. login real pela interface, quando as credenciais de smoke estiverem configuradas;
 *  3. rotas estáticas permitidas ao papel da conta;
 *  4. rotas dinâmicas resolvíveis com dados existentes, registrando explicitamente
 *     as que não puderam ser exercitadas.
 *
 * Variáveis:
 *  SMOKE_BASE_URL       URL do sistema
 *  SMOKE_USER_EMAIL     usuário dedicado de smoke test
 *  SMOKE_USER_PASSWORD  senha do usuário
 *  SMOKE_MFA_TOKEN      token MFA opcional
 *  SMOKE_ROLE           user | viewer | editor | admin (padrão: editor)
 *  SMOKE_SCOPE          critical | full (padrão: full)
 *  SMOKE_ROUTES         rotas separadas por vírgula; sobrescreve o manifesto
 *  SMOKE_SCREENSHOT_DIR diretório de evidências
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
const smokeRole = (process.env.SMOKE_ROLE || "editor").toLowerCase();
const smokeScope = (process.env.SMOKE_SCOPE || "full").toLowerCase();
const screenshotDir = process.env.SMOKE_SCREENSHOT_DIR || "artifacts/smoke";
const manifestPath = new URL("./production-routes.json", import.meta.url);
const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));

const roleRank = { user: 0, viewer: 1, editor: 2, admin: 3 };
if (!(smokeRole in roleRank)) {
  throw new Error(`SMOKE_ROLE inválido: ${smokeRole}`);
}
if (!["critical", "full"].includes(smokeScope)) {
  throw new Error(`SMOKE_SCOPE inválido: ${smokeScope}`);
}

const fatalTextMarkers = [
  "página não encontrada",
  "permissão insuficiente",
  "acesso negado",
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

function routePath(route) {
  return route.split("?")[0];
}

function expectedRedirect(route) {
  return manifest.redirects[route] || null;
}

function accessibleRoutesForConfiguredRole() {
  const routes = [...manifest.authenticated];
  if (roleRank[smokeRole] >= roleRank.editor) routes.push(...manifest.editor);
  if (roleRank[smokeRole] >= roleRank.admin) routes.push(...manifest.admin);
  return new Set(routes);
}

function routesForConfiguredRole() {
  const explicitRoutes = (process.env.SMOKE_ROUTES || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (explicitRoutes.length > 0) return explicitRoutes;

  const accessible = accessibleRoutesForConfiguredRole();
  const routes = smokeScope === "critical"
    ? manifest.critical.filter((route) => accessible.has(route))
    : [...accessible];

  if (smokeScope === "full") {
    for (const [source, target] of Object.entries(manifest.redirects)) {
      if (accessible.has(routePath(target))) routes.push(source);
    }
  }
  return [...new Set(routes)];
}

async function fetchText(endpoint) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${baseUrl}${endpoint}`, {
      headers: { "user-agent": "S2-Licit-Production-Smoke/3.0" },
      redirect: "follow",
      signal: controller.signal,
    });
    const body = await response.text();
    return {
      endpoint,
      status: response.status,
      ok: response.ok,
      contentType: response.headers.get("content-type") || "",
      finalUrl: response.url,
      body,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function checkJsonEndpoint(endpoint, expectedStatus) {
  const result = await fetchText(endpoint);
  if (!result.ok) {
    throw new Error(`${endpoint} respondeu HTTP ${result.status}: ${result.body.slice(0, 300)}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(result.body);
  } catch {
    throw new Error(`${endpoint} não devolveu JSON do S2; possível conflito de domínio/proxy`);
  }

  if (parsed.status !== expectedStatus) {
    throw new Error(`${endpoint} devolveu status inesperado: ${JSON.stringify(parsed).slice(0, 300)}`);
  }

  return {
    endpoint,
    status: result.status,
    contentType: result.contentType,
    finalUrl: result.finalUrl,
    response: parsed,
  };
}

async function checkApplicationIdentity() {
  const result = await fetchText("/login");
  if (!result.ok) {
    throw new Error(`/login respondeu HTTP ${result.status}: ${result.body.slice(0, 300)}`);
  }

  const expectedTitle = "Sistema S2 — Licitações e Cotações";
  const hasTitle = result.body.includes(`<title>${expectedTitle}</title>`);
  const hasRoot = /<div\s+id=["']root["']\s*><\/div>/.test(result.body);
  if (!hasTitle || !hasRoot) {
    throw new Error(
      "O domínio não está servindo o frontend do Sistema S2. " +
        `Título esperado: "${expectedTitle}". Verifique DNS, Nginx/Caddy e a variável DOMAIN.`,
    );
  }

  return {
    endpoint: "/login",
    status: result.status,
    contentType: result.contentType,
    finalUrl: result.finalUrl,
    identity: "s2-licit",
  };
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

async function writeSummary(summary) {
  summary.finishedAt = new Date().toISOString();
  await fs.writeFile(
    path.join(screenshotDir, "summary.json"),
    JSON.stringify(summary, null, 2),
  );
}

async function settlePage(page) {
  await page.waitForSelector("#root");
  await page.waitForNetworkIdle({ idleTime: 400, timeout: 8_000 }).catch(() => undefined);
  await new Promise((resolve) => setTimeout(resolve, 250));
}

async function inspectLoadedPage({
  page,
  route,
  expectedPath,
  response,
  routeErrorsBefore,
  summary,
}) {
  const currentUrl = new URL(page.url());
  const currentPath = currentUrl.pathname;
  const currentLocation = `${currentUrl.pathname}${currentUrl.search}`;
  const title = await page.title();
  const text = (await page.evaluate(() => document.body?.innerText || "")).trim();
  const normalizedText = text.toLocaleLowerCase("pt-BR");
  const fatalMarker = fatalTextMarkers.find((marker) => normalizedText.includes(marker));
  const routeErrors = summary.browserErrors.slice(routeErrorsBefore);
  const pathMatches = expectedPath instanceof RegExp
    ? expectedPath.test(currentPath)
    : currentLocation === expectedPath;

  const result = {
    route,
    expectedPath: expectedPath instanceof RegExp ? expectedPath.source : expectedPath,
    currentPath,
    currentLocation,
    status: response?.status() ?? null,
    title,
    browserErrors: routeErrors,
  };
  summary.routes.push(result);

  if (currentPath === "/login") {
    throw new Error(`${route}: sessão perdida ou acesso redirecionado para login`);
  }
  if (response && response.status() >= 400) {
    throw new Error(`${route}: respondeu HTTP ${response.status()}`);
  }
  if (!pathMatches) {
    throw new Error(`${route}: abriu ${currentLocation}; esperado ${String(expectedPath)}`);
  }
  if (!text || text.length < 20) {
    throw new Error(`${route}: página sem conteúdo suficiente`);
  }
  if (fatalMarker) {
    throw new Error(`${route}: marcador de erro encontrado: ${fatalMarker}`);
  }
  if (routeErrors.length > 0) {
    throw new Error(`${route}: erro de JavaScript: ${routeErrors.join(" | ")}`);
  }
  return result;
}

async function exerciseDynamicRoutes(page, summary) {
  if (smokeScope !== "full") return;

  for (const template of manifest.dynamic) {
    if (template !== "/propostas/:id") {
      summary.dynamicRoutes.skipped.push({
        template,
        reason: "Nenhum resolvedor automático foi definido para esta rota dinâmica.",
      });
      continue;
    }

    await page.goto(`${baseUrl}/propostas`, { waitUntil: "domcontentloaded" });
    await settlePage(page);
    const firstProposal = await page.$("table.its-table tbody tr");
    if (!firstProposal) {
      summary.dynamicRoutes.skipped.push({
        template,
        reason: "Não havia proposta existente para abrir sem criar dados artificiais.",
      });
      continue;
    }

    const startedAt = Date.now();
    const routeErrorsBefore = summary.browserErrors.length;
    await firstProposal.evaluate((element) => element.click());
    await page.waitForFunction(
      () => /^\/propostas\/\d+$/.test(window.location.pathname),
      { timeout: 15_000 },
    );
    await settlePage(page);
    const result = await inspectLoadedPage({
      page,
      route: template,
      expectedPath: /^\/propostas\/\d+$/,
      response: null,
      routeErrorsBefore,
      summary,
    });
    result.durationMs = Date.now() - startedAt;
    summary.dynamicRoutes.resolved.push({ template, path: result.currentPath });
    await page.screenshot({
      path: path.join(screenshotDir, `${sanitizeRoute(result.currentPath)}.png`),
      fullPage: false,
    });
    console.log(`OK ${template} -> ${result.currentPath} (${result.durationMs} ms)`);
  }
}

async function main() {
  await fs.mkdir(screenshotDir, { recursive: true });

  const routes = routesForConfiguredRole();
  const summary = {
    baseUrl,
    startedAt: new Date().toISOString(),
    scope: smokeScope,
    role: smokeRole,
    endpoints: [],
    routes: [],
    dynamicRoutes: { resolved: [], skipped: [] },
    browserErrors: [],
    authentication: {
      configured: Boolean(email && password),
      skipped: false,
    },
  };

  let browser;
  try {
    summary.endpoints.push(await checkJsonEndpoint("/healthz", "ok"));
    summary.endpoints.push(await checkJsonEndpoint("/readyz", "ready"));
    summary.endpoints.push(await checkApplicationIdentity());

    if (!email || !password) {
      summary.authentication.skipped = true;
      summary.authentication.reason =
        "SMOKE_USER_EMAIL/SMOKE_USER_PASSWORD não configurados; validação pública concluída.";
      console.warn(
        "::warning::Smoke autenticado não executado. Configure SMOKE_USER_EMAIL e " +
          "SMOKE_USER_PASSWORD com uma conta dedicada.",
      );
      return;
    }

    const executablePath = findBrowserExecutable();
    browser = await puppeteer.launch({
      headless: true,
      executablePath,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });

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

    await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
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
        throw new Error("A conta de smoke exige MFA. Informe SMOKE_MFA_TOKEN ou use conta sem MFA.");
      }
      await page.type("#token", mfaToken);
      await page.click('button[type="submit"]');
      await page.waitForFunction(() => window.location.pathname !== "/login", { timeout: 15_000 });
    }

    if (new URL(page.url()).pathname === "/login") {
      const message = await page
        .$eval('[role="alert"]', (element) => element.textContent || "")
        .catch(() => "");
      throw new Error(`Login não concluído${message ? `: ${message}` : ""}`);
    }

    for (const route of routes) {
      const startedAt = Date.now();
      const routeErrorsBefore = summary.browserErrors.length;
      const response = await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded" });
      await settlePage(page);
      const redirectTarget = expectedRedirect(route);
      const result = await inspectLoadedPage({
        page,
        route,
        expectedPath: redirectTarget || route,
        response,
        routeErrorsBefore,
        summary,
      });
      result.durationMs = Date.now() - startedAt;

      await page.screenshot({
        path: path.join(screenshotDir, `${sanitizeRoute(route)}.png`),
        fullPage: false,
      });
      console.log(`OK ${route} (${result.durationMs} ms)`);
    }

    await exerciseDynamicRoutes(page, summary);
  } catch (error) {
    summary.failedAt = new Date().toISOString();
    summary.error = error instanceof Error ? error.stack || error.message : String(error);
    throw error;
  } finally {
    if (browser) await browser.close();
    await writeSummary(summary);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});
