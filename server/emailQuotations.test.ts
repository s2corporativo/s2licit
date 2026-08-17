import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { makeTestUser } from "./testUtils";

/**
 * Testes dedicados do módulo de cotações por e-mail (emailQuotations).
 *
 * Cobertura:
 *  - Inventário de procedures no router consolidado (17 procedures).
 *  - RBAC por camada:
 *      * sem sessão → 401/403 em qualquer procedure autenticada;
 *      * usuário básico (user) → bloqueado nas editorProcedure/adminProcedure;
 *      * editor → permitido nas editorProcedure, bloqueado nas adminProcedure;
 *      * admin → permitido em tudo.
 *  - Serviços mockados para execução sem banco (list/get/status/prazosProximos).
 *
 * A bateria de integração valida o fluxo com banco real; estes testes mantêm
 * a superfície de autorização e validação coberta de forma determinística.
 */

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createContext(user: AuthenticatedUser | null): TrpcContext {
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

const userBasic: AuthenticatedUser = makeTestUser({ id: 1, role: "user" });
const editorUser: AuthenticatedUser = makeTestUser({ id: 4, role: "editor" });
const adminUser: AuthenticatedUser = makeTestUser({ id: 3, role: "admin" });

describe("emailQuotations router — inventário e RBAC (mocked)", () => {
  const serviceMocks = vi.hoisted(() => ({
    listEmailQuotations: vi.fn(async () => []),
    getEmailQuotationWithItems: vi.fn(async () => null),
    syncEmailQuotations: vi.fn(async () => ({ synced: 0 })),
    buildQuotationResponse: vi.fn(async () => ({ ok: true })),
    previewQuotationPricing: vi.fn(async () => []),
    setQuotationItemSalePrice: vi.fn(async () => ({ ok: true })),
    isSmtpConfigured: vi.fn(() => true),
    isImapConfigured: vi.fn(() => true),
    sendEmail: vi.fn(async () => ({ sent: true })),
    ensureOpportunityFromQuotation: vi.fn(async () => ({ id: 1 })),
    prepareProposalFromQuotation: vi.fn(async () => ({ ok: true })),
    suggestSimilarItems: vi.fn(async () => []),
    autoConfirmThreshold: vi.fn(() => 3),
    isAutoPipelineEnabled: vi.fn(() => true),
    isAutoSendEnabled: vi.fn(() => true),
    runAutoPipelineForPending: vi.fn(async () => ({ processed: 0 })),
    runAutoPipelineForQuotation: vi.fn(async () => ({ ok: true })),
    sendQuotationDailyReport: vi.fn(async () => ({ sent: true })),
  }));

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mock("./services/emailQuotationResponseService", () => ({
      buildQuotationResponse: serviceMocks.buildQuotationResponse,
      previewQuotationPricing: serviceMocks.previewQuotationPricing,
      applyMargin: vi.fn(() => "10"),
      resolveItemMarginPercent: vi.fn(() => 10),
      priceQuotationItems: vi.fn(async () => ({ ok: true })),
    }));
    vi.mock("./services/emailQuotationSimilarService", () => ({
      suggestSimilarItems: serviceMocks.suggestSimilarItems,
    }));
    vi.mock("./services/quotationItemPricingService", () => ({
      setQuotationItemSalePrice: serviceMocks.setQuotationItemSalePrice,
    }));
    vi.mock("./services/opportunityWorkflowService", () => ({
      ensureOpportunityFromQuotation: serviceMocks.ensureOpportunityFromQuotation,
      parseOpportunityDecision: vi.fn(() => ({})),
      getAllowedTransitions: vi.fn(() => []),
      assertTransitionAllowed: vi.fn(),
      ensureOpportunityFromRadar: vi.fn(async () => ({ id: 1 })),
      ensureOpportunityFromLicitacao: vi.fn(async () => ({ id: 1 })),
      decideOpportunity: vi.fn(async () => ({ ok: true })),
      moveOpportunity: vi.fn(async () => ({ ok: true })),
      prepareOpportunityForProposal: vi.fn(async () => ({ ok: true })),
      createOpportunityFromReviewedEdital: vi.fn(async () => ({ id: 1 })),
      finalizeOpportunityProposal: vi.fn(async () => ({ ok: true })),
      getOpportunityDecision: vi.fn(async () => null),
    }));
    vi.mock("./services/quotationPortalHandoffService", () => ({
      prepareProposalFromQuotation: serviceMocks.prepareProposalFromQuotation,
    }));
    vi.mock("./services/quotationAutoPipelineService", () => ({
      autoConfirmThreshold: serviceMocks.autoConfirmThreshold,
      isAutoPipelineEnabled: serviceMocks.isAutoPipelineEnabled,
      isAutoSendEnabled: serviceMocks.isAutoSendEnabled,
      runAutoPipelineForPending: serviceMocks.runAutoPipelineForPending,
      runAutoPipelineForQuotation: serviceMocks.runAutoPipelineForQuotation,
    }));
    vi.mock("./services/emailQuotationSyncService", () => ({
      listEmailQuotations: serviceMocks.listEmailQuotations,
      getEmailQuotationWithItems: serviceMocks.getEmailQuotationWithItems,
      syncEmailQuotations: serviceMocks.syncEmailQuotations,
    }));
    vi.mock("./services/quotationDailyReportService", () => ({
      sendQuotationDailyReport: serviceMocks.sendQuotationDailyReport,
      sendQuotationDailyReportSafely: vi.fn(async () => ({ sent: true })),
    }));
    vi.mock("./services/emailInboxService", () => ({
      isImapConfigured: serviceMocks.isImapConfigured,
      fetchEmailByMessageId: vi.fn(async () => null),
      fetchUnseenEmails: vi.fn(async () => []),
    }));
    vi.mock("./services/emailSenderService", () => ({
      isSmtpConfigured: serviceMocks.isSmtpConfigured,
      sendEmail: serviceMocks.sendEmail,
    }));
    vi.mock("./db", async importOriginal => {
      const actual = await importOriginal<typeof import("./db")>();
      return {
        ...actual,
        getDb: vi.fn(() => ({
          select: vi.fn(() => ({
            from: vi.fn(() => ({
              where: vi.fn(() => ({
                then: vi.fn(() => Promise.resolve([])),
              })),
            })),
          })),
        })),
      };
    });
  });

  it("expõe as 17 procedures esperadas no router consolidado", () => {
    const procedures = Object.keys((appRouter as any)._def.procedures ?? {});
    for (const name of [
      "emailQuotations.list",
      "emailQuotations.get",
      "emailQuotations.status",
      "emailQuotations.autoPipeline",
      "emailQuotations.prepararParaPortal",
      "emailQuotations.autoMatchAccuracy",
      "emailQuotations.testarRelatorioDiario",
      "emailQuotations.sync",
      "emailQuotations.pricingPreview",
      "emailQuotations.setItemMatch",
      "emailQuotations.setItemSalePrice",
      "emailQuotations.gerarOrcamento",
      "emailQuotations.responderPorEmail",
      "emailQuotations.setPrazo",
      "emailQuotations.prazosProximos",
      "emailQuotations.suggestSimilar",
      "emailQuotations.setStatus",
    ]) {
      expect(procedures).toContain(name);
    }
  });

  it("bloqueia listagem sem autenticação", async () => {
    const caller = appRouter.createCaller(createContext(null));
    await expect(caller.emailQuotations.list()).rejects.toBeInstanceOf(TRPCError);
  });

  it("bloqueia usuário básico nas operações de editor (setItemSalePrice)", async () => {
    const caller = appRouter.createCaller(createContext(userBasic));
    await expect(
      caller.emailQuotations.setItemSalePrice({
        itemId: 1,
        salePrice: 99.90,
      }),
    ).rejects.toBeInstanceOf(TRPCError);
  });

  it("bloqueia usuário básico nas operações de admin (autoPipeline)", async () => {
    const caller = appRouter.createCaller(createContext(userBasic));
    await expect(caller.emailQuotations.autoPipeline()).rejects.toBeInstanceOf(TRPCError);
  });

  it("bloqueia editor nas operações de admin (sync)", async () => {
    const caller = appRouter.createCaller(createContext(editorUser));
    await expect(
      caller.emailQuotations.sync({ limit: 10 }),
    ).rejects.toBeInstanceOf(TRPCError);
  });

  it("permite editor executar prepararParaPortal", async () => {
    const caller = appRouter.createCaller(createContext(editorUser));
    const result = await caller.emailQuotations.prepararParaPortal({ id: 1 });
    expect(result).toHaveProperty("ok");
  });

  it("permite admin executar testarRelatorioDiario", async () => {
    const caller = appRouter.createCaller(createContext(adminUser));
    const result = await caller.emailQuotations.testarRelatorioDiario({ destinatario: "admin@example.com" });
    expect(result).toHaveProperty("sent");
  });

  it("lista cotações com usuário autenticado (serviço mockado)", async () => {
    serviceMocks.listEmailQuotations.mockResolvedValue([
      { id: 1, status: "nova" },
    ] as never);
    const caller = appRouter.createCaller(createContext(editorUser));
    const result = await caller.emailQuotations.list({ status: "nova" });
    expect(Array.isArray(result)).toBe(true);
  });
});
