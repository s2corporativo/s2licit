import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Simula o retorno "thenable" do query builder do drizzle: pode ser
 * aguardado diretamente (`await db.select().from(x).where(y)`) ou seguido
 * de `.limit(n)` (`await db.select().from(x).where(y).limit(1)`).
 */
function queryResult(data: unknown[]) {
  const p = Promise.resolve(data) as Promise<unknown[]> & { limit: () => unknown };
  p.limit = () => queryResult(data);
  return p;
}

const mockWhere = vi.fn();
const mockFrom = vi.fn(() => ({ where: mockWhere }));
const mockSelect = vi.fn(() => ({ from: mockFrom }));

vi.mock("../db", () => ({
  getDb: vi.fn(async () => ({ select: mockSelect })),
}));

vi.mock("./scraperEngine", () => ({
  executarScraper: vi.fn(),
}));

vi.mock("../_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

vi.mock("./captureLogService", () => ({
  createCaptureLog: vi.fn(async () => 42),
  finalizeCaptureLog: vi.fn(async () => {}),
  logCaptureError: vi.fn(async () => {}),
  markErrorAsReprocessed: vi.fn(async () => {}),
}));

import { startCaptureForSupplier, reprocessFailedCaptures } from "./captureSchedulerService";
import { executarScraper } from "./scraperEngine";
import { finalizeCaptureLog, logCaptureError, markErrorAsReprocessed } from "./captureLogService";

const baseScraperResult = {
  supplierId: 1,
  supplierName: "Fornecedor X",
  durationMs: 100,
  log: [] as string[],
};

describe("captureSchedulerService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("startCaptureForSupplier", () => {
    it("retorna config_not_found e finaliza como failed quando não há scraper cadastrado", async () => {
      mockWhere.mockReturnValueOnce(queryResult([]));

      const result = await startCaptureForSupplier(1);

      expect(result).toEqual({ logId: 42, status: "config_not_found" });
      expect(executarScraper).not.toHaveBeenCalled();
      expect(finalizeCaptureLog).toHaveBeenCalledWith(
        42,
        expect.objectContaining({ totalProductsFound: 0 }),
        "failed",
        expect.stringContaining("Nenhum scraper configurado")
      );
    });

    it("roda o scraper real e finaliza como completed em caso de sucesso", async () => {
      mockWhere.mockReturnValueOnce(queryResult([{ id: 7 }]));
      vi.mocked(executarScraper).mockResolvedValueOnce({
        ...baseScraperResult,
        success: true,
        productsScraped: 10,
        productsMatched: 8,
        productsUpdated: 5,
        productsNew: 3,
        errors: [],
      });

      const result = await startCaptureForSupplier(1);

      expect(executarScraper).toHaveBeenCalledWith(7);
      expect(result.status).toBe("completed");
      expect(finalizeCaptureLog).toHaveBeenCalledWith(
        42,
        {
          totalPages: 0,
          totalProductsFound: 10,
          newProductsCreated: 3,
          productsUpdated: 5,
          productsWithErrors: 0,
          productsIgnored: 2,
        },
        "completed",
        undefined
      );
    });

    it("finaliza como failed e registra os erros quando o scraper falha", async () => {
      mockWhere.mockReturnValueOnce(queryResult([{ id: 7 }]));
      vi.mocked(executarScraper).mockResolvedValueOnce({
        ...baseScraperResult,
        success: false,
        productsScraped: 0,
        productsMatched: 0,
        productsUpdated: 0,
        productsNew: 0,
        errors: ["Falha no login"],
      });

      const result = await startCaptureForSupplier(1);

      expect(result.status).toBe("failed");
      expect(logCaptureError).toHaveBeenCalledWith(
        expect.objectContaining({
          supplierId: 1,
          errorMessage: "Falha no login",
          canReprocess: true,
        })
      );
    });
  });

  describe("reprocessFailedCaptures", () => {
    it("agrupa erros por fornecedor, recaptura e marca como reprocessado em caso de sucesso", async () => {
      // 1ª query: erros reprocessáveis (dois erros do mesmo fornecedor)
      mockWhere.mockReturnValueOnce(
        queryResult([
          { id: 100, supplierId: 5 },
          { id: 101, supplierId: 5 },
        ])
      );
      // 2ª query: histórico de capture_logs do fornecedor (sem falhas anteriores)
      mockWhere.mockReturnValueOnce(queryResult([]));
      // 3ª query: dentro de startCaptureForSupplier(5) -> scraperConfigs
      mockWhere.mockReturnValueOnce(queryResult([{ id: 9 }]));
      vi.mocked(executarScraper).mockResolvedValueOnce({
        ...baseScraperResult,
        supplierId: 5,
        success: true,
        productsScraped: 4,
        productsMatched: 4,
        productsUpdated: 4,
        productsNew: 0,
        errors: [],
      });

      const result = await reprocessFailedCaptures();

      expect(result.reprocessed).toBe(2);
      expect(result.failed).toBe(0);
      expect(markErrorAsReprocessed).toHaveBeenCalledWith(100);
      expect(markErrorAsReprocessed).toHaveBeenCalledWith(101);
    });

    it("não marca como reprocessado quando a recaptura falha", async () => {
      mockWhere.mockReturnValueOnce(queryResult([{ id: 200, supplierId: 6 }]));
      mockWhere.mockReturnValueOnce(queryResult([])); // histórico vazio -> não esgotou tentativas
      mockWhere.mockReturnValueOnce(queryResult([])); // sem scraper configurado -> config_not_found

      const result = await reprocessFailedCaptures();

      expect(result.reprocessed).toBe(0);
      expect(result.failed).toBe(1);
      expect(markErrorAsReprocessed).not.toHaveBeenCalled();
    });

    it("suspende o reprocessamento após maxRetries capturas consecutivas com falha, sem chamar o scraper de novo", async () => {
      mockWhere.mockReturnValueOnce(queryResult([{ id: 300, supplierId: 7 }]));
      // Histórico: 3 capturas recentes, todas "failed" (maxRetries padrão = 3)
      mockWhere.mockReturnValueOnce(
        queryResult([
          { status: "failed", startedAt: new Date("2026-01-03") },
          { status: "failed", startedAt: new Date("2026-01-02") },
          { status: "failed", startedAt: new Date("2026-01-01") },
        ])
      );

      const result = await reprocessFailedCaptures();

      expect(executarScraper).not.toHaveBeenCalled();
      expect(result.reprocessed).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.errors[0].error).toContain("Reprocessamento suspenso");
      expect(markErrorAsReprocessed).not.toHaveBeenCalled();
    });
  });
});
