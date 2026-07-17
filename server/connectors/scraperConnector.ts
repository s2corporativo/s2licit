/**
 * scraperConnector.ts
 *
 * Conector concreto que liga o motor de scraping (scraperEngine) ao contrato
 * modular SupplierConnector (§4/§7/§23). Cada fornecedor configurado vira um
 * ScraperConnector independente, com método de acesso "scraper".
 *
 * O mapeamento ScrapedProduct → SupplierProductResult (campos §7 + proveniência)
 * e o filtro por consulta são funções puras e testáveis; a obtenção dos produtos
 * é injetada (fetchProducts), desacoplando do Puppeteer.
 */

import type { ScrapedProduct } from "../services/scraperEngine";
import {
  type SupplierConnector,
  type SupplierProductResult,
  type SupplierSearchQuery,
  type ConnectorContext,
} from "./supplierConnector";

/** Converte um produto raspado no formato do contrato (§7), com proveniência. */
export function scrapedProductToResult(
  sp: ScrapedProduct,
  origem: string,
  agora: number,
): SupplierProductResult {
  const disponivel =
    sp.availability != null
      ? sp.availability === "disponivel"
      : sp.stock != null
        ? sp.stock > 0
        : undefined;
  return {
    nome: sp.name,
    referencia: sp.code,
    sku: sp.code,
    ean: sp.ean,
    imagemUrl: sp.imageUrl,
    urlProduto: sp.productUrl ?? sp.fonteUrl,
    precoNormal: sp.priceNormal ?? sp.price,
    precoPromocional: sp.pricePromo,
    unidadeVenda: sp.unit,
    estoque: sp.stock,
    disponivel,
    // Proveniência a nível de URL: a página consultada quando disponível; o
    // nome do fornecedor fica como fallback (a rastreabilidade do preço exige a origem).
    fonte: { metodo: "scraper", origem: sp.fonteUrl ?? sp.productUrl ?? origem },
    consultadoEm: sp.consultadoEm ?? agora,
  };
}

const normalizar = (s: string): string =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

const soDigitos = (s: string): string => s.replace(/\D/g, "");

/** Filtra os resultados pelos campos da consulta (puro). Sem campos → tudo. */
export function filtrarPorConsulta(
  produtos: SupplierProductResult[],
  query: SupplierSearchQuery,
): SupplierProductResult[] {
  const termo = query.termo ? normalizar(query.termo) : null;
  const codigo = query.codigo ?? query.sku ?? query.referenciaFabricante;
  const codigoNorm = codigo ? normalizar(codigo) : null;
  const ean = query.ean ? soDigitos(query.ean) : null;
  const marca = query.marca ? normalizar(query.marca) : null;

  if (!termo && !codigoNorm && !ean && !marca) return produtos;

  return produtos.filter((p) => {
    if (ean && p.ean && soDigitos(p.ean) === ean) return true;
    if (codigoNorm) {
      const ref = [p.referencia, p.sku].filter(Boolean).map((v) => normalizar(String(v)));
      if (ref.some((r) => r === codigoNorm || r.includes(codigoNorm))) return true;
    }
    if (termo && normalizar(p.nome).includes(termo)) return true;
    if (marca && p.marca && normalizar(p.marca).includes(marca)) return true;
    return false;
  });
}

export class ScraperConnector implements SupplierConnector {
  readonly metodoAcesso = "scraper" as const;

  constructor(
    public readonly id: string,
    public readonly nome: string,
    public readonly supplierId: number | undefined,
    private readonly fetchProducts: (query: SupplierSearchQuery) => Promise<ScrapedProduct[]>,
    private readonly checarDisponibilidade: () => boolean = () => true,
  ) {}

  disponivel(): boolean {
    return this.checarDisponibilidade();
  }

  async buscar(query: SupplierSearchQuery, ctx: ConnectorContext): Promise<SupplierProductResult[]> {
    const raw = await this.fetchProducts(query);
    const mapeados = raw.map((sp) => scrapedProductToResult(sp, this.nome, sp.consultadoEm ?? ctx.agora));
    return filtrarPorConsulta(mapeados, query);
  }
}
