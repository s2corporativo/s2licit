import type { SelectorConfig } from "./scraperContracts";

export const FORNECEDOR_CONFIGS: Readonly<Record<string, SelectorConfig>> = {
  tambasa: {
    loginUrl: "https://tambasa.com/",
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
    productItem: '.f1-product-item, .products-lists__list-item',
    productName: '.f1-product-item__name-title, .f1-product-item__name-link',
    productPrice: '.f1-box-price__price',
    productCode: '.f1-product-item__code-text',
    productEan: '[data-ean], .ean',
    productImage: 'img',
    productLink: '.f1-product-item__name-link, a',
    nextPage: '.f1-pagination__list-item-link--next',
    navigationWait: 2_500,
  },

  cristalia: {
    loginEmail: 'input[name="login"], input[name="email"], input[type="email"]',
    loginPassword: 'input[name="senha"], input[name="password"], input[type="password"]',
    loginSubmit: 'button[type="submit"], input[type="submit"], .btn-login',
    loginSuccessUrl: "/area-cliente",
    categoryUrls: ["https://www.cristalia.com.br/produtos"],
    productItem: '.product-item, .produto, [class*="product-card"]',
    productName: '.product-name, .nome-produto, h2, h3, [class*="product-name"]',
    productPrice: '.price, .preco, [class*="price"], [class*="preco"]',
    productCode: '.product-code, .codigo, [class*="code"]',
    productImage: 'img',
    productLink: 'a',
    nextPage: '.next, [rel="next"], .proxima-pagina',
    waitForSelector: '.product-item, .produto',
    navigationWait: 3_000,
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
    navigationWait: 3_000,
  },

  bartofil: {
    loginUrl: "https://www.bartofil.com.br/login",
    loginEmail:
      'input[type="email"], input[name="email"], input[name="username"], input[name="login"], input[id*="email" i], input[placeholder*="mail" i], input[placeholder*="CNPJ" i]',
    loginPassword:
      'input[type="password"], input[name="password"], input[name="senha"], input[id*="pass" i], input[id*="senha" i]',
    loginSubmit: 'button[type="submit"], [type="submit"], button[class*="login" i]',
    waitForSelector: 'input[type="password"]',
    categoryUrls: [],
    searchUrlTemplate: "https://www.bartofil.com.br/busca?q={q}",
    productItem: '[class*="product"], [class*="produto"], [class*="card"], li[class*="item"]',
    productName: 'h2, h3, [class*="name"], [class*="nome"], [class*="title"], [class*="titulo"]',
    productPrice: '[class*="price"], [class*="preco"], [class*="valor"]',
    productImage: 'img',
    productLink: 'a',
    nextPage: '[rel="next"], [class*="next"], [class*="proxima"]',
    navigationWait: 3_000,
  },

  bassopancotte: {
    loginUrl: "https://cliente.bassopancotte.com.br/login",
    loginEmail:
      'input[type="email"], input[autocomplete="username"], input[autocomplete="email"], input[name*="email" i], input[name*="user" i], input[type="text"]',
    loginPassword:
      'input[type="password"], input[autocomplete="current-password"], input[name*="senha" i], input[name*="pass" i]',
    loginSubmit: 'button[type="submit"], [role="button"], button',
    waitForSelector: 'input[type="password"]',
    searchUrlTemplate: "https://cliente.bassopancotte.com.br/busca?q={q}",
    categoryUrls: [],
    productItem: '[class*="product"], [class*="produto"], [class*="item"], [class*="card"]',
    productName: 'h2, h3, [class*="name"], [class*="title"], [class*="nome"]',
    productPrice: '[class*="price"], [class*="preco"], [class*="valor"]',
    productImage: 'img',
    productLink: 'a',
    nextPage: '[rel="next"], [class*="next"], [class*="proxima"]',
    navigationWait: 3_000,
  },

  magazinemedica: {
    loginUrl: "https://magazinemedica.com.br/accounts/login/",
    loginEmail: '#id_username, input[name="username"]',
    loginPassword: '#id_password, input[name="password"]',
    loginSubmit: '#login_entrar, button[type="submit"]',
    loginSuccessUrl: "/accounts/",
    useStructuredData: true,
    categoryUrls: [
      "https://magazinemedica.com.br/colecao/veterinaria-e-pet-shop/",
      "https://magazinemedica.com.br/categorias/medicamentos/",
      "https://magazinemedica.com.br/categorias/descartaveis/",
      "https://magazinemedica.com.br/categorias/medicina/",
    ],
    searchUrlTemplate: "https://magazinemedica.com.br/busca/?keywords={q}",
    productItem: '.product, .produto, [class*="product"], [class*="card"], .thumbnail',
    productName: 'h2, h3, .name, .title, .nome, .product-title',
    productPrice: '.price, .preco, [class*="price"], [class*="preco"]',
    productImage: 'img.lazy, img',
    productLink: 'a',
    nextPage: '[rel="next"], .next, .proxima, .pagination .active + li a',
    navigationWait: 2_500,
  },

  utilidadesclinicas: {
    loginUrl: "https://www.utilidadesclinicas.com.br/customer/account/login/",
    loginEmail:
      '#email-registro, input[name="login[username]"], #email, input[name="login[username]"]',
    loginPassword: '#pass-popup, input[name="login[password]"], #pass',
    loginSubmit: '#send2, button.action.login, button[type="submit"]',
    loginSuccessSelector:
      '.customer-welcome, a[href*="customer/account/logout"], .customer-name',
    useStructuredData: true,
    categoryUrls: [
      "https://www.utilidadesclinicas.com.br/veterinaria.html",
      "https://www.utilidadesclinicas.com.br/descartaveis.html",
      "https://www.utilidadesclinicas.com.br/estetoscopios.html",
    ],
    searchUrlTemplate:
      "https://www.utilidadesclinicas.com.br/catalogsearch/result/?q={q}",
    productItem: '.product-item, li.item.product, [class*="product-item"]',
    productName: '.product-item-link, .product-item-name, h2, h3',
    productPrice:
      '.price, [data-price-type="finalPrice"] .price, [class*="price"]',
    productImage: 'img.product-image-photo, img',
    productLink: '.product-item-link, a.product-item-photo, a',
    nextPage: '.pages-item-next a, [rel="next"], .action.next',
    navigationWait: 2_500,
  },

  generico: {
    loginEmail: 'input[name="email"], input[type="email"], #email, #username',
    loginPassword:
      'input[name="password"], input[type="password"], #password, #senha',
    loginSubmit: 'button[type="submit"], input[type="submit"]',
    categoryUrls: [],
    productItem: '.product, .produto, [class*="product"], [class*="item"]',
    productName: 'h2, h3, .name, .title, .nome, .titulo',
    productPrice: '.price, .preco, [class*="price"], [class*="preco"]',
    productImage: 'img',
    productLink: 'a',
    nextPage: '[rel="next"], .next, .proxima',
    navigationWait: 2_000,
  },
};

export function getScraperPreset(type: string): SelectorConfig | null {
  const preset = FORNECEDOR_CONFIGS[type.trim().toLowerCase()];
  if (!preset) return null;
  return {
    ...preset,
    categoryUrls: [...preset.categoryUrls],
  };
}
