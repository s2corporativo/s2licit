/**
 * scraperEngine.ts
 * Motor universal de scraping com Puppeteer para sites de fornecedores com login.
 *
 * Suporta qualquer fornecedor via configuração de seletores CSS.
 * Fluxo: Login → Navegar categorias → Extrair produtos → Match → Atualizar preços
 */

import puppeteer, { Browser, Page } from "puppeteer";
import { getDb, recordPriceHistory } from "../db";
import { products, scraperConfigs, scraperLogs, productSupplierOffers } from "../../drizzle/schema";
import { eq, and, or, like } from "drizzle-orm";
import { decryptPassword } from "../utils/encryption";
import { normalizeText } from "../matching/productMatcher";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface SelectorConfig {
  /** URL da página de login (opcional). Se ausente, deriva origin+"/login". */
  loginUrl?: string;
  /**
   * Seletor de um gatilho que ABRE o modal de login (opcional). Em plataformas
   * como F1 Soluções o formulário fica num modal que só existe no DOM após
   * clicar no link "Entrar". Clicado antes de procurar os campos de login.
   */
  loginTrigger?: string;
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
  /**
   * Seletor cuja PRESENÇA confirma o login (ex.: ".f1-client-info--logged").
   * Mais confiável que URL/texto em SPAs e sites com modal.
   */
  loginSuccessSelector?: string;
  /**
   * Extrai produtos dos dados estruturados da página (JSON-LD schema.org e
   * `F1SOLUCOES...pushProducts([...])` / camada de dados) em vez de depender de
   * seletores de grade CSS. Muito mais robusto em lojas F1 Soluções, onde o
   * markup da grade muda mas os dados estruturados carregam nome/código/preço/
   * estoque de forma estável.
   */
  useStructuredData?: boolean;
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
  // Tambasa roda na plataforma "F1 Soluções". Login por MODAL (campo é
  // `username`, não `email`) e preços só aparecem logado. A extração usa os
  // dados estruturados da página (JSON-LD + camada F1SOLUCOES.pushProducts),
  // que carregam nome/código/EAN/preço/estoque de forma estável — os seletores
  // de grade CSS abaixo ficam como fallback.
  tambasa: {
    loginUrl: "https://tambasa.com/",
    // O modal de login é injetado ao clicar no atalho de conta no cabeçalho.
    loginTrigger:
      '.js-modal-login-open, [data-target=".js-modal-login"], a[href="#modal-login"], .header-account__login, .js-open-login',
    loginEmail: '#username, input[name="username"]',
    loginPassword: '#password, input[name="password"]',
    loginSubmit: '.f1-modal-login__submit, #formLogin button[type="submit"]',
    loginSuccessSelector: '.f1-client-info--logged, .f1-client-info__identity-name',
    useStructuredData: true,
    categoryUrls: [
      "https://tambasa.com/categoria/pet-e-vet-e-agro/produtos-veterinarios",
      "https://tambasa.com/categoria/pet-e-vet-e-agro/produtos-veterinarios/medicamentos",
      "https://tambasa.com/categoria/pet-e-vet-e-agro/produtos-veterinarios/carrapaticidas",
      "https://tambasa.com/categoria/pet-e-vet-e-agro/produtos-veterinarios/pomadas",
      "https://tambasa.com/categoria/pet-e-vet-e-agro/produtos-veterinarios/fungicidas",
      "https://tambasa.com/categoria/pet-e-vet-e-agro/produtos-veterinarios/seringas",
    ],
    // Fallback de grade CSS (usado apenas se useStructuredData falhar).
    productItem: '.product-item, .js-product, [data-product], .product-card',
    productName: '.product-item__name, .js-product-name, .product-name, h2, h3',
    productPrice: '.product-item__price, .price-new-price, .js-product-price, .price',
    productCode: '.product-item__code, .product-code, [data-product-code]',
    productEan: '[data-ean], .ean',
    productImage: 'img',
    productLink: 'a',
    nextPage: 'a[rel="next"], .pagination__next a, .pagination-next:not(.disabled)',
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
        // --single-process/--no-zygote foram removidos: causam crash do
        // renderer do Chromium em páginas pesadas (fonte comum de "não captura").
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

    // Alguns sites (ex.: plataforma F1 Soluções) só injetam o formulário de
    // login num modal após clicar num atalho no cabeçalho. Se o campo ainda não
    // está presente e há um gatilho configurado, clica nele primeiro.
    const emailAlreadyVisible = await this.page.$(cfg.loginEmail);
    if (!emailAlreadyVisible && cfg.loginTrigger) {
      const trigger = await this.page.$(cfg.loginTrigger);
      if (trigger) {
        this.addLog("Abrindo modal de login...");
        try {
          await trigger.click();
          await new Promise(r => setTimeout(r, 800));
        } catch { /* segue tentando localizar o campo */ }
      }
    }

    // Aguardar campo de email/usuário aparecer
    try {
      await this.page.waitForSelector(cfg.loginEmail, { timeout: 10000, visible: true });
    } catch {
      throw new Error(`Campo de login não encontrado com seletor: ${cfg.loginEmail}`);
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
    // Sinal positivo por presença de elemento (ex.: área do cliente logado).
    const hasSuccessSelector = cfg.loginSuccessSelector
      ? await this.page.evaluate(
          (sel) => !!document.querySelector(sel),
          cfg.loginSuccessSelector,
        )
      : false;
    // Sinal negativo: se ainda há campo de senha visível, o login NÃO passou.
    const stillHasPasswordField = await this.page.evaluate(
      () => Array.from(document.querySelectorAll('input[type="password"]'))
        .some((el) => (el as HTMLElement).offsetParent !== null),
    );

    const hasErrorText =
      pageText.toLowerCase().includes("senha incorreta") ||
      pageText.toLowerCase().includes("usuário não encontrado") ||
      pageText.toLowerCase().includes("credenciais inválidas") ||
      pageText.toLowerCase().includes("e-mail ou senha");

    const hasPositiveCriterion =
      !!cfg.loginSuccessUrl || !!cfg.loginSuccessText || !!cfg.loginSuccessSelector;

    const loginFailed =
      (cfg.loginSuccessUrl && !currentUrl.includes(cfg.loginSuccessUrl)) ||
      (cfg.loginSuccessText && !pageText.includes(cfg.loginSuccessText)) ||
      (cfg.loginSuccessSelector && !hasSuccessSelector) ||
      hasErrorText ||
      // Sem critério configurado, exige sinal positivo: página sem campo de
      // senha visível. Antes assumia sucesso só por não ver "senha incorreta",
      // raspando páginas deslogadas e gravando preços errados como oficiais.
      (!hasPositiveCriterion && stillHasPasswordField);

    if (loginFailed) {
      throw new Error(`Login falhou ou não pôde ser confirmado. URL atual: ${currentUrl}`);
    }

    this.addLog(`Login confirmado. URL: ${currentUrl}`);
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
      let produtos = cfg.useStructuredData
        ? await this.extractStructuredProducts()
        : await this.extractPageProducts(cfg);
      // Se os dados estruturados vierem vazios, cai para os seletores de grade.
      if (cfg.useStructuredData && produtos.length === 0) {
        produtos = await this.extractPageProducts(cfg);
      }
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

  /**
   * Extrai produtos dos DADOS ESTRUTURADOS da página, sem depender de seletores
   * de grade CSS. Combina duas fontes que a plataforma F1 Soluções (Tambasa)
   * emite tanto em páginas de listagem quanto de detalhe:
   *
   *  1. `F1SOLUCOES...pushProducts([...])` na camada de dados — traz preço,
   *     estoque, código e SKU de forma confiável (preço só existe logado).
   *  2. JSON-LD schema.org (`@type: Product` / `ItemList`) — nome, SKU, marca,
   *     EAN e imagem (normalmente sem preço).
   *
   * Casa as duas por código/SKU para montar o produto mais completo possível.
   */
  private async extractStructuredProducts(): Promise<ScrapedProduct[]> {
    return this.page!.evaluate(() => {
      const toNumber = (v: unknown): number => {
        if (typeof v === "number") return isFinite(v) ? v : 0;
        if (typeof v === "string") {
          // Aceita "361,36", "1.234,56" e "1234.56".
          const s = v.replace(/[^\d,.-]/g, "");
          const norm = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
          const n = parseFloat(norm);
          return isNaN(n) ? 0 : n;
        }
        return 0;
      };

      // ── Fonte 1: chamadas pushProducts([...]) em scripts inline ────────────
      const fromDataLayer: any[] = [];
      const scripts = Array.from(document.querySelectorAll("script:not([src])"));
      for (const sc of scripts) {
        const text = sc.textContent ?? "";
        let idx = text.indexOf("pushProducts(");
        while (idx !== -1) {
          // Localiza o "[" do argumento e casa os colchetes respeitando strings.
          const start = text.indexOf("[", idx);
          if (start === -1) break;
          let depth = 0, end = -1, inStr = false, quote = "";
          for (let i = start; i < text.length; i++) {
            const ch = text[i];
            if (inStr) {
              if (ch === "\\") { i++; continue; }
              if (ch === quote) inStr = false;
            } else if (ch === '"' || ch === "'") {
              inStr = true; quote = ch;
            } else if (ch === "[") {
              depth++;
            } else if (ch === "]") {
              depth--;
              if (depth === 0) { end = i; break; }
            }
          }
          if (end === -1) break;
          try {
            const arr = JSON.parse(text.slice(start, end + 1));
            if (Array.isArray(arr)) fromDataLayer.push(...arr);
          } catch { /* argumento não era JSON puro; ignora */ }
          idx = text.indexOf("pushProducts(", end);
        }
      }

      // ── Fonte 2: blocos JSON-LD schema.org ─────────────────────────────────
      const jsonLdProducts: any[] = [];
      const ldNodes = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
      const collectProducts = (node: any) => {
        if (!node || typeof node !== "object") return;
        if (Array.isArray(node)) { node.forEach(collectProducts); return; }
        const type = node["@type"];
        if (type === "Product" || (Array.isArray(type) && type.includes("Product"))) {
          jsonLdProducts.push(node);
        }
        if (node.itemListElement) collectProducts(node.itemListElement);
        if (node.item) collectProducts(node.item);
        if (node["@graph"]) collectProducts(node["@graph"]);
      };
      for (const n of ldNodes) {
        try { collectProducts(JSON.parse(n.textContent ?? "null")); } catch { /* ignora */ }
      }

      // ── Índice de metadados do JSON-LD por SKU para enriquecer preços ──────
      const ldBySku = new Map<string, any>();
      for (const p of jsonLdProducts) {
        const sku = String(p.sku ?? p.mpn ?? p.gtin13 ?? p.productID ?? "").trim();
        if (sku) ldBySku.set(sku, p);
      }

      const eanOf = (p: any): string | undefined => {
        const raw = p.gtin13 ?? p.gtin14 ?? p.gtin ?? p.ean ?? (p.specs && p.specs.ean);
        const s = raw != null ? String(raw).trim() : "";
        return s && /^\d{8,14}$/.test(s) ? s : undefined;
      };
      const imageOf = (p: any): string | undefined => {
        const img = Array.isArray(p.image) ? p.image[0] : p.image;
        return typeof img === "string" && img ? img : undefined;
      };

      const out: ScrapedProduct[] = [];
      const seen = new Set<string>();

      // Prioriza a camada de dados (tem preço/estoque).
      for (const d of fromDataLayer) {
        const code = String(d.code ?? d.sku ?? d.id ?? "").trim();
        const price = toNumber(d.spot_price ?? d.price ?? d.old_price);
        const name = String(d.name ?? "").trim();
        if (!name || price <= 0) continue;
        const key = code || name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        const ld = code ? ldBySku.get(code) : undefined;
        out.push({
          name,
          price,
          code: code || undefined,
          ean: eanOf(d) ?? (ld ? eanOf(ld) : undefined),
          imageUrl: (d.image && String(d.image)) || (ld ? imageOf(ld) : undefined),
          productUrl: d.url ? String(d.url) : (ld && ld.url ? String(ld.url) : undefined),
          availability:
            typeof d.stock !== "undefined" && toNumber(d.stock) > 0 ? "disponivel" : undefined,
        });
      }

      // JSON-LD que traga preço em offers e ainda não tenha sido coberto.
      for (const p of jsonLdProducts) {
        const offers = Array.isArray(p.offers) ? p.offers[0] : p.offers;
        const price = offers ? toNumber(offers.price ?? offers.lowPrice) : 0;
        const name = String(p.name ?? "").trim();
        if (!name || price <= 0) continue;
        const code = String(p.sku ?? p.mpn ?? "").trim();
        const key = code || name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          name,
          price,
          code: code || undefined,
          ean: eanOf(p),
          imageUrl: imageOf(p),
          productUrl: typeof p.url === "string" ? p.url : undefined,
          availability:
            offers && typeof offers.availability === "string" && /InStock/i.test(offers.availability)
              ? "disponivel"
              : undefined,
        });
      }

      return out;
    });
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

          // Versiona o preço capturado no histórico (antes o scraping não
          // registrava, deixando alertas de variação cegos para a captura).
          try {
            await recordPriceHistory({ productId, supplierId, price: String(sp.price) });
          } catch { /* não bloqueia a captura por falha de histórico */ }
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

  // Credenciais. O e-mail é armazenado em TEXTO PURO (não é segredo) — algumas
  // telas gravavam sem criptografar e o motor tentava descriptografar, quebrando
  // 100% das capturas. Aqui toleramos ambos: se já parece e-mail, usa direto;
  // senão tenta descriptografar (registros antigos). Só a SENHA é criptografada.
  let email: string, password: string;
  if (config.email && config.email.includes("@")) {
    email = config.email;
  } else {
    try { email = decryptPassword(config.email); } catch { email = config.email ?? ""; }
  }
  try {
    password = decryptPassword(config.passwordHash);
  } catch {
    throw new Error("Falha ao descriptografar a senha do fornecedor");
  }

  // Determinar URL de login: usa a configurada; senão deriva do origin da
  // primeira categoria; por fim cai no padrão "<tipo>.com.br/login".
  const loginUrl =
    cfg.loginUrl ??
    (cfg.categoryUrls[0]
      ? new URL(cfg.categoryUrls[0]).origin + "/login"
      : `https://${scraperType}.com.br/login`);

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

    // Fail-closed: 0 produtos capturados quase sempre é falha silenciosa
    // (login não confirmado ou seletor CSS quebrado). Antes marcava "sucesso"
    // e a equipe confiava em preços não atualizados.
    if (allScraped.length === 0) {
      throw new Error("Nenhum produto capturado — verifique login e seletores (possível falha silenciosa).");
    }

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
