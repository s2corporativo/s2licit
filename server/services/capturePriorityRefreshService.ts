import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import { scraperConfigs } from "../../drizzle/schema";
import { getConnectorCapabilities } from "./captureConnectorCapabilities";
import { enqueueCaptureJob, type CaptureTrigger } from "./captureCoreService";

function normalizeTerms(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = raw.trim().replace(/\s+/g, " ");
    if (!value) continue;
    const key = value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= 500) break;
  }
  return out;
}

/**
 * Enfileira refresh seletivo dos termos importantes para uma operação atual
 * (proposta, edital, cotação). Um job por fornecedor carrega vários termos,
 * evitando abrir um navegador/job separado para cada item.
 */
export async function enqueuePriorityRefreshForTerms(input: {
  terms: string[];
  trigger?: CaptureTrigger;
  createdByUserId?: number | null;
  priority?: number;
}) {
  const terms = normalizeTerms(input.terms);
  if (terms.length === 0) return { jobs: [], skipped: [], terms: 0 };
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");

  const configs = await db.select().from(scraperConfigs)
    .where(and(eq(scraperConfigs.enabled, "yes"), eq(scraperConfigs.tosAprovado, true)));
  const jobs: Array<{ scraperConfigId: number; jobId: number; reused: boolean }> = [];
  const skipped: Array<{ scraperConfigId: number; reason: string }> = [];

  for (const config of configs) {
    const capabilities = getConnectorCapabilities(config.scraperType, config.customSelectors as any);
    if (!capabilities.search) {
      skipped.push({
        scraperConfigId: config.id,
        reason: "Conector sem busca seletiva; full scan não é disparado por item de proposta.",
      });
      continue;
    }
    try {
      const job = await enqueueCaptureJob({
        scraperConfigId: config.id,
        mode: "refresh",
        trigger: input.trigger ?? "proposal",
        query: terms.join("\n"),
        priority: input.priority ?? 100,
        createdByUserId: input.createdByUserId ?? null,
        meta: {
          reason: "priority_price_refresh",
          termCount: terms.length,
        },
      });
      jobs.push({ scraperConfigId: config.id, jobId: job.id, reused: job.reused });
    } catch (error) {
      skipped.push({ scraperConfigId: config.id, reason: (error as Error).message });
    }
  }

  return { jobs, skipped, terms: terms.length };
}
