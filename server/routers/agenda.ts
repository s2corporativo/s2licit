import { and, eq, isNotNull, ne } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { emailQuotations, certidoes, contractAlerts, postAwardContracts } from "../../drizzle/schema";
import { logger } from "../_core/logger";

export type TipoAgenda = "cotacao" | "certidao" | "contrato_alerta" | "contrato_fim";

export interface ItemAgenda {
  tipo: TipoAgenda;
  titulo: string;
  detalhe: string;
  data: string;
  diasRestantes: number;
  urgencia: "vencido" | "hoje" | "urgente" | "proximo" | "futuro";
  link: string;
}

function classificar(dias: number): ItemAgenda["urgencia"] {
  if (dias < 0) return "vencido";
  if (dias === 0) return "hoje";
  if (dias <= 3) return "urgente";
  if (dias <= 14) return "proximo";
  return "futuro";
}

function diasAte(d: Date): number {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const alvo = new Date(d);
  alvo.setHours(0, 0, 0, 0);
  return Math.round((alvo.getTime() - hoje.getTime()) / (24 * 60 * 60 * 1000));
}

export const agendaRouter = router({
  proximos: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { itens: [] as ItemAgenda[], resumo: { vencidos: 0, hoje: 0, semana: 0 } };

    const itens: ItemAgenda[] = [];

    try {
      const cots = await db.select().from(emailQuotations).where(isNotNull(emailQuotations.prazoResposta));
      for (const c of cots) {
        if (!c.prazoResposta || c.status === "respondida" || c.status === "descartada") continue;
        const dias = diasAte(new Date(c.prazoResposta));
        itens.push({
          tipo: "cotacao",
          titulo: `Responder cotação: ${c.orgao ?? c.subject ?? `#${c.id}`}`,
          detalhe: `${c.matchedItems}/${c.totalItems} itens vinculados`,
          data: new Date(c.prazoResposta).toISOString(),
          diasRestantes: dias,
          urgencia: classificar(dias),
          // Deep-link: elimina a busca manual dentro de até 200 cotações.
          link: `/cotacoes-recebidas?cotacao=${c.id}`,
        });
      }
    } catch (err) { logger.error("[Agenda] Erro ao buscar cotações:", (err as Error).message); }

    try {
      const certs = await db.select().from(certidoes).where(eq(certidoes.ativa, true));
      for (const c of certs) {
        if (!c.dataValidade) continue;
        const dias = diasAte(new Date(c.dataValidade));
        if (dias > 60) continue;
        itens.push({
          tipo: "certidao",
          titulo: `Certidão vence: ${c.tipo}`,
          detalhe: c.orgaoEmissor ?? "",
          data: new Date(c.dataValidade).toISOString(),
          diasRestantes: dias,
          urgencia: classificar(dias),
          link: "/certidoes",
        });
      }
    } catch (err) { logger.error("[Agenda] Erro ao buscar certidões:", (err as Error).message); }

    try {
      const alertas = await db.select().from(contractAlerts).where(eq(contractAlerts.status, "open"));
      for (const a of alertas) {
        if (!a.dueDate) continue;
        const dias = diasAte(new Date(a.dueDate));
        itens.push({
          tipo: "contrato_alerta",
          titulo: a.title,
          detalhe: a.description ?? "",
          data: new Date(a.dueDate).toISOString(),
          diasRestantes: dias,
          urgencia: classificar(dias),
          link: "/contratos-pos-licitacao",
        });
      }
    } catch (err) { logger.error("[Agenda] Erro ao buscar alertas de contrato:", (err as Error).message); }

    try {
      const contratos = await db.select().from(postAwardContracts).where(and(isNotNull(postAwardContracts.endDate), ne(postAwardContracts.status, "closed")));
      for (const ct of contratos) {
        if (!ct.endDate) continue;
        const dias = diasAte(new Date(ct.endDate));
        if (dias > 90) continue;
        itens.push({
          tipo: "contrato_fim",
          titulo: `Contrato encerra: ${ct.contractNumber}`,
          detalhe: ct.objectDescription ?? "",
          data: new Date(ct.endDate).toISOString(),
          diasRestantes: dias,
          urgencia: classificar(dias),
          link: "/contratos-pos-licitacao",
        });
      }
    } catch (err) { logger.error("[Agenda] Erro ao buscar fim de contratos:", (err as Error).message); }

    itens.sort((a, b) => a.diasRestantes - b.diasRestantes);
    return {
      itens,
      resumo: {
        vencidos: itens.filter((i) => i.urgencia === "vencido").length,
        hoje: itens.filter((i) => i.urgencia === "hoje").length,
        semana: itens.filter((i) => i.diasRestantes >= 0 && i.diasRestantes <= 7).length,
      },
    };
  }),
});
