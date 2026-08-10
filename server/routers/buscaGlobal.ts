import { z } from "zod";
import { desc, like, or, sql } from "drizzle-orm";
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

function escapeLikePrefix(value: string): string {
  return `${value.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
}

function booleanFullTextQuery(value: string): string {
  return value
    .normalize("NFKC")
    .match(/[\p{L}\p{N}]+/gu)
    ?.filter((token) => token.length >= 2)
    .slice(0, 6)
    .map((token) => `${token}*`)
    .join(" ") ?? "";
}

function joinSubtitle(values: Array<string | number | null | undefined>): string {
  return values.filter((value) => value !== null && value !== undefined && value !== "").join(" · ");
}

export const buscaGlobalRouter = router({
  buscar: protectedProcedure
    .input(z.object({ q: z.string().trim().min(2).max(200) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { resultados: [] as ResultadoBusca[], total: 0 };

      const term = input.q;
      const prefix = escapeLikePrefix(term);
      const booleanQuery = booleanFullTextQuery(term);
      const noFullText = sql<boolean>`FALSE`;

      const productScore = booleanQuery
        ? sql<number>`MATCH(${products.name}) AGAINST (${booleanQuery} IN BOOLEAN MODE)`
        : sql<number>`0`;
      const supplierScore = booleanQuery
        ? sql<number>`MATCH(${suppliers.name}) AGAINST (${booleanQuery} IN BOOLEAN MODE)`
        : sql<number>`0`;
      const opportunityScore = booleanQuery
        ? sql<number>`MATCH(${funilOportunidades.titulo}, ${funilOportunidades.orgao}) AGAINST (${booleanQuery} IN BOOLEAN MODE)`
        : sql<number>`0`;
      const quotationScore = booleanQuery
        ? sql<number>`MATCH(${emailQuotations.orgao}, ${emailQuotations.subject}) AGAINST (${booleanQuery} IN BOOLEAN MODE)`
        : sql<number>`0`;
      const proposalScore = booleanQuery
        ? sql<number>`MATCH(${proposals.title}, ${proposals.orgName}) AGAINST (${booleanQuery} IN BOOLEAN MODE)`
        : sql<number>`0`;
      const invoiceScore = booleanQuery
        ? sql<number>`MATCH(${salesInvoices.orgao}) AGAINST (${booleanQuery} IN BOOLEAN MODE)`
        : sql<number>`0`;
      const orderScore = booleanQuery
        ? sql<number>`MATCH(${purchaseOrders.descricao}, ${purchaseOrders.fornecedorNome}) AGAINST (${booleanQuery} IN BOOLEAN MODE)`
        : sql<number>`0`;
      const certificateScore = booleanQuery
        ? sql<number>`MATCH(${certidoes.tipo}, ${certidoes.orgaoEmissor}) AGAINST (${booleanQuery} IN BOOLEAN MODE)`
        : sql<number>`0`;

      const blocks: Array<Promise<ResultadoBusca[]>> = [
        (async () => {
          const rows = await db
            .select({
              id: products.id,
              name: products.name,
              code: products.code,
              ean: products.ean,
              mapa: products.mapa,
              score: productScore,
            })
            .from(products)
            .where(
              or(
                like(products.code, prefix),
                like(products.ean, prefix),
                like(products.mapa, prefix),
                booleanQuery ? sql<boolean>`${productScore} > 0` : noFullText,
              ),
            )
            .orderBy(desc(productScore), desc(products.updatedAt))
            .limit(LIMITE_POR_TIPO);
          return rows.map((row) => ({
            tipo: "produto",
            id: row.id,
            titulo: row.name,
            subtitulo: joinSubtitle([row.code, row.ean, row.mapa]),
            link: `/catalogo?produto=${row.id}`,
          }));
        })(),
        (async () => {
          if (!booleanQuery) return [];
          const rows = await db
            .select({ id: suppliers.id, name: suppliers.name, score: supplierScore })
            .from(suppliers)
            .where(sql<boolean>`${supplierScore} > 0`)
            .orderBy(desc(supplierScore))
            .limit(LIMITE_POR_TIPO);
          return rows.map((row) => ({
            tipo: "fornecedor",
            id: row.id,
            titulo: row.name,
            subtitulo: "",
            link: `/catalogo?fornecedor=${row.id}`,
          }));
        })(),
        (async () => {
          const rows = await db
            .select({
              id: funilOportunidades.id,
              titulo: funilOportunidades.titulo,
              orgao: funilOportunidades.orgao,
              numeroProcesso: funilOportunidades.numeroProcesso,
              etapa: funilOportunidades.etapa,
              updatedAt: funilOportunidades.updatedAt,
              score: opportunityScore,
            })
            .from(funilOportunidades)
            .where(
              or(
                like(funilOportunidades.numeroProcesso, prefix),
                booleanQuery ? sql<boolean>`${opportunityScore} > 0` : noFullText,
              ),
            )
            .orderBy(desc(opportunityScore), desc(funilOportunidades.updatedAt))
            .limit(LIMITE_POR_TIPO);
          return rows.map((row) => ({
            tipo: "oportunidade",
            id: row.id,
            titulo: row.titulo,
            subtitulo: joinSubtitle([row.orgao, row.numeroProcesso, `etapa: ${row.etapa}`]),
            link: `/oportunidades?oportunidade=${row.id}`,
          }));
        })(),
        (async () => {
          if (!booleanQuery) return [];
          const rows = await db
            .select({
              id: emailQuotations.id,
              orgao: emailQuotations.orgao,
              subject: emailQuotations.subject,
              status: emailQuotations.status,
              receivedAt: emailQuotations.receivedAt,
              score: quotationScore,
            })
            .from(emailQuotations)
            .where(sql<boolean>`${quotationScore} > 0`)
            .orderBy(desc(quotationScore), desc(emailQuotations.receivedAt))
            .limit(LIMITE_POR_TIPO);
          return rows.map((row) => ({
            tipo: "cotacao",
            id: row.id,
            titulo: row.orgao ?? row.subject ?? `Cotação #${row.id}`,
            subtitulo: `status: ${row.status}`,
            link: `/oportunidades?origem=cotacoes&cotacao=${row.id}`,
          }));
        })(),
        (async () => {
          const rows = await db
            .select({
              id: proposals.id,
              title: proposals.title,
              processNumber: proposals.processNumber,
              orgName: proposals.orgName,
              status: proposals.status,
              updatedAt: proposals.updatedAt,
              score: proposalScore,
            })
            .from(proposals)
            .where(
              or(
                like(proposals.processNumber, prefix),
                booleanQuery ? sql<boolean>`${proposalScore} > 0` : noFullText,
              ),
            )
            .orderBy(desc(proposalScore), desc(proposals.updatedAt))
            .limit(LIMITE_POR_TIPO);
          return rows.map((row) => ({
            tipo: "proposta",
            id: row.id,
            titulo: row.title,
            subtitulo: joinSubtitle([row.orgName, row.processNumber, row.status]),
            link: `/propostas/${row.id}`,
          }));
        })(),
        (async () => {
          const rows = await db
            .select({
              id: salesInvoices.id,
              numero: salesInvoices.numero,
              orgao: salesInvoices.orgao,
              status: salesInvoices.status,
              score: invoiceScore,
            })
            .from(salesInvoices)
            .where(
              or(
                like(salesInvoices.numero, prefix),
                booleanQuery ? sql<boolean>`${invoiceScore} > 0` : noFullText,
              ),
            )
            .orderBy(desc(invoiceScore), desc(salesInvoices.createdAt))
            .limit(LIMITE_POR_TIPO);
          return rows.map((row) => ({
            tipo: "nota_fiscal",
            id: row.id,
            titulo: `NF ${row.numero} — ${row.orgao}`,
            subtitulo: `status: ${row.status}`,
            link: `/financeiro?nf=${row.id}`,
          }));
        })(),
        (async () => {
          const rows = await db
            .select({
              id: purchaseOrders.id,
              descricao: purchaseOrders.descricao,
              fornecedorNome: purchaseOrders.fornecedorNome,
              vinculo: purchaseOrders.vinculo,
              status: purchaseOrders.status,
              score: orderScore,
            })
            .from(purchaseOrders)
            .where(
              or(
                like(purchaseOrders.vinculo, prefix),
                booleanQuery ? sql<boolean>`${orderScore} > 0` : noFullText,
              ),
            )
            .orderBy(desc(orderScore), desc(purchaseOrders.createdAt))
            .limit(LIMITE_POR_TIPO);
          return rows.map((row) => ({
            tipo: "pedido_compra",
            id: row.id,
            titulo: row.descricao,
            subtitulo: joinSubtitle([row.fornecedorNome, row.status]),
            link: `/execucao?pedido=${row.id}`,
          }));
        })(),
        (async () => {
          const rows = await db
            .select({
              id: certidoes.id,
              tipo: certidoes.tipo,
              orgaoEmissor: certidoes.orgaoEmissor,
              numero: certidoes.numero,
              score: certificateScore,
            })
            .from(certidoes)
            .where(
              or(
                like(certidoes.numero, prefix),
                booleanQuery ? sql<boolean>`${certificateScore} > 0` : noFullText,
              ),
            )
            .orderBy(desc(certificateScore), desc(certidoes.updatedAt))
            .limit(LIMITE_POR_TIPO);
          return rows.map((row) => ({
            tipo: "certidao",
            id: row.id,
            titulo: row.tipo,
            subtitulo: row.orgaoEmissor ?? "",
            link: `/documentos-habilitacao?certidao=${row.id}`,
          }));
        })(),
      ];

      const settled = await Promise.allSettled(blocks);
      const resultados: ResultadoBusca[] = [];
      settled.forEach((result, index) => {
        if (result.status === "fulfilled") {
          resultados.push(...result.value);
        } else {
          logger.warn(`[BuscaGlobal] Bloco ${index + 1} falhou`, result.reason);
        }
      });

      return { resultados, total: resultados.length };
    }),
});
