/**
 * Router de orçamentos rápidos (cotações comerciais em PDF).
 *
 * Gera o PDF a partir dos itens montados na tela de Orçamentos usando o
 * serviço testado em services/quotationPdfGeneratorService, com os dados
 * da empresa vindos de company_settings.
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  calculateQuotationTotals,
  generateQuotationPdf,
  validateQuotationData,
  type QuotationPdfData,
} from "../services/quotationPdfGeneratorService";
import { getCompanySettings } from "../db";

const QuotationItemSchema = z.object({
  productName: z.string().min(1).max(500),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
  imageUrl: z.string().url().optional(),
});

const GeneratePdfSchema = z.object({
  number: z.string().min(1).max(50),
  clientName: z.string().max(256).optional(),
  clientEmail: z.string().max(320).optional(),
  clientPhone: z.string().max(32).optional(),
  items: z.array(QuotationItemSchema).min(1).max(500),
  discount: z.number().nonnegative().optional(),
  tax: z.number().nonnegative().optional(),
  notes: z.string().max(2000).optional(),
  validDays: z.number().int().positive().max(365).default(30),
});

export const quotationsRouter = router({
  generatePdf: protectedProcedure
    .input(GeneratePdfSchema)
    .mutation(async ({ input }) => {
      const company = await getCompanySettings();

      const { subtotal } = calculateQuotationTotals(input.items);
      const total = subtotal - (input.discount ?? 0) + (input.tax ?? 0);

      const pdfData: QuotationPdfData = {
        number: input.number,
        date: new Date(),
        validUntil: new Date(Date.now() + input.validDays * 24 * 60 * 60 * 1000),
        clientName: input.clientName,
        clientEmail: input.clientEmail,
        clientPhone: input.clientPhone,
        items: input.items.map((item) => ({
          ...item,
          totalPrice: item.quantity * item.unitPrice,
        })),
        subtotal,
        discount: input.discount,
        tax: input.tax,
        total,
        notes: input.notes,
        company: {
          name: company?.name || "Empresa não configurada",
          cnpj: company?.cnpj ?? undefined,
          address: company?.address ?? undefined,
          phone: company?.phone ?? undefined,
          email: company?.email ?? undefined,
          logoUrl: company?.logoUrl ?? undefined,
          bankAccount: company?.bankInfo ?? undefined,
        },
      };

      const validation = validateQuotationData(pdfData);
      if (!validation.valid) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: validation.errors.join("; "),
        });
      }

      const pdfBuffer = await generateQuotationPdf(pdfData);

      return {
        success: true as const,
        pdfUrl: `data:application/pdf;base64,${pdfBuffer.toString("base64")}`,
        total,
        itemCount: input.items.length,
      };
    }),
});
