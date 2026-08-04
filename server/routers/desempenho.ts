import { z } from "zod";
import { and, desc, eq, isNotNull, ne } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { emailQuotations, proposals } from "../../drizzle/schema";

/**
 * Análise de vitória/derrota (win rate).
 *
 * Cada cotação disputada tem um desfecho: ganhou, perdeu ou cancelada.
 * Aqui consolidamos a taxa de vitória — geral, por órgão e por categoria —
 * e medimos o quanto ficamos acima do preço vencedor quando perdemos.
 * É o retrato de "onde eu ganho e onde eu jogo dinheiro fora".
 *
 * Duas origens alimentam o mesmo painel: cotações recebidas por e-mail
 * (campo `resultado` explícito) e propostas comerciais (derivado do
 * `status` do pipeline — não há um campo "resultado" redundante lá).
 * Propostas cujo status é order/in_transit/delivered contam como
 * "ganhou"; "cancelled" com motivo/valor do concorrente registrado conta
 * como "perdeu"; "cancelled" sem esses dados é cancelamento interno e não
 * entra no win rate (mesma regra de `cancelada` das cotações por e-mail).
 */

const resultadoSchema = z.enum(["pendente", "ganhou", "perdeu", "cancelada"]);

type ResultadoDesfecho = "pendente" | "ganhou" | "perdeu" | "cancelada";

export function resultadoDaProposta(status: string, lossReason: string | null, competitorValue: string | null): ResultadoDesfecho {
  if (status === "order" || status === "in_transit" || status === "delivered") return "ganhou";
  if (status === "cancelled") return lossReason || competitorValue != null ? "perdeu" : "cancelada";
  if (status === "sent") return "pendente";
  return "pendente"; // draft — ainda não disputada, tratada como pendente para não sumir da contagem geral
}

interface Agregado {
  chave: string;
  ganhou: number;
  perdeu: number;
  canceladas: number;
  pendentes: number;
  decididas: number;      // ganhou + perdeu
  winRate: number;        // 0..100 sobre as decididas
}

function novoAgregado(chave: string): Agregado {
  return { chave, ganhou: 0, perdeu: 0, canceladas: 0, pendentes: 0, decididas: 0, winRate: 0 };
}

function finalizar(a: Agregado): Agregado {
  a.decididas = a.ganhou + a.perdeu;
  a.winRate = a.decididas > 0 ? Math.round((a.ganhou / a.decididas) * 100) : 0;
  return a;
}

export const desempenhoRouter = router({
  /** Registra o desfecho de uma cotação disputada. */
  registrarResultado: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        resultado: resultadoSchema,
        valorProposto: z.number().nonnegative().optional(),
        valorVencedor: z.number().nonnegative().optional(),
        categoria: z.string().max(128).optional(),
        observacao: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco indisponível");
      await db
        .update(emailQuotations)
        .set({
          resultado: input.resultado,
          valorProposto: input.valorProposto != null ? String(input.valorProposto) : undefined,
          valorVencedor: input.valorVencedor != null ? String(input.valorVencedor) : undefined,
          categoria: input.categoria,
          resultadoObs: input.observacao,
          resultadoEm: new Date(),
        })
        .where(eq(emailQuotations.id, input.id));
      return { ok: true };
    }),

  /** Cotações e propostas já decididas, mais recentes primeiro (para conferência). */
  historico: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const emailRows = await db
      .select()
      .from(emailQuotations)
      .where(ne(emailQuotations.resultado, "pendente"))
      .orderBy(desc(emailQuotations.resultadoEm))
      .limit(200);
    const propostaRows = await db
      .select()
      .from(proposals)
      .where(eq(proposals.status, "cancelled"))
      .orderBy(desc(proposals.cancelledAt))
      .limit(200);

    const deEmail = emailRows.map((r) => ({
      id: r.id,
      origem: "email" as const,
      orgao: r.orgao ?? r.fromName ?? r.subject ?? `#${r.id}`,
      categoria: r.categoria,
      resultado: r.resultado,
      valorProposto: r.valorProposto ? Number(r.valorProposto) : null,
      valorVencedor: r.valorVencedor ? Number(r.valorVencedor) : null,
      resultadoEm: r.resultadoEm ? new Date(r.resultadoEm).toISOString() : null,
    }));
    const deProposta = propostaRows
      .map((p) => ({
        id: p.id,
        origem: "proposta" as const,
        orgao: p.orgName ?? p.title,
        categoria: null as string | null,
        resultado: resultadoDaProposta(p.status, p.lossReason, p.competitorValue),
        valorProposto: p.totalValue ? Number(p.totalValue) : null,
        valorVencedor: p.competitorValue ? Number(p.competitorValue) : null,
        resultadoEm: p.cancelledAt ? new Date(p.cancelledAt).toISOString() : null,
      }))
      .filter((p) => p.resultado === "perdeu" || p.resultado === "cancelada");

    // Propostas "ganhou" também entram no histórico (marcadas order/delivered).
    const propostasGanhas = await db
      .select()
      .from(proposals)
      .where(ne(proposals.status, "draft"))
      .orderBy(desc(proposals.orderedAt))
      .limit(200);
    const deGanhas = propostasGanhas
      .map((p) => ({
        id: p.id,
        origem: "proposta" as const,
        orgao: p.orgName ?? p.title,
        categoria: null as string | null,
        resultado: resultadoDaProposta(p.status, p.lossReason, p.competitorValue),
        valorProposto: p.totalValue ? Number(p.totalValue) : null,
        valorVencedor: null as number | null,
        resultadoEm: p.orderedAt ? new Date(p.orderedAt).toISOString() : null,
      }))
      .filter((p) => p.resultado === "ganhou");

    return [...deEmail, ...deProposta, ...deGanhas]
      .sort((a, b) => (b.resultadoEm ?? "").localeCompare(a.resultadoEm ?? ""))
      .slice(0, 200);
  }),

  /** Consolidação: taxa de vitória geral, por órgão e por categoria. */
  resumo: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) {
      return {
        geral: finalizar(novoAgregado("Geral")),
        porOrgao: [] as Agregado[],
        porCategoria: [] as Agregado[],
        gapMedioPerda: null as number | null,
        totalDecididas: 0,
      };
    }

    const rows = await db.select().from(emailQuotations);
    const propostaRows = await db.select().from(proposals);
    const geral = novoAgregado("Geral");
    const orgaos = new Map<string, Agregado>();
    const categorias = new Map<string, Agregado>();
    let somaGap = 0;
    let nGap = 0;

    const bump = (a: Agregado, r: string) => {
      if (r === "ganhou") a.ganhou++;
      else if (r === "perdeu") a.perdeu++;
      else if (r === "cancelada") a.canceladas++;
      else a.pendentes++;
    };

    for (const r of rows) {
      bump(geral, r.resultado);

      const orgaoChave = (r.orgao ?? "Sem órgão").trim() || "Sem órgão";
      if (!orgaos.has(orgaoChave)) orgaos.set(orgaoChave, novoAgregado(orgaoChave));
      bump(orgaos.get(orgaoChave)!, r.resultado);

      const catChave = (r.categoria ?? "Sem categoria").trim() || "Sem categoria";
      if (!categorias.has(catChave)) categorias.set(catChave, novoAgregado(catChave));
      bump(categorias.get(catChave)!, r.resultado);

      // Gap % acima do vencedor quando perdemos com números conhecidos
      if (r.resultado === "perdeu" && r.valorProposto && r.valorVencedor) {
        const prop = Number(r.valorProposto);
        const venc = Number(r.valorVencedor);
        if (venc > 0) {
          somaGap += ((prop - venc) / venc) * 100;
          nGap++;
        }
      }
    }

    for (const p of propostaRows) {
      const resultado = resultadoDaProposta(p.status, p.lossReason, p.competitorValue);
      bump(geral, resultado);

      const orgaoChave = (p.orgName ?? "Sem órgão").trim() || "Sem órgão";
      if (!orgaos.has(orgaoChave)) orgaos.set(orgaoChave, novoAgregado(orgaoChave));
      bump(orgaos.get(orgaoChave)!, resultado);
      // Propostas não têm categoria própria — entram em "Sem categoria" no
      // recorte por categoria (a fonte real de categoria é por item, não
      // por proposta; consolidar exigiria agregação por item, fora de escopo).
      const catChave = "Sem categoria";
      if (!categorias.has(catChave)) categorias.set(catChave, novoAgregado(catChave));
      bump(categorias.get(catChave)!, resultado);

      if (resultado === "perdeu" && p.totalValue && p.competitorValue) {
        const prop = Number(p.totalValue);
        const venc = Number(p.competitorValue);
        if (venc > 0) {
          somaGap += ((prop - venc) / venc) * 100;
          nGap++;
        }
      }
    }

    const porOrgao = [...orgaos.values()]
      .map(finalizar)
      .filter((a) => a.decididas > 0)
      .sort((a, b) => b.decididas - a.decididas);
    const porCategoria = [...categorias.values()]
      .map(finalizar)
      .filter((a) => a.decididas > 0)
      .sort((a, b) => b.decididas - a.decididas);

    return {
      geral: finalizar(geral),
      porOrgao,
      porCategoria,
      gapMedioPerda: nGap > 0 ? Math.round((somaGap / nGap) * 10) / 10 : null,
      totalDecididas: geral.ganhou + geral.perdeu,
    };
  }),

  /** Cotações e propostas já enviadas mas ainda sem desfecho, para o operador dar baixa. */
  pendentes: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db
      .select()
      .from(emailQuotations)
      .where(and(eq(emailQuotations.resultado, "pendente"), isNotNull(emailQuotations.orgao)))
      .orderBy(desc(emailQuotations.receivedAt))
      .limit(100);
    const deEmail = rows.map((r) => ({
      id: r.id,
      origem: "email" as const,
      orgao: r.orgao ?? r.subject ?? `#${r.id}`,
      subject: r.subject,
      status: r.status,
      recebidaEm: r.receivedAt ? new Date(r.receivedAt).toISOString() : null,
    }));

    // Apenas "sent": rascunho ainda não foi disputado, não há o que dar baixa.
    const propostaRows = await db
      .select()
      .from(proposals)
      .where(eq(proposals.status, "sent"))
      .orderBy(desc(proposals.sentAt))
      .limit(100);
    const deProposta = propostaRows.map((p) => ({
      id: p.id,
      origem: "proposta" as const,
      orgao: p.orgName ?? p.title,
      subject: p.title,
      status: p.status,
      recebidaEm: p.sentAt ? new Date(p.sentAt).toISOString() : null,
    }));

    return [...deEmail, ...deProposta]
      .sort((a, b) => (b.recebidaEm ?? "").localeCompare(a.recebidaEm ?? ""))
      .slice(0, 100);
  }),
});
