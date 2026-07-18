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

/**
 * Busca Global (spec §28): um campo, todas as entidades.
 * Pesquisa textual em produtos, fornecedores, oportunidades do funil,
 * cotações recebidas, propostas, notas fiscais, pedidos de compra e
 * certidões — com link direto para a tela correspondente.
 */

export interface ResultadoBusca {
  tipo: string;
  id: number;
  titulo: string;
  subtitulo: string;
  link: string;
}

const LIMITE_POR_TIPO = 8;

export const buscaGlobalRouter = router({
  buscar: protectedProcedure
    .input(z.object({ q: z.string().min(2).max(200) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { resultados: [] as ResultadoBusca[], total: 0 };
      const q = `%${input.q.trim()}%`;
      const resultados: ResultadoBusca[] = [];

      // Cada bloco é tolerante a falha — uma tabela com problema não
      // derruba a busca inteira.
      const blocos: Array<Promise<void>> = [
        // Produtos
        (async () => {
          const rows = await db
            .select({ id: products.id, name: products.name, code: products.code, ean: products.ean })
            .from(products)
            .where(or(like(products.name, q), like(products.code, q), like(products.ean, q)))
            .limit(LIMITE_POR_TIPO);
          for (const r of rows) {
            resultados.push({
              tipo: "produto",
              id: r.id,
              titulo: r.name,
              subtitulo: [r.code, r.ean].filter(Boolean).join(" · "),
              link: "/produtos",
            });
          }
        })(),
        // Fornecedores
        (async () => {
          const rows = await db
            .select({ id: suppliers.id, name: suppliers.name })
            .from(suppliers)
            .where(like(suppliers.name, q))
            .limit(LIMITE_POR_TIPO);
          for (const r of rows) {
            resultados.push({ tipo: "fornecedor", id: r.id, titulo: r.name, subtitulo: "", link: "/fornecedores" });
          }
        })(),
        // Funil de oportunidades
        (async () => {
          const rows = await db
            .select()
            .from(funilOportunidades)
            .where(
              or(
                like(funilOportunidades.titulo, q),
                like(funilOportunidades.orgao, q),
                like(funilOportunidades.numeroProcesso, q),
              ),
            )
            .orderBy(desc(funilOportunidades.updatedAt))
            .limit(LIMITE_POR_TIPO);
          for (const r of rows) {
            resultados.push({
              tipo: "oportunidade",
              id: r.id,
              titulo: r.titulo,
              subtitulo: `${r.orgao ?? ""} · etapa: ${r.etapa}`,
              link: "/funil",
            });
          }
        })(),
        // Cotações recebidas por e-mail
        (async () => {
          const rows = await db
            .select()
            .from(emailQuotations)
            .where(or(like(emailQuotations.orgao, q), like(emailQuotations.subject, q)))
            .orderBy(desc(emailQuotations.receivedAt))
            .limit(LIMITE_POR_TIPO);
          for (const r of rows) {
            resultados.push({
              tipo: "cotacao",
              id: r.id,
              titulo: r.orgao ?? r.subject ?? `Cotação #${r.id}`,
              subtitulo: `status: ${r.status}`,
              link: "/cotacoes-recebidas",
            });
          }
        })(),
        // Propostas
        (async () => {
          const rows = await db
            .select({ id: proposals.id, title: proposals.title })
            .from(proposals)
            .where(like(proposals.title, q))
            .limit(LIMITE_POR_TIPO);
          for (const r of rows) {
            resultados.push({ tipo: "proposta", id: r.id, titulo: r.title, subtitulo: "", link: "/propostas" });
          }
        })(),
        // Notas fiscais
        (async () => {
          const rows = await db
            .select()
            .from(salesInvoices)
            .where(or(like(salesInvoices.numero, q), like(salesInvoices.orgao, q)))
            .limit(LIMITE_POR_TIPO);
          for (const r of rows) {
            resultados.push({
              tipo: "nota_fiscal",
              id: r.id,
              titulo: `NF ${r.numero} — ${r.orgao}`,
              subtitulo: `status: ${r.status}`,
              link: "/pos-venda",
            });
          }
        })(),
        // Pedidos de compra
        (async () => {
          const rows = await db
            .select()
            .from(purchaseOrders)
            .where(or(like(purchaseOrders.descricao, q), like(purchaseOrders.fornecedorNome, q)))
            .limit(LIMITE_POR_TIPO);
          for (const r of rows) {
            resultados.push({
              tipo: "pedido_compra",
              id: r.id,
              titulo: r.descricao,
              subtitulo: `${r.fornecedorNome} · ${r.status}`,
              link: "/pos-venda",
            });
          }
        })(),
        // Certidões
        (async () => {
          const rows = await db
            .select()
            .from(certidoes)
            .where(or(like(certidoes.tipo, q), like(certidoes.orgaoEmissor, q)))
            .limit(LIMITE_POR_TIPO);
          for (const r of rows) {
            resultados.push({
              tipo: "certidao",
              id: r.id,
              titulo: r.tipo,
              subtitulo: r.orgaoEmissor ?? "",
              link: "/certidoes",
            });
          }
        })(),
      ];

      const settled = await Promise.allSettled(blocos);
      for (const s of settled) {
        if (s.status === "rejected") {
          logger.warn("[BuscaGlobal] Bloco falhou:", (s.reason as Error)?.message);
        }
      }

      return { resultados, total: resultados.length };
    }),
});
