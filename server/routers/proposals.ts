import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, editorProcedure, router } from "../_core/trpc";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { products, proposals, suppliers } from "../../drizzle/schema";
import { addProposalItem, advanceProposalStatus, createFinancialEntry, createProposal, deleteProposal, duplicateProposal, getCompanySettings, getDb, getProposalStatusHistory, getProposalWithItems, getRequestingOrgById, listProposals, listProposalsAdmin, removeProposalItem, suggestProductsFromList, updateProposal, updateProposalFreight, updateProposalItem } from "../db";
import { validateEquivalenceForMultipleItems } from "../services/equivalenceValidationService";
import { recordAudit } from "../services/auditService";
import { generateProposalPdf } from "../proposalPdf";
import { isSmtpConfigured, sendEmail } from "../services/emailSenderService";

export const proposalsRouter = router({
    list: protectedProcedure.query(() => listProposals()),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => getProposalWithItems(input.id)),
    create: protectedProcedure
      .input(
        z.object({
          title: z.string().min(1).max(256),
          processNumber: z.string().max(128).optional().nullable(),
          orgId: z.number().optional().nullable(),
          orgName: z.string().max(256).optional().nullable(),
          status: z.enum(["draft", "sent", "order", "in_transit", "delivered", "cancelled"]).optional(),
          validityDays: z.number().optional(),
          paymentTerms: z.string().max(256).optional().nullable(),
          deliveryTerms: z.string().max(256).optional().nullable(),
          notes: z.string().optional().nullable(),
          origem: z.string().max(32).optional().nullable(),
          radarOpportunityId: z.number().optional().nullable(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const id = await createProposal(input as any);
        await recordAudit({
          userId: ctx.user?.id,
          action: "proposal_create",
          entity: "proposals",
          entityId: id,
          summary: `Proposta criada: ${input.title}`,
        });
        return id;
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          title: z.string().min(1).max(256).optional(),
          processNumber: z.string().max(128).optional().nullable(),
          orgId: z.number().optional().nullable(),
          orgName: z.string().max(256).optional().nullable(),
          status: z.enum(["draft", "sent", "order", "in_transit", "delivered", "cancelled"]).optional(),
          validityDays: z.number().optional(),
          paymentTerms: z.string().max(256).optional().nullable(),
          deliveryTerms: z.string().max(256).optional().nullable(),
          notes: z.string().optional().nullable(),
          notesHtml: z.string().optional().nullable(),
        })
      )
      .mutation(({ input }) => {
        const { id, ...data } = input;
        return updateProposal(id, data as any);
      }),

     delete: editorProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await deleteProposal(input.id);
        await recordAudit({
          userId: ctx.user?.id,
          action: "proposal_delete",
          entity: "proposals",
          entityId: input.id,
          summary: `Proposta excluída (id ${input.id})`,
        });
      }),

    addItem: protectedProcedure
      .input(
        z.object({
          proposalId: z.number(),
          productId: z.number().optional().nullable(),
          productName: z.string().min(1).max(512),
          activeIngredient: z.string().max(512).optional().nullable(),
          manufacturer: z.string().max(256).optional().nullable(),
          concentration: z.string().max(128).optional().nullable(),
          presentation: z.string().max(256).optional().nullable(),
          unit: z.string().max(64).optional().nullable(),
          supplierName: z.string().max(256).optional().nullable(),
          unitPrice: z.string().optional().nullable(),
          quantity: z.number().finite().positive().default(1),
          notes: z.string().optional().nullable(),
          imageUrl: z.string().optional().nullable(),
          productUrl: z.string().optional().nullable(),
          registroMapa: z.string().max(128).optional().nullable(),
        })
      )
      .mutation(({ input }) => addProposalItem(input as any)),

    updateItem: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          productId: z.number().optional().nullable(),
          productName: z.string().max(512).optional(),
          activeIngredient: z.string().max(512).optional().nullable(),
          manufacturer: z.string().max(256).optional().nullable(),
          concentration: z.string().max(128).optional().nullable(),
          presentation: z.string().max(256).optional().nullable(),
          unit: z.string().max(64).optional().nullable(),
          supplierName: z.string().max(256).optional().nullable(),
          unitPrice: z.string().optional().nullable(),
          costPrice: z.string().optional().nullable(),
          editalRefPrice: z.string().optional().nullable(),
          suggestedPrice: z.string().optional().nullable(),
          quantity: z.number().finite().positive().optional(),
          notes: z.string().optional().nullable(),
          sortOrder: z.number().optional(),
          registroMapa: z.string().max(128).optional().nullable(),
          imageUrl: z.string().max(2000).optional().nullable(),
          productUrl: z.string().max(2000).optional().nullable(),
        })
      )
      .mutation(({ input }) => {
        const { id, ...data } = input;
        return updateProposalItem(id, data as any);
      }),

    removeItem: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => removeProposalItem(input.id)),
    // Administration
    listAdmin: protectedProcedure
      .input(z.object({
        status: z.string().optional(),
        orgName: z.string().optional(),
        dateFrom: z.date().optional(),
        dateTo: z.date().optional(),
      }).optional())
      .query(({ input }) => listProposalsAdmin(input)),

    /**
     * Envia a proposta por e-mail ao comprador (PDF em anexo) e avança o
     * status para "sent" — fecha o ciclo que hoje termina em download manual.
     * Reaproveita o mesmo motor de envio (emailSenderService) e a mesma
     * trilha de status (advanceProposalStatus) já usados no fluxo de
     * cotações recebidas por e-mail.
     */
    sendByEmail: editorProcedure
      .input(
        z.object({
          id: z.number(),
          to: z.string().email().optional(),
          subject: z.string().max(256).optional(),
          mensagem: z.string().max(4000).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        if (!isSmtpConfigured()) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "SMTP não configurado. Defina SMTP_HOST, SMTP_USER e SMTP_PASSWORD.",
          });
        }

        const proposal = await getProposalWithItems(input.id);
        if (!proposal) throw new TRPCError({ code: "NOT_FOUND", message: "Proposta não encontrada." });

        const org = proposal.orgId ? await getRequestingOrgById(proposal.orgId) : null;
        const destinatario = input.to ?? org?.email ?? undefined;
        if (!destinatario) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Sem destinatário: informe um e-mail (o órgão vinculado não tem e-mail cadastrado).",
          });
        }

        const company = await getCompanySettings();
        // generateProposalPdf valida preço pronto de cada item (assertProposalPricingReady)
        // — nenhuma proposta sai sem preço de venda definido.
        const pdfBuffer = await generateProposalPdf(proposal as any, company as any);

        await sendEmail({
          to: destinatario,
          subject: input.subject ?? `Proposta comercial - ${proposal.title}`,
          text:
            input.mensagem ??
            "Prezados,\n\nSegue em anexo nossa proposta comercial.\n\nAtenciosamente.",
          attachments: [
            { filename: `proposta-${input.id}.pdf`, content: pdfBuffer, contentType: "application/pdf" },
          ],
        });

        await advanceProposalStatus(input.id, "sent", `Enviada por e-mail para ${destinatario}`);
        await recordAudit({
          userId: ctx.user?.id,
          action: "proposal_send_email",
          entity: "proposals",
          entityId: input.id,
          summary: `Proposta enviada por e-mail para ${destinatario}`,
        });

        return { success: true as const, to: destinatario };
      }),

    advanceStatus: protectedProcedure
      .input(z.object({
        id: z.number(),
        newStatus: z.enum(["draft", "sent", "order", "in_transit", "delivered", "cancelled"]),
        notes: z.string().optional(),
        installments: z.number().int().min(1).max(60).optional(),
        firstDueDate: z.date().optional(),
        lossReason: z.string().max(2000).optional(),
        competitorValue: z.number().nonnegative().optional(),
      }))
      .mutation(async ({ input }) => {
        await advanceProposalStatus(input.id, input.newStatus, input.notes);
        if (input.newStatus === "cancelled" && (input.lossReason || input.competitorValue != null)) {
          const db = await getDb();
          if (db) {
            await db
              .update(proposals)
              .set({
                lossReason: input.lossReason,
                competitorValue: input.competitorValue != null ? String(input.competitorValue) : undefined,
              })
              .where(eq(proposals.id, input.id));
          }
        }
        if (input.newStatus === "delivered" && input.installments && input.installments > 1) {
          const db = await getDb();
          if (!db) return { success: true };
          const [proposal] = await db
            .select({ totalValue: proposals.totalValue, title: proposals.title, orgName: proposals.orgName })
            .from(proposals)
            .where(eq(proposals.id, input.id))
            .limit(1);
          if (proposal?.totalValue) {
            const total = parseFloat(String(proposal.totalValue));
            const parcelValue = total / input.installments;
            const baseDate = input.firstDueDate ? new Date(input.firstDueDate) : new Date();
            for (let i = 0; i < input.installments; i++) {
              const dueDate = new Date(baseDate);
              dueDate.setMonth(dueDate.getMonth() + i);
              await createFinancialEntry({
                type: "income",
                category: "Proposta",
                description: `${proposal.title ?? "Proposta"} — Parcela ${i + 1}/${input.installments}${proposal.orgName ? ` (${proposal.orgName})` : ""}`,
                amount: String(parcelValue.toFixed(2)) as any,
                dueDate,
                isPaid: "no",
                proposalId: input.id,
              });
            }
          }
        } else if (input.newStatus === "delivered") {
          const db = await getDb();
          if (!db) return { success: true };
          const [proposal] = await db
            .select({ totalValue: proposals.totalValue, title: proposals.title, orgName: proposals.orgName })
            .from(proposals)
            .where(eq(proposals.id, input.id))
            .limit(1);
          if (proposal?.totalValue) {
            const dueDate = input.firstDueDate ? new Date(input.firstDueDate) : new Date();
            await createFinancialEntry({
              type: "income",
              category: "Proposta",
              description: `${proposal.title ?? "Proposta"}${proposal.orgName ? ` (${proposal.orgName})` : ""}`,
              amount: String(parseFloat(String(proposal.totalValue)).toFixed(2)) as any,
              dueDate,
              isPaid: "no",
              proposalId: input.id,
            });
          }
        }
        return { success: true };
      }),
    updateFreight: protectedProcedure
      .input(z.object({
        id: z.number(),
        freightValue: z.string().optional().nullable(),
        freightCarrier: z.string().max(256).optional().nullable(),
        freightTrackingCode: z.string().max(128).optional().nullable(),
        freightPaidAt: z.date().optional().nullable(),
      }))
      .mutation(({ input }) => {
        const { id, ...data } = input;
        return updateProposalFreight(id, data as any);
      }),
    getStatusHistory: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => getProposalStatusHistory(input.id)),
    duplicate: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const newId = await duplicateProposal(input.id);
        await recordAudit({
          userId: ctx.user?.id,
          action: "proposal_duplicate",
          entity: "proposals",
          entityId: newId,
          summary: `Proposta ${input.id} duplicada como ${newId}`,
        });
        return newId;
      }),

    suggestFromList: protectedProcedure
      .input(z.object({
        productNames: z.array(z.string().min(1)).min(1).max(200),
      }))
      .mutation(({ input }) => suggestProductsFromList(input.productNames)),

    findCheaperSimilar: protectedProcedure
      .input(z.object({
        productId: z.number(),
        unitPrice: z.string(),
        excludeProductId: z.number().optional().nullable(),
      }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return { similars: [] };

        const [prod] = await db
          .select({ activeIngredient: products.activeIngredient, name: products.name })
          .from(products)
          .where(eq(products.id, input.productId))
          .limit(1);

        if (!prod?.activeIngredient || prod.activeIngredient.trim().length < 3) {
          return { similars: [] };
        }

        const currentPrice = parseFloat(input.unitPrice);
        if (isNaN(currentPrice) || currentPrice <= 0) return { similars: [] };

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
              eq(products.activeIngredient, prod.activeIngredient),
              ne(products.id, input.productId),
              eq(products.isActive, "yes"),
              sql`CAST(${products.price} AS DECIMAL(12,2)) < ${currentPrice}`,
            )
          )
          .orderBy(asc(products.price))
          .limit(5);

        return {
          similars: similars.map((s) => ({
            ...s,
            price: s.price ? String(s.price) : null,
            savingPct: s.price
              ? Math.round(((currentPrice - parseFloat(String(s.price))) / currentPrice) * 100)
              : 0,
          })),
          originalName: prod.name,
          originalPrice: input.unitPrice,
          activeIngredient: prod.activeIngredient,
        };
      }),

    validateEquivalenceForItems: protectedProcedure
      .input(
        z.object({
          items: z.array(
            z.object({
              id: z.string(),
              description: z.string().min(1),
              quantity: z.number().optional(),
              unit: z.string().optional(),
              estimatedValue: z.number().optional(),
            })
          ).min(1),
        })
      )
      .mutation(async ({ input }) => {
        return validateEquivalenceForMultipleItems(input.items);
      }),
  });