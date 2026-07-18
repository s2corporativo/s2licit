import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getDb } from "../db";
import { products } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { processFichaTecnicaPage, processReclassifyPage } from "../services/aiEnrichmentService";
import { getAiJob, startPagedAiJob } from "../jobs/aiJobRunner";

/**
 * Router de enriquecimento com IA.
 *
 * Operações em massa NÃO rodam dentro da mutation: as procedures *StartJob
 * criam um registro em `ai_jobs`, processam em background e o cliente
 * acompanha por `aiJobStatus` (polling). Apenas operações de item único
 * (sugestão de campos, ficha técnica de um produto) são síncronas.
 */
export const enrichmentRouter = router({
  // Sugerir campos de um produto a partir do nome (uso pontual na UI)
  suggestFields: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      categoryName: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { invokeLLM, parseLlmJson } = await import("../_core/llm");
      const systemMsg = "Você é um especialista em produtos para cotações e licitações — medicamentos veterinários e humanos, materiais de construção, insumos e equipamentos. Responda apenas com JSON válido.";
      const userMsg = `Produto: "${input.name}"${input.categoryName ? ` (categoria: ${input.categoryName})` : ""}. Sugira: activeIngredient, concentration, presentation, unit, manufacturer (ou null), description, confidence (0-1). JSON apenas.`;

      try {
        const result = await invokeLLM({
          messages: [
            { role: "system" as const, content: systemMsg },
            { role: "user" as const, content: userMsg },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "product_enrichment",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  activeIngredient: { type: "string" },
                  concentration: { type: "string" },
                  presentation: { type: "string" },
                  unit: { type: "string" },
                  manufacturer: { type: ["string", "null"] },
                  description: { type: "string" },
                  confidence: { type: "number" },
                },
                required: ["activeIngredient", "concentration", "presentation", "unit", "manufacturer", "description", "confidence"],
                additionalProperties: false,
              },
            },
          },
        });
        const content = result.choices?.[0]?.message?.content;
        if (!content || typeof content !== "string") return { error: "Sem resposta do modelo" };
        return parseLlmJson(content);
      } catch (e: any) {
        return { error: e.message ?? "Erro ao chamar LLM" };
      }
    }),

  // ── Ficha técnica: uma página (uso para produto único no modal de edição) ──
  enrichFichaTecnica: protectedProcedure
    .input(z.object({
      scope: z.enum(["withoutFicha", "selected", "all"]).default("withoutFicha"),
      productIds: z.array(z.number()).optional(),
      overwrite: z.boolean().default(false),
      offset: z.number().min(0).default(0),
      // Página pequena: operação síncrona é só para poucos itens; volumes
      // grandes devem usar enrichFichaTecnicaStartJob.
      pageSize: z.number().min(1).max(50).default(10),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      return processFichaTecnicaPage(db, input);
    }),

  // ── Ficha técnica em massa: job em background ──────────────────────────────
  enrichFichaTecnicaStartJob: protectedProcedure
    .input(z.object({
      scope: z.enum(["withoutFicha", "selected", "all"]).default("withoutFicha"),
      productIds: z.array(z.number()).optional(),
      overwrite: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const jobId = await startPagedAiJob({
          tipo: "ficha_tecnica",
          payload: input,
          requestedBy: ctx.user?.id,
          runPage: (db, offset) =>
            processFichaTecnicaPage(db, { ...input, offset, pageSize: 150 }),
        });
        return { jobId };
      } catch (e) {
        throw new TRPCError({ code: "CONFLICT", message: (e as Error).message });
      }
    }),

  // ── Reclassificação em massa: job em background ────────────────────────────
  bulkReclassifyStartJob: protectedProcedure
    .input(z.object({
      productIds: z.array(z.number()).optional(),
      includeAlreadyCategorized: z.boolean().optional().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const jobId = await startPagedAiJob({
          tipo: "reclassificacao",
          payload: input,
          requestedBy: ctx.user?.id,
          runPage: (db, offset) =>
            processReclassifyPage(db, {
              productIds: input.productIds,
              includeAlreadyCategorized: input.includeAlreadyCategorized ?? false,
              offset,
              pageSize: 200,
              batchSize: 50,
            }),
        });
        return { jobId };
      } catch (e) {
        throw new TRPCError({ code: "CONFLICT", message: (e as Error).message });
      }
    }),

  // ── Status de job de IA (polling do cliente) ───────────────────────────────
  aiJobStatus: protectedProcedure
    .input(z.object({ jobId: z.number() }))
    .query(async ({ input }) => {
      const job = await getAiJob(input.jobId);
      if (!job) throw new TRPCError({ code: "NOT_FOUND", message: `Job ${input.jobId} não encontrado` });
      return {
        id: job.id,
        tipo: job.tipo,
        status: job.status,
        progresso: job.progresso ?? { processed: 0, total: 0, updated: 0, skipped: 0, errors: 0 },
        errorMessages: job.errorMessages ?? [],
        iniciadoEm: job.iniciadoEm,
        concluidoEm: job.concluidoEm,
      };
    }),

  // ── extractFichaTecnica: extrai ficha técnica de UM produto via IA (para modal de edição) ──
  extractFichaTecnica: protectedProcedure
    .input(z.object({
      productId: z.number(),
      name: z.string(),
      manufacturer: z.string().optional(),
      concentration: z.string().optional(),
      presentation: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { invokeLLM, parseLlmJson } = await import("../_core/llm");
      const prompt = [
        `Produto veterinário: "${input.name}"`,
        input.manufacturer ? `Fabricante: ${input.manufacturer}` : null,
        input.concentration ? `Concentração: ${input.concentration}` : null,
        input.presentation ? `Apresentação: ${input.presentation}` : null,
      ].filter(Boolean).join(" | ");
      const resp = await invokeLLM({
        messages: [
          { role: "system", content: "Você é um especialista técnico em produtos para cotações (medicamentos veterinários e humanos, materiais de construção, insumos e equipamentos). Retorne APENAS um JSON com o campo 'fichaTecnica' contendo a ficha técnica completa do produto (composição/princípio ativo ou especificação, classe/categoria de uso, indicações/aplicações, posologia ou modo de uso quando couber, apresentação). Se não souber, retorne fichaTecnica como string vazia." },
          { role: "user", content: prompt },
        ],
        response_format: {
          type: "json_schema" as const,
          json_schema: {
            name: "ficha_tecnica",
            strict: true,
            schema: {
              type: "object",
              properties: { fichaTecnica: { type: "string" } },
              required: ["fichaTecnica"],
              additionalProperties: false,
            },
          },
        },
      });
      const parsed = parseLlmJson<{ fichaTecnica: string }>(resp.choices[0].message.content as string);
      if (!parsed.fichaTecnica?.trim()) throw new TRPCError({ code: "NOT_FOUND", message: "IA não encontrou ficha técnica para este produto" });
      return { fichaTecnica: parsed.fichaTecnica.trim() };
    }),

  getEnrichmentStats: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("DB indisponível");

    const allProducts = await db
      .select({
        id: products.id,
        statusConfiabilidade: products.statusConfiabilidade,
        activeIngredient: products.activeIngredient,
      })
      .from(products)
      .where(eq(products.isActive, "yes"));

    const enriquecidos = allProducts.filter(
      (p) => p.statusConfiabilidade === "enriquecido_ia"
    ).length;
    const pendentes = allProducts.filter(
      (p) => !p.activeIngredient || p.statusConfiabilidade === "incompleto"
    ).length;

    return {
      total: allProducts.length,
      enriquecidos,
      pendentes,
      percentualEnriquecido:
        allProducts.length > 0 ? (enriquecidos / allProducts.length) * 100 : 0,
    };
  }),
});
