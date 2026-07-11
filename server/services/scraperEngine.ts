/**
 * scraperEngine.ts
 * Motor universal de scraping com Puppeteer para sites de fornecedores com login.
 *
 * Suporta qualquer fornecedor via configuração de seletores CSS.
 * Fluxo: Login → Navegar categorias → Extrair produtos → Match → Atualizar preços
 */

import puppeteer, { Browser, Page } from "puppeteer";
import { getDb } from "../db";
import { products, scraperConfigs, scraperLogs, productSupplierOffers } from "../../drizzle/schema";
import { eq, and, or, like } from "drizzle-orm";
import { decryptPassword } from "../utils/encryption";
import { normalizeText } from "../matching/productMatcher";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface SelectorConfig {
  /** Seletor do campo email/usuário no formulário de login */
  loginEmail: string;
  /** Seletor do campo senha no formulário de login */
  loginPassword: string;
  /** Seletor do botão de submit do login */
  loginSubmit: string;
  /** URL ou padrão que indica login bem-sucedido (ex: "/minha-conta") */
  loginSuccessUrl?: string;
  /** Texto na página que confirma login (alternativa a loginSuccessUrl) */
  loginSuccessText?: string;
  /** URLs das categorias a raspar (lista) */
  categoryUrls: string[];
  /** Seletor de cada card/item de produto na listagem */
  productItem: string;
  /** Seletor do nome do produto (relativo ao productItem) */
  productName: string;
  /** Seletor do preço (relativo ao productItem) */
  productPrice: string;
  /** Seletor do código interno (relativo ao productItem, opcional) */
  productCode?: string;
  /** Seletor do EAN/barcode (relativo ao productItem, opcional) */
  productEan?: string;
  /** Seletor da imagem (relativo ao productItem, opcional) */
  productImage?: string;
  /** Seletor do link do produto (relativo ao productItem, opcional) */
  productLink?: string;
  /** Seletor do botão/link de próxima página */
  nextPage?: string;
  /** Aguardar este seletor aparecer antes de extrair (opcional) */
  waitForSelector?: string;
  /** Tempo de espera após navegação em ms (padrão 2000) */
  navigationWait?: number;
}

export interface ScrapedProduct {
  name: string;
  code?: string;
  ean?: string;
  price: number;
  unit?: string;
  imageUrl?: string;
  productUrl?: string;
  availability?: string;
}

export interface ScraperRunResult {
  success: boolean;
  supplierId: number;
  supplierName: string;
  productsScraped: number;
  productsMatched: number;
  productsUpdated: number;
  productsNew: number;
  errors: string[];
  durationMs: number;
  log: string[];
}

// ─── Configurações pré-definidas por fornecedor ───────────────────────────────
// Cada fornecedor tem seus seletores específicos configurados aqui.
// Novos fornecedores são adicionados apenas neste mapa.

export const FORNECEDOR_CONFIGS: Record<string, SelectorConfig> = {
  tambasa: {
    loginEmail: 'input[name="email"], input[type="email"], #email',
    loginPassword: 'input[name="password"], input[type="password"], #password',
    loginSubmit: 'button[type="submit"], .login-btn, [data-login-submit]',
    loginSuccessUrl: "/minha-conta",
    categoryUrls: [
      "https://tambasa.com/categoria/pet-e-vet-e-agro/produtos-veterinarios",
      "https://tambasa.com/categoria/pet-e-vet-e-agro/medicamentos-veterinarios",
    ],
    productItem: '[data-product-item], .product-card, .produto-item',
    productName: '[data-product-name], .product-name, .produto-nome, h2, h3',
    productPrice: '[data-product-price], .product-price, .preco, .price',
    productCode: '[data-product-code], .product-code',
    productEan: '[data-product-ean], .ean',
    productImage: 'img[data-product-image], img.product-img, img.produto-img',
    productLink: 'a[data-product-link], a.product-link, a.produto-link',
    nextPage: '[data-next-page]:not([disabled]), .pagination-next:not(.disabled), a[rel="next"]',
    waitForSelector: '[data-product-item], .product-card, .produto-item',
    navigationWait: 2500,
  },

  cristalia: {
    loginEmail: 'input[name="login"], input[name="email"], input[type="email"]',
    loginPassword: 'input[name="senha"], input[name="password"], input[type="password"]',
    loginSubmit: 'button[type="submit"], input[type="submit"], .btn-login',
    loginSuccessUrl: "/area-cliente",
    categoryUrls: [
      "https://www.cristalia.com.br/produtos",
    ],
    productItem: '.product-item, .produto, [class*="product-card"]',
    productName: '.product-name, .nome-produto, h2, h3, [class*="product-name"]',
    productPrice: '.price, .preco, [class*="price"], [class*="preco"]',
    productCode: '.product-code, .codigo, [class*="code"]',
    productImage: 'img',
    productLink: 'a',
    nextPage: '.next, [rel="next"], .proxima-pagina',
    waitForSelector: '.product-item, .produto',
    navigationWait: 3000,
  },

  ourofino: {
    loginEmail: 'input[name="email"], input[type="email"]',
    loginPassword: 'input[name="password"], input[type="password"]',
    loginSubmit: 'button[type="submit"], .login-button',
    loginSuccessUrl: "/cliente",
    categoryUrls: [
      "https://www.ourofinoagro.com.br/produtos",
      "https://www.ourofinosaudeanimal.com/produtos",
    ],
    productItem: '.product, .produto, [class*="product-item"]',
    productName: 'h2, h3, .name, .nome',
    productPrice: '.price, .preco',
    productImage: 'img',
    productLink: 'a',
    nextPage: '.next-page, [rel="next"]',
    waitForSelector: '.product, .produto',
    navigationWait: 3000,
  },

  // Fornecedor genérico — funciona para muitos e-commerces padrão
  generico: {
    loginEmail: 'input[name="email"], input[type="email"], #email, #username',
    loginPassword: 'input[name="password"], input[type="password"], #password, #senha',
    loginSubmit: 'button[type="submit"], input[type="submit"]',
    categoryUrls: [],
    productItem: '.product, .produto, [class*="product"], [class*="item"]',
    productName: 'h2, h3, .name, .title, .nome, .titulo',
    productPrice: '.price, .preco, [class*="price"], [class*="preco"]',
    productImage: 'img',
    productLink: 'a',
    nextPage: '[rel="next"], .next, .proxima',
    navigationWait: 2000,
  },
};

// ─── Motor de Scraping ─────────────────────────────────────────────────────────

export class ScraperEngine {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private log: string[] = [];

  private addLog(msg: string) {
    const ts = new Date().toISOString().slice(11, 19);
    const linha = `[${ts}] ${msg}`;
    this.log.push(linha);
    console.log(`[ScraperEngine] ${linha}`);
  }

  async init(): Promise<void> {
    if (this.browser) return;
    this.addLog("Iniciando navegador...");
    this.browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--single-process",
        "--no-zygote",
      ],
    });
    this.addLog("Navegador iniciado.");
  }

  async close(): Promise<void> {
    try {
      if (this.page) { await this.page.close(); this.page = null; }
      if (this.browser) { await this.browser.close(); this.browser = null; }
    } catch {}
  }

  /** Faz login no site do fornecedor */
  async login(loginUrl: string, email: string, password: string, cfg: SelectorConfig): Promise<void> {
    if (!this.browser) await this.init();
    this.page = await this.browser!.newPage();

    // User-agent real para evitar bloqueio anti-bot
    await this.page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    // Viewport padrão desktop
    await this.page.setViewport({ width: 1366, height: 768 });

    this.addLog(`Acessando ${loginUrl}...`);
    await this.page.goto(loginUrl, { waitUntil: "networkidle2", timeout: 30000 });

    // Aguardar campo de email aparecer
    try {
      await this.page.waitForSelector(cfg.loginEmail, { timeout: 10000 });
    } catch {
      throw new Error(`Campo de email não encontrado com seletor: ${cfg.loginEmail}`);
    }

    // Preencher formulário com delay humano
    this.addLog("Preenchendo formulário de login...");
    await this.page.click(cfg.loginEmail);
    await this.page.type(cfg.loginEmail, email, { delay: 80 });
    await new Promise(r => setTimeout(r, 500));
    await this.page.click(cfg.loginPassword);
    await this.page.type(cfg.loginPassword, password, { delay: 80 });
    await new Promise(r => setTimeout(r, 300));

    // Submeter
    await Promise.all([
      this.page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }).catch(() => {}),
      this.page.click(cfg.loginSubmit),
    ]);
    await new Promise(r => setTimeout(r, 1500));

    // Verificar sucesso
    const currentUrl = this.page.url();
    const pageText = await this.page.evaluate(() => document.body?.innerText ?? "");

    const loginFailed =
      (cfg.loginSuccessUrl && !currentUrl.includes(cfg.loginSuccessUrl)) ||
      (cfg.loginSuccessText && !pageText.includes(cfg.loginSuccessText)) ||
      currentUrl.includes("login") ||
      pageText.toLowerCase().includes("senha incorreta") ||
      pageText.toLowerCase().includes("usuário não encontrado") ||
      pageText.toLowerCase().includes("credenciais inválidas");

    if (loginFailed && !cfg.loginSuccessUrl && !cfg.loginSuccessText) {
      // Sem critério de sucesso definido — assumir OK se não há erro óbvio
      if (!pageText.toLowerCase().includes("senha incorreta")) {
        this.addLog("Login concluído (sem critério de sucesso definido).");
        return;
      }
    }

    if (loginFailed) {
      throw new Error(`Login falhou. URL atual: ${currentUrl}`);
    }

    this.addLog(`Login bem-sucedido. URL: ${currentUrl}`);
  }

  /** Extrai produtos de uma URL de categoria */
  async scrapeCategory(categoryUrl: string, cfg: SelectorConfig): Promise<ScrapedProduct[]> {
    if (!this.page) throw new Error("Não autenticado. Chame login() primeiro.");

    const todos: ScrapedProduct[] = [];
    let pagina = 1;
    const MAX_PAGES = 20;

    this.addLog(`Raspando categoria: ${categoryUrl}`);
    await this.page.goto(categoryUrl, { waitUntil: "networkidle2", timeout: 30000 });
    await new Promise(r => setTimeout(r, cfg.navigationWait ?? 2000));

    // Aguardar produtos carregarem
    if (cfg.waitForSelector) {
      try {
        await this.page.waitForSelector(cfg.waitForSelector, { timeout: 10000 });
      } catch {
        this.addLog(`Aviso: seletor de espera "${cfg.waitForSelector}" não encontrado. Continuando...`);
      }
    }

    while (pagina <= MAX_PAGES) {
      const produtos = await this.extractPageProducts(cfg);
      this.addLog(`  Página ${pagina}: ${produtos.length} produtos extraídos`);
      todos.push(...produtos);

      // Verificar próxima página
      if (!cfg.nextPage) break;
      const nextBtn = await this.page.$(cfg.nextPage);
      if (!nextBtn) break;

      try {
        await Promise.all([
          this.page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 }).catch(() => {}),
          nextBtn.click(),
        ]);
        await new Promise(r => setTimeout(r, cfg.navigationWait ?? 2000));
        pagina++;
      } catch {
        break;
      }
    }

    return todos;
  }

  /** Extrai produtos da página atual */
  private async extractPageProducts(cfg: SelectorConfig): Promise<ScrapedProduct[]> {
    return this.page!.evaluate(
      (c) => {
        const items = Array.from(document.querySelectorAll(c.productItem));
        return items.map(el => {
          const getText = (sel: string) => {
            if (!sel) return "";
            const node = el.querySelector(sel);
            return node?.textContent?.trim() ?? "";
          };
          const getAttr = (sel: string, attr: string) => {
            if (!sel) return "";
            const node = el.querySelector(sel);
            return (node as any)?.[attr] ?? node?.getAttribute(attr) ?? "";
          };

          const name = getText(c.productName);
          const priceRaw = getText(c.productPrice);

          // Parse de preço BR: R$ 1.234,56 → 1234.56
          const priceClean = priceRaw
            .replace(/[^\d,.-]/g, "")
            .replace(/\.(\d{3})/g, "$1")   // remove ponto de milhar
            .replace(",", ".");             // vírgula decimal → ponto
          const price = parseFloat(priceClean);

          return {
            name,
            price: isNaN(price) ? 0 : price,
            code: c.productCode ? getText(c.productCode) : undefined,
            ean: c.productEan ? getText(c.productEan) : undefined,
            imageUrl: c.productImage ? getAttr(c.productImage, "src") : undefined,
            productUrl: c.productLink ? getAttr(c.productLink, "href") : undefined,
          };
        }).filter(p => p.name && p.price > 0);
      },
      cfg as any
    );
  }

  /** Faz match dos produtos extraídos com o catálogo e atualiza preços */
  async matchAndUpdate(
    scrapedProducts: ScrapedProduct[],
    supplierId: number,
    supplierName: string
  ): Promise<{ matched: number; updated: number; created: number; errors: string[] }> {
    const db = await getDb();
    if (!db) throw new Error("Banco de dados indisponível");

    let matched = 0, updated = 0, created = 0;
    const errors: string[] = [];

    for (const sp of scrapedProducts) {
      try {
        // 1. Tentar match por EAN
        let productId: number | null = null;

        if (sp.ean) {
          const byEan = await db.select({ id: products.id })
            .from(products)
            .where(or(eq(products.ean, sp.ean), eq(products.gtin, sp.ean), eq(products.barcode, sp.ean)))
            .limit(1);
          if (byEan[0]) productId = byEan[0].id;
        }

        // 2. Tentar match por código do fornecedor
        if (!productId && sp.code) {
          const byCode = await db.select({ id: products.id })
            .from(products)
            .where(and(eq(products.supplierId, supplierId), eq(products.codigoFornecedor, sp.code)))
            .limit(1);
          if (byCode[0]) productId = byCode[0].id;
        }

        // 3. Tentar match fuzzy por nome normalizado
        if (!productId) {
          const normName = normalizeText(sp.name);
          if (normName.length >= 4) {
            // Narrowing no banco: filtra por LIKE na primeira palavra
            // significativa (MySQL LIKE é case-insensitive na collation padrão),
            // e refina por similaridade em JS. Antes, o filtro LIKE não existia
            // (db.$client ? undefined : undefined), varrendo só 20 produtos.
            const firstWord = sp.name.trim().split(/\s+/).find((w) => w.length >= 3) ?? "";
            const byName = await db.select({ id: products.id, name: products.name })
              .from(products)
              .where(and(
                eq(products.supplierId, supplierId),
                firstWord ? like(products.name, `%${firstWord}%`) : undefined,
              ))
              .limit(50);

            // Match por similaridade no nome
            const best = byName.find(p => normalizeText(p.name).includes(normName.slice(0, 20)));
            if (best) productId = best.id;
          }
        }

        if (productId) {
          matched++;
          // Atualizar oferta do fornecedor (tabela product_supplier_offers)
          const existing = await db.select({ id: productSupplierOffers.id })
            .from(productSupplierOffers)
            .where(and(
              eq(productSupplierOffers.productId, productId),
              eq(productSupplierOffers.supplierId, supplierId)
            ))
            .limit(1);

          const offerData = {
            price: String(sp.price),
            supplierCode: sp.code,
            supplierName,
            link: sp.productUrl,
            image: sp.imageUrl,
            availability: "disponivel",
            updatedAt: new Date(),
          };

          if (existing[0]) {
            await db.update(productSupplierOffers)
              .set(offerData)
              .where(eq(productSupplierOffers.id, existing[0].id));
            updated++;
          } else {
            await db.insert(productSupplierOffers).values({
              productId,
              supplierId,
              ...offerData,
              createdAt: new Date(),
            });
            created++;
          }

          // Atualizar campo price do produto principal se for o mesmo fornecedor
          await db.update(products)
            .set({ price: String(sp.price), updatedAt: new Date() })
            .where(and(eq(products.id, productId), eq(products.supplierId, supplierId)));
        }
      } catch (err: any) {
        errors.push(`Erro no produto "${sp.name}": ${err?.message}`);
      }
    }

    return { matched, updated, created, errors };
  }
}

// ─── Função principal de execução ─────────────────────────────────────────────

export async function executarScraper(scraperConfigId: number): Promise<ScraperRunResult> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  const startTime = Date.now();
  const engine = new ScraperEngine();

  // Buscar configuração
  const configs = await db.select().from(scraperConfigs)
    .where(eq(scraperConfigs.id, scraperConfigId)).limit(1);
  if (!configs[0]) throw new Error(`Configuração de scraper #${scraperConfigId} não encontrada`);
  const config = configs[0];

  // Buscar dados do fornecedor
  const { suppliers } = await import("../../drizzle/schema");
  const sups = await db.select().from(suppliers)
    .where(eq(suppliers.id, config.supplierId)).limit(1);
  const supplier = sups[0];
  if (!supplier) throw new Error(`Fornecedor #${config.supplierId} não encontrado`);

  const result: ScraperRunResult = {
    success: false,
    supplierId: config.supplierId,
    supplierName: supplier.name,
    productsScraped: 0,
    productsMatched: 0,
    productsUpdated: 0,
    productsNew: 0,
    errors: [],
    durationMs: 0,
    log: [],
  };

  // Buscar seletores do fornecedor
  const scraperType = config.scraperType.toLowerCase();
  const cfg = FORNECEDOR_CONFIGS[scraperType] ?? FORNECEDOR_CONFIGS.generico;

  // Descriptografar credenciais
  let email: string, password: string;
  try {
    email = decryptPassword(config.email);
    password = decryptPassword(config.passwordHash);
  } catch {
    throw new Error("Falha ao descriptografar credenciais do fornecedor");
  }

  // Determinar URL de login
  const loginUrl = cfg.categoryUrls[0]
    ? new URL(cfg.categoryUrls[0]).origin + "/login"
    : `https://${scraperType}.com.br/login`;

  try {
    // Login
    await engine.login(loginUrl, email, password, cfg);

    // Raspar todas as categorias configuradas
    const allScraped: ScrapedProduct[] = [];
    for (const catUrl of cfg.categoryUrls) {
      const prods = await engine.scrapeCategory(catUrl, cfg);
      allScraped.push(...prods);
    }
    result.productsScraped = allScraped.length;

    // Match e atualização
    const { matched, updated, created, errors } = await engine.matchAndUpdate(
      allScraped, config.supplierId, supplier.name
    );
    result.productsMatched = matched;
    result.productsUpdated = updated;
    result.productsNew = created;
    result.errors = errors;
    result.success = true;

    // Atualizar registro de configuração
    await db.update(scraperConfigs).set({
      lastRunAt: new Date(),
      lastRunStatus: "success",
      lastRunErrorMessage: null,
      productsScrapedCount: allScraped.length,
      productsMatchedCount: matched,
      productsUpdatedCount: updated,
      productsCreatedCount: created,
    }).where(eq(scraperConfigs.id, scraperConfigId));

  } catch (err: any) {
    result.errors.push(err?.message ?? "Erro desconhecido");
    result.success = false;

    await db.update(scraperConfigs).set({
      lastRunAt: new Date(),
      lastRunStatus: "failed",
      lastRunErrorMessage: err?.message?.slice(0, 500) ?? "Erro desconhecido",
    }).where(eq(scraperConfigs.id, scraperConfigId));
  } finally {
    result.log = (engine as any).log ?? [];
    result.durationMs = Date.now() - startTime;
    await engine.close();

    // Salvar log de execução
    try {
      await db.insert(scraperLogs).values({
        scraperConfigId,
        status: result.success ? "success" : "failed",
        startedAt: new Date(startTime),
        completedAt: new Date(),
        durationMs: result.durationMs,
        productsScraped: result.productsScraped,
        productsMatched: result.productsMatched,
        productsUpdated: result.productsUpdated,
        productsCreated: result.productsNew,
        errorMessage: result.errors[0]?.slice(0, 500),
      });
    } catch {}
  }

  return result;
}
