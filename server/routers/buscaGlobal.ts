import { z } from "zod";
import { desc, like, or } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  certidoes,
  emailQuotations,
  funilOportunidades,
  products,
  proposals,
  purchaseOrders,
  salesInvoices,
  suppliers,
} from "../../drizzle/schema";
import { logger } from "../_core/logger";

export interface ResultadoBusca {
  tipo: string;
  id: number;
  titulo: string;
  subtitulo: string;
  link: string;
}

const LIMITE_POR_TIPO = 8;

/**
 * Busca global com deep links: o resultado abre o registro/contexto correto,
 * evitando obrigar o operador a repetir a busca dentro do módulo de destino.
 */
export const buscaGlobalRouter = router({
  buscar: protectedProcedure
    .input(z.object({ q: z.string().min(2).max(200) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { resultados: [] as ResultadoBusca[], total: 0 };
      const q = `%${input.q.trim()}%`;
      const resultados: ResultadoBusca[] = [];

      const blocos: Array<Promise<void>> = [
        (async () => {
          const rows = await db
            .select({ id: products.id, name: products.name, code: products.code, ean: products.ean })
            .from(products)
            .where(or(like(products.name, q), like(products.code, q), like(products.ean, q)))
            .limit(LIMITE_POR_TIPO);
          for (const r of rows) resultados.push({
            tipo: "produto", id: r.id, titulo: r.name,
            subtitulo: [r.code, r.ean].filter(Boolean).join(" · "),
            link: `/catalogo?produto=${r.id}`,
          });
        })(),
        (async () => {
          const rows = await db.select({ id: suppliers.id, name: suppliers.name }).from(suppliers)
            .where(like(suppliers.name, q)).limit(LIMITE_POR_TIPO);
          for (const r of rows) resultados.push({
            tipo: "fornecedor", id: r.id, titulo: r.name, subtitulo: "",
            link: `/catalogo?fornecedor=${r.id}`,
          });
        })(),
        (async () => {
          const rows = await db.select().from(funilOportunidades)
            .where(or(
              like(funilOportunidades.titulo, q),
              like(funilOportunidades.orgao, q),
              like(funilOportunidades.numeroProcesso, q),
            ))
            .orderBy(desc(funilOportunidades.updatedAt)).limit(LIMITE_POR_TIPO);
          for (const r of rows) resultados.push({
            tipo: "oportunidade", id: r.id, titulo: r.titulo,
            subtitulo: [r.orgao, r.numeroProcesso, `etapa: ${r.etapa}`].filter(Boolean).join(" · "),
            link: `/oportunidades?oportunidade=${r.id}`,
          });
        })(),
        (async () => {
          const rows = await db.select().from(emailQuotations)
            .where(or(like(emailQuotations.orgao, q), like(emailQuotations.subject, q)))
            .orderBy(desc(emailQuotations.receivedAt)).limit(LIMITE_POR_TIPO);
          for (const r of rows) resultados.push({
            tipo: "cotacao", id: r.id,
            titulo: r.orgao ?? r.subject ?? `Cotação #${r.id}`,
            subtitulo: `status: ${r.status}`,
            link: `/oportunidades?origem=cotacoes&cotacao=${r.id}`,
          });
        })(),
        (async () => {
          const rows = await db.select({
            id: proposals.id,
            title: proposals.title,
            processNumber: proposals.processNumber,
            orgName: proposals.orgName,
            status: proposals.status,
          }).from(proposals)
            .where(or(like(proposals.title, q), like(proposals.processNumber, q), like(proposals.orgName, q)))
            .limit(LIMITE_POR_TIPO);
          for (const r of rows) resultados.push({
            tipo: "proposta", id: r.id, titulo: r.title,
            subtitulo: [r.orgName, r.processNumber, r.status].filter(Boolean).join(" · "),
            link: `/propostas/${r.id}`,
          });
        })(),
        (async () => {
          const rows = await db.select().from(salesInvoices)
            .where(or(like(salesInvoices.numero, q), like(salesInvoices.orgao, q)))
            .limit(LIMITE_POR_TIPO);
          for (const r of rows) resultados.push({
            tipo: "nota_fiscal", id: r.id, titulo: `NF ${r.numero} — ${r.orgao}`,
            subtitulo: `status: ${r.status}`,
            link: `/financeiro?nf=${r.id}`,
          });
        })(),
        (async () => {
          const rows = await db.select().from(purchaseOrders)
            .where(or(like(purchaseOrders.descricao, q), like(purchaseOrders.fornecedorNome, q), like(purchaseOrders.vinculo, q)))
            .limit(LIMITE_POR_TIPO);
          for (const r of rows) resultados.push({
            tipo: "pedido_compra", id: r.id, titulo: r.descricao,
            subtitulo: `${r.fornecedorNome} · ${r.status}`,
            link: `/execucao?pedido=${r.id}`,
          });
        })(),
        (async () => {
          const rows = await db.select().from(certidoes)
            .where(or(like(certidoes.tipo, q), like(certidoes.orgaoEmissor, q), like(certidoes.numero, q)))
            .limit(LIMITE_POR_TIPO);
          for (const r of rows) resultados.push({
            tipo: "certidao", id: r.id, titulo: r.tipo,
            subtitulo: r.orgaoEmissor ?? "",
            link: `/documentos-habilitacao?certidao=${r.id}`,
          });
        })(),
      ];

      const settled = await Promise.allSettled(blocos);
      for (const result of settled) {
        if (result.status === "rejected") logger.warn("[BuscaGlobal] Bloco falhou:", (result.reason as Error)?.message);
      }
      return { resultados, total: resultados.length };
    }),
});
