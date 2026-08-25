import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createSanction, getActiveSanctions, getSanctionById, listSanctions, revokeSanction, updateSanction } from "../db/sanctions";
import { getSupplierById } from "../db/suppliers";
import { recordAudit } from "../services/auditService";
import { editorProcedure, protectedProcedure, router } from "../_core/trpc";

const SanctionInput = z.object({
  supplierId: z.number().int().positive(),
  orgao: z.string().min(1).max(256),
  processo: z.string().max(128).optional().nullable(),
  penalidade: z.enum(["advertencia", "multa", "impedimento", "inidoneidade"]).default("advertencia"),
  dataInicio: z.string(), // ISO date
  dataFim: z.string().optional().nullable(), // ISO date — nula = sem prazo (Lei 14.133 art. 156)
  referenciaLegal: z.string().max(512).optional().nullable(),
  observacoes: z.string().optional().nullable(),
  // Âmbito federativo do efeito (Lei 14.133/21, art. 156 §5º).
  abrangencia: z.enum(["municipal", "estadual", "federal", "nacional"]).optional().nullable(),
  arquivoUrl: z.string().optional().nullable(),
});

async function assertSupplierExists(supplierId: number) {
  const supplier = await getSupplierById(supplierId);
  if (!supplier) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Fornecedor não encontrado" });
  }
  return supplier;
}

export const sanctionsRouter = router({
  /** Lista todas as sanções ou as de um fornecedor específico. */
  list: protectedProcedure
    .input(z.object({ supplierId: z.number().int().positive().optional() }).optional())
    .query(({ input }) => listSanctions(input?.supplierId)),

  /** Sanções ativas e vigentes de um fornecedor (para validação em cotações). */
  active: protectedProcedure
    .input(z.object({ supplierId: z.number().int().positive() }))
    .query(({ input }) => getActiveSanctions(input.supplierId)),

  create: editorProcedure
    .input(SanctionInput)
    .mutation(async ({ ctx, input }) => {
      const supplier = await assertSupplierExists(input.supplierId);
      if (input.dataFim && new Date(input.dataFim) < new Date(input.dataInicio)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "A data de fim deve ser posterior à data de início" });
      }
      const result = await createSanction({
        ...input,
        dataInicio: new Date(input.dataInicio),
        dataFim: input.dataFim ? new Date(input.dataFim) : null,
        criadoPor: ctx.user.email ?? "admin",
        status: "ativa",
      });
      await recordAudit({
        userId: Number(ctx.user.id) ?? null,
        action: "sancao_registrada",
        entity: "supplier_sanction",
        entityId: result.insertId,
        origin: "web",
        summary: `Sanção ${input.penalidade} registrada para fornecedor ${supplier.name} (órgão: ${input.orgao}, processo: ${input.processo ?? "-"})`,
      });
      return { id: result.insertId };
    }),

  update: editorProcedure
    .input(
      SanctionInput.extend({ id: z.number().int().positive() })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await getSanctionById(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Sanção não encontrada" });
      if (input.dataFim && new Date(input.dataFim) < new Date(input.dataInicio)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "A data de fim deve ser posterior à data de início" });
      }
      await assertSupplierExists(input.supplierId);
      await updateSanction(input.id, {
        supplierId: input.supplierId,
        orgao: input.orgao,
        processo: input.processo,
        penalidade: input.penalidade,
        dataInicio: new Date(input.dataInicio),
        dataFim: input.dataFim ? new Date(input.dataFim) : null,
        referenciaLegal: input.referenciaLegal,
        observacoes: input.observacoes,
        abrangencia: input.abrangencia,
        arquivoUrl: input.arquivoUrl,
        criadoPor: existing.criadoPor ?? ctx.user.email ?? "admin",
      });
      await recordAudit({
        userId: Number(ctx.user.id) ?? null,
        action: "sancao_atualizada",
        entity: "supplier_sanction",
        entityId: input.id,
        origin: "web",
        summary: `Sanção #${input.id} atualizada`,
      });
      return { ok: true };
    }),

  revoke: editorProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await getSanctionById(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Sanção não encontrada" });
      if (existing.status !== "ativa") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "A sanção não está ativa" });
      }
      await revokeSanction(input.id, ctx.user.email ?? "admin");
      await recordAudit({
        userId: Number(ctx.user.id) ?? null,
        action: "sancao_revogada",
        entity: "supplier_sanction",
        entityId: input.id,
        origin: "web",
        summary: `Sanção #${input.id} revogada por ${ctx.user.email ?? "admin"}`,
      });
      return { ok: true };
    }),
});
