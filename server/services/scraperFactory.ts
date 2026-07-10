/**
 * scraperFactory.ts
 * Fábrica unificada de scrapers de fornecedores.
 *
 * Scrapers implementados via scraperEngine.ts (Puppeteer universal):
 *   - tambasa    ✅ Implementado
 *   - generico   ✅ Adaptativo
 *
 * Scrapers pendentes de mapeamento de seletores:
 *   - cristalia  ⏳ Aguarda inspeção do site real
 *   - ourofino   ⏳ Aguarda inspeção do site real
 *
 * Para adicionar um novo fornecedor: adicionar entrada em
 * scraperEngine.ts → FORNECEDOR_CONFIGS com os seletores CSS corretos.
 */

import { executarScraper } from "./scraperEngine";
import { getDb } from "../db";
import { scraperConfigs } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

export type SupplierId = "tambasa" | "cristalia" | "ourofino" | "generico";

export interface ScraperStatus {
  supplierId: SupplierId;
  implementado: boolean;
  motivo?: string;
}

/** Lista o status de implementação de cada scraper */
export function listarStatusScrapers(): ScraperStatus[] {
  return [
    { supplierId: "tambasa",   implementado: true },
    { supplierId: "generico",  implementado: true },
    { supplierId: "cristalia", implementado: false, motivo: "Aguarda mapeamento de seletores CSS do site" },
    { supplierId: "ourofino",  implementado: false, motivo: "Aguarda mapeamento de seletores CSS do site" },
  ];
}

/**
 * Executa o scraper de um fornecedor pelo ID de configuração no banco.
 * Delega para scraperEngine.ts que usa Puppeteer universal.
 */
export async function executarScraperPorId(scraperConfigId: number) {
  return executarScraper(scraperConfigId);
}

/**
 * Executa todos os scrapers habilitados no banco.
 */
export async function executarTodosScrapers(): Promise<{
  iniciados: number;
  ignorados: string[];
}> {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");

  const ativos = await db
    .select({ id: scraperConfigs.id, scraperType: scraperConfigs.scraperType })
    .from(scraperConfigs)
    .where(eq(scraperConfigs.enabled, "yes"));

  const naoImplementados = ["cristalia", "ourofino"];
  const ignorados: string[] = [];
  let iniciados = 0;

  for (const cfg of ativos) {
    if (naoImplementados.includes(cfg.scraperType.toLowerCase())) {
      ignorados.push(`${cfg.scraperType} (#${cfg.id}) — scraper não implementado`);
      continue;
    }
    // Fire-and-forget — progresso acompanhado pelo router
    executarScraper(cfg.id).catch(err =>
      console.error(`[ScraperFactory] Erro no scraper #${cfg.id}:`, err?.message)
    );
    iniciados++;
  }

  return { iniciados, ignorados };
}
