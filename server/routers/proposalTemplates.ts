import { z } from "zod";
import { editorProcedure, protectedProcedure, router } from "../_core/trpc";
import { createProposalTemplate, deleteProposalTemplate, getDefaultProposalTemplate, getProposalTemplate, listProposalTemplates, updateProposalTemplate } from "../db";

export const proposalTemplatesRouter = router({
    list: protectedProcedure.query(() => listProposalTemplates()),

    getDefault: protectedProcedure.query(() => getDefaultProposalTemplate()),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => getProposalTemplate(input.id)),

    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(128),
        orgType: z.enum(["prefeitura", "estado", "federal", "privado", "outro"]).default("outro"),
        icmsPercent: z.number().min(0).max(100).default(0),
        stPercent: z.number().min(0).max(100).default(0),
        ipiPercent: z.number().min(0).max(100).default(0),
        otherTaxPercent: z.number().min(0).max(100).default(0),
        freightType: z.enum(["cif", "fob", "none"]).default("cif"),
        freightPercent: z.number().min(0).max(100).default(0),
        validityDays: z.number().int().min(1).default(30),
        declarations: z.string().optional(),
        paymentTerms: z.string().max(256).optional(),
        deliveryDays: z.number().int().min(0).default(15),
        notes: z.string().optional(),
        isDefault: z.enum(["yes", "no"]).default("no"),
      }))
      .mutation(({ input }) => createProposalTemplate({
        ...input,
        icmsPercent: String(input.icmsPercent),
        stPercent: String(input.stPercent),
        ipiPercent: String(input.ipiPercent),
        otherTaxPercent: String(input.otherTaxPercent),
        freightPercent: String(input.freightPercent),
      } as any)),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).max(128).optional(),
        orgType: z.enum(["prefeitura", "estado", "federal", "privado", "outro"]).optional(),
        icmsPercent: z.number().min(0).max(100).optional(),
        stPercent: z.number().min(0).max(100).optional(),
        ipiPercent: z.number().min(0).max(100).optional(),
        otherTaxPercent: z.number().min(0).max(100).optional(),
        freightType: z.enum(["cif", "fob", "none"]).optional(),
        freightPercent: z.number().min(0).max(100).optional(),
        validityDays: z.number().int().min(1).optional(),
        declarations: z.string().optional(),
        paymentTerms: z.string().max(256).optional(),
        deliveryDays: z.number().int().min(0).optional(),
        notes: z.string().optional(),
        isDefault: z.enum(["yes", "no"]).optional(),
      }))
      .mutation(({ input }) => {
        const { id, icmsPercent, stPercent, ipiPercent, otherTaxPercent, freightPercent, ...rest } = input;
        return updateProposalTemplate(id, {
          ...rest,
          ...(icmsPercent !== undefined && { icmsPercent: String(icmsPercent) }),
          ...(stPercent !== undefined && { stPercent: String(stPercent) }),
          ...(ipiPercent !== undefined && { ipiPercent: String(ipiPercent) }),
          ...(otherTaxPercent !== undefined && { otherTaxPercent: String(otherTaxPercent) }),
          ...(freightPercent !== undefined && { freightPercent: String(freightPercent) }),
        } as any);
      }),

    delete: editorProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteProposalTemplate(input.id)),
    seedDefaults: protectedProcedure
      .mutation(async () => {
        const defaults = [
          {
            name: "Licitação Federal (Ministério/Autarquia)",
            orgType: "federal" as const,
            icmsPercent: "0", stPercent: "0", ipiPercent: "0", otherTaxPercent: "0",
            freightType: "cif" as const, freightPercent: "0",
            validityDays: 90, paymentTerms: "30 dias após entrega", deliveryDays: 30,
            declarations: "Declaramos que os produtos ofertados atendem às especificações do edital, às normas vigentes da ANVISA e ao Decreto nº 7.892/2013.",
            isDefault: "yes" as const,
          },
          {
            name: "Licitação Estadual — Padrão",
            orgType: "estado" as const,
            icmsPercent: "12", stPercent: "2", ipiPercent: "0", otherTaxPercent: "0",
            freightType: "cif" as const, freightPercent: "0",
            validityDays: 60, paymentTerms: "30 dias após entrega", deliveryDays: 20,
            declarations: "Declaramos que os produtos ofertados atendem às especificações do edital e às normas vigentes da ANVISA.",
            isDefault: "no" as const,
          },
          {
            name: "Licitação Municipal (Prefeitura)",
            orgType: "prefeitura" as const,
            icmsPercent: "12", stPercent: "0", ipiPercent: "0", otherTaxPercent: "0",
            freightType: "cif" as const, freightPercent: "0",
            validityDays: 60, paymentTerms: "30 dias após entrega", deliveryDays: 15,
            declarations: "Declaramos que os produtos ofertados atendem às especificações do edital e às normas vigentes da ANVISA.",
            isDefault: "no" as const,
          },
          {
            name: "Venda Direta — Cliente Privado",
            orgType: "privado" as const,
            icmsPercent: "12", stPercent: "0", ipiPercent: "0", otherTaxPercent: "0",
            freightType: "cif" as const, freightPercent: "3",
            validityDays: 30, paymentTerms: "À vista ou 30 dias", deliveryDays: 10,
            declarations: "",
            isDefault: "no" as const,
          },
        ];
        let created = 0;
        for (const t of defaults) {
          await createProposalTemplate(t as any);
          created++;
        }
        return { created };
      }),
  });
