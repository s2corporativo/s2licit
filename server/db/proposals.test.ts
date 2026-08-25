import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Testa a resolução de `supplierId` a partir de `supplierName` (Ressalva 4,
 * Módulo 06) em `addProposalItem`/`updateProposalItem`. `resolveSupplierIdByName`
 * não é exportada — cobrimos o efeito observável (valor de `supplierId`
 * persistido) através das funções públicas, mockando a camada de banco na
 * ordem exata em que cada função a consulta.
 *
 * Fila de respostas por ordem de chamada (não por tabela): mais simples e
 * robusto que rotear por identidade de tabela, já que `proposalItems` é
 * consultado mais de uma vez com projeções diferentes na mesma função.
 */
let selectQueue: unknown[][] = [];
function nextResult(): unknown[] {
  return selectQueue.length ? (selectQueue.shift() as unknown[]) : [];
}
function makeQueryBuilder(): any {
  const builder: any = {};
  builder.where = vi.fn(() => builder);
  builder.limit = vi.fn(() => builder);
  builder.orderBy = vi.fn(() => builder);
  builder.then = (resolve: (v: unknown[]) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(nextResult()).then(resolve, reject);
  return builder;
}

const mockFrom = vi.fn(() => makeQueryBuilder());
const mockSelect = vi.fn(() => ({ from: mockFrom }));
const insertedValues: any[] = [];
const mockInsert = vi.fn(() => ({
  values: vi.fn(async (vals: any) => {
    insertedValues.push(vals);
    return [{ insertId: 123 }];
  }),
}));
const updatedValues: any[] = [];
const mockUpdate = vi.fn(() => ({
  set: vi.fn((vals: any) => {
    updatedValues.push(vals);
    return { where: vi.fn(async () => undefined) };
  }),
}));

vi.mock("./_client", () => ({
  getDb: vi.fn(async () => ({ select: mockSelect, insert: mockInsert, update: mockUpdate })),
}));

import { addProposalItem, updateProposalItem } from "./proposals";

describe("addProposalItem — resolução de fornecedor por nome (Ressalva 4, Módulo 06)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectQueue = [];
    insertedValues.length = 0;
    updatedValues.length = 0;
  });

  it("resolve supplierId por casamento exato de nome quando não informado", async () => {
    selectQueue = [
      [{ max: 0 }],       // MAX(itemNumber)
      [{ id: 42 }],        // resolveSupplierIdByName encontra o fornecedor
      [{ total: 0 }],      // recalcProposalTotal
    ];

    await addProposalItem({ proposalId: 1, supplierName: "Fornecedor Exemplo Ltda" } as any);

    expect(insertedValues).toHaveLength(1);
    expect(insertedValues[0]).toMatchObject({ supplierId: 42, supplierName: "Fornecedor Exemplo Ltda" });
  });

  it("mantém supplierId nulo quando o nome não casa com nenhum fornecedor cadastrado", async () => {
    selectQueue = [
      [{ max: 0 }],
      [],                   // nenhum fornecedor casado por nome
      [{ total: 0 }],
    ];

    await addProposalItem({ proposalId: 1, supplierName: "Nome Sem Correspondência" } as any);

    expect(insertedValues[0]).toMatchObject({ supplierId: null });
  });

  it("respeita supplierId explícito sem consultar por nome", async () => {
    selectQueue = [
      [{ max: 0 }],   // MAX(itemNumber)
      [{ total: 0 }], // recalcProposalTotal — sem consulta de fornecedor, pois supplierId já veio definido
    ];

    await addProposalItem({ proposalId: 1, supplierId: 7, supplierName: "Qualquer Nome" } as any);

    expect(insertedValues[0]).toMatchObject({ supplierId: 7 });
  });

  it("não quebra a criação do item quando não há supplierName (institucional/sem fornecedor)", async () => {
    selectQueue = [
      [{ max: 0 }],
      [{ total: 0 }],
    ];

    await expect(addProposalItem({ proposalId: 1 } as any)).resolves.toBeDefined();
    expect(insertedValues[0]).toMatchObject({ supplierId: null });
  });
});

describe("updateProposalItem — resolução de fornecedor por nome ao editar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectQueue = [];
    insertedValues.length = 0;
    updatedValues.length = 0;
  });

  it("resolve supplierId quando supplierName muda e supplierId não foi informado", async () => {
    selectQueue = [
      [{ id: 55 }],           // resolveSupplierIdByName
      [{ proposalId: 1 }],    // busca proposalId para recalc
      [{ total: 0 }],         // recalcProposalTotal
    ];

    await updateProposalItem(10, { supplierName: "Novo Fornecedor" } as any);

    // updatedValues[0] é o update do próprio item; updatedValues[1] é o
    // totalValue recalculado em `proposals` (mesma chamada de update mockada).
    expect(updatedValues[0]).toMatchObject({ supplierId: 55, supplierName: "Novo Fornecedor" });
  });

  it("não sobrescreve supplierId quando ele é informado explicitamente junto do nome", async () => {
    selectQueue = [
      [{ proposalId: 1 }],
      [{ total: 0 }],
    ];

    await updateProposalItem(10, { supplierName: "Outro Nome", supplierId: 8 } as any);

    expect(updatedValues[0]).toMatchObject({ supplierId: 8 });
  });
});
