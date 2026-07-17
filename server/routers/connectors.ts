import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { carregarConectoresDeFornecedores } from "../connectors/connectorFactory";
import { buscarComCascata } from "../connectors/supplierConnector";

/**
 * Busca de produtos via conectores modulares (§4). Executa a cascata de acesso
 * (API → catálogo → scraper → manual) para os conectores do fornecedor e
 * retorna os resultados com proveniência. Mutation porque dispara a consulta
 * ao portal (efeito colateral de rede/navegador).
 */
export const connectorsRouter = router({
  buscarPorFornecedor: protectedProcedure
    .input(z.object({ supplierId: z.number().int().positive(), termo: z.string().min(1).max(200) }))
    .mutation(async ({ input }) => {
      const registro = await carregarConectoresDeFornecedores();
      const conectores = registro.paraSupplier(input.supplierId);
      if (conectores.length === 0) {
        return {
          encontrados: [],
          metodo: null,
          tentativas: [],
          aviso: "Nenhum conector configurado para este fornecedor. Cadastre o acesso e os seletores.",
        };
      }
      try {
        const r = await buscarComCascata(conectores, { termo: input.termo }, { agora: Date.now() });
        return {
          encontrados: r.resultados,
          metodo: r.metodo,
          tentativas: r.tentativas,
          aviso: r.resultados.length === 0 ? "Nenhum produto encontrado nos conectores disponíveis." : null,
        };
      } catch (err) {
        return {
          encontrados: [],
          metodo: null,
          tentativas: [],
          aviso: `Falha na consulta: ${(err as Error).message}`,
        };
      }
    }),
});
