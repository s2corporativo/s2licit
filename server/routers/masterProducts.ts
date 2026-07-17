import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { checkDuplicatesInRows, getProductPricesByMasterName, listMasterProducts, previewImportRows, previewImportRowsFuzzy, searchMasterProducts } from "../db";

export const masterProductsRouter = router({
    list: protectedProcedure
      .input(z.object({ search: z.string().optional(), limit: z.number().optional() }).optional())
      .query(({ input }) => listMasterProducts(input?.search, input?.limit ?? 50)),

    search: protectedProcedure
      .input(z.object({ query: z.string(), limit: z.number().optional() }))
      .query(({ input }) => searchMasterProducts(input.query, input.limit ?? 20)),

    previewImport: protectedProcedure
      .input(z.object({
        rows: z.array(z.record(z.string(), z.string())),
      }))
      .mutation(({ input }) => previewImportRows(input.rows)),

     previewImportFuzzy: protectedProcedure
      .input(z.object({
        rows: z.array(z.record(z.string(), z.string())),
        supplierId: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        try {
          if (!input.rows || input.rows.length === 0) {
            throw new Error("Array 'rows' não pode estar vazio");
          }
          return await previewImportRowsFuzzy(input.rows, input.supplierId);
        } catch (error: any) {
          console.error("[previewImportFuzzy]", error?.message || error);
          throw new Error(`Erro ao processar preview de importação: ${error?.message || "Erro desconhecido"}`);
        }
      }),
    previewWithDuplicates: protectedProcedure
      .input(z.object({
        rows: z.array(z.object({
          name: z.string().optional(),
          fichaTecnica: z.string().optional(),
          presentation: z.string().optional(),
          ean: z.string().optional(),
        })).max(3000),
        supplierId: z.number(),
      }))
      .mutation(async ({ input }) => {
        try {
          if (!input.rows || input.rows.length === 0) {
            throw new Error("Array 'rows' não pode estar vazio");
          }
          if (!input.supplierId || input.supplierId <= 0) {
            throw new Error("ID do fornecedor inválido");
          }
          return await checkDuplicatesInRows(input.rows, input.supplierId);
        } catch (error: any) {
          console.error("[checkDuplicatesInRows]", error?.message || error);
          throw new Error(`Erro ao verificar duplicatas: ${error?.message || "Erro desconhecido"}`);
        }
      }),
    pricesByName: protectedProcedure
      .input(z.object({ name: z.string() }))
      .query(async ({ input }) => {
        try {
          if (!input.name || input.name.trim().length === 0) {
            throw new Error("Nome do produto não pode estar vazio");
          }
          return await getProductPricesByMasterName(input.name);
        } catch (error: any) {
          console.error("[pricesByName]", error?.message || error);
          throw new Error(`Erro ao buscar preços: ${error?.message || "Erro desconhecido"}`);
        }
      }),
  });
