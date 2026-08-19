/**
 * agenticSeekService.ts
 * Serviço do módulo AgenticSeek — prospecção automatizada de licitações.
 *
 * Executa buscas orientadas por objetivo ("indústrias em Betim que abriram
 * licitação em 90 dias") sobre a API oficial do PNCP (reaproveita o
 * pncpConnector, que já implementa rate limit, retry e api_logs), pontua a
 * relevância de cada edital com a IA configurada (llm.ts), valida o CNPJ do
 * órgão (dígitos verificadores locais + BrasilAPI) e consolida duplicados.
 *
 * Regras de conduta:
 * - Toda busca grava registro em agenticseek_buscas com status e custo estimado.
 * - Erros nunca vazam stack trace para o cliente; a mensagem fica na coluna
 *   erroMensagem da busca (visível apenas ao operador).
 * - A IA só pontua — nunca decide. A ação de enviar ao funil é manual.
 * - Sem segredos no código: as chaves vêm de llm.ts (ANTHROPIC/GROQ/FORGE env).
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import {
  agenticseekBuscas,
  agenticseekResultados,
  funilOportunidades,
} from "../../drizzle/schema";
import {
  buscarLicitacoesMultiModalidade,
} from "../connectors/pncpConnector";
import { consultarCnpj } from "../connectors/brasilApiConnector";
import {
  estimateCostUsd,
  invokeLLM,
  parseLlmJson,
  usdBrlRate,
} from "../_core/llm";
import { logger } from "../_core/logger";
import { validateCnpjDigits } from "../utils/cnpjUtils";
import { recordAudit } from "../services/auditService";
import { activeProvider } from "../_core/llm";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export type AgenticSeekIniciarInput = {
  objetivo: string;
  keywords?: string[];
  uf?: string;
  municipio?: string;
  diasAtras?: number;
  modalidades?: number[];
  maxPaginas?: number;
};

export type BuscaStatusResumo = {
  id: number;
  objetivo: string;
  status: string;
  totalResultados: number;
  totalValidados: number;
  erroMensagem: string | null;
  custoEstimadoBrl: string | null;
  custoEstimadoUsd: string | null;
  tempoExecucaoMs: number | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
};

const MAX_OBJECTIVO_CHARS = 4000;
const DEFAULT_MAX_PAGINAS = 4;
const PNCP_MODALIDADES_PADRAO = [8, 6]; // pregão eletrônico, concorrência eletrônica

/** Extrai palavras-chave do objetivo quando nenhuma foi fornecida. */
function deriveKeywords(objetivo: string, provided?: string[]): string[] {
  if (provided && provided.length > 0) return provided;
  // Heurística simples e determinística: nada de IA aqui.
  const stop = new Set([
    "de", "da", "do", "das", "dos", "e", "em", "que", "com", "para", "no", "na",
    "a", "o", "os", "as", "um", "uma", "nos", "nas", "aos", "às",
  ]);
  return objetivo
    .split(/[\s,;]+/)
    .map((t) => t.toLowerCase())
    .filter((t) => t.length >= 3 && !stop.has(t))
    .slice(0, 20);
}

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

/**
 * Pontua a relevância de um edital em relação ao objetivo da busca, usando a
 * IA configurada (invokeLLM). Retorna score 0–100, justificativa e avaliação
 * de compatibilidade do órgão.
 *
 * Falha de IA nunca aborta a busca: retorna score neutro (50) com nota de
 * aviso — o operador vê a lacuna no campo orgaoCompatibilidadeNota.
 */
export async function scoreRelevanceWithLlm(
  objetivo: string,
  edital: { orgao: string; objeto: string; modalidade?: string; uf?: string; municipio?: string; cnpjOrgao?: string }
): Promise<{
  relevanceScore: number;
  justificativa: string;
  orgaoCompativel: boolean;
  compatibilidadeNota: string;
  promptTokens: number;
  completionTokens: number;
}> {
  const neutro = {
    relevanceScore: 50,
    justificativa: "Pontuação indisponível — IA inoperante no momento. Revisar configuração.",
    orgaoCompativel: false,
    compatibilidadeNota: "Pontuação IA indisponível; resultado não avaliado.",
    promptTokens: 0,
    completionTokens: 0,
  };
  try {
    const outputSchema = {
      name: "score_edital",
      strict: true,
      schema: {
        type: "object",
        properties: {
          relevanceScore: { type: "integer", description: "Score de 0 a 100" },
          justificativa: { type: "string", description: "Justificativa em uma frase" },
          orgaoCompativel: { type: "boolean", description: "O órgão é compatível com o objetivo" },
          compatibilidadeNota: { type: "string", description: "Nota sobre a compatibilidade do órgão" },
        },
        required: ["relevanceScore", "justificativa", "orgaoCompativel", "compatibilidadeNota"],
        additionalProperties: false,
      },
    };
    const res = await invokeLLM({
      messages: [
        {
          role: "user",
          content: `Você é um analista de prospecção de licitações públicas.

OBJETIVO DA BUSCA: "${objetivo}"

EDITAL A AVALIAR:
- Órgão: ${edital.orgao || "não informado"}
- CNPJ do órgão: ${edital.cnpjOrgao || "não informado"}
- Objeto: ${edital.objeto || "não informado"}
- Modalidade: ${edital.modalidade || "não informada"}
- UF: ${edital.uf || "não informada"}
- Município: ${edital.municipio || "não informado"}

Avalie:
1. relevanceScore (0–100): aderência do objeto ao objetivo da busca (considere também UF/município quando informados no objetivo).
2. justificativa: uma frase explicando o score.
3. orgaoCompativel: se a natureza do órgão é compatível com a execução do objeto (ex.: órgão de saúde comprando medicamento é compatível).
4. compatibilidadeNota: uma frase curta.

Responda apenas com JSON válido.`,
        },
      ],
      outputSchema,
      responseFormat: { type: "json_schema", json_schema: outputSchema },
      maxTokens: 500,
    });
    const choice = res.choices?.[0];
    const raw =
      typeof choice?.message?.content === "string" ? choice.message.content : "";
    if (!raw) return neutro;
    const parsed = parseLlmJson<{
      relevanceScore?: number;
      justificativa?: string;
      orgaoCompativel?: boolean;
      compatibilidadeNota?: string;
    }>(raw);
    const relevanceScore = Math.min(
      100,
      Math.max(0, Math.round(Number(parsed.relevanceScore ?? 50)))
    );
    return {
      relevanceScore,
      justificativa: parsed.justificativa ?? "Sem justificativa",
      orgaoCompativel: parsed.orgaoCompativel ?? false,
      compatibilidadeNota: parsed.compatibilidadeNota ?? "",
      promptTokens: res.usage?.prompt_tokens ?? 0,
      completionTokens: res.usage?.completion_tokens ?? 0,
    };
  } catch (err) {
    logger.error("[AgenticSeek] Falha no scoring IA:", (err as Error).message);
    return neutro;
  }
}

/** Valida o CNPJ do órgão: dígitos verificadores (determinístico) + BrasilAPI. */
export async function validateOrgaoCnpj(cnpj: string): Promise<{
  cnpjValido: boolean;
  naturezaJuridica: string | null;
  cnae: string | null;
}> {
  const digitsOnly = cnpj.replace(/\D/g, "");
  const validFormat = validateCnpjDigits(digitsOnly);
  if (!validFormat) {
    return { cnpjValido: false, naturezaJuridica: null, cnae: null };
  }
  try {
    const info = await consultarCnpj(digitsOnly);
    return {
      cnpjValido:
        info.situacao === "ATIVA" ||
        (info.situacao != null && /ativa/i.test(info.situacao)),
      naturezaJuridica: info.razaoSocial ?? null,
      cnae: info.cnaePrincipal ?? null,
    };
  } catch (err) {
    logger.warn("[AgenticSeek] CNPJ do órgão não consultável:", (err as Error).message);
    // Formato válido, mas consulta indisponível — não rebaixar para inválido.
    return { cnpjValido: true, naturezaJuridica: null, cnae: null };
  }
}

/** Deduplica por número de controle PNCP; mantém o registro de maior score. */
function consolidateResults<T extends { numeroControlePncp?: string | null; relevanceScore?: number | null }>(
  rows: T[]
): T[] {
  const seen = new Map<string, T>();
  for (const row of rows) {
    const key = row.numeroControlePncp || `raw-${Math.random()}`;
    const existing = seen.get(key);
    if (!existing || (row.relevanceScore ?? 0) > (existing.relevanceScore ?? 0)) {
      seen.set(key, row);
    }
  }
  return Array.from(seen.values());
}

export async function toCSV(results: Array<Record<string, unknown>>): Promise<string> {
  const header = [
    "Edital", "Órgão", "CNPJ Órgão", "UF", "Município", "Modalidade", "Objeto",
    "Publicação", "Abertura", "Encerramento", "Valor Estimado", "Score",
    "Justificativa", "CNPJ Válido", "Compatível", "Link",
  ];
  const esc = (v: unknown): string => {
    const s = v == null ? "" : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };
  const lines = results.map((r) =>
    header
      .map((h) => {
        const key = h.toLowerCase().replace(/ /g, "");
        return esc(
          key === "cnpjórgão" ? r.cnpjOrgao : r[key as keyof typeof r] ?? r[h] ?? ""
        );
      })
      .join(",")
  );
  return [header.map(esc).join(","), ...lines].join("\n");
}

/**
 * Inicia (e executa imediatamente) uma busca AgenticSeek.
 *
 * O cliente recebe o id da busca e acompanha por polling (statusResultados).
 * A execução roda em background viaPromise (fire-and-return) — o servidor não
 * bloqueia a resposta HTTP; o progresso fica persistido no banco.
 */
export async function iniciarBusca(
  userId: number,
  input: AgenticSeekIniciarInput
): Promise<{ buscaId: number }> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível para iniciar a busca.");

  const objetivo = (input.objetivo ?? "").trim();
  if (!objetivo || objetivo.length < 10 || objetivo.length > MAX_OBJECTIVO_CHARS) {
    throw new Error(
      `Objetivo inválido: informe entre 10 e ${MAX_OBJECTIVO_CHARS} caracteres.`
    );
  }

  const modalidadesArray = (input.modalidades ?? PNCP_MODALIDADES_PADRAO)
    .slice(0, 6)
    .map((n) => Math.max(1, Math.min(99, n)));
  const modalidades = modalidadesArray.join(",");
  const diasAtras = Math.min(90, Math.max(1, input.diasAtras ?? 30));

  const keywords = deriveKeywords(objetivo, input.keywords);

  const [inserted] = await db.insert(agenticseekBuscas).values({
    userId,
    objetivo,
    keywords: keywords.join(", "),
    uf: input.uf?.toUpperCase().slice(0, 2),
    municipio: input.municipio?.slice(0, 128),
    diasAtras,
    modalidades,
    status: "executando",
    startedAt: new Date(),
  });
  const buscaId = Number(inserted.insertId);

  void recordAudit({
    userId,
    action: "agenticseek_busca_iniciada",
    entity: "agenticseek_buscas",
    entityId: buscaId,
    origin: "api",
    summary: `Busca AgenticSeek iniciada: ${objetivo.slice(0, 100)}`,
  }).catch(() => undefined);

  // Execução em background (fire-and-return). O cliente faz polling.
  executarBusca(buscaId, { ...input, diasAtras, modalidadesArray }).catch((err) =>
    logger.error("[AgenticSeek] Falha na execução em background:", (err as Error).message)
  );

  return { buscaId };
}

async function executarBusca(
  buscaId: number,
  input: AgenticSeekIniciarInput & {
    diasAtras: number;
    modalidadesArray: number[];
  }
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const startedAt = Date.now();
  let totalTokens = 0;
  let custoUsd = 0;

  const markError = async (msg: string) => {
    await db
      .update(agenticseekBuscas)
      .set({ status: "erro", erroMensagem: msg.slice(0, 4000), completedAt: new Date() })
      .where(eq(agenticseekBuscas.id, buscaId));
  };

  try {
    const dataFinal = new Date();
    const dataInicial = new Date();
    dataInicial.setDate(dataInicial.getDate() - input.diasAtras);

    // buscarLicitacoesMultiModalidade consulta UMA página por modalidade por
    // vez; paginar além disso exigiria N chamadas por modalidade.
    const buscaMulti = await buscarLicitacoesMultiModalidade(
      toDateStr(dataInicial),
      toDateStr(dataFinal),
      1,
      input.modalidadesArray
    );
    const licitacoes = buscaMulti.data ?? [];

    if (licitacoes.length === 0) {
      await db
        .update(agenticseekBuscas)
        .set({ status: "concluida", completedAt: new Date(), tempoExecucaoMs: Date.now() - startedAt })
        .where(eq(agenticseekBuscas.id, buscaId));
      return;
    }

    const keywords = deriveKeywords(input.objetivo, input.keywords);
    const filtered = licitacoes.filter((lic) => {
      const haystack = `${lic.objetoCompra ?? ""} ${lic.informacaoComplementar ?? ""}`.toLowerCase();
      return keywords.length === 0 || keywords.some((k) => haystack.includes(k.toLowerCase()));
    });

    // 1ª passagem: persistir todos os filtrados sem IA (rápido e determinístico).
    const rows: Array<{
      numeroControlePncp: string | null;
      editalId: string | null;
      orgao: string;
      cnpjOrgao: string | null;
      uf: string | null;
      municipio: string | null;
      modalidade: string;
      objeto: string;
      dataPublicacao: string | null;
      dataAbertura: string | null;
      dataEncerramento: string | null;
      valorEstimado: string | null;
      link: string | null;
    }> = [];
    for (const lic of filtered) {
      rows.push({
        numeroControlePncp: lic.numeroControlePNCP ?? null,
        editalId: lic.linkSistemaOrigem ?? null,
        orgao: lic.orgaoEntidade?.razaoSocial ?? "não informado",
        cnpjOrgao: lic.orgaoEntidade?.cnpj ?? null,
        uf: lic.unidadeOrgao?.ufSigla ?? lic.unidadeOrgao?.ufNome ?? null,
        municipio: lic.unidadeOrgao?.municipioNome ?? null,
        modalidade: lic.modalidadeNome ?? String(lic.modalidadeId ?? "não informada"),
        objeto: lic.objetoCompra ?? "",
        dataPublicacao: lic.dataPublicacaoPncp ?? null,
        dataAbertura: lic.dataAberturaProposta ?? null,
        dataEncerramento: lic.dataEncerramentoProposta ?? null,
        valorEstimado:
          lic.valorTotalEstimado != null ? String(lic.valorTotalEstimado) : null,
        link: lic.linkSistemaOrigem ?? null,
      });
    }
    for (const row of rows) {
      await db.insert(agenticseekResultados).values({
        buscaId,
        fonte: "pncp",
        ...row,
      });
    }

    // 2ª passagem: IA pontua cada resultado (com custo estimado e rate limit
    // interno do invokeLLM). Falhas individuais não abortam a busca.
    const allResults = await db
      .select()
      .from(agenticseekResultados)
      .where(eq(agenticseekResultados.buscaId, buscaId));

    for (const result of allResults) {
        try {
        const score = await scoreRelevanceWithLlm(input.objetivo, {
          orgao: result.orgao ?? "",
          objeto: result.objeto ?? "",
          modalidade: result.modalidade ?? undefined,
          uf: result.uf ?? undefined,
          municipio: result.municipio ?? undefined,
          cnpjOrgao: result.cnpjOrgao ?? undefined,
        });
        void score;
        totalTokens += score.promptTokens + score.completionTokens;
        await db
          .update(agenticseekResultados)
          .set({
            relevanceScore: score.relevanceScore,
            relevanceJustificativa: score.justificativa,
            orgaoCompativel: score.orgaoCompativel,
            orgaoCompatibilidadeNota: score.compatibilidadeNota,
            validated: true,
          })
          .where(eq(agenticseekResultados.id, result.id));
      } catch (err) {
        logger.warn("[AgenticSeek] Falha ao pontuar resultado:", (err as Error).message);
      }

      // Validação do CNPJ do órgão (BrasilAPI — sem quota de IA).
      if (result.cnpjOrgao && result.cnpjOrgao.replace(/\D/g, "").length === 14) {
        try {
          const val = await validateOrgaoCnpj(result.cnpjOrgao);
          await db
            .update(agenticseekResultados)
            .set({
              cnpjValido: val.cnpjValido,
              cnpjNaturezaJuridica: val.naturezaJuridica,
              cnpjCnae: val.cnae,
            })
            .where(eq(agenticseekResultados.id, result.id));
        } catch (err) {
          logger.warn("[AgenticSeek] Falha ao validar CNPJ:", (err as Error).message);
        }
      }
    }

    const provider = activeProvider();
    custoUsd = estimateCostUsd(provider?.model ?? "claude-sonnet", totalTokens, 0);
    const custoBrl = custoUsd * usdBrlRate();
    const stats = await db
      .select({
        total: sql<number>`count(*)`,
        validados: sql<number>`sum(case when validated then 1 else 0 end)`,
      })
      .from(agenticseekResultados)
      .where(eq(agenticseekResultados.buscaId, buscaId));

    await db
      .update(agenticseekBuscas)
      .set({
        status: "concluida",
        totalResultados: Number(stats[0]?.total ?? 0),
        totalValidados: Number(stats[0]?.validados ?? 0),
        custoEstimadoUsd: custoUsd.toFixed(4),
        custoEstimadoBrl: custoBrl.toFixed(4),
        tempoExecucaoMs: Date.now() - startedAt,
        completedAt: new Date(),
      })
      .where(eq(agenticseekBuscas.id, buscaId));
  } catch (err) {
    logger.error(`[AgenticSeek] Busca ${buscaId} falhou:`, (err as Error).message);
    await markError((err as Error).message);
  }
}

export async function statusBusca(buscaId: number, userId: number): Promise<BuscaStatusResumo> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  const [busca] = await db
    .select()
    .from(agenticseekBuscas)
    .where(eq(agenticseekBuscas.id, buscaId));
  if (!busca) throw new Error("Busca não encontrada.");
  return {
    id: busca.id,
    objetivo: busca.objetivo,
    status: busca.status,
    totalResultados: busca.totalResultados,
    totalValidados: busca.totalValidados,
    erroMensagem: busca.erroMensagem,
    custoEstimadoBrl: busca.custoEstimadoBrl,
    custoEstimadoUsd: busca.custoEstimadoUsd,
    tempoExecucaoMs: busca.tempoExecucaoMs,
    startedAt: busca.startedAt,
    completedAt: busca.completedAt,
    createdAt: busca.createdAt,
  };
}

export async function resultadosBusca(
  buscaId: number,
  userId: number,
  opts?: { minScore?: number; onlyValidadas?: boolean; limit?: number }
) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  const conds = [eq(agenticseekResultados.buscaId, buscaId)];
  if (opts?.minScore != null) conds.push(sql`${agenticseekResultados.relevanceScore} >= ${opts.minScore}`);
  if (opts?.onlyValidadas) conds.push(eq(agenticseekResultados.validated, true));
  const resultados = await db
    .select()
    .from(agenticseekResultados)
    .where(and(...conds))
    .orderBy(desc(agenticseekResultados.relevanceScore), desc(agenticseekResultados.id))
    .limit(Math.min(500, opts?.limit ?? 100));

  const [busca] = await db
    .select({ custoEstimadoUsd: agenticseekBuscas.custoEstimadoUsd, custoEstimadoBrl: agenticseekBuscas.custoEstimadoBrl })
    .from(agenticseekBuscas)
    .where(eq(agenticseekBuscas.id, buscaId));

  return {
    resultados,
    custo: busca ? { custoEstimadoUsd: busca.custoEstimadoUsd, custoEstimadoBrl: busca.custoEstimadoBrl } : null,
  };
}

export async function historicoBuscas(userId: number, limit = 25) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  return db
    .select()
    .from(agenticseekBuscas)
    .orderBy(desc(agenticseekBuscas.id))
    .limit(Math.min(50, limit));
}

/**
 * Envia um resultado validado para o funil de oportunidades como nova
 * oportunidade (origemTipo = "agenticseek"). Exige adminProcedure.
 */
export async function enviarParaFunil(buscaId: number, resultadoId: number, responsavel?: string) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  const [resultado] = await db
    .select()
    .from(agenticseekResultados)
    .where(eq(agenticseekResultados.id, resultadoId));
  if (!resultado || resultado.buscaId !== buscaId) {
    throw new Error("Resultado não encontrado nesta busca.");
  }
  const [inserted] = await db.insert(funilOportunidades).values({
    titulo: (resultado.orgao ?? "Órgão") + " — " + (resultado.objeto ?? "").slice(0, 200),
    orgao: resultado.orgao ?? undefined,
    objeto: resultado.objeto ?? undefined,
    modalidade: resultado.modalidade ?? undefined,
    // "agenticseek" é gravado em origemId (int); a origem lógica fica na
    // observações para não poluir o enum sem autorização do dono do schema.
    origemTipo: "manual",
    origemId: resultado.id,
    valorEstimado: resultado.valorEstimado ?? undefined,
    dataAbertura: resultado.dataAbertura ? new Date(resultado.dataAbertura) : undefined,
    prazoEnvio: resultado.dataEncerramento ? new Date(resultado.dataEncerramento) : undefined,
    responsavel,
    observacoes: (resultado.relevanceJustificativa ?? "") +
      " [origem: prospecção AgenticSeek — busca #" + buscaId + "]",
  });
  const oportunidadeId = Number(inserted.insertId);
  await db
    .update(agenticseekResultados)
    .set({ funilOportunidadeId: oportunidadeId })
    .where(eq(agenticseekResultados.id, resultadoId));
  void recordAudit({
    action: "agenticseek_enviado_funil",
    entity: "funil_oportunidades",
    entityId: oportunidadeId,
    origin: "api",
    summary: `Resultado AgenticSeek #${resultadoId} enviado ao funil como oportunidade #${oportunidadeId}`,
  }).catch(() => undefined);
  return { oportunidadeId };
}

export async function cancelarBusca(buscaId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  const [busca] = await db
    .select()
    .from(agenticseekBuscas)
    .where(eq(agenticseekBuscas.id, buscaId));
  if (!busca) throw new Error("Busca não encontrada.");
  if (busca.status !== "pendente" && busca.status !== "executando") {
    throw new Error(`Não é possível cancelar uma busca com status "${busca.status}".`);
  }
  await db
    .update(agenticseekBuscas)
    .set({ status: "cancelada", completedAt: new Date() })
    .where(eq(agenticseekBuscas.id, buscaId));
  void recordAudit({
    userId,
    action: "agenticseek_busca_cancelada",
    entity: "agenticseek_buscas",
    entityId: buscaId,
    origin: "api",
    summary: `Busca AgenticSeek #${buscaId} cancelada.`,
  }).catch(() => undefined);
  return { ok: true };
}
