import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import {
  detectSupplierFromFile,
  previewPriceImport,
  importPricesWithSupplier,
  extractPriceRowsFromSpreadsheet,
  type PriceRow,
} from "../services/priceImportService";

export const priceImportRouter = router({
  /**
   * Detecta o fornecedor a partir do nome do arquivo
   */
  detectSupplier: protectedProcedure
    .input(z.object({ fileName: z.string() }))
    .query(async ({ input }) => {
      const result = await detectSupplierFromFile(input.fileName);
      return result;
    }),

  /**
   * Cria preview de importação de preços
   */
  previewPriceImport: protectedProcedure
    .input(
      z.object({
        rows: z.array(
          z.object({
            productName: z.string(),
            productCode: z.string().optional(),
            ean: z.string().optional(),
            price: z.number(),
            unit: z.string().optional(),
            notes: z.string().optional(),
          })
        ),
        supplierId: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      const rows: PriceRow[] = input.rows.map((r) => ({
        productName: r.productName,
        productCode: r.productCode,
        ean: r.ean,
        price: r.price,
        unit: r.unit,
        notes: r.notes,
      }));

      const preview = await previewPriceImport(rows, input.supplierId);
      return preview;
    }),

  /**
   * Importa preços selecionados
   */
  importPrices: protectedProcedure
    .input(
      z.object({
        rows: z.array(
          z.object({
            productName: z.string(),
            productCode: z.string().optional(),
            ean: z.string().optional(),
            price: z.number(),
            unit: z.string().optional(),
            notes: z.string().optional(),
          })
        ),
        supplierId: z.number(),
        selectedIndexes: z.array(z.number()),
      })
    )
    .mutation(async ({ input }) => {
      const rows: PriceRow[] = input.rows.map((r) => ({
        productName: r.productName,
        productCode: r.productCode,
        ean: r.ean,
        price: r.price,
        unit: r.unit,
        notes: r.notes,
      }));

      const result = await importPricesWithSupplier(
        rows,
        input.supplierId,
        input.selectedIndexes
      );
      return result;
    }),

  /**
   * Extrai dados de preço de uma planilha
   */
  extractPrices: protectedProcedure
    .input(
      z.object({
        data: z.array(z.array(z.any())),
      })
    )
    .mutation(async ({ input }) => {
      const rows = extractPriceRowsFromSpreadsheet(input.data);
      return {
        success: true,
        rowCount: rows.length,
        rows,
      };
    }),
});
