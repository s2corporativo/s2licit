import { and, eq, isNull, lt } from "drizzle-orm";
import { getDb } from "../db";
import { emailQuotations, emailQuotationItems } from "../../drizzle/schema";
import { matchQuotationItem } from "./emailQuotationMatchingService";
import { listProductsForMatching } from "../db/images";
import { logger } from "../_core/logger";

export interface RematchResult {
  quotationsChecked: number;
  itemsReMatched: number;
  newMatches: number;
  errors: string[];
}

/**
 * Re-matching periódico das cotações paradas em revisão.
 *
 * Motivo: o catálogo cresce constantemente (32.318 produtos ativos) e um
 * item que não encontrou correspondência na importação pode encontrar hoje,
 * seja por nome (threshold 0,68) seja por código CATMAT/CATMAS recém-criado.
 *
 * Atualiza os itens sem correspondência e a coluna matchedItems da cotação.
 * A geração automática da proposta continua sendo responsabilidade do
 * pipeline (runQuotationAutoPipeline), que roda a cada 15 minutos e logo
 * em seguida da sincronização.
 */
const DEFAULT_ITEMS_PER_RUN = 15;

export async function runQuotationRematch(options?: {
  limit?: number;
  maxItemsPerRun?: number;
}): Promise<RematchResult> {
  const result: RematchResult = {
    quotationsChecked: 0,
    itemsReMatched: 0,
    newMatches: 0,
    errors: [],
  };

  const db = await getDb();
  if (!db) {
    result.errors.push("Banco de dados indisponível.");
    return result;
  }

  const limit = options?.limit ?? 100;
  // Limite de segurança por execução: processar todos os itens pendentes de
  // até 100 cotações de uma vez saturava o servidor (catálogo com mais de
  // 27 mil produtos carregado em memória + embeddings sequenciais por item).
  const maxItemsPerRun = options?.maxItemsPerRun ?? DEFAULT_ITEMS_PER_RUN;
  let itemsRemaining = maxItemsPerRun;

  // Cotações em revisão com ao menos um item ainda sem correspondência.
  const pending = await db
    .select({ id: emailQuotations.id, totalItems: emailQuotations.totalItems })
    .from(emailQuotations)
    .where(
      and(
        eq(emailQuotations.status, "revisao"),
        isNull(emailQuotations.propostaGeradaEm),
        lt(emailQuotations.matchedItems, emailQuotations.totalItems),
      ),
    )
    .limit(limit);

  if (pending.length === 0) {
    return result;
  }

  const catalog = await listProductsForMatching();
  logger.info(
    `[Rematch] ${pending.length} cotação(ões) em revisão com itens pendentes; catálogo com ${catalog.length} produtos.`,
  );

  for (const row of pending) {
    result.quotationsChecked++;
    try {
      const items = await db
        .select()
        .from(emailQuotationItems)
        .where(
          and(
            eq(emailQuotationItems.quotationId, row.id),
            isNull(emailQuotationItems.produtoMatchId),
          ),
        );

      let updated = 0;
      let matched = 0;
      for (const item of items) {
        if (itemsRemaining <= 0) {
          break;
        }
        itemsRemaining--;
        logger.info(
          `[Rematch] cotação ${row.id}: item ${items.length - itemsRemaining}/${items.length} ` +
            `(restam ${maxItemsPerRun - itemsRemaining}/${maxItemsPerRun} nesta execução)`,
        );
        const hit = await matchQuotationItem(
          {
            descricao: item.descricao,
            quantidade: item.quantidade != null ? Number(item.quantidade) : undefined,
            unidade: item.unidade ?? undefined,
            codigoCatalogo: item.codigoCatalogo ?? undefined,
          },
          catalog,
        );
        if (hit.produtoMatchId != null) {
          await db
            .update(emailQuotationItems)
            .set({
              produtoMatchId: hit.produtoMatchId,
              matchScore: hit.matchScore != null ? String(hit.matchScore) : null,
              matchMethod: hit.matchMethod,
              precoSugerido: hit.precoSugerido,
            })
            .where(eq(emailQuotationItems.id, item.id));
          matched++;
          updated++;
        }
      }

      if (updated > 0) {
        const all = await db
          .select({ produtoMatchId: emailQuotationItems.produtoMatchId })
          .from(emailQuotationItems)
          .where(eq(emailQuotationItems.quotationId, row.id));
        await db
          .update(emailQuotations)
          .set({ matchedItems: all.filter((i) => i.produtoMatchId != null).length })
          .where(eq(emailQuotations.id, row.id));
        logger.info(`[Rematch] Cotação ${row.id}: ${updated} item(ns) novo(s) casado(s).`);
      }
      result.itemsReMatched += updated;
      result.newMatches += matched;
    } catch (err) {
      result.errors.push(`Cotação ${row.id}: ${(err as Error).message}`);
    }

    if (itemsRemaining <= 0) {
      logger.info(
        `[Rematch] limite de itens desta execução atingido (${maxItemsPerRun}); ` +
          `o restante será processado na próxima janela agendada.`,
      );
      break;
    }
  }

  if (result.quotationsChecked > 0) {
    logger.info(
      `[Rematch] concluído: ${result.quotationsChecked} verificadas, ` +
        `${result.itemsReMatched} itens casados, ${result.newMatches} novos matches.`,
    );
  }
  return result;
}

/** Wrapper seguro para o agendador — falha isolada, nunca derruba o job. */
export async function runQuotationRematchSafely(): Promise<void> {
  try {
    await runQuotationRematch();
  } catch (err) {
    logger.error("[Rematch] Falha na verificação periódica:", (err as Error).message);
  }
}
