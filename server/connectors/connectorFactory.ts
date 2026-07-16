/**
 * connectorFactory.ts
 *
 * Transforma os fornecedores CONFIGURADOS (scraper_configs) em conectores vivos
 * no registro/cascata (§4/§23). Assim, ao cadastrar um fornecedor pela UI
 * (credencial no cofre + seletores), ele passa a ser um SupplierConnector
 * independente automaticamente — sem alterar código.
 *
 * A montagem do registro é pura (recebe as configs e a função de busca por
 * injeção), portanto testável; o carregamento a partir do banco é glue fino.
 */

import type { ScrapedProduct } from "../services/scraperEngine";
import { ConnectorRegistry, type SupplierSearchQuery } from "./supplierConnector";
import { ScraperConnector } from "./scraperConnector";

export interface ScraperConfigRow {
  id: number;
  supplierId: number;
  scraperType: string;
  enabled: string; // "yes" | "no"
}

/** Id estável de um conector de scraping. */
export function connectorIdFor(scraperType: string, supplierId: number): string {
  return `scraper:${scraperType.toLowerCase()}:${supplierId}`;
}

/**
 * Monta o registro de conectores a partir das configs (puro). Ignora as
 * desabilitadas. `fetchFactory` produz a função de busca de cada config.
 */
export function construirRegistro(
  configs: ScraperConfigRow[],
  nomePorSupplier: Map<number, string>,
  fetchFactory: (cfg: ScraperConfigRow) => (query: SupplierSearchQuery) => Promise<ScrapedProduct[]>,
): ConnectorRegistry {
  const registro = new ConnectorRegistry();
  for (const cfg of configs) {
    if (cfg.enabled !== "yes") continue;
    const nome = nomePorSupplier.get(cfg.supplierId) ?? cfg.scraperType;
    registro.register(
      new ScraperConnector(connectorIdFor(cfg.scraperType, cfg.supplierId), nome, cfg.supplierId, fetchFactory(cfg)),
    );
  }
  return registro;
}

/** Carrega os conectores de fornecedor a partir do banco (glue). */
export async function carregarConectoresDeFornecedores(): Promise<ConnectorRegistry> {
  const { getDb } = await import("../db");
  const { scraperConfigs, suppliers } = await import("../../drizzle/schema");
  const { buscarProdutosFornecedor } = await import("../services/scraperEngine");

  const db = await getDb();
  if (!db) return new ConnectorRegistry();

  const configs = await db.select().from(scraperConfigs);
  const sups = await db.select().from(suppliers);
  const nome = new Map<number, string>(sups.map((s) => [s.id, s.name]));

  return construirRegistro(
    configs.map((c) => ({ id: c.id, supplierId: c.supplierId, scraperType: c.scraperType, enabled: c.enabled })),
    nome,
    (cfg) => (query) => buscarProdutosFornecedor(cfg.id, { termo: query.termo, codigo: query.codigo }),
  );
}
