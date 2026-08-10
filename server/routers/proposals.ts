import { TRPCError } from "@trpc/server";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { products, proposalItems, proposals, suppliers } from "../../drizzle/schema";
import { editorProcedure, protectedProcedure, router } from "../_core/trpc";
import {
  addProposalItem,
  createProposal,
  deleteProposal,
  duplicateProposal,
  getCompanySettings,
  getDb,
  getProposalStatusHistory,
  getProposalWithItems,
  listProposals,
  listProposalsAdmin,
  removeProposalItem,
  suggestProductsFromList,
  updateProposal,
  updateProposalFreight,
  updateProposalItem,
} from "../db";
import { generateProposalPdf } from "../proposalPdf";
import { recordAudit } from "../services/auditService";
import { isSmtpConfigured, sendEmail } from "../services/emailSenderService";
import { validateEquivalenceForMultipleItems } from "../services/equivalenceValidationService";
import {
  getProposalEmailDispatch,
  markProposalEmailDispatchAmbiguous,
  markProposalEmailDispatchCompleted,
  markProposalSmtpAccepted,
  releaseProposalEmailDispatchReservation,
  reserveProposalEmailDispatch,
} from "../services/proposalEmailDispatchService";
import { advanceProposalLifecycle } from "../services/proposalLifecycleService";

const proposalStatusSchema = z.enum([
  "draft",
  "sent",
  "order",
  "in_transit",
  "delivered",
  "cancelled",
]);

const proposalCreateSchema = z.object({
  title: z.string().trim().min(1).max(256),
  processNumber: z.string().trim().max(128).optional().nullable(),
  orgId: z.number().int().positive().optional().nullable(),
  orgName: z.string().trim().max(256).optional().nullable(),
  validityDays: z.number().int().min(1).max(365).optional(),
  paymentTerms: z.string().trim().max(256).optional().nullable(),
  deliveryTerms: z.string().trim().max(256).optional().nullable(),
  notes: z.string().max(20_000).optional().nullable(),
  origem: z.string().trim().max(32).optional().nullable(),
  radarOpportunityId: z.number().int().positive().optional().nullable(),
});

const proposalUpdateSchema = proposalCreateSchema
  .omit({ origem: true, radarOpportunityId: true })
  .partial()
  .extend({
    id: z.number().int().positive(),
    notesHtml: z.string().max(50_000).optional().nullable(),
  });

const itemCreateSchema = z.object({
  proposalId: z.number().int().positive(),
  productId: z.number().int().positive().optional().nullable(),
  productName: z.string().trim().min(1).max(512),
  activeIngredient: z.string().trim().max(512).optional().nullable(),
  manufacturer: z.string().trim().max(256).optional().nullable(),
  concentration: z.string().trim().max(128).optional().nullable(),
  presentation: z.string().trim().max(256).optional().nullable(),
  unit: z.string().trim().max(64).optional().nullable(),
  supplierName: z.string().trim().max(256).optional().nullable(),
  unitPrice: z.string().max(32).optional().nullable(),
  quantity: z.number().int().min(1).max(1_000_000).default(1),
  notes: z.string().max(4000).optional().nullable(),
  imageUrl: z.string().url().max(2000).optional().nullable(),
  productUrl: z.string().url().max(2000).optional().nullable(),
  registroMapa: z.string().trim().max(128).optional().nullable(),
});

function actorLabel(user: { name?: string | null; email?: string | null }): string {
  return user.name?.trim() || user.email?.trim() || "sistema";
}

function numericDecimal(value: string | null | undefined, field: string): string | null | undefined {
  if (value == null || value === "") return value;
  const numeric = Number(value.replace(",", "."));
  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `${field} inválido.` });
  }
  return String(numeric);
}

async function assertDraftProposal(proposalId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
  const [proposal] = await db
    .select({ status: proposals.status })
    .from(proposals)
    .where(eq(proposals.id, proposalId))
    .limit(1);
  if (!proposal) throw new TRPCError({ code: "NOT_FOUND", message: "Proposta não encontrada." });
  if (proposal.status !== "draft") {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "A proposta já saiu do rascunho. Conteúdo e itens comerciais estão congelados.",
    });
  }
}

async function assertDraftProposalItem(itemId: number): Promise<number> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
  const [item] = await db
    .select({ proposalId: proposalItems.proposalId, status: proposals.status })
    .from(proposalItems)
    .innerJoin(proposals, eq(proposals.id, proposalItems.proposalId))
    .where(eq(proposalItems.id, itemId))
    .limit(1);
  if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Item de proposta não encontrado." });
  if (item.status !== "draft") {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "A proposta já saiu do rascunho. Os itens comerciais estão congelados.",
    });
  }
  return item.proposalId;
}

function proposalPdfInput(proposal: NonNullable<Awaited<ReturnType<typeof getProposalWithItems>>>) {
  return {
    id: proposal.id,
    title: proposal.title,
    processNumber: proposal.processNumber,
    orgName: proposal.orgName,
    status: proposal.status,
    validityDays: proposal.validityDays,
    paymentTerms: proposal.paymentTerms,
    deliveryTerms: proposal.deliveryTerms,
    notes: proposal.notes,
    createdAt: proposal.createdAt,
    items: proposal.items.map((item) => ({
      id: item.id,
      sortOrder: item.sortOrder ?? item.itemNumber ?? 0,
      productName: item.productName,
      activeIngredient: item.activeIngredient,
      manufacturer: item.manufacturer,
      concentration: item.concentration,
      presentation: item.presentation,
      unit: item.unit,
      supplierName: item.supplierName,
      unitPrice: item.unitPrice,
      suggestedPrice: item.suggestedPrice,
      quantity: item.quantity,
      notes: item.notes,
      imageUrl: item.imageUrl,
      registroMapa: item.registroMapa,
      productUrl: item.productUrl,
    })),
  };
}

function companyPdfInput(company: Awaited<ReturnType<typeof getCompanySettings>>) {
  if (!company) return null;
  return {
    name: company.name,
    cnpj: company.cnpj,
    address: company.address,
    city: company.city,
    state: company.state,
    zipCode: company.zipCode,
    phone: company.phone,
    email: company.email,
    website: company.website,
    logoUrl: company.logoUrl,
    bankName: null,
    bankAgency: null,
    bankAccount: null,
    bankPixKey: null,
    defaultNotes: company.notes,
  };
}

export const proposalsRouter = router({
  list: protectedProcedure.query(() => listProposals()),

  get: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(({ input }) => getProposalWithItems(input.id)),

  emailDispatch: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(({ input }) => getProposalEmailDispatch(input.id)),

  create: editorProcedure
    .input(proposalCreateSchema)
    .mutation(async ({ input, ctx }) => {
      const id = await createProposal({ ...input, status: "draft" });
      await recordAudit({
        userId: ctx.user.id,
        action: "proposal_create",
        entity: "proposals",
        entityId: id,
        origin: "proposals",
        summary: `Proposta criada: ${input.title}`,
      });
      return id;
    }),

  update: editorProcedure
    .input(proposalUpdateSchema)
    .mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      await assertDraftProposal(id);
      await updateProposal(id, data);
      await recordAudit({
        userId: ctx.user.id,
        action: "proposal_update",
        entity: "proposals",
        entityId: id,
        origin: "proposals",
        summary: "Dados da proposta atualizados",
        changes: { fields: Object.keys(data) },
      });
      return { success: true as const };
    }),

  delete: editorProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      await assertDraftProposal(input.id);
      await deleteProposal(input.id);
      await recordAudit({
        userId: ctx.user.id,
        action: "proposal_delete",
        entity: "proposals",
        entityId: input.id,
        origin: "proposals",
        summary: `Proposta rascunho excluída (id ${input.id})`,
      });
      return { success: true as const };
    }),

  addItem: editorProcedure
    .input(itemCreateSchema)
    .mutation(async ({ input, ctx }) => {
      await assertDraftProposal(input.proposalId);
      const id = await addProposalItem({
        ...input,
        unitPrice: numericDecimal(input.unitPrice, "Preço de custo"),
      });
      await recordAudit({
        userId: ctx.user.id,
        action: "proposal_item_create",
        entity: "proposal_items",
        entityId: id,
        origin: "proposals",
        summary: `Item adicionado à proposta #${input.proposalId}: ${input.productName}`,
      });
      return id;
    }),

  updateItem: editorProcedure
    .input(
      itemCreateSchema
        .omit({ proposalId: true })
        .partial()
        .extend({
          id: z.number().int().positive(),
          costPrice: z.string().max(32).optional().nullable(),
          editalRefPrice: z.string().max(32).optional().nullable(),
          suggestedPrice: z.string().max(32).optional().nullable(),
          sortOrder: z.number().int().min(0).optional(),
        }),
    )
    .mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      await assertDraftProposalItem(id);
      await updateProposalItem(id, {
        ...data,
        unitPrice: numericDecimal(data.unitPrice, "Preço de custo"),
        costPrice: numericDecimal(data.costPrice, "Custo explícito"),
        editalRefPrice: numericDecimal(data.editalRefPrice, "Referência do edital"),
        suggestedPrice: numericDecimal(data.suggestedPrice, "Preço sugerido"),
      });
      await recordAudit({
        userId: ctx.user.id,
        action: "proposal_item_update",
        entity: "proposal_items",
        entityId: id,
        origin: "proposals",
        summary: "Item da proposta atualizado",
        changes: { fields: Object.keys(data) },
      });
      return { success: true as const };
    }),

  removeItem: editorProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      await assertDraftProposalItem(input.id);
      await removeProposalItem(input.id);
      await recordAudit({
        userId: ctx.user.id,
        action: "proposal_item_delete",
        entity: "proposal_items",
        entityId: input.id,
        origin: "proposals",
        summary: "Item removido da proposta",
      });
      return { success: true as const };
    }),

  listAdmin: protectedProcedure
    .input(
      z.object({
        status: proposalStatusSchema.optional(),
        orgName: z.string().trim().max(256).optional(),
        dateFrom: z.date().optional(),
        dateTo: z.date().optional(),
        limit: z.number().int().min(1).max(1000).default(300),
      }).optional(),
    )
    .query(({ input }) => listProposalsAdmin(input)),

  /**
   * Despacho transacionalmente rastreado. SMTP não oferece exactly-once com
   * MySQL; por isso qualquer resultado ambíguo bloqueia repetição automática.
   */
  sendByEmail: editorProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        to: z.string().email().optional(),
        subject: z.string().trim().max(256).optional(),
        mensagem: z.string().max(4000).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (!isSmtpConfigured()) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "SMTP não configurado." });
      }

      const actor = actorLabel(ctx.user);
      const reservation = await reserveProposalEmailDispatch({
        proposalId: input.id,
        recipient: input.to,
        subject: input.subject,
        actor,
      });

      if (reservation.mode === "already_sent") {
        return {
          success: true as const,
          alreadySent: true as const,
          to: reservation.recipient,
          messageId: reservation.messageId,
        };
      }

      if (reservation.mode === "resume") {
        const lifecycle = await advanceProposalLifecycle({
          id: input.id,
          newStatus: "sent",
          notes: `Envio SMTP já confirmado para ${reservation.recipient}; retomada do estado interno sem reenvio`,
          actor,
        });
        await markProposalEmailDispatchCompleted({
          proposalId: input.id,
          token: reservation.token,
        });
        await recordAudit({
          userId: ctx.user.id,
          action: "proposal_send_email_recovered",
          entity: "proposals",
          entityId: input.id,
          origin: "email",
          summary: `Estado interno recuperado sem novo envio para ${reservation.recipient}`,
          changes: { messageId: reservation.messageId, opportunityId: lifecycle.opportunityId },
        });
        return {
          success: true as const,
          alreadySent: true as const,
          recovered: true as const,
          to: reservation.recipient,
          messageId: reservation.messageId,
        };
      }

      let proposal: NonNullable<Awaited<ReturnType<typeof getProposalWithItems>>>;
      let pdfBuffer: Buffer;
      try {
        const current = await getProposalWithItems(input.id);
        if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Proposta não encontrada." });
        proposal = current;
        const company = await getCompanySettings();
        pdfBuffer = await generateProposalPdf(
          proposalPdfInput(proposal),
          companyPdfInput(company),
        );
      } catch (error) {
        await releaseProposalEmailDispatchReservation({
          proposalId: input.id,
          token: reservation.token,
        });
        throw error;
      }

      let acceptedMessageId = reservation.messageId;
      try {
        const sent = await sendEmail({
          to: reservation.recipient,
          subject: reservation.subject,
          text:
            input.mensagem ??
            "Prezados,\n\nSegue em anexo nossa proposta comercial.\n\nAtenciosamente.",
          messageId: reservation.messageId,
          attachments: [
            {
              filename: `proposta-${input.id}.pdf`,
              content: pdfBuffer,
              contentType: "application/pdf",
            },
          ],
        });
        acceptedMessageId = sent.messageId || reservation.messageId;
      } catch (error) {
        await markProposalEmailDispatchAmbiguous({
          proposalId: input.id,
          token: reservation.token,
          error,
        });
        await recordAudit({
          userId: ctx.user.id,
          action: "proposal_send_email_ambiguous",
          entity: "proposals",
          entityId: input.id,
          origin: "email",
          summary: `Resultado SMTP ambíguo para ${reservation.recipient}; reenvio automático bloqueado`,
          changes: { messageId: reservation.messageId },
        });
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "O SMTP não confirmou o resultado de forma segura. O reenvio automático foi bloqueado; confira a caixa de enviados antes de tentar novamente.",
          cause: error,
        });
      }

      // Se o processo cair depois de o SMTP aceitar e antes deste registro, a
      // reserva permanece "sending" e bloqueia reenvio cego. É deliberadamente
      // conservador porque SMTP não oferece transação distribuída com MySQL.
      await markProposalSmtpAccepted({
        proposalId: input.id,
        token: reservation.token,
        messageId: acceptedMessageId,
      });

      const lifecycle = await advanceProposalLifecycle({
        id: input.id,
        newStatus: "sent",
        notes: `Enviada por e-mail para ${reservation.recipient}`,
        actor,
      });

      await markProposalEmailDispatchCompleted({
        proposalId: input.id,
        token: reservation.token,
      });
      await recordAudit({
        userId: ctx.user.id,
        action: "proposal_send_email",
        entity: "proposals",
        entityId: input.id,
        origin: "email",
        summary: `Proposta enviada por e-mail para ${reservation.recipient}`,
        changes: {
          messageId: acceptedMessageId,
          opportunityId: lifecycle.opportunityId,
        },
      });
      return {
        success: true as const,
        alreadySent: false as const,
        to: reservation.recipient,
        messageId: acceptedMessageId,
      };
    }),

  advanceStatus: editorProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        newStatus: proposalStatusSchema,
        notes: z.string().trim().max(2000).optional(),
        installments: z.number().int().min(1).max(60).optional(),
        firstDueDate: z.date().optional(),
        lossReason: z.string().trim().max(2000).optional(),
        competitorValue: z.number().nonnegative().max(9_999_999_999_999.99).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const result = await advanceProposalLifecycle({
        ...input,
        actor: actorLabel(ctx.user),
      });
      await recordAudit({
        userId: ctx.user.id,
        action: "proposal_status_change",
        entity: "proposals",
        entityId: input.id,
        origin: "proposals",
        summary: `Proposta avançada para ${input.newStatus}`,
        changes: {
          newStatus: input.newStatus,
          installments: input.installments ?? 1,
          opportunityId: result.opportunityId,
          financialEntriesCreated: result.financialEntriesCreated,
        },
      });
      return result;
    }),

  updateFreight: editorProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        freightValue: z.string().max(32).optional().nullable(),
        freightCarrier: z.string().trim().max(256).optional().nullable(),
        freightTrackingCode: z.string().trim().max(128).optional().nullable(),
        freightPaidAt: z.date().optional().nullable(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { id, freightValue, ...rest } = input;
      await updateProposalFreight(id, {
        ...rest,
        freightValue: numericDecimal(freightValue, "Frete"),
      });
      await recordAudit({
        userId: ctx.user.id,
        action: "proposal_freight_update",
        entity: "proposals",
        entityId: id,
        origin: "proposals",
        summary: "Dados de frete atualizados",
      });
      return { success: true as const };
    }),

  getStatusHistory: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(({ input }) => getProposalStatusHistory(input.id)),

  duplicate: editorProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const newId = await duplicateProposal(input.id);
      await recordAudit({
        userId: ctx.user.id,
        action: "proposal_duplicate",
        entity: "proposals",
        entityId: newId,
        origin: "proposals",
        summary: `Proposta ${input.id} duplicada como ${newId}`,
      });
      return newId;
    }),

  suggestFromList: editorProcedure
    .input(
      z.object({
        productNames: z.array(z.string().trim().min(1).max(512)).min(1).max(200),
      }),
    )
    .mutation(({ input }) => suggestProductsFromList(input.productNames)),

  findCheaperSimilar: protectedProcedure
    .input(
      z.object({
        productId: z.number().int().positive(),
        unitPrice: z.string().max(32),
        excludeProductId: z.number().int().positive().optional().nullable(),
      }),
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { similars: [] };

      const [product] = await db
        .select({ activeIngredient: products.activeIngredient, name: products.name })
        .from(products)
        .where(eq(products.id, input.productId))
        .limit(1);
      if (!product?.activeIngredient || product.activeIngredient.trim().length < 3) {
        return { similars: [] };
      }

      const currentPrice = Number(input.unitPrice.replace(",", "."));
      if (!Number.isFinite(currentPrice) || currentPrice <= 0) return { similars: [] };

      const similars = await db
        .select({
          id: products.id,
          name: products.name,
          activeIngredient: products.activeIngredient,
          manufacturer: products.manufacturer,
          concentration: products.concentration,
          presentation: products.presentation,
          price: products.price,
          unit: products.unit,
          imageUrl: products.imageUrl,
          supplierName: suppliers.name,
        })
        .from(products)
        .leftJoin(suppliers, eq(products.supplierId, suppliers.id))
        .where(
          and(
            eq(products.activeIngredient, product.activeIngredient),
            ne(products.id, input.excludeProductId ?? input.productId),
            eq(products.isActive, "yes"),
            sql`CAST(${products.price} AS DECIMAL(12,2)) < ${currentPrice}`,
          ),
        )
        .orderBy(asc(products.price))
        .limit(5);

      return {
        similars: similars.map((similar) => {
          const price = similar.price == null ? null : Number(similar.price);
          return {
            ...similar,
            price: similar.price == null ? null : String(similar.price),
            savingPct:
              price != null && Number.isFinite(price)
                ? Math.round(((currentPrice - price) / currentPrice) * 100)
                : 0,
          };
        }),
        originalName: product.name,
        originalPrice: input.unitPrice,
        activeIngredient: product.activeIngredient,
      };
    }),

  validateEquivalenceForItems: editorProcedure
    .input(
      z.object({
        items: z
          .array(
            z.object({
              id: z.string().max(128),
              description: z.string().trim().min(1).max(4000),
              quantity: z.number().positive().optional(),
              unit: z.string().max(64).optional(),
              estimatedValue: z.number().nonnegative().optional(),
            }),
          )
          .min(1)
          .max(500),
      }),
    )
    .mutation(({ input }) => validateEquivalenceForMultipleItems(input.items)),
});
