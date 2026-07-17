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
import { supplierSessionService } from "./supplierSessionService";
import { puppeteerCookiesToRecord, recordToPuppeteerCookies } from "./sessionCookies";

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
  /**
   * Template de URL de busca por termo (§4/§5), com o placeholder {q} (ou
   * {termo}). Ex.: "https://site.com/busca?q={q}". Quando presente, permite
   * pesquisar um produto específico em vez de varrer categorias inteiras.
   */
  searchUrlTemplate?: string;
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
  // §7 — campos adicionais (opcionais; ausentes = não disponibilizado, nunca
  // inventados). Proveniência: consultadoEm/fonteUrl são carimbados no Node.
  priceNormal?: number;     // preço "de" (old_price)
  pricePromo?: number;      // preço promocional (spot_price), quando < normal
  stock?: number;           // estoque informado
  consultadoEm?: number;    // epoch ms da consulta
  fonteUrl?: string;        // URL de origem do dado
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

/**
 * Monta a URL de busca a partir do template do fornecedor e do termo (§4/§5).
 * Substitui {q}/{termo}; sem placeholder, anexa ?q=/&q=. Pura e testável.
 */
export function buildSearchUrl(template: string, termo: string): string {
  const enc = encodeURIComponent(termo.trim());
  if (/\{q\}|\{termo\}/i.test(template)) {
    return template.replace(/\{q\}/gi, enc).replace(/\{termo\}/gi, enc);
  }
  const sep = template.includes("?") ? "&" : "?";
  return `${template}${sep}q=${enc}`;
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
    // Seletores reais confirmados na plataforma F1 Soluções (tambasa.com).
    productItem: '.f1-product-item, .products-lists__list-item',
    productName: '.f1-product-item__name-title, .f1-product-item__name-link',
    productPrice: '.f1-box-price__price',
    // Texto vem como "Código: NNNNNN"; o prefixo é removido em extractPageProducts.
    productCode: '.f1-product-item__code-text',
    productEan: '[data-ean], .ean',
    productImage: 'img',
    productLink: '.f1-product-item__name-link, a',
    nextPage: '.f1-pagination__list-item-link--next',
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

  // ── Templates iniciais (VALIDAR com "testar login" e ajustar) ────────────────
  // Os sites abaixo bloqueiam inspeção automática (403 anti-bot), então estes
  // configs partem das URLs públicas conhecidas + seletores de fallback amplos e
  // extração por dados estruturados. Confirme os seletores no Configurador de
  // Fornecedores (botão "testar login") e prefira catálogo/API onde o ToS
  // restringir automação (§17).
  // Bartofil B2B é uma SPA (React/Vite: <div id="root">, bundle /assets/*.js,
  // manifest.webmanifest) — NÃO é Magento. O formulário de login e a grade de
  // produtos são renderizados por JavaScript, então waitForSelector é essencial
  // (esperar o campo de senha aparecer antes de preencher). Como é SPA com
  // catálogo servido por API interna, o caminho recomendado (§4) é API/catálogo;
  // a raspagem do DOM é fallback. Os seletores abaixo são genéricos amplos —
  // confirme os reais no Configurador ("testar login") a partir do DOM
  // renderizado (F12 → Inspecionar o <input> de e-mail/senha).
  bartofil: {
    loginUrl: "https://www.bartofil.com.br/login",
    loginEmail:
      'input[type="email"], input[name="email"], input[name="username"], input[name="login"], input[id*="email" i], input[placeholder*="mail" i], input[placeholder*="CNPJ" i]',
    loginPassword:
      'input[type="password"], input[name="password"], input[name="senha"], input[id*="pass" i], input[id*="senha" i]',
    loginSubmit: 'button[type="submit"], [type="submit"], button[class*="login" i]',
    // Espera o formulário da SPA hidratar antes de tentar o login.
    waitForSelector: 'input[type="password"]',
    categoryUrls: [],
    // Rota de busca da SPA ainda não confirmada — ajuste no Configurador.
    searchUrlTemplate: "https://www.bartofil.com.br/busca?q={q}",
    productItem: '[class*="product"], [class*="produto"], [class*="card"], li[class*="item"]',
    productName: 'h2, h3, [class*="name"], [class*="nome"], [class*="title"], [class*="titulo"]',
    productPrice: '[class*="price"], [class*="preco"], [class*="valor"]',
    productImage: 'img',
    productLink: 'a',
    nextPage: '[rel="next"], [class*="next"], [class*="proxima"]',
    navigationWait: 3000,
  },
  // Basso Pancotte usa o "Portal do cliente" em React Native Web / Expo
  // (cliente.bassopancotte.com.br: fontes @expo/vector-icons, bundle
  // webpackJsonppec, sweetalert2) — NÃO é loja server-rendered. O login e o
  // conteúdo são renderizados por JS; o RNW gera DOM aninhado com classes
  // hasheadas, então a raspagem por seletores CSS é frágil. Caminho recomendado
  // (§4): API/catálogo ou captura manual. Confirme os seletores reais e a rota
  // do catálogo pelo Configurador ("testar login" a partir do DOM renderizado).
  bassopancotte: {
    loginUrl: "https://cliente.bassopancotte.com.br/login",
    // RNW: senha vira input[type=password]; e-mail costuma vir como type=text.
    loginEmail:
      'input[type="email"], input[autocomplete="username"], input[autocomplete="email"], input[name*="email" i], input[name*="user" i], input[type="text"]',
    loginPassword: 'input[type="password"], input[autocomplete="current-password"], input[name*="senha" i], input[name*="pass" i]',
    // RNW renderiza botões como <div role="button"> ou <button>.
    loginSubmit: 'button[type="submit"], [role="button"], button',
    waitForSelector: 'input[type="password"]',
    // Rota de busca do portal ainda não confirmada — ajuste no Configurador.
    searchUrlTemplate: "https://cliente.bassopancotte.com.br/busca?q={q}",
    categoryUrls: [],
    productItem: '[class*="product"], [class*="produto"], [class*="item"], [class*="card"]',
    productName: 'h2, h3, [class*="name"], [class*="title"], [class*="nome"]',
    productPrice: '[class*="price"], [class*="preco"], [class*="valor"]',
    productImage: 'img',
    productLink: 'a',
    nextPage: '[rel="next"], [class*="next"], [class*="proxima"]',
    navigationWait: 3000,
  },
  magazinemedica: {
    // Login confirmado (base Django); entra por CPF/CNPJ ou e-mail.
    loginUrl: "https://magazinemedica.com.br/accounts/registro/login/",
    loginEmail: '#id_username, input[name="username"], input[name="login"], input[type="text"]',
    loginPassword: '#id_password, input[name="password"], input[type="password"]',
    loginSubmit: 'button[type="submit"], input[type="submit"]',
    useStructuredData: true,
    categoryUrls: [],
    searchUrlTemplate: "https://magazinemedica.com.br/busca/?q={q}",
    productItem: '.product, .produto, [class*="product"], [class*="card"]',
    productName: 'h2, h3, .name, .title, .nome',
    productPrice: '.price, .preco, [class*="price"], [class*="preco"]',
    productImage: 'img',
    productLink: 'a',
    nextPage: '[rel="next"], .next, .proxima',
    navigationWait: 2500,
  },
  // Utilidades Clínicas roda em Magento 2 (base Henry Schein Brazil). Seletores
  // reais confirmados na página de login. B2B profissional: os preços só
  // aparecem logado e há produtos restritos (exigem CRM/CRMV/CRO no cadastro).
  //
  // ⚠ §3/§17 — o site tem CAPTCHA no user_login (hoje isRequired:false, mas pode
  // ser ligado) e AUTENTICAÇÃO POR DISPOSITIVO / 2FA (modal hsb-mfa, token por
  // SMS/WhatsApp). Quando qualquer um for exigido, o login automático NÃO deve
  // tentar resolvê-lo: o motor detecta o desafio e requer intervenção humana
  // (login manual + reuso de sessão via cookies). Prefira o caminho de
  // catálogo/sessão salva; a raspagem com senha só funciona quando 2FA/captcha
  // estiverem desligados para o acesso usado.
  utilidadesclinicas: {
    // Página de login padrão do Magento (o mesmo formulário existe no modal
    // #login-form-registro, que posta em /customer/ajax/login/).
    loginUrl: "https://www.utilidadesclinicas.com.br/customer/account/login/",
    // Campo aceita e-mail OU CPF/CNPJ (label "E-mail ou CPF/CNPJ").
    loginEmail: '#email-registro, input[name="login[username]"], #email, input[name="login[username]"]',
    loginPassword: '#pass-popup, input[name="login[password]"], #pass',
    loginSubmit: '#send2, button.action.login, button[type="submit"]',
    // Em Magento o link de logout no cabeçalho confirma a sessão autenticada.
    loginSuccessSelector: '.customer-welcome, a[href*="customer/account/logout"], .customer-name',
    useStructuredData: true,
    categoryUrls: [
      "https://www.utilidadesclinicas.com.br/veterinaria.html",
      "https://www.utilidadesclinicas.com.br/descartaveis.html",
      "https://www.utilidadesclinicas.com.br/estetoscopios.html",
    ],
    // Busca padrão do Magento (endpoint de resultado). O mini-form do site usa
    // /catalog_search/?term= — se este template voltar vazio, troque no
    // Configurador ("testar login" / capturar).
    searchUrlTemplate: "https://www.utilidadesclinicas.com.br/catalogsearch/result/?q={q}",
    productItem: '.product-item, li.item.product, [class*="product-item"]',
    productName: '.product-item-link, .product-item-name, h2, h3',
    productPrice: '.price, [data-price-type="finalPrice"] .price, [class*="price"]',
    productImage: 'img.product-image-photo, img',
    productLink: '.product-item-link, a.product-item-photo, a',
    nextPage: '.pages-item-next a, [rel="next"], .action.next',
    navigationWait: 2500,
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

  /** Verifica se a página atual está autenticada, pelos sinais da config. */
  private async verificarLogado(cfg: SelectorConfig): Promise<boolean> {
    if (!this.page) return false;
    try {
      if (cfg.loginSuccessSelector) {
        return await this.page.evaluate(
          (sel) => !!document.querySelector(sel),
          cfg.loginSuccessSelector,
        );
      }
      // Sem seletor de sucesso: considera logado se não há campo de senha visível.
      const temSenhaVisivel = await this.page.evaluate(() =>
        Array.from(document.querySelectorAll('input[type="password"]')).some(
          (el) => (el as HTMLElement).offsetParent !== null,
        ),
      );
      return !temSenhaVisivel;
    } catch {
      return false;
    }
  }

  /**
   * §4 — tenta reutilizar uma sessão salva (cookies criptografados) antes de
   * refazer o login por formulário. Totalmente defensivo: qualquer falha
   * retorna false e o fluxo cai no login normal.
   */
  private async tentarReutilizarSessao(
    supplierId: number,
    loginUrl: string,
    cfg: SelectorConfig,
  ): Promise<boolean> {
    try {
      const session = await supplierSessionService.getActiveSession(supplierId);
      if (!session) return false;
      const cookies = recordToPuppeteerCookies(
        supplierSessionService.parseCookies(session),
        loginUrl,
      );
      if (cookies.length === 0) return false;

      await this.page!.setCookie(...cookies);
      await this.page!.goto(loginUrl, { waitUntil: "networkidle2", timeout: 30000 });
      await new Promise((r) => setTimeout(r, 800));

      const logado = await this.verificarLogado(cfg);
      if (!logado) {
        // Sessão não vale mais: marca como expirada para não insistir.
        await supplierSessionService.expireSession(supplierId).catch(() => {});
      }
      return logado;
    } catch {
      return false;
    }
  }

  /** Salva os cookies atuais como sessão reutilizável (best-effort). */
  private async salvarSessao(supplierId: number): Promise<void> {
    try {
      if (!this.page) return;
      const record = puppeteerCookiesToRecord(await this.page.cookies());
      if (Object.keys(record).length === 0) return;
      await supplierSessionService.upsertSession(supplierId, { cookies: record }, "active");
      this.addLog("Sessão salva para reuso.");
    } catch {
      /* auditoria/persistência de sessão nunca bloqueia a captura */
    }
  }

  /** Faz login no site do fornecedor */
  async login(
    loginUrl: string,
    email: string,
    password: string,
    cfg: SelectorConfig,
    supplierId?: number,
  ): Promise<void> {
    if (!this.browser) await this.init();
    this.page = await this.browser!.newPage();

    // User-agent real para evitar bloqueio anti-bot
    await this.page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    // Viewport padrão desktop
    await this.page.setViewport({ width: 1366, height: 768 });

    // §4 — reutiliza sessão salva quando possível (evita novo login).
    if (supplierId != null && (await this.tentarReutilizarSessao(supplierId, loginUrl, cfg))) {
      this.addLog("Sessão reutilizada — login por formulário dispensado.");
      return;
    }

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

    // §4 — persiste a sessão para reuso na próxima execução.
    if (supplierId != null) await this.salvarSessao(supplierId);
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
      // §7 — proveniência: carimba origem e horário da consulta (para validade
      // de preço, §13). Feito no Node (fora do page.evaluate).
      const agora = Date.now();
      for (const p of produtos) {
        p.consultadoEm = agora;
        p.fonteUrl = p.productUrl ?? categoryUrl;
      }
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

  /**
   * Pesquisa um termo específico usando o template de busca do fornecedor
   * (§4/§5), em vez de varrer categorias inteiras. Reaproveita a extração e
   * carimba a proveniência. Requer searchUrlTemplate configurado.
   */
  async scrapeSearch(termo: string, cfg: SelectorConfig): Promise<ScrapedProduct[]> {
    if (!this.page) throw new Error("Não autenticado. Chame login() primeiro.");
    if (!cfg.searchUrlTemplate) {
      throw new Error("Busca por termo indisponível: searchUrlTemplate não configurado para este fornecedor.");
    }
    const url = buildSearchUrl(cfg.searchUrlTemplate, termo);
    this.addLog(`Buscando "${termo}": ${url}`);
    await this.page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
    await new Promise((r) => setTimeout(r, cfg.navigationWait ?? 2000));
    if (cfg.waitForSelector) {
      try {
        await this.page.waitForSelector(cfg.waitForSelector, { timeout: 10000 });
      } catch {
        this.addLog(`Aviso: seletor de espera "${cfg.waitForSelector}" não encontrado na busca.`);
      }
    }
    let produtos = cfg.useStructuredData
      ? await this.extractStructuredProducts()
      : await this.extractPageProducts(cfg);
    if (cfg.useStructuredData && produtos.length === 0) {
      produtos = await this.extractPageProducts(cfg);
    }
    const agora = Date.now();
    for (const p of produtos) {
      p.consultadoEm = agora;
      p.fonteUrl = p.productUrl ?? url;
    }
    this.addLog(`  Busca "${termo}": ${produtos.length} produtos.`);
    return produtos;
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

          // Código vem como "Código: 123456" na F1 Soluções — remove o rótulo.
          const codeRaw = c.productCode ? getText(c.productCode) : "";
          const code = codeRaw
            .replace(/c[oó]digo\s*:?/i, "")
            .trim() || undefined;

          // Parse de preço BR: R$ 1.234,56 → 1234.56
          const priceClean = priceRaw
            .replace(/[^\d,.-]/g, "")
            .replace(/\.(\d{3})/g, "$1")   // remove ponto de milhar
            .replace(",", ".");             // vírgula decimal → ponto
          const price = parseFloat(priceClean);

          return {
            name,
            price: isNaN(price) ? 0 : price,
            code,
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
        // §7 — preço "de", promocional e estoque quando a camada de dados os
        // expõe. Ausentes ficam undefined (não inventar).
        const precoNormalRaw = toNumber(d.old_price ?? d.price);
        const precoSpot = toNumber(d.spot_price);
        const temEstoque = typeof d.stock !== "undefined";
        const estoque = temEstoque ? toNumber(d.stock) : undefined;
        out.push({
          name,
          price,
          code: code || undefined,
          ean: eanOf(d) ?? (ld ? eanOf(ld) : undefined),
          imageUrl: (d.image && String(d.image)) || (ld ? imageOf(ld) : undefined),
          productUrl: d.url ? String(d.url) : (ld && ld.url ? String(ld.url) : undefined),
          availability: temEstoque ? (estoque! > 0 ? "disponivel" : "indisponivel") : undefined,
          priceNormal: precoNormalRaw > 0 ? precoNormalRaw : undefined,
          pricePromo: precoSpot > 0 && precoNormalRaw > 0 && precoSpot < precoNormalRaw ? precoSpot : undefined,
          stock: estoque,
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
            // §7 — reflete a disponibilidade real (antes gravava sempre
            // "disponivel"); promo/estoque quando o fornecedor os expõe.
            availability: sp.availability ?? "disponivel",
            promoPrice: sp.pricePromo != null ? String(sp.pricePromo) : null,
            stock: sp.stock ?? null,
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

// ─── Teste de conexão (login real, sem raspar) ────────────────────────────────

export interface TestLoginResult {
  success: boolean;
  message: string;
  log: string[];
}

/**
 * Faz APENAS o login no site do fornecedor para validar as credenciais, sem
 * raspar produtos. Usado pela tela "Configurador de Fornecedores" antes de
 * salvar/agendar uma captura, para dar um retorno imediato de credencial válida.
 *
 * Não persiste nada no banco e sempre fecha o navegador ao final.
 */
export async function testarLoginFornecedor(
  scraperType: string,
  email: string,
  password: string,
  customSelectors?: SelectorConfig,
): Promise<TestLoginResult> {
  if (!email || !password) {
    return { success: false, message: "E-mail e senha são obrigatórios", log: [] };
  }

  const tipo = scraperType?.toLowerCase() ?? "generico";
  const cfg = customSelectors ?? FORNECEDOR_CONFIGS[tipo] ?? FORNECEDOR_CONFIGS.generico;

  // Mesma derivação de URL de login usada em executarScraper.
  const loginUrl =
    cfg.loginUrl ??
    (cfg.categoryUrls[0]
      ? new URL(cfg.categoryUrls[0]).origin + "/login"
      : `https://${tipo}.com.br/login`);

  const engine = new ScraperEngine();
  try {
    await engine.login(loginUrl, email, password, cfg);
    return {
      success: true,
      message: "Login confirmado no site do fornecedor. Credenciais válidas.",
      log: (engine as any).log ?? [],
    };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message ?? "Falha ao autenticar no site do fornecedor",
      log: (engine as any).log ?? [],
    };
  } finally {
    await engine.close();
  }
}

// ─── Função principal de execução ─────────────────────────────────────────────

// Guarda em memória para impedir que o mesmo fornecedor seja raspado duas vezes
// ao mesmo tempo (ex.: clique manual em "Atualizar Agora" coincidindo com o
// disparo automático agendado). Compartilhada por qualquer chamador do módulo.
const runningConfigIds = new Set<number>();

export function isScraperRunning(scraperConfigId: number): boolean {
  return runningConfigIds.has(scraperConfigId);
}

export async function executarScraper(scraperConfigId: number): Promise<ScraperRunResult> {
  if (runningConfigIds.has(scraperConfigId)) {
    throw new Error(`Scraper #${scraperConfigId} já está em execução.`);
  }
  runningConfigIds.add(scraperConfigId);
  try {
    return await executarScraperInternal(scraperConfigId);
  } finally {
    runningConfigIds.delete(scraperConfigId);
  }
}

/**
 * Busca sob demanda de produtos de um fornecedor configurado, sem persistir
 * (usada pelos conectores da cascata §4). Faz login (reusando sessão) e, se
 * houver termo + searchUrlTemplate, pesquisa; senão raspa a 1ª categoria.
 */
export async function buscarProdutosFornecedor(
  scraperConfigId: number,
  query: { termo?: string; codigo?: string },
): Promise<ScrapedProduct[]> {
  // Participa do mesmo lock por config do executarScraper: impede dois
  // navegadores simultâneos na mesma conta (sessão/throttling do fornecedor).
  if (runningConfigIds.has(scraperConfigId)) {
    throw new Error(`Fornecedor #${scraperConfigId} já está em consulta — tente novamente em instantes.`);
  }
  runningConfigIds.add(scraperConfigId);
  try {
    return await buscarProdutosFornecedorInterno(scraperConfigId, query);
  } finally {
    runningConfigIds.delete(scraperConfigId);
  }
}

async function buscarProdutosFornecedorInterno(
  scraperConfigId: number,
  query: { termo?: string; codigo?: string },
): Promise<ScrapedProduct[]> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const configs = await db.select().from(scraperConfigs)
    .where(eq(scraperConfigs.id, scraperConfigId)).limit(1);
  if (!configs[0]) throw new Error(`Configuração de scraper #${scraperConfigId} não encontrada`);
  const config = configs[0];

  const scraperType = config.scraperType.toLowerCase();
  const cfg: SelectorConfig =
    (config.customSelectors as SelectorConfig | null) ??
    FORNECEDOR_CONFIGS[scraperType] ??
    FORNECEDOR_CONFIGS.generico;

  let email: string, password: string;
  if (config.email && config.email.includes("@")) email = config.email;
  else { try { email = decryptPassword(config.email); } catch { email = config.email ?? ""; } }
  try { password = decryptPassword(config.passwordHash); }
  catch { throw new Error("Falha ao descriptografar a senha do fornecedor"); }

  const loginUrl =
    cfg.loginUrl ??
    (cfg.categoryUrls[0]
      ? new URL(cfg.categoryUrls[0]).origin + "/login"
      : `https://${scraperType}.com.br/login`);

  const engine = new ScraperEngine();
  try {
    await engine.login(loginUrl, email, password, cfg, config.supplierId);
    const termo = (query.termo ?? query.codigo ?? "").trim();
    if (termo && cfg.searchUrlTemplate) return await engine.scrapeSearch(termo, cfg);
    if (cfg.categoryUrls[0]) return await engine.scrapeCategory(cfg.categoryUrls[0], cfg);
    return [];
  } finally {
    await engine.close();
  }
}

async function executarScraperInternal(scraperConfigId: number): Promise<ScraperRunResult> {
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

  // Buscar seletores do fornecedor: seletores customizados cadastrados pelo
  // usuário têm prioridade sobre a config fixa por tipo.
  const scraperType = config.scraperType.toLowerCase();
  const cfg: SelectorConfig =
    (config.customSelectors as SelectorConfig | null) ??
    FORNECEDOR_CONFIGS[scraperType] ??
    FORNECEDOR_CONFIGS.generico;

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
    // Login (reutiliza a sessão do fornecedor quando válida, §4)
    await engine.login(loginUrl, email, password, cfg, config.supplierId);

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
