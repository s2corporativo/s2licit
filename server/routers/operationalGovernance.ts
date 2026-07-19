import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { adminProcedure, editorProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  evaluateExecutiveDecision,
  type CompetitionLevel,
  type RiskLevel,
} from "../services/executiveDecisionService";
import { rankSupplierOffers } from "../services/supplierRankingService";

const certificationChecklistSchema = z.array(
  z.object({
    key: z.string().min(1).max(64),
    label: z.string().min(1).max(256),
    passed: z.boolean(),
    details: z.string().max(2000).optional(),
  }),
).min(1).max(40);

const executiveMetricsSchema = z.object({
  marginPercent: z.number().min(-100).max(100),
  supplierCoveragePercent: z.number().min(0).max(100),
  documentationReadinessPercent: z.number().min(0).max(100),
  deliveryConfidencePercent: z.number().min(0).max(100),
  workingCapitalCoveragePercent: z.number().min(0).max(100),
  competitionLevel: z.enum(["low", "medium", "high"]),
  deadlineDays: z.number().int().min(-365).max(3650).optional(),
  legalRisk: z.enum(["low", "medium", "high"]),
  taxRisk: z.enum(["low", "medium", "high"]),
  operationalRisk: z.enum(["low", "medium", "high"]).optional(),
});

const contractItemSchema = z.object({
  id: z.number().int().positive().optional(),
  description: z.string().min(1).max(512),
  quantityContracted: z.number().nonnegative(),
  quantityOrdered: z.number().nonnegative(),
  quantityDelivered: z.number().nonnegative(),
  quantityInvoiced: z.number().nonnegative(),
  unitPrice: z.number().nonnegative(),
});

function asRows<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value === "object") return value as T;
  try {
    return JSON.parse(String(value)) as T;
  } catch {
    return fallback;
  }
}

function dateOnly(value?: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) throw new TRPCError({ code: "BAD_REQUEST", message: `Data inválida: ${value}` });
  return value;
}

export const operationalGovernanceRouter = router({
  summary: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });

    const [rows] = await db.execute(sql`
      SELECT
        (SELECT COUNT(*) FROM suppliers WHERE isActive = 'yes') AS activeSuppliers,
        (SELECT COUNT(*) FROM scraper_configs WHERE enabled = 'yes') AS configuredScrapers,
        (SELECT COUNT(*) FROM scraper_configs WHERE enabled = 'yes' AND tosAprovado = FALSE) AS tosPending,
        (SELECT COUNT(*) FROM scraper_configs WHERE enabled = 'yes' AND lastRunStatus = 'failed') AS failedScrapers,
        (SELECT COUNT(*) FROM portal_credentials WHERE ativo = TRUE) AS activePortalCredentials,
        (SELECT COUNT(*) FROM operational_certifications WHERE status = 'approved' AND (validUntil IS NULL OR validUntil >= CURRENT_DATE)) AS approvedCertifications,
        (SELECT COUNT(*) FROM operational_certifications WHERE status IN ('pending','failed','expired') OR (validUntil IS NOT NULL AND validUntil < CURRENT_DATE)) AS pendingCertifications,
        (SELECT COUNT(*) FROM contract_lifecycle WHERE status = 'active') AS activeContracts,
        (SELECT COUNT(*) FROM contract_lifecycle WHERE status = 'active' AND fimVigencia BETWEEN CURRENT_DATE AND DATE_ADD(CURRENT_DATE, INTERVAL 45 DAY)) AS contractsExpiring,
        (SELECT COUNT(*) FROM canonical_product_costs) AS productsWithCanonicalCost
    `);
    const row = (asRows<Record<string, unknown>>(rows)[0] ?? {});

    const integrations = {
      ai: Boolean(process.env.GROQ_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.BUILT_IN_FORGE_API_KEY),
      email: Boolean(process.env.IMAP_HOST && process.env.IMAP_USER && process.env.IMAP_PASSWORD),
      whatsapp: Boolean((process.env.WHATSAPP_PHONE_ID && process.env.WHATSAPP_TOKEN) || process.env.WHATSAPP_WEBHOOK_URL),
      secureCookies: process.env.FORCE_SECURE_COOKIES === "true",
    };

    const metrics = {
      activeSuppliers: Number(row.activeSuppliers ?? 0),
      configuredScrapers: Number(row.configuredScrapers ?? 0),
      tosPending: Number(row.tosPending ?? 0),
      failedScrapers: Number(row.failedScrapers ?? 0),
      activePortalCredentials: Number(row.activePortalCredentials ?? 0),
      approvedCertifications: Number(row.approvedCertifications ?? 0),
      pendingCertifications: Number(row.pendingCertifications ?? 0),
      activeContracts: Number(row.activeContracts ?? 0),
      contractsExpiring: Number(row.contractsExpiring ?? 0),
      productsWithCanonicalCost: Number(row.productsWithCanonicalCost ?? 0),
    };

    const blockers: string[] = [];
    if (!integrations.ai) blockers.push("Nenhum provedor de IA configurado.");
    if (!integrations.email) blockers.push("Recebimento/envio de e-mail não configurado.");
    if (!integrations.secureCookies) blockers.push("FORCE_SECURE_COOKIES ainda não está ativo.");
    if (metrics.tosPending > 0) blockers.push(`${metrics.tosPending} captura(s) aguardam aprovação dos termos de uso.`);
    if (metrics.failedScrapers > 0) blockers.push(`${metrics.failedScrapers} captura(s) estão com última execução falha.`);
    if (metrics.pendingCertifications > 0) blockers.push(`${metrics.pendingCertifications} integração(ões) ainda não estão certificadas.`);
    if (metrics.contractsExpiring > 0) blockers.push(`${metrics.contractsExpiring} contrato(s) vencem nos próximos 45 dias.`);

    return {
      metrics,
      integrations,
      blockers,
      ready: blockers.length === 0,
      checkedAt: new Date(),
    };
  }),

  pricingIntegrity: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
    const [rows] = await db.execute(sql`
      SELECT
        SUM(CASE WHEN o.id IS NULL THEN 1 ELSE 0 END) AS legacyOnly,
        SUM(CASE WHEN o.id IS NOT NULL AND psp.id IS NOT NULL AND COALESCE(o.price, -1) <> COALESCE(psp.price, -1) THEN 1 ELSE 0 END) AS divergent,
        COUNT(*) AS legacyRows
      FROM product_supplier_prices psp
      LEFT JOIN product_supplier_offers o
        ON o.productId = psp.productId AND o.supplierId = psp.supplierId
    `);
    const [offersOnlyRows] = await db.execute(sql`
      SELECT COUNT(*) AS offersOnly
      FROM product_supplier_offers o
      LEFT JOIN product_supplier_prices psp
        ON o.productId = psp.productId AND o.supplierId = psp.supplierId
      WHERE psp.id IS NULL
    `);
    const row = asRows<Record<string, unknown>>(rows)[0] ?? {};
    const offersOnly = asRows<Record<string, unknown>>(offersOnlyRows)[0] ?? {};
    return {
      legacyRows: Number(row.legacyRows ?? 0),
      legacyOnly: Number(row.legacyOnly ?? 0),
      divergent: Number(row.divergent ?? 0),
      offersOnly: Number(offersOnly.offersOnly ?? 0),
      canonicalSource: "product_supplier_offers" as const,
      compatibilityMode: "dual_write" as const,
    };
  }),

  reconcileCanonicalOffers: adminProcedure.mutation(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
    const [result] = await db.execute(sql`
      INSERT INTO product_supplier_offers
        (productId, supplierId, supplierCode, price, link, createdAt, updatedAt)
      SELECT
        psp.productId,
        psp.supplierId,
        psp.codigoFornecedor,
        psp.price,
        psp.linkProduto,
        COALESCE(psp.dataAtualizacao, psp.updatedAt, CURRENT_TIMESTAMP),
        COALESCE(psp.updatedAt, psp.dataAtualizacao, CURRENT_TIMESTAMP)
      FROM product_supplier_prices psp
      ON DUPLICATE KEY UPDATE
        supplierCode = COALESCE(VALUES(supplierCode), product_supplier_offers.supplierCode),
        price = COALESCE(VALUES(price), product_supplier_offers.price),
        link = COALESCE(VALUES(link), product_supplier_offers.link),
        updatedAt = GREATEST(VALUES(updatedAt), product_supplier_offers.updatedAt)
    `);
    return { affectedRows: Number((result as { affectedRows?: number }).affectedRows ?? 0) };
  }),

  rankSuppliers: protectedProcedure
    .input(z.object({ productId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
      const [rows] = await db.execute(sql`
        SELECT
          o.id AS offerId,
          o.supplierId,
          s.name AS supplierName,
          o.price AS regularPrice,
          o.promoPrice,
          o.stock,
          o.availability,
          o.updatedAt,
          sc.lastRunStatus AS scraperStatus,
          sc.productsScrapedCount,
          sc.productsMatchedCount
        FROM product_supplier_offers o
        JOIN suppliers s ON s.id = o.supplierId AND s.isActive = 'yes'
        LEFT JOIN scraper_configs sc ON sc.supplierId = o.supplierId AND sc.enabled = 'yes'
        WHERE o.productId = ${input.productId}
      `);
      const offers = asRows<Record<string, unknown>>(rows).map((row) => ({
        offerId: Number(row.offerId),
        supplierId: Number(row.supplierId),
        supplierName: String(row.supplierName ?? "Fornecedor"),
        regularPrice: row.regularPrice == null ? null : Number(row.regularPrice),
        promoPrice: row.promoPrice == null ? null : Number(row.promoPrice),
        stock: row.stock == null ? null : Number(row.stock),
        availability: row.availability == null ? null : String(row.availability),
        updatedAt: row.updatedAt == null ? null : String(row.updatedAt),
        scraperStatus: row.scraperStatus == null ? null : String(row.scraperStatus) as "success" | "failed" | "pending",
        productsScrapedCount: row.productsScrapedCount == null ? null : Number(row.productsScrapedCount),
        productsMatchedCount: row.productsMatchedCount == null ? null : Number(row.productsMatchedCount),
      }));
      return rankSupplierOffers(offers);
    }),

  listCertifications: protectedProcedure
    .input(z.object({ entityType: z.enum(["supplier", "portal"]).optional() }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const [rows] = input?.entityType
        ? await db.execute(sql`SELECT * FROM operational_certifications WHERE entityType = ${input.entityType} ORDER BY updatedAt DESC`)
        : await db.execute(sql`SELECT * FROM operational_certifications ORDER BY entityType, entityName`);
      return asRows<Record<string, unknown>>(rows).map((row) => ({
        ...row,
        id: Number(row.id),
        entityId: row.entityId == null ? null : Number(row.entityId),
        checklist: parseJson(row.checklist, []),
      }));
    }),

  saveCertification: editorProcedure
    .input(z.object({
      id: z.number().int().positive().optional(),
      entityType: z.enum(["supplier", "portal"]),
      entityId: z.number().int().positive().optional(),
      entityName: z.string().min(2).max(256),
      status: z.enum(["pending", "approved", "failed", "expired"]),
      checklist: certificationChecklistSchema,
      evidenceUrl: z.string().url().max(512).optional().or(z.literal("")),
      notes: z.string().max(8000).optional(),
      validUntil: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
      const checklist = JSON.stringify(input.checklist);
      const validUntil = dateOnly(input.validUntil);
      const testedBy = ctx.user.name ?? ctx.user.email ?? "sistema";
      if (input.id) {
        await db.execute(sql`
          UPDATE operational_certifications SET
            entityType = ${input.entityType}, entityId = ${input.entityId ?? null}, entityName = ${input.entityName},
            status = ${input.status}, checklist = ${checklist}, evidenceUrl = ${input.evidenceUrl || null},
            notes = ${input.notes ?? null}, validUntil = ${validUntil}, lastTestedAt = CURRENT_TIMESTAMP,
            testedBy = ${testedBy}
          WHERE id = ${input.id}
        `);
        return { id: input.id };
      }
      const [result] = await db.execute(sql`
        INSERT INTO operational_certifications
          (entityType, entityId, entityName, status, checklist, evidenceUrl, notes, validUntil, lastTestedAt, testedBy)
        VALUES
          (${input.entityType}, ${input.entityId ?? null}, ${input.entityName}, ${input.status}, ${checklist},
           ${input.evidenceUrl || null}, ${input.notes ?? null}, ${validUntil}, CURRENT_TIMESTAMP, ${testedBy})
        ON DUPLICATE KEY UPDATE
          entityId = VALUES(entityId), status = VALUES(status), checklist = VALUES(checklist),
          evidenceUrl = VALUES(evidenceUrl), notes = VALUES(notes), validUntil = VALUES(validUntil),
          lastTestedAt = CURRENT_TIMESTAMP, testedBy = VALUES(testedBy)
      `);
      return { id: Number((result as { insertId?: number }).insertId ?? 0) };
    }),

  listContracts: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const [rows] = await db.execute(sql`
      SELECT *,
        DATEDIFF(fimVigencia, CURRENT_DATE) AS daysToExpire
      FROM contract_lifecycle
      ORDER BY
        CASE status WHEN 'active' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END,
        fimVigencia ASC,
        updatedAt DESC
    `);
    return asRows<Record<string, unknown>>(rows).map((row) => ({
      ...row,
      id: Number(row.id),
      funilId: row.funilId == null ? null : Number(row.funilId),
      proposalId: row.proposalId == null ? null : Number(row.proposalId),
      valorContratado: Number(row.valorContratado ?? 0),
      saldoContratual: Number(row.saldoContratual ?? 0),
      daysToExpire: row.daysToExpire == null ? null : Number(row.daysToExpire),
      alerts: parseJson(row.alerts, []),
    }));
  }),

  contractDetail: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const [contractRows] = await db.execute(sql`SELECT * FROM contract_lifecycle WHERE id = ${input.id} LIMIT 1`);
      const contract = asRows<Record<string, unknown>>(contractRows)[0];
      if (!contract) return null;
      const [itemRows] = await db.execute(sql`SELECT * FROM contract_item_balances WHERE contractId = ${input.id} ORDER BY id`);
      return {
        ...contract,
        id: Number(contract.id),
        valorContratado: Number(contract.valorContratado ?? 0),
        saldoContratual: Number(contract.saldoContratual ?? 0),
        alerts: parseJson(contract.alerts, []),
        items: asRows<Record<string, unknown>>(itemRows).map((row) => ({
          ...row,
          id: Number(row.id),
          contractId: Number(row.contractId),
          quantityContracted: Number(row.quantityContracted ?? 0),
          quantityOrdered: Number(row.quantityOrdered ?? 0),
          quantityDelivered: Number(row.quantityDelivered ?? 0),
          quantityInvoiced: Number(row.quantityInvoiced ?? 0),
          unitPrice: Number(row.unitPrice ?? 0),
        })),
      };
    }),

  saveContract: editorProcedure
    .input(z.object({
      id: z.number().int().positive().optional(),
      funilId: z.number().int().positive().optional(),
      proposalId: z.number().int().positive().optional(),
      orgao: z.string().min(2).max(256),
      numeroContrato: z.string().min(1).max(128),
      objeto: z.string().max(20_000).optional(),
      valorContratado: z.number().nonnegative(),
      saldoContratual: z.number().nonnegative(),
      inicioVigencia: z.string().optional(),
      fimVigencia: z.string().optional(),
      dataBaseReajuste: z.string().optional(),
      indiceReajuste: z.string().max(64).optional(),
      garantiaVencimento: z.string().optional(),
      status: z.enum(["draft", "active", "suspended", "expired", "closed", "cancelled"]),
      alerts: z.array(z.string().max(512)).max(30).optional(),
      notes: z.string().max(20_000).optional(),
      items: z.array(contractItemSchema).max(500).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
      const alerts = JSON.stringify(input.alerts ?? []);
      const createdBy = ctx.user.name ?? ctx.user.email ?? "sistema";

      return db.transaction(async (tx) => {
        let contractId = input.id;
        if (contractId) {
          await tx.execute(sql`
            UPDATE contract_lifecycle SET
              funilId = ${input.funilId ?? null}, proposalId = ${input.proposalId ?? null}, orgao = ${input.orgao},
              numeroContrato = ${input.numeroContrato}, objeto = ${input.objeto ?? null}, valorContratado = ${input.valorContratado},
              saldoContratual = ${input.saldoContratual}, inicioVigencia = ${dateOnly(input.inicioVigencia)},
              fimVigencia = ${dateOnly(input.fimVigencia)}, dataBaseReajuste = ${dateOnly(input.dataBaseReajuste)},
              indiceReajuste = ${input.indiceReajuste ?? null}, garantiaVencimento = ${dateOnly(input.garantiaVencimento)},
              status = ${input.status}, alerts = ${alerts}, notes = ${input.notes ?? null}
            WHERE id = ${contractId}
          `);
        } else {
          const [result] = await tx.execute(sql`
            INSERT INTO contract_lifecycle
              (funilId, proposalId, orgao, numeroContrato, objeto, valorContratado, saldoContratual,
               inicioVigencia, fimVigencia, dataBaseReajuste, indiceReajuste, garantiaVencimento,
               status, alerts, notes, createdBy)
            VALUES
              (${input.funilId ?? null}, ${input.proposalId ?? null}, ${input.orgao}, ${input.numeroContrato},
               ${input.objeto ?? null}, ${input.valorContratado}, ${input.saldoContratual},
               ${dateOnly(input.inicioVigencia)}, ${dateOnly(input.fimVigencia)}, ${dateOnly(input.dataBaseReajuste)},
               ${input.indiceReajuste ?? null}, ${dateOnly(input.garantiaVencimento)}, ${input.status},
               ${alerts}, ${input.notes ?? null}, ${createdBy})
          `);
          contractId = Number((result as { insertId?: number }).insertId ?? 0);
        }

        if (!contractId) throw new Error("Falha ao identificar contrato salvo.");
        if (input.items) {
          await tx.execute(sql`DELETE FROM contract_item_balances WHERE contractId = ${contractId}`);
          for (const item of input.items) {
            await tx.execute(sql`
              INSERT INTO contract_item_balances
                (contractId, description, quantityContracted, quantityOrdered, quantityDelivered, quantityInvoiced, unitPrice)
              VALUES
                (${contractId}, ${item.description}, ${item.quantityContracted}, ${item.quantityOrdered},
                 ${item.quantityDelivered}, ${item.quantityInvoiced}, ${item.unitPrice})
            `);
          }
        }
        return { id: contractId };
      });
    }),

  evaluateOpportunity: editorProcedure
    .input(z.object({ opportunityId: z.number().int().positive(), metrics: executiveMetricsSchema }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
      const [rows] = await db.execute(sql`
        SELECT id, prazoEnvio, risco FROM funil_oportunidades WHERE id = ${input.opportunityId} LIMIT 1
      `);
      const opportunity = asRows<Record<string, unknown>>(rows)[0];
      if (!opportunity) throw new TRPCError({ code: "NOT_FOUND", message: "Oportunidade não encontrada." });

      const deadlineDays = input.metrics.deadlineDays ?? (() => {
        if (!opportunity.prazoEnvio) return 30;
        const target = new Date(String(opportunity.prazoEnvio));
        return Math.ceil((target.getTime() - Date.now()) / 86_400_000);
      })();
      const opportunityRisk = String(opportunity.risco ?? "medio");
      const operationalRisk = input.metrics.operationalRisk ?? (
        opportunityRisk === "alto" ? "high" : opportunityRisk === "baixo" ? "low" : "medium"
      );

      const result = evaluateExecutiveDecision({
        ...input.metrics,
        deadlineDays,
        operationalRisk: operationalRisk as RiskLevel,
        competitionLevel: input.metrics.competitionLevel as CompetitionLevel,
      });
      const metricsJson = JSON.stringify({ ...input.metrics, deadlineDays, operationalRisk });
      const blockersJson = JSON.stringify(result.blockers);
      const reasonsJson = JSON.stringify(result.reasons);
      const createdBy = ctx.user.name ?? ctx.user.email ?? "sistema";
      const [insert] = await db.execute(sql`
        INSERT INTO executive_assessments
          (opportunityId, score, recommendation, metrics, blockers, reasons, createdBy)
        VALUES
          (${input.opportunityId}, ${result.score}, ${result.recommendation}, ${metricsJson},
           ${blockersJson}, ${reasonsJson}, ${createdBy})
      `);
      return { ...result, assessmentId: Number((insert as { insertId?: number }).insertId ?? 0) };
    }),

  assessmentHistory: protectedProcedure
    .input(z.object({ opportunityId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const [rows] = await db.execute(sql`
        SELECT * FROM executive_assessments
        WHERE opportunityId = ${input.opportunityId}
        ORDER BY createdAt DESC
        LIMIT 50
      `);
      return asRows<Record<string, unknown>>(rows).map((row) => ({
        ...row,
        id: Number(row.id),
        opportunityId: Number(row.opportunityId),
        score: Number(row.score),
        metrics: parseJson(row.metrics, {}),
        blockers: parseJson(row.blockers, []),
        reasons: parseJson(row.reasons, []),
      }));
    }),
});
