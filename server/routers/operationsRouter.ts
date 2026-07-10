import { z } from "zod";
import { and, desc, eq, like, or, sql } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  auditLogs,
  documentosHabilitacao,
  orgHistoryEvents,
  priceHistory,
  products,
  proposalItems,
  proposals,
  requestingOrgs,
  suppliers,
  diligenciaWorkflows,
  type InsertOrgHistoryEvent,
} from "../../drizzle/schema";

const money = (value: unknown) => Number(value ?? 0);
const normalizeQuery = (value: string) => `%${value.trim()}%`;

export const operationsRouter = router({
  getActionCenter: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Banco de dados indisponível");

    const [expiringDocs, openDiligences, draftProposals, riskyProposals] = await Promise.all([
      db
        .select()
        .from(documentosHabilitacao)
        .where(or(eq(documentosHabilitacao.statusValidade, "expirando"), eq(documentosHabilitacao.statusValidade, "vencido")))
        .limit(10),
      db
        .select()
        .from(diligenciaWorkflows)
        .where(or(eq(diligenciaWorkflows.status, "aberta"), eq(diligenciaWorkflows.status, "pendente")))
        .orderBy(desc(diligenciaWorkflows.updatedAt))
        .limit(10),
      db
        .select()
        .from(proposals)
        .where(or(eq(proposals.status, "draft"), eq(proposals.status, "sent"), eq(proposals.status, "order")))
        .orderBy(desc(proposals.updatedAt))
        .limit(10),
      db.execute(sql`
        SELECT p.id, p.title, COUNT(pi.id) AS itemCount,
               SUM(CASE WHEN pi.suggestedPrice IS NULL OR pi.suggestedPrice = 0 THEN 1 ELSE 0 END) AS missingPrice,
               SUM(CASE WHEN pi.registroMapa IS NULL OR pi.registroMapa = '' THEN 1 ELSE 0 END) AS missingRegistro
          FROM proposals p
          LEFT JOIN proposal_items pi ON pi.proposalId = p.id
         GROUP BY p.id, p.title
         HAVING missingPrice > 0 OR missingRegistro > 0
         ORDER BY p.id DESC
         LIMIT 10
      `),
    ]);

    return {
      expiringDocs,
      openDiligences,
      draftProposals,
      riskyProposals,
    };
  }),

  universalSearch: protectedProcedure
    .input(z.object({ query: z.string().min(2) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco de dados indisponível");
      const q = normalizeQuery(input.query);

      const [productRows, supplierRows, proposalRows, orgRows, docRows] = await Promise.all([
        db.select({ id: products.id, name: products.name, code: products.code, ean: products.ean }).from(products).where(or(like(products.name, q), like(products.code, q), like(products.ean, q))).limit(8),
        db.select({ id: suppliers.id, name: suppliers.name }).from(suppliers).where(like(suppliers.name, q)).limit(8),
        db.select({ id: proposals.id, title: proposals.title, processNumber: proposals.processNumber }).from(proposals).where(or(like(proposals.title, q), like(proposals.processNumber, q), like(proposals.orgName, q))).limit(8),
        db.select({ id: requestingOrgs.id, name: requestingOrgs.name, cnpj: requestingOrgs.cnpj }).from(requestingOrgs).where(or(like(requestingOrgs.name, q), like(requestingOrgs.cnpj, q), like(requestingOrgs.contactPerson, q))).limit(8),
        db.select({ id: documentosHabilitacao.id, nome: documentosHabilitacao.nome, tipo: documentosHabilitacao.tipo }).from(documentosHabilitacao).where(or(like(documentosHabilitacao.nome, q), like(documentosHabilitacao.tipo, q), like(documentosHabilitacao.orgaoEmissor, q))).limit(8),
      ]);

      return { products: productRows, suppliers: supplierRows, proposals: proposalRows, orgs: orgRows, documents: docRows };
    }),

  getProposalRisk: protectedProcedure
    .input(z.object({ proposalId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco de dados indisponível");

      const proposal = await db.select().from(proposals).where(eq(proposals.id, input.proposalId)).limit(1);
      const items = await db.select().from(proposalItems).where(eq(proposalItems.proposalId, input.proposalId));
      const docs = await db.select().from(documentosHabilitacao).where(or(eq(documentosHabilitacao.statusValidade, "vencido"), eq(documentosHabilitacao.statusValidade, "expirando")));
      const diligences = await db.select().from(diligenciaWorkflows).where(and(eq(diligenciaWorkflows.proposalId, input.proposalId), or(eq(diligenciaWorkflows.status, "aberta"), eq(diligenciaWorkflows.status, "pendente"))));

      const flags: Array<{ area: string; severity: "alto" | "medio" | "baixo"; message: string }> = [];
      const totalItems = items.length;
      const missingSuggested = items.filter((item) => money(item.suggestedPrice) <= 0);
      const missingReg = items.filter((item) => !item.registroMapa);
      const lowMargin = items.filter((item) => {
        const cost = money(item.costPrice ?? item.unitPrice);
        const suggested = money(item.suggestedPrice ?? item.totalPrice);
        return cost > 0 && suggested > 0 && ((suggested - cost) / cost) * 100 < 8;
      });

      if (!proposal[0]?.validityDays || proposal[0].validityDays < 15) {
        flags.push({ area: "comercial", severity: "medio", message: "Validade da proposta inferior a 15 dias." });
      }
      if (missingSuggested.length) {
        flags.push({ area: "preço", severity: "alto", message: `${missingSuggested.length} item(ns) sem preço sugerido.` });
      }
      if (missingReg.length) {
        flags.push({ area: "técnico", severity: "alto", message: `${missingReg.length} item(ns) sem registro regulatório/MAPA informado.` });
      }
      if (lowMargin.length) {
        flags.push({ area: "margem", severity: "medio", message: `${lowMargin.length} item(ns) com margem estimada inferior a 8%.` });
      }
      if (docs.length) {
        flags.push({ area: "documental", severity: "alto", message: `${docs.length} documento(s) em status expirando/vencido.` });
      }
      if (diligences.length) {
        flags.push({ area: "jurídico", severity: "medio", message: `${diligences.length} diligência(s) pendente(s) vinculadas à proposta.` });
      }
      if (!proposal[0]?.orgName) {
        flags.push({ area: "cadastro", severity: "baixo", message: "Órgão demandante não informado na proposta." });
      }

      const score = Math.max(0, 100 - flags.reduce((acc, flag) => acc + (flag.severity === "alto" ? 20 : flag.severity === "medio" ? 10 : 5), 0));
      return {
        proposal: proposal[0] ?? null,
        totalItems,
        score,
        flags,
        resumo: {
          missingSuggested: missingSuggested.length,
          missingReg: missingReg.length,
          lowMargin: lowMargin.length,
          docsAlert: docs.length,
          diligences: diligences.length,
        },
      };
    }),

  getProductDossier: protectedProcedure
    .input(z.object({ productId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco de dados indisponível");

      const product = await db
        .select({
          id: products.id,
          name: products.name,
          description: products.description,
          manufacturer: products.manufacturer,
          activeIngredient: products.activeIngredient,
          concentration: products.concentration,
          presentation: products.presentation,
          ean: products.ean,
          gtin: products.gtin,
          mapa: products.mapa,
          imageUrl: products.imageUrl,
          productUrl: products.productUrl,
          supplierName: suppliers.name,
          price: products.price,
          fichaTecnica: products.fichaTecnica,
          informacaoTecnica: products.informacaoTecnica,
        })
        .from(products)
        .leftJoin(suppliers, eq(products.supplierId, suppliers.id))
        .where(eq(products.id, input.productId))
        .limit(1);

      const prices = await db.select().from(priceHistory).where(eq(priceHistory.productId, input.productId)).orderBy(desc(priceHistory.recordedAt)).limit(20);
      const equivalence = await db.execute(sql`
        SELECT eg.id, eg.activeIngredient, eg.notes, COUNT(em.id) AS members
          FROM equivalence_groups eg
          LEFT JOIN equivalence_members em ON em.groupId = eg.id
         WHERE eg.id IN (
           SELECT groupId FROM equivalence_members WHERE productId = ${input.productId}
         )
         GROUP BY eg.id, eg.activeIngredient, eg.notes
      `);

      return {
        product: product[0] ?? null,
        prices,
        equivalence,
      };
    }),

  getOrgHistory: protectedProcedure
    .input(z.object({ orgId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco de dados indisponível");

      const org = await db.select().from(requestingOrgs).where(eq(requestingOrgs.id, input.orgId)).limit(1);
      const proposalsByOrg = await db.select().from(proposals).where(eq(proposals.orgId, input.orgId)).orderBy(desc(proposals.createdAt)).limit(20);
      const events = await db.select().from(orgHistoryEvents).where(eq(orgHistoryEvents.orgId, input.orgId)).orderBy(desc(orgHistoryEvents.createdAt)).limit(30);
      const diligences = await db.select().from(diligenciaWorkflows).where(eq(diligenciaWorkflows.orgId, input.orgId)).orderBy(desc(diligenciaWorkflows.updatedAt)).limit(20);

      return {
        org: org[0] ?? null,
        proposals: proposalsByOrg,
        events,
        diligences,
      };
    }),

  recordOrgEvent: protectedProcedure
    .input(z.object({ orgId: z.number(), proposalId: z.number().optional(), eventType: z.string(), title: z.string(), details: z.string().optional(), score: z.number().default(0) }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco de dados indisponível");
      const eventPayload: InsertOrgHistoryEvent = {
        orgId: input.orgId,
        proposalId: input.proposalId ?? null,
        eventType: input.eventType,
        title: input.title,
        details: input.details ?? null,
        score: input.score ?? 0,
      };
      await db.insert(orgHistoryEvents).values(eventPayload);
      await db.insert(auditLogs).values({
        userId: ctx.user.id,
        action: "record_org_event",
        entity: "org_history_events",
        entityId: input.orgId,
        origin: "operationsRouter",
        summary: input.title,
        changes: input as any,
      });
      return { success: true };
    }),

  calculateStrategicPrice: protectedProcedure
    .input(z.object({
      cost: z.number().min(0),
      icmsPercent: z.number().min(0).default(0),
      ipiPercent: z.number().min(0).default(0),
      pisPercent: z.number().min(0).default(0),
      cofinsPercent: z.number().min(0).default(0),
      freight: z.number().min(0).default(0),
      overhead: z.number().min(0).default(0),
      marginPercent: z.number().min(0).default(20),
      editalRefPrice: z.number().min(0).optional(),
    }))
    .query(({ input }) => {
      const taxValue = input.cost * ((input.icmsPercent + input.ipiPercent + input.pisPercent + input.cofinsPercent) / 100);
      const baseWithCharges = input.cost + taxValue + input.freight + input.overhead;
      const suggestedPrice = baseWithCharges * (1 + input.marginPercent / 100);
      const marginValue = suggestedPrice - baseWithCharges;
      const belowReference = input.editalRefPrice ? suggestedPrice <= input.editalRefPrice : null;
      const inexequivel = suggestedPrice <= baseWithCharges;
      return {
        cost: input.cost,
        taxValue,
        freight: input.freight,
        overhead: input.overhead,
        baseWithCharges,
        marginPercent: input.marginPercent,
        marginValue,
        suggestedPrice,
        editalRefPrice: input.editalRefPrice ?? null,
        belowReference,
        inexequivel,
      };
    }),
});
