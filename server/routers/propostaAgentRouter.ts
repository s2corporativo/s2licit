/**
 * propostaAgentRouter.ts
 * Endpoints tRPC para o Agente de Preenchimento de Propostas
 */

import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { randomUUID } from "crypto";
import { encryptPassword } from "../utils/encryption";
import {
  PORTAL_CONFIGS,
  executarAgenteProposta,
  propostaJobs,
  type PortalType,
} from "../services/propostaAgent";

const portalTypeSchema = z.enum([
  "comprasnet", "comprasmg", "fundep", "funarbe", "copasa", "agrega", "generico"
]);

export const propostaAgentRouter = router({

  /** Lista portais suportados com suas configurações */
  portaisDisponiveis: protectedProcedure.query(() => {
    return Object.entries(PORTAL_CONFIGS).map(([key, cfg]) => ({
      tipo: key as PortalType,
      nome: cfg.nome,
      loginUrl: cfg.loginUrl,
      estrategia: cfg.estrategia,
      camposSuportados: {
        preco: !!cfg.seletores.inputPreco,
        marca: !!cfg.seletores.inputMarca,
        validade: !!cfg.seletores.inputValidade,
        envioAutomatico: !!cfg.seletores.botaoEnviar,
      },
    }));
  }),

  /** Inicia preenchimento de proposta em segundo plano */
  iniciar: protectedProcedure
    .input(z.object({
      propostaId: z.number(),
      portalType: portalTypeSchema,
      // Use uma credencial salva no cofre (credencialId) OU informe inline.
      credencialId: z.number().int().positive().optional(),
      credencial: z.object({
        email: z.string(),
        password: z.string().min(4),
        cpf: z.string().optional(),
        cnpj: z.string().optional(),
        loginUrl: z.string().optional(),
      }).optional(),
      urlLicitacao: z.string().url().optional(),
      modoAprovacao: z.enum(["salvar_rascunho", "enviar_direto"]).default("salvar_rascunho"),
      validadeDias: z.number().min(1).max(365).default(60),
    }))
    .mutation(async ({ input }) => {
      const jobId = randomUUID();

      // Resolve a credencial: do cofre (credencialId) ou inline.
      let cred = input.credencial;
      let portalType = input.portalType as PortalType;
      if (input.credencialId) {
        const { getPortalCredentialDecrypted } = await import("./portalCredentials");
        const v = await getPortalCredentialDecrypted(input.credencialId);
        if (!v) throw new Error("Credencial do portal não encontrada no cofre.");
        cred = { email: v.usuario, password: v.senha, cnpj: v.cnpj, loginUrl: v.loginUrl };
        portalType = v.portal;
      }
      if (!cred) throw new Error("Informe uma credencial (inline) ou um credencialId do cofre.");

      // Criptografar senha antes de passar ao job background
      const passwordEncrypted = encryptPassword(cred.password);

      propostaJobs.set(jobId, { status: "running", criadoEm: new Date() });

      // Disparar em background
      executarAgenteProposta({
        propostaId: input.propostaId,
        portalType,
        credencial: {
          email: cred.email,
          passwordEncrypted,
          cpf: cred.cpf,
          cnpj: cred.cnpj,
          loginUrl: cred.loginUrl,
        },
        urlLicitacao: input.urlLicitacao,
        modoAprovacao: input.modoAprovacao,
        validadeDias: input.validadeDias,
      }).then(resultado => {
        propostaJobs.set(jobId, {
          status: resultado.aguardandoAprovacao ? "aguardando_aprovacao"
            : resultado.sucesso ? "done" : "error",
          resultado,
          criadoEm: propostaJobs.get(jobId)?.criadoEm ?? new Date(),
        });
      }).catch(err => {
        propostaJobs.set(jobId, {
          status: "error",
          resultado: {
            sucesso: false, portalUsado: input.portalType as PortalType,
            itensTentados: 0, itensPreenchidos: 0, itensComErro: 0,
            screenshots: [], log: [], erros: [err?.message ?? "Erro desconhecido"],
            aguardandoAprovacao: false,
            resumo: { processo: "", orgao: "", totalProposta: 0, validadeDias: input.validadeDias },
          },
          criadoEm: propostaJobs.get(jobId)?.criadoEm ?? new Date(),
        });
      });

      return {
        jobId,
        message: "Agente iniciado. Acompanhe o progresso pelo jobId.",
      };
    }),

  /** Consulta status e resultado de um job */
  status: protectedProcedure
    .input(z.object({ jobId: z.string().uuid() }))
    .query(({ input }: { input: { jobId: string } }) => {
      const job = propostaJobs.get(input.jobId);
      if (!job) return { status: "not_found" as const, resultado: null };

      // Retornar sem screenshots (são grandes — buscar separado)
      const resultado = job.resultado
        ? { ...job.resultado, screenshots: [] }
        : null;

      return { status: job.status, resultado };
    }),

  /** Busca screenshots de um job concluído */
  screenshots: protectedProcedure
    .input(z.object({ jobId: z.string().uuid() }))
    .query(({ input }: { input: { jobId: string } }) => {
      const job = propostaJobs.get(input.jobId);
      if (!job?.resultado) return { screenshots: [] };
      return { screenshots: job.resultado.screenshots };
    }),

  /** Confirma envio final (após aprovação humana no modo rascunho) */
  confirmarEnvio: protectedProcedure
    .input(z.object({
      jobId: z.string().uuid(),
      propostaId: z.number(),
      portalType: portalTypeSchema,
      credencial: z.object({
        email: z.string(),
        password: z.string(),
        cpf: z.string().optional(),
        cnpj: z.string().optional(),
        loginUrl: z.string().optional(),
      }),
      urlLicitacao: z.string().url().optional(),
    }))
    .mutation(async ({ input }: { input: { jobId: string; propostaId: number; portalType: PortalType; credencial: { email: string; password: string; cpf?: string; cnpj?: string; loginUrl?: string }; urlLicitacao?: string } }) => {
      const novoJobId = randomUUID();
      const passwordEncrypted = encryptPassword(input.credencial.password);

      propostaJobs.set(novoJobId, { status: "running", criadoEm: new Date() });

      // Reexecuta em modo envio direto
      executarAgenteProposta({
        propostaId: input.propostaId,
        portalType: input.portalType as PortalType,
        credencial: { ...input.credencial, passwordEncrypted },
        urlLicitacao: input.urlLicitacao,
        modoAprovacao: "enviar_direto",
        validadeDias: 60,
      }).then(r => {
        propostaJobs.set(novoJobId, {
          status: r.sucesso ? "done" : "error",
          resultado: r,
          criadoEm: new Date(),
        });
      }).catch(err => {
        propostaJobs.set(novoJobId, {
          status: "error",
          criadoEm: new Date(),
          resultado: {
            sucesso: false, portalUsado: input.portalType as PortalType,
            itensTentados: 0, itensPreenchidos: 0, itensComErro: 0,
            screenshots: [], log: [], erros: [err?.message],
            aguardandoAprovacao: false,
            resumo: { processo: "", orgao: "", totalProposta: 0, validadeDias: 60 },
          },
        });
      });

      return { jobId: novoJobId, message: "Envio iniciado" };
    }),

  /** Lista jobs recentes (últimas 20 execuções em memória) */
  historicoJobs: protectedProcedure.query(() => {
    return Array.from(propostaJobs.entries())
      .slice(-20)
      .map(([id, job]) => ({
        jobId: id,
        status: job.status,
        criadoEm: job.criadoEm,
        portal: job.resultado?.portalUsado,
        itensPreenchidos: job.resultado?.itensPreenchidos ?? 0,
        itensTentados: job.resultado?.itensTentados ?? 0,
        totalProposta: job.resultado?.resumo.totalProposta ?? 0,
        processo: job.resultado?.resumo.processo ?? "",
      }))
      .reverse();
  }),
});
