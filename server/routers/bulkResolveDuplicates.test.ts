import { describe, expect, it, vi, beforeEach } from "vitest";

// Teste isolado da lógica de resolução em massa de duplicados (produtos):
// (a) apenas grupos com TODOS os membros na seleção são processados;
// (b) o mestre é escolhido pelo produto com mais dados preenchidos;
// (c) merge seguro é chamado por grupo.

import { registerRouter, callEndpoint } from "./__mockEndpoint";

vi.mock("../db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../db")>();
  return {
    ...actual,
    findDuplicateGroups: vi.fn(),
    mergeProductGroup: vi.fn(),
  };
});

vi.mock("../services/auditService", () => ({
  recordAudit: vi.fn(async () => {}),
}));

// Mock do tRPC: os procedimentos protegidos e de editor expõem o handler final
// para este teste unitário de lógica. O RBAC real de editor é coberto
// separadamente em productBulkRbac.test.ts; aqui não devemos enfraquecer a
// procedure só para manter o harness legado funcionando.
vi.mock("../_core/trpc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../_core/trpc")>();
  const mockProcedure = {
    input: (_schema: any) => ({
      mutation: (handler: any) => handler,
      query: (handler: any) => handler,
    }),
  };
  return {
    ...actual,
    protectedProcedure: mockProcedure,
    editorProcedure: mockProcedure,
    router: (defs: any) => registerRouter(defs),
  };
});

import "./productsGroup";

let db: any;

function makeGroup(groupId: number, members: Array<{ id: number; name: string; price: string | null; concentration: string | null }>) {
  return {
    groupId,
    reason: "name_similar" as const,
    similarity: 0.9,
    products: members.map((m) => ({
      ...m,
      activeIngredient: null,
      presentation: null,
      supplierId: 1,
      supplierName: "Fornecedor Teste",
      categoryId: null,
      categoryName: null,
      isActive: "yes" as const,
      imageUrl: null,
    })),
  };
}

describe("bulkResolveDuplicates (lógica)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    db = await import("../db");
    await import("./productsGroup");
  });

  it("processa somente grupos com todos os membros na seleção", async () => {
    db.findDuplicateGroups.mockResolvedValue([
      makeGroup(1, [{ id: 10, name: "A", price: "10", concentration: "500mg" }, { id: 11, name: "A 500mg", price: null, concentration: null }]),
      makeGroup(2, [{ id: 20, name: "B", price: null, concentration: null }, { id: 21, name: "B extra", price: null, concentration: null }]),
    ]);
    db.mergeProductGroup.mockResolvedValue({ merged: 1, redirected: 0 });

    const result = await callEndpoint("bulkResolveDuplicates", { ids: [10, 11, 99] });

    expect(result.groups).toBe(1);
    expect(db.findDuplicateGroups).toHaveBeenCalledOnce();
    expect(db.mergeProductGroup).toHaveBeenCalledOnce();
  });

  it("escolhe como mestre o produto com mais dados preenchidos", async () => {
    db.findDuplicateGroups.mockResolvedValue([
      makeGroup(1, [
        { id: 10, name: "X", price: null, concentration: null },
        { id: 11, name: "X 2", price: "10", concentration: "500mg" },
      ]),
    ]);
    db.mergeProductGroup.mockResolvedValue({ merged: 1, redirected: 0 });

    await callEndpoint("bulkResolveDuplicates", { ids: [10, 11] });

    expect(db.mergeProductGroup).toHaveBeenCalledWith(11, [10]);
  });

  it("ignora grupos com membro fora da seleção e retorna zero", async () => {
    db.findDuplicateGroups.mockResolvedValue([
      makeGroup(1, [{ id: 10, name: "A", price: null, concentration: null }, { id: 11, name: "A 2", price: null, concentration: null }]),
    ]);
    db.mergeProductGroup.mockResolvedValue({ merged: 1, redirected: 0 });

    const result = await callEndpoint("bulkResolveDuplicates", { ids: [10] });

    expect(result.groups).toBe(0);
    expect(result.merged).toBe(0);
    expect(db.mergeProductGroup).not.toHaveBeenCalled();
  });

  it("registra auditoria da operação", async () => {
    const { recordAudit } = await import("../services/auditService");
    db.findDuplicateGroups.mockResolvedValue([]);
    await callEndpoint("bulkResolveDuplicates", { ids: [1, 2, 3] }, { user: { id: 42 } });
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "product_bulk_resolve_duplicates", userId: 42 })
    );
  });
});
