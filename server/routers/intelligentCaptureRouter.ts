import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  createCaptureBatch,
  getCaptureBatch,
  listCaptureBatches,
  updateCapturedProductStatus,
} from "../services/intelligentCaptureService";
import {
  buildCaptureDraftFromDocument,
  buildCaptureDraftFromSpreadsheet,
  buildCaptureDraftFromStructuredSource,
  buildCaptureDraftFromWebsite,
} from "../services/intelligentCaptureIngestionService";

const sourceTypeSchema = z.enum(["url", "html", "pdf", "spreadsheet", "xml", "docx", "text"]);
const actionSuggestionSchema = z.enum(["create", "update", "review", "ignore"]);
const duplicateSignalSchema = z.enum(["none", "possible", "probable", "confirmed"]);
const reviewStatusSchema = z.enum(["approved", "rejected", "applied"]);

const captureProductSchema = z.object({
  name: z.string().min(1),
  brand: z.string().nullable().optional(),
  manufacturer: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  presentation: z.string().nullable().optional(),
  barcode: z.string().nullable().optional(),
  sku: z.string().nullable().optional(),
  price: z.union([z.string(), z.number()]).nullable().optional(),
  unit: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  productUrl: z.string().nullable().optional(),
  matchedProductId: z.number().nullable().optional(),
  actionSuggestion: actionSuggestionSchema.optional(),
  duplicateSignal: duplicateSignalSchema.optional(),
  regulatoryData: z.record(z.string(), z.unknown()).nullable().optional(),
  rawPayload: z.record(z.string(), z.unknown()).nullable().optional(),
  confidence: z.array(z.object({
    fieldName: z.string(),
    confidenceScore: z.union([z.string(), z.number()]),
    extractionMethod: z.string().nullable().optional(),
    sourceSnippet: z.string().nullable().optional(),
  })).optional(),
});

function normalizeBatchResponse(result: Awaited<ReturnType<typeof createCaptureBatch>>) {
  return {
    success: true as const,
    batchId: result.batch?.id ?? null,
    totalCaptured: result.products.length,
    sourceType: result.batch?.sourceType ?? null,
    sourceLabel: result.batch?.sourceLabel ?? null,
    status: result.batch?.status ?? null,
    matchingSummary: result.matchingSummary,
  };
}

export const intelligentCaptureRouter = router({
  listBatches: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(20) }).default({ limit: 20 }))
    .query(async ({ input }) => listCaptureBatches(input.limit)),

  getBatch: protectedProcedure
    .input(z.object({ batchId: z.number() }))
    .query(async ({ input }) => getCaptureBatch(input.batchId)),

  createBatch: protectedProcedure
    .input(z.object({
      sourceType: sourceTypeSchema,
      sourceLabel: z.string().nullable().optional(),
      sourceReference: z.string().nullable().optional(),
      createdByUserId: z.number().nullable().optional(),
      meta: z.record(z.string(), z.unknown()).nullable().optional(),
      products: z.array(captureProductSchema).max(20000),
    }))
    .mutation(async ({ ctx, input }) =>
      createCaptureBatch({
        ...input,
        createdByUserId: input.createdByUserId ?? ctx.user.id,
      }),
    ),

  ingestWebsite: protectedProcedure
    .input(z.object({
      url: z.string().url("Informe uma URL válida"),
      mode: z.enum(["product", "catalog"]).default("product"),
      maxItems: z.number().min(1).max(500).default(50),
    }))
    .mutation(async ({ ctx, input }) => {
      const draft = await buildCaptureDraftFromWebsite(input);
      if (draft.products.length === 0) {
        return { success: false as const, error: "Nenhum produto foi extraído da URL informada." };
      }

      const batch = await createCaptureBatch({
        ...draft,
        createdByUserId: ctx.user.id,
      });

      return normalizeBatchResponse(batch);
    }),

  ingestDocument: protectedProcedure
    .input(z.object({
      fileBase64: z.string().min(1),
      fileName: z.string().min(1),
      mimeType: z.string().min(1),
      sourceType: z.enum(["pdf", "docx", "image"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const draft = await buildCaptureDraftFromDocument(input);
      if (draft.products.length === 0) {
        return { success: false as const, error: "Nenhum produto foi identificado no documento enviado." };
      }

      const batch = await createCaptureBatch({
        ...draft,
        createdByUserId: ctx.user.id,
      });

      return normalizeBatchResponse(batch);
    }),

  ingestSpreadsheet: protectedProcedure
    .input(z.object({
      fileBase64: z.string().min(1),
      fileName: z.string().min(1),
      mimeType: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const draft = await buildCaptureDraftFromSpreadsheet(input);
      if (draft.products.length === 0) {
        return { success: false as const, error: "Nenhum produto foi identificado na planilha enviada." };
      }

      const batch = await createCaptureBatch({
        ...draft,
        createdByUserId: ctx.user.id,
      });

      return normalizeBatchResponse(batch);
    }),

  ingestStructured: protectedProcedure
    .input(z.object({
      sourceType: z.enum(["xml", "text", "html"]),
      content: z.string().min(1),
      sourceLabel: z.string().optional(),
      sourceReference: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const draft = await buildCaptureDraftFromStructuredSource(input);
      if (draft.products.length === 0) {
        return { success: false as const, error: "Nenhum produto estruturado foi identificado no conteúdo informado." };
      }

      const batch = await createCaptureBatch({
        ...draft,
        createdByUserId: ctx.user.id,
      });

      return normalizeBatchResponse(batch);
    }),

  reviewItem: protectedProcedure
    .input(z.object({ capturedProductId: z.number(), status: reviewStatusSchema }))
    .mutation(async ({ input }) => updateCapturedProductStatus(input.capturedProductId, input.status)),
});
