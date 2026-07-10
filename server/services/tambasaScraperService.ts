import puppeteer, { Browser, Page } from "puppeteer";
import { getDb } from "../db";
import { eq } from "drizzle-orm";
import { products, suppliers } from "../../drizzle/schema";

export interface TambasaScraperConfig {
  email: string;
  password: string;
  supplierId: number;
  enabled: boolean;
  lastRun?: Date;
  nextRun?: Date;
  scheduleTime: string; // "HH:mm" format
}

export interface ScrapedProduct {
  name: string;
  code?: string;
  ean?: string;
  price: number;
  unit?: string;
  imageUrl?: string;
  productUrl?: string;
  category?: string;
}

export interface ScraperResult {
  success: boolean;
  productsScraped: number;
  productsMatched: number;
  productsUpdated: number;
  productsCreated: number;
  errors: string[];
  startTime: Date;
  endTime: Date;
  duration: number; // milliseconds
}

/**
 * Tambasa Web Scraper Service
 * Extrai preços de produtos do site tambasa.com.br com login automático
 */
export class TambasaScraperService {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private readonly baseUrl = "https://tambasa.com";
  private readonly loginUrl = "https://tambasa.com/login";
  private readonly categoryUrl = "https://tambasa.com/categoria/pet-e-vet-e-agro/produtos-veterinarios";

  /**
   * Inicializa o navegador Puppeteer
   */
  async initBrowser(): Promise<void> {
    if (this.browser) return;

    this.browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--single-process",
      ],
    });
  }

  /**
   * Fecha o navegador
   */
  async closeBrowser(): Promise<void> {
    if (this.page) {
      await this.page.close();
      this.page = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * Faz login no site da Tambasa
   */
  async login(email: string, password: string): Promise<boolean> {
    try {
      if (!this.browser) await this.initBrowser();
      this.page = await this.browser!.newPage();

      // Navega para página de login
      await this.page.goto(this.loginUrl, { waitUntil: "networkidle2" });

      // Preenche email
      await this.page.type('input[name="email"]', email);

      // Preenche senha
      await this.page.type('input[name="password"]', password);

      // Clica em login
      await this.page.click('button[type="submit"]');

      // Aguarda redirecionamento após login
      await this.page.waitForNavigation({ waitUntil: "networkidle2" });

      // Verifica se login foi bem-sucedido
      const url = this.page.url();
      if (url.includes("login")) {
        throw new Error("Login falhou - redirecionado para página de login");
      }

      return true;
    } catch (error) {
      throw new Error(`Erro ao fazer login na Tambasa: ${error}`);
    }
  }

  /**
   * Extrai preços de produtos da categoria de produtos veterinários
   */
  async scrapeProducts(): Promise<ScrapedProduct[]> {
    if (!this.page) {
      throw new Error("Navegador não inicializado");
    }

    const products: ScrapedProduct[] = [];

    try {
      // Navega para categoria de produtos veterinários
      await this.page.goto(this.categoryUrl, { waitUntil: "networkidle2" });

      // Aguarda carregamento dos produtos
      await this.page.waitForSelector('[data-product-item]', { timeout: 10000 });

      // Extrai informações dos produtos
      const productElements = await this.page.$$('[data-product-item]');

      for (const element of productElements) {
        try {
          const product = await this.extractProductInfo(element);
          if (product) {
            products.push(product);
          }
        } catch (error) {
          console.error("Erro ao extrair produto:", error);
          continue;
        }
      }

      // Se houver paginação, continua extraindo
      let hasNextPage = await this.hasNextPage();
      while (hasNextPage) {
        await this.goToNextPage();
        await this.page.waitForSelector('[data-product-item]', { timeout: 10000 });

        const nextPageElements = await this.page.$$('[data-product-item]');
        for (const element of nextPageElements) {
          try {
            const product = await this.extractProductInfo(element);
            if (product) {
              products.push(product);
            }
          } catch (error) {
            console.error("Erro ao extrair produto:", error);
            continue;
          }
        }

        hasNextPage = await this.hasNextPage();
      }

      return products;
    } catch (error) {
      throw new Error(`Erro ao extrair produtos: ${error}`);
    }
  }

  /**
   * Extrai informações de um produto individual
   */
  private async extractProductInfo(element: any): Promise<ScrapedProduct | null> {
    try {
      const name = await element.$eval(
        '[data-product-name]',
        (el: any) => el.textContent?.trim() || ""
      );

      const priceText = await element.$eval(
        '[data-product-price]',
        (el: any) => el.textContent?.trim() || "0"
      );

      // Remove "R$" e converte para número
      const price = parseFloat(priceText.replace(/[^\d,.-]/g, "").replace(",", "."));

      const code = await element.$eval(
        '[data-product-code]',
        (el: any) => el.textContent?.trim() || undefined
      ).catch(() => undefined);

      const ean = await element.$eval(
        '[data-product-ean]',
        (el: any) => el.textContent?.trim() || undefined
      ).catch(() => undefined);

      const imageUrl = await element.$eval(
        'img[data-product-image]',
        (el: any) => el.src || undefined
      ).catch(() => undefined);

      const productUrl = await element.$eval(
        'a[data-product-link]',
        (el: any) => el.href || undefined
      ).catch(() => undefined);

      if (!name || isNaN(price)) {
        return null;
      }

      return {
        name,
        code,
        ean,
        price,
        imageUrl,
        productUrl,
      };
    } catch (error) {
      console.error("Erro ao extrair informações do produto:", error);
      return null;
    }
  }

  /**
   * Verifica se há próxima página
   */
  private async hasNextPage(): Promise<boolean> {
    if (!this.page) return false;

    try {
      const nextButton = await this.page.$('[data-next-page]:not([disabled])');
      return !!nextButton;
    } catch {
      return false;
    }
  }

  /**
   * Navega para próxima página
   */
  private async goToNextPage(): Promise<void> {
    if (!this.page) return;

    try {
      await this.page.click('[data-next-page]');
      await this.page.waitForNavigation({ waitUntil: "networkidle2" });
    } catch (error) {
      throw new Error(`Erro ao navegar para próxima página: ${error}`);
    }
  }

  /**
   * Faz matching de produtos scraped com produtos existentes
   */
  async matchProducts(
    scrapedProducts: ScrapedProduct[],
    supplierId: number
  ): Promise<Map<ScrapedProduct, number | null>> {
    const db = await getDb();
    if (!db) throw new Error("Database connection failed");
    const matches = new Map<ScrapedProduct, number | null>();

    for (const scrapedProduct of scrapedProducts) {
      try {
        // Tenta encontrar por EAN
        if (scrapedProduct.ean) {
          const existingByEan = await db
            .select()
            .from(products)
            .where(eq(products.ean, scrapedProduct.ean))
            .limit(1);

          if (existingByEan.length > 0) {
            matches.set(scrapedProduct, existingByEan[0].id);
            continue;
          }
        }

        // Tenta encontrar por código do fornecedor
        if (scrapedProduct.code) {
          const existingByCode = await db
            .select()
            .from(products)
            .where(eq(products.codigoFornecedor, scrapedProduct.code))
            .limit(1);

          if (existingByCode.length > 0) {
            matches.set(scrapedProduct, existingByCode[0].id);
            continue;
          }
        }

        // Tenta encontrar por nome (fuzzy matching)
        const existingByName = await db
          .select()
          .from(products)
          .where(eq(products.name, scrapedProduct.name))
          .limit(1);

        if (existingByName.length > 0) {
          matches.set(scrapedProduct, existingByName[0].id);
        } else {
          // Produto não encontrado
          matches.set(scrapedProduct, null);
        }
      } catch (error) {
        console.error(`Erro ao fazer matching do produto ${scrapedProduct.name}:`, error);
        matches.set(scrapedProduct, null);
      }
    }

    return matches;
  }

  /**
   * Atualiza preços dos produtos no banco de dados
   */
  async updatePrices(
    matches: Map<ScrapedProduct, number | null>,
    supplierId: number
  ): Promise<{ updated: number; created: number }> {
    const db = await getDb();
    if (!db) throw new Error("Database connection failed");
    let updated = 0;
    let created = 0;

    for (const [scrapedProduct, productId] of Array.from(matches)) {
      try {
        if (productId) {
          // Atualiza produto existente
          await db
            .update(products)
            .set({
              price: scrapedProduct.price.toString() as any,
              imageUrl: scrapedProduct.imageUrl || undefined,
              productUrl: scrapedProduct.productUrl || undefined,
            })
            .where(eq(products.id, productId));

          updated++;
        } else {
          // Cria novo produto
          const supplier = await db
            .select()
            .from(suppliers)
            .where(eq(suppliers.id, supplierId))
            .limit(1);

          if (supplier.length === 0) {
            console.warn(`Fornecedor ${supplierId} não encontrado`);
            continue;
          }

          await db.insert(products).values({
            name: scrapedProduct.name,
            ean: scrapedProduct.ean,
            codigoFornecedor: scrapedProduct.code,
            price: scrapedProduct.price.toString() as any,
            supplierId: supplierId,
            imageUrl: scrapedProduct.imageUrl,
            productUrl: scrapedProduct.productUrl,
            isActive: "yes",
          });

          created++;
        }
      } catch (error) {
        console.error(`Erro ao atualizar preço do produto ${scrapedProduct.name}:`, error);
      }
    }

    return { updated, created };
  }

  /**
   * Executa o scraping completo
   */
  async run(config: TambasaScraperConfig): Promise<ScraperResult> {
    const startTime = new Date();
    const errors: string[] = [];

    try {
      // Inicializa navegador
      await this.initBrowser();

      // Faz login
      await this.login(config.email, config.password);

      // Extrai produtos
      const scrapedProducts = await this.scrapeProducts();

      // Faz matching
      const matches = await this.matchProducts(scrapedProducts, config.supplierId);

      // Atualiza preços
      const { updated, created } = await this.updatePrices(matches, config.supplierId);

      return {
        success: true,
        productsScraped: scrapedProducts.length,
        productsMatched: Array.from(matches.values()).filter((id) => id !== null).length,
        productsUpdated: updated,
        productsCreated: created,
        errors,
        startTime,
        endTime: new Date(),
        duration: new Date().getTime() - startTime.getTime(),
      };
    } catch (error) {
      errors.push(String(error));
      return {
        success: false,
        productsScraped: 0,
        productsMatched: 0,
        productsUpdated: 0,
        productsCreated: 0,
        errors,
        startTime,
        endTime: new Date(),
        duration: new Date().getTime() - startTime.getTime(),
      };
    } finally {
      await this.closeBrowser();
    }
  }
}

export const tambasaScraper = new TambasaScraperService();
