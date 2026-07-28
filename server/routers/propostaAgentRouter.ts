/**
 * propostaAgentRouter.ts
 * Endpoints tRPC para o Agente de Preenchimento de Propostas.
 */

import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { randomUUID } from "crypto";
import { encryptPassword } from "../utils/encryption";
import {
  executarAgenteProposta,
  propostaJobs,
  type PortalType,
} from "../services/propostaAgent";
import {
  S2_PORTAL_CONFIGS,
  S2_TARGET_PORTALS,
  type S2TargetPortal,
} from "../services/s2PortalAgentExtension";

const portalTypeSchema = z.enum([
  "copasa",
  "cemig",
  "fundep",
  "funarbe",
  "comprasmg",
  "fiemg",
]);

function isTargetPortal(value: string): value is S2TargetPortal {
  return (S2_TARGET_PORTALS as readonly string[]).includes(value);
}

function asLegacyPortalType(portal: S2TargetPortal): PortalType {
  // O motor legado aceita strings em runtime; a extensão registra CEMIG/FIEMG
  // no mesmo mapa de configurações antes da execução.
  return portal as unknown as PortalType;
}

export const propostaAgentRouter = router({

  /** Lista somente os seis portais definidos para a operação atual do S2. */
  portaisDisponiveis: protectedProcedure.query(() => {
    return S2_TARGET_PORTALS.map((key) => {
      const cfg = S2_PORTAL_CONFIGS[key];
      return {
        tipo: key,
        nome: cfg.nome,
        loginUrl: cfg.loginUrl,
        estrategia: cfg.estrategia,
        camposSuportados: {
          preco: !!cfg.seletores.inputPreco,
          marca: !!cfg.seletores.inputMarca,
          validade: !!cfg.seletores.inputValidade,
          envioAutomatico: !!cfg.seletores.botaoEnviar,
        },
      };
    });
  }),

  /** Inicia preenchimento de proposta em segundo plano. */
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
      let portalType = input.portalType as S2TargetPortal;
      if (input.credencialId) {
        const { getPortalCredentialDecrypted } = await import("./portalCredentials");
        const saved = await getPortalCredentialDecrypted(input.credencialId);
        if (!saved) throw new Error("Credencial do portal não encontrada no cofre.");
        if (!isTargetPortal(saved.portal)) {
          throw new Error("A credencial selecionada pertence a um portal fora do escopo atual do S2.");
        }
        cred = {
          email: saved.usuario,
          password: saved.senha,
          cnpj: saved.cnpj,
          loginUrl: saved.loginUrl,
        };
        portalType = saved.portal;
      }
      if (!cred) throw new Error("Informe uma credencial (inline) ou um credencialId do cofre.");

      const passwordEncrypted = encryptPassword(cred.password);
      propostaJobs.set(jobId, { status: "running", criadoEm: new Date() });

      executarAgenteProposta({
        propostaId: input.propostaId,
        portalType: asLegacyPortalType(portalType),
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
            sucesso: false,
            portalUsado: asLegacyPortalType(portalType),
            itensTentados: 0,
            itensPreenchidos: 0,
            itensComErro: 0,
            screenshots: [],
            log: [],
            erros: [err?.message ?? "Erro desconhecido"],
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

  /** Consulta status e resultado de um job. */
  status: protectedProcedure
    .input(z.object({ jobId: z.string().uuid() }))
    .query(({ input }: { input: { jobId: string } }) => {
      const job = propostaJobs.get(input.jobId);
      if (!job) return { status: "not_found" as const, resultado: null };
      const resultado = job.resultado
        ? { ...job.resultado, screenshots: [] }
        : null;
      return { status: job.status, resultado };
    }),

  /** Busca screenshots de um job concluído. */
  screenshots: protectedProcedure
    .input(z.object({ jobId: z.string().uuid() }))
    .query(({ input }: { input: { jobId: string } }) => {
      const job = propostaJobs.get(input.jobId);
      if (!job?.resultado) return { screenshots: [] };
      return { screenshots: job.resultado.screenshots };
    }),

  /** Confirma envio final após aprovação humana no modo rascunho. */
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
    .mutation(async ({ input }) => {
      const novoJobId = randomUUID();
      const passwordEncrypted = encryptPassword(input.credencial.password);
      const portalType = input.portalType as S2TargetPortal;

      propostaJobs.set(novoJobId, { status: "running", criadoEm: new Date() });

      executarAgenteProposta({
        propostaId: input.propostaId,
        portalType: asLegacyPortalType(portalType),
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
            sucesso: false,
            portalUsado: asLegacyPortalType(portalType),
            itensTentados: 0,
            itensPreenchidos: 0,
            itensComErro: 0,
            screenshots: [],
            log: [],
            erros: [err?.message ?? "Erro desconhecido"],
            aguardandoAprovacao: false,
            resumo: { processo: "", orgao: "", totalProposta: 0, validadeDias: 60 },
          },
        });
      });

      return { jobId: novoJobId, message: "Envio iniciado" };
    }),

  /** Lista jobs recentes (últimas 20 execuções em memória). */
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
