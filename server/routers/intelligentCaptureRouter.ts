import { z } from "zod";
import { editorProcedure, protectedProcedure, router } from "../_core/trpc";
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
import { assertSafeExternalUrl } from "../utils/urlGuard";

const MAX_SYNC_PRODUCTS = 5_000;
const MAX_UPLOAD_BASE64_CHARS = 28_000_000;
const MAX_STRUCTURED_CONTENT_CHARS = 5_000_000;
const MAX_META_JSON_BYTES = 128 * 1024;
const MAX_PRODUCT_JSON_BYTES = 64 * 1024;
const MAX_REGULATORY_JSON_BYTES = 32 * 1024;

const sourceTypeSchema = z.enum([
  "url",
  "html",
  "pdf",
  "spreadsheet",
  "xml",
  "docx",
  "text",
  "image",
]);
const actionSuggestionSchema = z.enum(["create", "update", "review", "ignore"]);
const duplicateSignalSchema = z.enum(["none", "possible", "probable", "confirmed"]);
const reviewStatusSchema = z.enum(["approved", "rejected"]);

function jsonSize(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function boundedJsonRecord(maxBytes: number, label: string) {
  return z
    .record(z.string(), z.unknown())
    .refine((value) => jsonSize(value) <= maxBytes, {
      message: `${label} excede o limite de ${maxBytes} bytes.`,
    });
}

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

const externalUrlSchema = z
  .string()
  .trim()
  .url("Informe uma URL válida")
  .max(2_048)
  .refine((value) => {
    try {
      assertSafeExternalUrl(value, "URL da captura inteligente");
      return true;
    } catch {
      return false;
    }
  }, "A URL precisa ser pública e usar http/https.");

const captureProductSchema = z
  .object({
    name: z.string().trim().min(1).max(256),
    brand: optionalText(128),
    manufacturer: optionalText(128),
    description: optionalText(16_000),
    presentation: optionalText(128),
    barcode: optionalText(64),
    sku: optionalText(128),
    price: z
      .union([
        z.string().trim().max(64),
        z.number().finite(),
      ])
      .nullable()
      .optional(),
    unit: optionalText(64),
    category: optionalText(128),
    imageUrl: optionalText(2_048),
    productUrl: optionalText(2_048),
    matchedProductId: z.number().int().positive().nullable().optional(),
    actionSuggestion: actionSuggestionSchema.optional(),
    duplicateSignal: duplicateSignalSchema.optional(),
    regulatoryData: boundedJsonRecord(
      MAX_REGULATORY_JSON_BYTES,
      "Dados regulatórios",
    ).nullable().optional(),
    rawPayload: boundedJsonRecord(
      MAX_PRODUCT_JSON_BYTES,
      "Payload bruto do produto",
    ).nullable().optional(),
    confidence: z
      .array(
        z.object({
          fieldName: z.string().trim().min(1).max(128),
          confidenceScore: z.union([
            z.string().trim().max(32),
            z.number().finite(),
          ]),
          extractionMethod: optionalText(128),
          sourceSnippet: optionalText(2_000),
        }),
      )
      .max(64)
      .optional(),
  })
  .refine((value) => jsonSize(value) <= MAX_PRODUCT_JSON_BYTES * 2, {
    message: "Produto capturado excede o tamanho máximo permitido.",
  });

function normalizeBatchResponse(
  result: Awaited<ReturnType<typeof createCaptureBatch>>,
) {
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
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).default(20),
      }).default({ limit: 20 }),
    )
    .query(({ input }) => listCaptureBatches(input.limit)),

  getBatch: protectedProcedure
    .input(z.object({ batchId: z.number().int().positive() }))
    .query(({ input }) => getCaptureBatch(input.batchId)),

  createBatch: editorProcedure
    .input(
      z.object({
        sourceType: sourceTypeSchema,
        sourceLabel: optionalText(256),
        sourceReference: optionalText(512),
        meta: boundedJsonRecord(MAX_META_JSON_BYTES, "Metadados do lote")
          .nullable()
          .optional(),
        products: z
          .array(captureProductSchema)
          .min(1)
          .max(
            MAX_SYNC_PRODUCTS,
            `Lotes síncronos aceitam até ${MAX_SYNC_PRODUCTS} produtos.`,
          ),
      }),
    )
    .mutation(({ ctx, input }) =>
      createCaptureBatch({
        ...input,
        createdByUserId: ctx.user.id,
      }),
    ),

  ingestWebsite: editorProcedure
    .input(
      z.object({
        url: externalUrlSchema,
        mode: z.enum(["product", "catalog"]).default("product"),
        maxItems: z.number().int().min(1).max(500).default(50),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const draft = await buildCaptureDraftFromWebsite(input);
      if (draft.products.length === 0) {
        return {
          success: false as const,
          error: "Nenhum produto foi extraído da URL informada.",
        };
      }

      const batch = await createCaptureBatch({
        ...draft,
        createdByUserId: ctx.user.id,
      });
      return normalizeBatchResponse(batch);
    }),

  ingestDocument: editorProcedure
    .input(
      z.object({
        fileBase64: z.string().min(1).max(MAX_UPLOAD_BASE64_CHARS),
        fileName: z.string().trim().min(1).max(512),
        mimeType: z.string().trim().min(1).max(128),
        sourceType: z.enum(["pdf", "docx", "image"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const draft = await buildCaptureDraftFromDocument(input);
      if (draft.products.length === 0) {
        return {
          success: false as const,
          error: "Nenhum produto foi identificado no documento enviado.",
        };
      }
      if (draft.products.length > MAX_SYNC_PRODUCTS) {
        throw new Error(
          `Documento gerou ${draft.products.length} produtos, acima do limite ` +
            `${MAX_SYNC_PRODUCTS} para processamento síncrono.`,
        );
      }

      const batch = await createCaptureBatch({
        ...draft,
        createdByUserId: ctx.user.id,
      });
      return normalizeBatchResponse(batch);
    }),

  ingestSpreadsheet: editorProcedure
    .input(
      z.object({
        fileBase64: z.string().min(1).max(MAX_UPLOAD_BASE64_CHARS),
        fileName: z.string().trim().min(1).max(512),
        mimeType: z.string().trim().min(1).max(128),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const draft = await buildCaptureDraftFromSpreadsheet(input);
      if (draft.products.length === 0) {
        return {
          success: false as const,
          error: "Nenhum produto foi identificado na planilha enviada.",
        };
      }
      if (draft.products.length > MAX_SYNC_PRODUCTS) {
        throw new Error(
          `Planilha gerou ${draft.products.length} produtos, acima do limite ` +
            `${MAX_SYNC_PRODUCTS} para processamento síncrono.`,
        );
      }

      const batch = await createCaptureBatch({
        ...draft,
        createdByUserId: ctx.user.id,
      });
      return normalizeBatchResponse(batch);
    }),

  ingestStructured: editorProcedure
    .input(
      z.object({
        sourceType: z.enum(["xml", "text", "html"]),
        content: z.string().min(1).max(MAX_STRUCTURED_CONTENT_CHARS),
        sourceLabel: z.string().trim().max(256).optional(),
        sourceReference: z.string().trim().max(512).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const draft = await buildCaptureDraftFromStructuredSource(input);
      if (draft.products.length === 0) {
        return {
          success: false as const,
          error: "Nenhum produto estruturado foi identificado no conteúdo informado.",
        };
      }
      if (draft.products.length > MAX_SYNC_PRODUCTS) {
        throw new Error(
          `Conteúdo gerou ${draft.products.length} produtos, acima do limite ` +
            `${MAX_SYNC_PRODUCTS} para processamento síncrono.`,
        );
      }

      const batch = await createCaptureBatch({
        ...draft,
        createdByUserId: ctx.user.id,
      });
      return normalizeBatchResponse(batch);
    }),

  reviewItem: editorProcedure
    .input(
      z.object({
        capturedProductId: z.number().int().positive(),
        status: reviewStatusSchema,
      }),
    )
    .mutation(({ ctx, input }) =>
      updateCapturedProductStatus(
        input.capturedProductId,
        input.status,
        ctx.user.id,
      ),
    ),
});
