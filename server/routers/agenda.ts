import { protectedProcedure, router } from "../_core/trpc";
import { listUnifiedAgenda } from "../services/canonicalOpportunityService";

/**
 * Agenda global do S2. A fonte de verdade é o orquestrador canônico, que reúne
 * prazos de oportunidades, sessões, cotações, habilitação, contratos,
 * entregas, recebíveis e contas a pagar, evitando agendas paralelas.
 */
export const agendaRouter = router({
  proximos: protectedProcedure.query(() => listUnifiedAgenda()),
});
