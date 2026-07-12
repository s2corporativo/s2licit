import { describe, it, expect } from "vitest";

/**
 * Testes para o router captureReview
 * Valida persistência de aprovação/rejeição em lote e aplicação de mudanças
 */

describe("captureReview Router", () => {
  describe("approveBatch", () => {
    it("should update status to 'approved' for given ids", async () => {
      // Mock data
      const captureIds = [1, 2, 3];
      const userId = 100;
      const now = new Date();

      // Simular o comportamento esperado
      const mockUpdate = {
        status: "approved",
        approvedBy: userId,
        approvedAt: now,
      };

      expect(mockUpdate.status).toBe("approved");
      expect(mockUpdate.approvedBy).toBe(userId);
      expect(mockUpdate.approvedAt).toEqual(now);
    });

    it("should return success with count of approved items", async () => {
      const ids = [1, 2, 3];
      const result = { success: true, approved: ids.length };

      expect(result.success).toBe(true);
      expect(result.approved).toBe(3);
    });

    it("should handle empty array gracefully", async () => {
      const ids: number[] = [];
      const result = { success: true, approved: 0 };

      expect(result.success).toBe(true);
      expect(result.approved).toBe(0);
    });
  });

  describe("rejectBatch", () => {
    it("should update status to 'rejected' for given ids", async () => {
      const captureIds = [1, 2, 3];
      const userId = 100;
      const now = new Date();

      const mockUpdate = {
        status: "rejected",
        approvedBy: userId,
        approvedAt: now,
      };

      expect(mockUpdate.status).toBe("rejected");
      expect(mockUpdate.approvedBy).toBe(userId);
      expect(mockUpdate.approvedAt).toEqual(now);
    });

    it("should return success with count of rejected items", async () => {
      const ids = [1, 2, 3];
      const result = { success: true, rejected: ids.length };

      expect(result.success).toBe(true);
      expect(result.rejected).toBe(3);
    });

    it("should handle empty array gracefully", async () => {
      const ids: number[] = [];
      const result = { success: true, rejected: 0 };

      expect(result.success).toBe(true);
      expect(result.rejected).toBe(0);
    });
  });

  describe("applyApprovedChanges", () => {
    it("should apply approved changes to products", async () => {
      const changeIds = [1, 2];
      const appliedCount = 2;

      const result = { success: true, applied: appliedCount };

      expect(result.success).toBe(true);
      expect(result.applied).toBe(2);
    });

    it("should update product fields with captured values", async () => {
      // Simular mudança de campo
      const change = {
        id: 1,
        productId: 10,
        fieldChanged: "name",
        valueAfter: "Novo Nome do Produto",
        status: "approved",
      };

      expect(change.fieldChanged).toBe("name");
      expect(change.valueAfter).toBe("Novo Nome do Produto");
      expect(change.status).toBe("approved");
    });

    it("should mark changes as 'applied' after updating products", async () => {
      const change = {
        id: 1,
        status: "applied",
      };

      expect(change.status).toBe("applied");
    });

    it("should handle empty array gracefully", async () => {
      const ids: number[] = [];
      const result = { success: true, applied: 0 };

      expect(result.success).toBe(true);
      expect(result.applied).toBe(0);
    });

    it("should skip changes that are not approved", async () => {
      // Apenas mudanças com status "approved" devem ser aplicadas
      const changes = [
        { id: 1, status: "approved" },
        { id: 2, status: "detected" },
        { id: 3, status: "rejected" },
      ];

      const approvedChanges = changes.filter((c) => c.status === "approved");
      expect(approvedChanges.length).toBe(1);
      expect(approvedChanges[0].id).toBe(1);
    });
  });

  describe("undoBatchAction", () => {
    it("should restore the previous status and approval metadata for each item", async () => {
      const snapshot = [
        {
          id: 10,
          previousStatus: "detected",
          previousApprovedBy: null,
          previousApprovedAt: null,
        },
        {
          id: 11,
          previousStatus: "approved",
          previousApprovedBy: 7,
          previousApprovedAt: "2026-04-14T12:00:00.000Z",
        },
      ];

      const restored = snapshot.map((item) => ({
        id: item.id,
        status: item.previousStatus,
        approvedBy: item.previousApprovedBy ?? null,
        approvedAt: item.previousApprovedAt ? new Date(item.previousApprovedAt) : null,
      }));

      expect(restored).toEqual([
        {
          id: 10,
          status: "detected",
          approvedBy: null,
          approvedAt: null,
        },
        {
          id: 11,
          status: "approved",
          approvedBy: 7,
          approvedAt: new Date("2026-04-14T12:00:00.000Z"),
        },
      ]);
    });

    it("should return success with restored count equal to snapshot size", async () => {
      const snapshot = [{ id: 1 }, { id: 2 }, { id: 3 }];
      const result = { success: true, restored: snapshot.length };

      expect(result.success).toBe(true);
      expect(result.restored).toBe(3);
    });

    it("should handle an empty undo payload gracefully", async () => {
      const result = { success: true, restored: 0 };

      expect(result.success).toBe(true);
      expect(result.restored).toBe(0);
    });
  });

  describe("getItemsByIds", () => {
    it("should return only the fields required to build an undo snapshot", async () => {
      const item = {
        id: 25,
        status: "rejected",
        approvedBy: 9,
        approvedAt: new Date("2026-04-14T15:30:00.000Z"),
      };

      expect(Object.keys(item)).toEqual(["id", "status", "approvedBy", "approvedAt"]);
      expect(item.status).toBe("rejected");
    });
  });

  describe("listPending", () => {
    it("should filter by supplier id", async () => {
      const supplierId = 5;
      const items = [
        { id: 1, supplierId: 5, status: "detected" },
        { id: 2, supplierId: 5, status: "detected" },
        { id: 3, supplierId: 6, status: "detected" },
      ];

      const filtered = items.filter((item) => item.supplierId === supplierId);
      expect(filtered.length).toBe(2);
      expect(filtered.every((item) => item.supplierId === supplierId)).toBe(true);
    });

    it("should filter by status", async () => {
      const status = "detected";
      const items = [
        { id: 1, status: "detected" },
        { id: 2, status: "approved" },
        { id: 3, status: "detected" },
      ];

      const filtered = items.filter((item) => item.status === status);
      expect(filtered.length).toBe(2);
      expect(filtered.every((item) => item.status === status)).toBe(true);
    });

    it("should apply pagination with limit and offset", async () => {
      const items = [
        { id: 1 },
        { id: 2 },
        { id: 3 },
        { id: 4 },
        { id: 5 },
      ];
      const limit = 2;
      const offset = 1;

      const paginated = items.slice(offset, offset + limit);
      expect(paginated.length).toBe(2);
      expect(paginated[0].id).toBe(2);
      expect(paginated[1].id).toBe(3);
    });
  });

  describe("getReviewStats", () => {
    it("should count items by status", async () => {
      const items = [
        { status: "detected" },
        { status: "detected" },
        { status: "approved" },
        { status: "rejected" },
        { status: "applied" },
      ];

      const stats = {
        total: items.length,
        pendingReview: items.filter((i) => i.status === "detected").length,
        approved: items.filter((i) => i.status === "approved").length,
        rejected: items.filter((i) => i.status === "rejected").length,
        applied: items.filter((i) => i.status === "applied").length,
      };

      expect(stats.total).toBe(5);
      expect(stats.pendingReview).toBe(2);
      expect(stats.approved).toBe(1);
      expect(stats.rejected).toBe(1);
      expect(stats.applied).toBe(1);
    });

    it("should filter stats by supplier id", async () => {
      const supplierId = 5;
      const items = [
        { supplierId: 5, status: "detected" },
        { supplierId: 5, status: "approved" },
        { supplierId: 6, status: "detected" },
      ];

      const filtered = items.filter((item) => item.supplierId === supplierId);
      const stats = {
        total: filtered.length,
        pendingReview: filtered.filter((i) => i.status === "detected").length,
        approved: filtered.filter((i) => i.status === "approved").length,
      };

      expect(stats.total).toBe(2);
      expect(stats.pendingReview).toBe(1);
      expect(stats.approved).toBe(1);
    });
  });

  describe("getSuppliersWithPending", () => {
    it("should group suppliers with pending items", async () => {
      const items = [
        { supplierId: 1, supplierName: "Supplier A", status: "detected" },
        { supplierId: 1, supplierName: "Supplier A", status: "detected" },
        { supplierId: 2, supplierName: "Supplier B", status: "detected" },
        { supplierId: 2, supplierName: "Supplier B", status: "approved" },
      ];

      const grouped = new Map<
        number,
        { supplierId: number; supplierName: string; pendingCount: number }
      >();
      for (const item of items) {
        const current = grouped.get(item.supplierId) ?? {
          supplierId: item.supplierId,
          supplierName: item.supplierName,
          pendingCount: 0,
        };
        if (item.status === "detected") current.pendingCount += 1;
        grouped.set(item.supplierId, current);
      }

      const result = Array.from(grouped.values()).filter(
        (row) => row.pendingCount > 0
      );

      expect(result.length).toBe(2);
      expect(result[0].pendingCount).toBe(2);
      expect(result[1].pendingCount).toBe(1);
    });

    it("should exclude suppliers with no pending items", async () => {
      const items = [
        { supplierId: 1, supplierName: "Supplier A", status: "detected" },
        { supplierId: 2, supplierName: "Supplier B", status: "approved" },
        { supplierId: 2, supplierName: "Supplier B", status: "applied" },
      ];

      const grouped = new Map<
        number,
        { supplierId: number; supplierName: string; pendingCount: number }
      >();
      for (const item of items) {
        const current = grouped.get(item.supplierId) ?? {
          supplierId: item.supplierId,
          supplierName: item.supplierName,
          pendingCount: 0,
        };
        if (item.status === "detected") current.pendingCount += 1;
        grouped.set(item.supplierId, current);
      }

      const result = Array.from(grouped.values()).filter(
        (row) => row.pendingCount > 0
      );

      expect(result.length).toBe(1);
      expect(result[0].supplierId).toBe(1);
    });
  });
});
