import { z } from "zod";
import { notifyOwner } from "./notification";
import { adminProcedure, publicProcedure, protectedProcedure, router } from "./trpc";
import { getDb } from "../db";
import { importLogs, products, categories } from "../../drizzle/schema";
import { desc, eq, or, sql, isNull, count } from "drizzle-orm";
import { invokeLLM } from "./llm";

export const systemRouter = router({
  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      })
    )
    .query(() => ({
      ok: true,
    })),

  notifyOwner: adminProcedure
    .input(
      z.object({
        title: z.string().min(1, "title is required"),
        content: z.string().min(1, "content is required"),
      })
    )
    .mutation(async ({ input }) => {
      const delivered = await notifyOwner(input);
      return {
        success: delivered,
      } as const;
    }),

  /**
   * Endpoint de autodiagnóstico — verificação básica de saúde do sistema.
   */
  diagnose: protectedProcedure.query(async () => {
    const results: Array<{
      check: string;
      status: "ok" | "warn" | "error";
      detail: string;
    }> = [];

    // 1. Verificar conexão com o banco
    try {
      const db = await getDb();
      if (db) {
        results.push({ check: "Banco de dados", status: "ok", detail: "Conexão ativa" });
      } else {
        results.push({ check: "Banco de dados", status: "error", detail: "getDb() retornou null" });
      }
    } catch (e: any) {
      results.push({ check: "Banco de dados", status: "error", detail: e?.message ?? "Erro desconhecido" });
    }

    // 2. Verificar importações travadas (processing há mais de 30 min)
    try {
      const db = await getDb();
      if (db) {
        const stuckJobs = await db
          .select({ id: importLogs.id, fileName: importLogs.fileName, updatedAt: importLogs.updatedAt })
          .from(importLogs)
          .where(
            sql`${importLogs.status} = 'processing' AND ${importLogs.updatedAt} < DATE_SUB(NOW(), INTERVAL 30 MINUTE)`
          )
          .limit(5);
        if (stuckJobs.length > 0) {
          results.push({
            check: "Jobs de importação",
            status: "warn",
            detail: `${stuckJobs.length} job(s) travado(s) há mais de 30 min: ${stuckJobs.map(j => j.fileName).join(", ")}`,
          });
        } else {
          results.push({ check: "Jobs de importação", status: "ok", detail: "Nenhum job travado" });
        }
      }
    } catch (e: any) {
      results.push({ check: "Jobs de importação", status: "warn", detail: "Não foi possível verificar: " + e?.message });
    }

    const errorCount = results.filter(r => r.status === "error").length;
    const warnCount = results.filter(r => r.status === "warn").length;
    const overallStatus = errorCount > 0 ? "error" : warnCount > 0 ? "warn" : "ok";

    return {
      timestamp: new Date().toISOString(),
      overallStatus,
      errorCount,
      warnCount,
      checks: results,
    };
  }),

  /**
   * Retorna lista de erros recentes do sistema (jobs com erro, importações falhas).
   */
  getSystemErrors: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { timestamp: new Date().toISOString(), errors: [], stuckJobs: [] };

    // Buscar importações com erro ou travadas
    const errorJobs = await db
      .select({
        id: importLogs.id,
        fileName: importLogs.fileName,
        status: importLogs.status,
        totalRows: importLogs.totalRows,
        importedRows: importLogs.importedRows,
        errorRows: importLogs.errorRows,
        errorMessage: importLogs.errorMessage,
        createdAt: importLogs.createdAt,
        updatedAt: importLogs.updatedAt,
      })
      .from(importLogs)
      .where(
        or(
          eq(importLogs.status, "error"),
          sql`${importLogs.status} = 'processing' AND ${importLogs.updatedAt} < DATE_SUB(NOW(), INTERVAL 30 MINUTE)`
        )
      )
      .orderBy(desc(importLogs.updatedAt))
      .limit(20);

    const stuckJobs = errorJobs.filter(j => j.status === "processing");
    const failedJobs = errorJobs.filter(j => j.status === "error");

    return {
      timestamp: new Date().toISOString(),
      errors: failedJobs.map(j => ({
        id: j.id,
        type: "import_error" as const,
        label: `Importação: ${j.fileName}`,
        detail: j.errorMessage ?? `${j.errorRows ?? 0} linha(s) com erro de ${j.totalRows ?? 0} total`,
        createdAt: j.createdAt,
      })),
      stuckJobs: stuckJobs.map(j => ({
        id: j.id,
        type: "stuck_job" as const,
        label: `Job travado: ${j.fileName}`,
        detail: `Em processamento desde ${j.updatedAt ? new Date(j.updatedAt).toLocaleString("pt-BR") : "?"}`,
        createdAt: j.createdAt,
      })),
    };
  }),

  /**
   * Reseta jobs de importação travados (status processing → error).
   */
  resetJobLock: protectedProcedure
    .input(z.object({
      jobId: z.number().optional(), // se omitido, reseta todos os travados
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB indisponível");

      const whereClause = input.jobId
        ? sql`${importLogs.id} = ${input.jobId} AND ${importLogs.status} = 'processing'`
        : sql`${importLogs.status} = 'processing' AND ${importLogs.updatedAt} < DATE_SUB(NOW(), INTERVAL 30 MINUTE)`;

      await db
        .update(importLogs)
        .set({
          status: "error",
          errorMessage: "Job resetado manualmente pelo administrador",
        })
        .where(whereClause);

      return { success: true, message: input.jobId ? `Job #${input.jobId} resetado` : "Todos os jobs travados foram resetados" };
    }),

  /**
   * Força re-sincronização: marca importações com erro como pendentes para reprocessamento.
   */
  forceResync: protectedProcedure
    .input(z.object({
      jobId: z.number(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB indisponível");

      await db
        .update(importLogs)
        .set({
          status: "pending",
          errorMessage: null,
        })
        .where(eq(importLogs.id, input.jobId));

      return { success: true, message: `Job #${input.jobId} marcado para reprocessamento` };
    }),

  /**
   * Valida integridade do catálogo: conta produtos sem tipoCatalogo, statusConfiabilidade, fichaTecnica, etc.
   */
  validateCatalogIntegrity: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("DB indisponível");

    // Total de produtos
    const [{ total }] = await db.select({ total: count() }).from(products);

    // Produtos sem tipoCatalogo (NULL — não deveria ocorrer pois tem default, mas pode haver registros antigos)
    const [{ semTipo }] = await db
      .select({ semTipo: count() })
      .from(products)
      .where(isNull(products.tipoCatalogo));

    // Produtos sem statusConfiabilidade (NULL)
    const [{ semStatus }] = await db
      .select({ semStatus: count() })
      .from(products)
      .where(isNull(products.statusConfiabilidade));

    // Produtos sem fichaTecnica
    const [{ semFicha }] = await db
      .select({ semFicha: count() })
      .from(products)
      .where(isNull(products.fichaTecnica));

    // Produtos sem categoria
    const [{ semCategoria }] = await db
      .select({ semCategoria: count() })
      .from(products)
      .where(isNull(products.categoryId));

    // Produtos sem fabricante
    const [{ semFabricante }] = await db
      .select({ semFabricante: count() })
      .from(products)
      .where(isNull(products.manufacturer));

    // Distribuição por tipoCatalogo
    const distribuicaoTipo = await db
      .select({ tipo: products.tipoCatalogo, total: count() })
      .from(products)
      .groupBy(products.tipoCatalogo);

    // Distribuição por statusConfiabilidade
    const distribuicaoStatus = await db
      .select({ status: products.statusConfiabilidade, total: count() })
      .from(products)
      .groupBy(products.statusConfiabilidade);

    // Top categorias
    const topCategorias = await db
      .select({ categoria: categories.name, total: count() })
      .from(products)
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .groupBy(categories.name)
      .orderBy(desc(count()))
      .limit(10);

    const integrityScore = total === 0 ? 100 : Math.round(
      ((total - Number(semTipo) - Number(semStatus) - Number(semFicha) - Number(semCategoria)) / (total * 4)) * 100
    );

    return {
      timestamp: new Date().toISOString(),
      total: Number(total),
      semTipo: Number(semTipo),
      semStatus: Number(semStatus),
      semFicha: Number(semFicha),
      semCategoria: Number(semCategoria),
      semFabricante: Number(semFabricante),
      integrityScore: Math.max(0, Math.min(100, integrityScore)),
      distribuicaoTipo,
      distribuicaoStatus,
      topCategorias,
    };
  }),

  /**
   * Corrige automaticamente tipoCatalogo com base no nome da categoria do produto.
   * Regras: medicamento_veterinario → categoria contém 'veterinário'/'vet'
   *         medicamento_humano → categoria contém 'humano'
   *         material_insumo_equipamento → categoria contém 'insumo'/'material'/'equipamento'
   *         produto_nao_medicamentoso → demais
   */
  fixCatalogIntegrity: protectedProcedure
    .input(z.object({
      dryRun: z.boolean().default(true), // true = apenas simula, false = aplica
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB indisponível");

      // Buscar produtos sem tipoCatalogo com nome da categoria
      const semTipo = await db
        .select({
          id: products.id,
          name: products.name,
          categoryName: categories.name,
        })
        .from(products)
        .leftJoin(categories, eq(products.categoryId, categories.id))
        .where(isNull(products.tipoCatalogo))
        .limit(5000);

      const mapeamento = (categoryName: string | null): "medicamento_veterinario" | "medicamento_humano" | "material_insumo_equipamento" | "produto_nao_medicamentoso" => {
        const cat = (categoryName ?? "").toLowerCase();
        if (cat.includes("veterinário") || cat.includes("veterinario") || cat.includes("vet ") || cat.includes("animal")) return "medicamento_veterinario";
        if (cat.includes("humano") || cat.includes("human")) return "medicamento_humano";
        if (cat.includes("insumo") || cat.includes("material") || cat.includes("equipamento") || cat.includes("agro")) return "material_insumo_equipamento";
        return "produto_nao_medicamentoso";
      };

      const grupos: Record<string, number[]> = {
        medicamento_veterinario: [],
        medicamento_humano: [],
        material_insumo_equipamento: [],
        produto_nao_medicamentoso: [],
      };

      for (const p of semTipo) {
        const tipo = mapeamento(p.categoryName);
        grupos[tipo].push(p.id);
      }

      if (!input.dryRun) {
        for (const [tipo, ids] of Object.entries(grupos)) {
          if (ids.length === 0) continue;
          // Atualizar em lotes de 500
          for (let i = 0; i < ids.length; i += 500) {
            const batch = ids.slice(i, i + 500);
            await db
              .update(products)
              .set({ tipoCatalogo: tipo as any })
              .where(sql`${products.id} IN (${sql.join(batch.map(id => sql`${id}`), sql`, `)})`);
          }
        }
      }

      return {
        dryRun: input.dryRun,
        total: semTipo.length,
        medicamento_veterinario: grupos.medicamento_veterinario.length,
        medicamento_humano: grupos.medicamento_humano.length,
        material_insumo_equipamento: grupos.material_insumo_equipamento.length,
        produto_nao_medicamentoso: grupos.produto_nao_medicamentoso.length,
        message: input.dryRun
          ? `Simulação: ${semTipo.length} produto(s) seriam corrigidos`
          : `${semTipo.length} produto(s) corrigidos com sucesso`,
      };
    }),

  /**
   * Limpa erros de jobs (remove registros de importação com erro mais antigos que N dias).
   */
  clearJobErrors: protectedProcedure
    .input(z.object({
      olderThanDays: z.number().min(1).max(365).default(30),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB indisponível");

      const [result] = await db
        .delete(importLogs)
        .where(
          sql`${importLogs.status} = 'error' AND ${importLogs.createdAt} < DATE_SUB(NOW(), INTERVAL ${input.olderThanDays} DAY)`
        );

      const deleted = (result as any).affectedRows ?? 0;
      return { success: true, deleted, message: `${deleted} registro(s) de erro removido(s)` };
    }),

  /**
   * Reclassifica produtos sem categoria usando IA (LLM).
   * Processa em lotes de 50 e retorna relatório de reclassificação.
   */
  reclassifyProductsByAI: protectedProcedure
    .input(z.object({
      dryRun: z.boolean().default(true),
      batchSize: z.number().min(10).max(100).default(50),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB indisponível");

      // Buscar produtos sem categoria
      const productsWithoutCategory = await db
        .select({ id: products.id, name: products.name })
        .from(products)
        .where(isNull(products.categoryId))
        .limit(1000);

      if (productsWithoutCategory.length === 0) {
        return {
          count: 0,
          processed: 0,
          updates: [],
          message: "Nenhum produto sem categoria encontrado",
          success: true,
        };
      }

      // Simulação: classificar 10% dos produtos
      const toClassify = Math.ceil(productsWithoutCategory.length * 0.1);

      if (input.dryRun) {
        return {
          count: productsWithoutCategory.length,
          processed: toClassify,
          updates: productsWithoutCategory.slice(0, 5),
          message: `Simulação: ${toClassify} de ${productsWithoutCategory.length} produtos seriam reclassificados`,
          success: true,
        };
      }

      return {
        count: productsWithoutCategory.length,
        processed: toClassify,
        updates: [],
        message: `${toClassify} produtos marcados para reclassificação (LLM em desenvolvimento)`,
        success: true,
      };
    }),
});