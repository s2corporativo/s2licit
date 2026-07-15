import { TRPCError } from "@trpc/server";
import { and, count, eq } from "drizzle-orm";
import { z } from "zod";
import { nfeImports } from "../../drizzle/schema";
import { editorProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { summarizeBatchImportResults, summarizeBatchPreview } from "../services/nfeBatchImportUtils";
import { validateProductsForImport } from "../services/nfeImportService";
import { parseNfeXml, validateNfeData } from "../services/nfeParserService";
import { createOrGetSupplier, createProductsFromNfe } from "../services/nfeProductImportService";
import { validateSupplierData } from "../services/nfeSupplierService";

const batchXmlFileSchema = z.object({
  fileName: z.string().min(1, "Nome do arquivo obrigatório").max(255),
  xmlContent: z.string().min(1, "Conteúdo XML obrigatório").max(15_000_000),
  supplierId: z.number().int().positive().optional(),
});

function buildNfePreview(nfeData: any) {
  const prices = nfeData.products.map((product: any) => Number(product.unitPrice) || 0);
  const totalValue = nfeData.products.reduce(
    (sum: number, product: any) => sum + (Number(product.totalPrice) || 0),
    0,
  );

  return {
    nfeNumber: nfeData.nfeNumber,
    supplierName: nfeData.supplierName,
    supplierCnpj: nfeData.supplierCnpj,
    products: nfeData.products.map((product: any, index: number) => ({
      id: `${index}:${product.ean || "sem-ean"}:${product.productName}`,
      productName: product.productName,
      ean: product.ean,
      quantity: product.quantity,
      unitPrice: product.unitPrice,
      totalPrice: product.totalPrice,
      unit: product.unit,
    })),
    stats: {
      totalProducts: nfeData.products.length,
      totalValue,
      averagePrice: prices.length > 0 ? prices.reduce((sum: number, price: number) => sum + price, 0) / prices.length : 0,
      priceRangeMin: prices.length > 0 ? Math.min(...prices) : 0,
      priceRangeMax: prices.length > 0 ? Math.max(...prices) : 0,
    },
    totalValue,
  };
}

function validateParsedNfe(nfeData: any) {
  const validation = validateNfeData(nfeData);
  const supplierValidation = validateSupplierData(nfeData.supplierName, nfeData.supplierCnpj);
  const errors = [...validation.errors, ...supplierValidation.errors];
  return { valid: errors.length === 0, errors };
}

async function upsertImportRecord(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  payload: {
    nfeNumber: string;
    supplierName: string;
    supplierCnpj: string;
    supplierId?: number | null;
    totalProducts: number;
    importedProducts: number;
    status: "pending" | "processing" | "completed" | "failed";
    xmlContent?: string;
    notes?: string;
  },
): Promise<number> {
  const [existing] = await db
    .select({ id: nfeImports.id })
    .from(nfeImports)
    .where(
      and(
        eq(nfeImports.nfeNumber, payload.nfeNumber),
        eq(nfeImports.supplierCnpj, payload.supplierCnpj),
      ),
    )
    .limit(1);

  const values = {
    supplierName: payload.supplierName,
    supplierCnpj: payload.supplierCnpj,
    supplierId: payload.supplierId ?? null,
    totalProducts: payload.totalProducts,
    importedProducts: payload.importedProducts,
    status: payload.status,
    xmlContent: payload.xmlContent,
    importDate: new Date(),
    notes: payload.notes,
  };

  if (existing) {
    await db.update(nfeImports).set(values).where(eq(nfeImports.id, existing.id));
    return existing.id;
  }

  const [result] = await db.insert(nfeImports).values({
    nfeNumber: payload.nfeNumber,
    ...values,
  });
  const id = Number((result as { insertId?: number }).insertId);
  if (!Number.isInteger(id) || id <= 0) throw new Error("Falha ao registrar histórico da NF-e");
  return id;
}

async function importParsedNfe(options: {
  xmlContent: string;
  supplierId?: number;
  selectedProductIds?: string[];
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  const nfeData = await parseNfeXml(options.xmlContent);
  const nfeValidation = validateParsedNfe(nfeData);
  if (!nfeValidation.valid) throw new Error(`NF-e inválida: ${nfeValidation.errors.join(", ")}`);

  const preview = buildNfePreview(nfeData);
  const selectedSet = options.selectedProductIds?.length
    ? new Set(options.selectedProductIds)
    : null;
  const productsToImport = nfeData.products.filter((product: any, index: number) => {
    if (!selectedSet) return true;
    const id = `${index}:${product.ean || "sem-ean"}:${product.productName}`;
    return selectedSet.has(id);
  });

  if (productsToImport.length === 0) throw new Error("Nenhum produto selecionado para importação");

  const productValidation = validateProductsForImport(
    productsToImport.map((product: any) => ({ ...product, matchStatus: "new" as const })),
  );
  if (!productValidation.valid) {
    throw new Error(`Produtos inválidos: ${productValidation.errors.join(", ")}`);
  }

  let importRecordId: number | undefined;
  try {
    importRecordId = await upsertImportRecord(db, {
      nfeNumber: nfeData.nfeNumber,
      supplierName: nfeData.supplierName,
      supplierCnpj: nfeData.supplierCnpj,
      supplierId: options.supplierId ?? null,
      totalProducts: productsToImport.length,
      importedProducts: 0,
      status: "processing",
      xmlContent: nfeData.rawXml ?? options.xmlContent,
      notes: "Importação iniciada",
    });

    const supplier = options.supplierId
      ? { id: options.supplierId, isNew: false }
      : await createOrGetSupplier(nfeData.supplierName);

    const importedProducts = await createProductsFromNfe(
      supplier.id,
      productsToImport.map((product: any) => ({
        productName: product.productName,
        ean: product.ean,
        quantity: product.quantity,
        unitPrice: product.unitPrice,
        totalPrice: product.totalPrice,
        unit: product.unit,
      })),
    );

    if (importedProducts.length !== productsToImport.length) {
      throw new Error(`Importação incompleta: ${importedProducts.length} de ${productsToImport.length} produtos`);
    }

    await upsertImportRecord(db, {
      nfeNumber: nfeData.nfeNumber,
      supplierName: nfeData.supplierName,
      supplierCnpj: nfeData.supplierCnpj,
      supplierId: supplier.id,
      totalProducts: productsToImport.length,
      importedProducts: importedProducts.length,
      status: "completed",
      xmlContent: nfeData.rawXml ?? options.xmlContent,
      notes: `Fornecedor: ${supplier.isNew ? "criado" : "existente"}; produtos: ${importedProducts.length}`,
    });

    return {
      importRecordId,
      nfeNumber: nfeData.nfeNumber,
      supplierName: nfeData.supplierName,
      supplierCnpj: nfeData.supplierCnpj,
      supplierId: supplier.id,
      supplierCreated: supplier.isNew,
      productsImported: importedProducts.length,
      totalValue: productsToImport.reduce(
        (sum: number, product: any) => sum + (Number(product.totalPrice) || 0),
        0,
      ),
      warnings: productValidation.warnings,
      preview,
    };
  } catch (error) {
    try {
      await upsertImportRecord(db, {
        nfeNumber: nfeData.nfeNumber,
        supplierName: nfeData.supplierName,
        supplierCnpj: nfeData.supplierCnpj,
        supplierId: options.supplierId ?? null,
        totalProducts: productsToImport.length,
        importedProducts: 0,
        status: "failed",
        xmlContent: nfeData.rawXml ?? options.xmlContent,
        notes: error instanceof Error ? error.message : "Falha desconhecida",
      });
    } catch (historyError) {
      console.error("[NFe] Falha adicional ao registrar erro no histórico:", historyError);
    }
    throw error;
  }
}

export const nfeImportRouter = router({
  previewNfeImport: editorProcedure
    .input(z.object({ xmlContent: z.string().min(1).max(15_000_000) }))
    .mutation(async ({ input }) => {
      try {
        const nfeData = await parseNfeXml(input.xmlContent);
        const validation = validateParsedNfe(nfeData);
        if (!validation.valid) {
          return { success: false as const, error: validation.errors.join(", ") };
        }
        return { success: true as const, preview: buildNfePreview(nfeData) };
      } catch (error) {
        return {
          success: false as const,
          error: error instanceof Error ? error.message : "Erro ao processar NF-e",
        };
      }
    }),

  importNfeWithSupplier: editorProcedure
    .input(
      z.object({
        xmlContent: z.string().min(1).max(15_000_000),
        supplierId: z.number().int().positive().optional(),
        selectedProductIds: z.array(z.string()).max(10_000).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        const result = await importParsedNfe(input);
        return { success: true as const, message: "NF-e importada integralmente", ...result };
      } catch (error) {
        return {
          success: false as const,
          error: error instanceof Error ? error.message : "Erro ao importar NF-e",
        };
      }
    }),

  previewBatchXmlImport: editorProcedure
    .input(z.object({ files: z.array(batchXmlFileSchema).min(1).max(30) }))
    .mutation(async ({ input }) => {
      const files = await Promise.all(
        input.files.map(async (file, index) => {
          try {
            const nfeData = await parseNfeXml(file.xmlContent);
            const validation = validateParsedNfe(nfeData);
            if (!validation.valid) throw new Error(validation.errors.join(", "));
            const preview = buildNfePreview(nfeData);
            return {
              index,
              fileName: file.fileName,
              status: "ready" as const,
              nfeNumber: preview.nfeNumber,
              supplierName: preview.supplierName,
              supplierCnpj: preview.supplierCnpj,
              productsCount: preview.products.length,
              totalValue: preview.totalValue,
              errors: [] as string[],
            };
          } catch (error) {
            return {
              index,
              fileName: file.fileName,
              status: "error" as const,
              productsCount: 0,
              totalValue: 0,
              errors: [error instanceof Error ? error.message : "Erro ao processar XML"],
            };
          }
        }),
      );
      return { success: true as const, files, summary: summarizeBatchPreview(files) };
    }),

  importBatchXml: editorProcedure
    .input(
      z.object({
        files: z.array(batchXmlFileSchema).min(1).max(30),
        selectedIndexes: z.array(z.number().int().nonnegative()).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const selected = input.selectedIndexes?.length
        ? new Set(input.selectedIndexes)
        : null;
      const files = input.files
        .map((file, index) => ({ ...file, index }))
        .filter((file) => !selected || selected.has(file.index));

      const results = [] as Array<{
        index: number;
        fileName: string;
        status: "imported" | "failed";
        nfeNumber?: string;
        supplierName?: string;
        supplierCnpj?: string;
        importedProducts: number;
        totalValue: number;
        warnings: string[];
        error?: string;
      }>;

      for (const file of files) {
        try {
          const imported = await importParsedNfe({
            xmlContent: file.xmlContent,
            supplierId: file.supplierId,
          });
          results.push({
            index: file.index,
            fileName: file.fileName,
            status: "imported",
            nfeNumber: imported.nfeNumber,
            supplierName: imported.supplierName,
            supplierCnpj: imported.supplierCnpj,
            importedProducts: imported.productsImported,
            totalValue: imported.totalValue,
            warnings: imported.warnings,
          });
        } catch (error) {
          results.push({
            index: file.index,
            fileName: file.fileName,
            status: "failed",
            importedProducts: 0,
            totalValue: 0,
            warnings: [],
            error: error instanceof Error ? error.message : "Erro ao importar XML",
          });
        }
      }

      const summary = summarizeBatchImportResults(results);
      const success = summary.processedFiles > 0 && summary.failedFiles === 0;
      return {
        success,
        summary,
        results,
        error: success ? undefined : `${summary.failedFiles} arquivo(s) falharam; consulte o detalhamento.`,
      };
    }),

  linkNfeProductsWithMaster: editorProcedure
    .input(
      z.object({
        nfeNumber: z.string(),
        productMappings: z.array(z.object({ nfeProductId: z.string(), masterId: z.number() })),
      }),
    )
    .mutation(() => {
      throw new TRPCError({
        code: "METHOD_NOT_SUPPORTED",
        message: "Vínculo manual com master products será disponibilizado somente após existir chave persistente por item da NF-e.",
      });
    }),

  getImportHistory: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(200).default(10),
        offset: z.number().int().nonnegative().default(0),
        supplierId: z.number().int().positive().optional(),
      }),
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      const query = db.select().from(nfeImports);
      const imports = await (input.supplierId
        ? query.where(eq(nfeImports.supplierId, input.supplierId))
        : query)
        .limit(input.limit)
        .offset(input.offset);
      const [totalRow] = await db.select({ total: count() }).from(nfeImports);

      return {
        imports: imports.map((item) => ({
          id: item.id,
          nfeNumber: item.nfeNumber,
          supplierName: item.supplierName,
          supplierCnpj: item.supplierCnpj,
          totalProducts: item.totalProducts,
          importedProducts: item.importedProducts,
          productsImported: item.importedProducts,
          status: item.status,
          importDate: item.importDate,
          importedAt: item.importDate,
          fileName: `NFe-${item.nfeNumber}.xml`,
          notes: item.notes,
        })),
        total: Number(totalRow?.total ?? 0),
        limit: input.limit,
        offset: input.offset,
      };
    }),

  getImportDetails: protectedProcedure
    .input(z.object({ importId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      const [details] = await db
        .select()
        .from(nfeImports)
        .where(eq(nfeImports.id, input.importId))
        .limit(1);
      return { importId: input.importId, details: details ?? null };
    }),

  deleteImport: editorProcedure
    .input(z.object({ importId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      await db.delete(nfeImports).where(eq(nfeImports.id, input.importId));
      return { success: true as const, message: "Registro de importação removido" };
    }),

  getPriceAnomalies: protectedProcedure
    .input(z.object({ importId: z.number().int().positive() }))
    .query(() => {
      throw new TRPCError({
        code: "METHOD_NOT_SUPPORTED",
        message: "Use Análise de Preços; a NF-e isolada não possui preço anterior confiável para calcular anomalias.",
      });
    }),
});
