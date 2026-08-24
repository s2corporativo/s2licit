import { describe, expect, it } from "vitest";
import {
  buildDuplicateSelectionPlan,
  collectFilteredProductIds,
  type DuplicatePlanProduct,
} from "./productBulkSelectionService";

describe("collectFilteredProductIds", () => {
  it("pagina até coletar todos os IDs sem truncar nos primeiros 500", async () => {
    const source = Array.from({ length: 1_203 }, (_, i) => ({ id: i + 1 }));
    const calls: Array<{ offset: number; limit: number }> = [];
    const result = await collectFilteredProductIds(async (offset, limit) => {
      calls.push({ offset, limit });
      return { items: source.slice(offset, offset + limit), total: source.length };
    });

    expect(result.total).toBe(1_203);
    expect(result.ids).toHaveLength(1_203);
    expect(result.ids[0]).toBe(1);
    expect(result.ids.at(-1)).toBe(1_203);
    expect(calls).toEqual([
      { offset: 0, limit: 500 },
      { offset: 500, limit: 500 },
      { offset: 1_000, limit: 500 },
    ]);
  });

  it("deduplica IDs defensivamente entre páginas", async () => {
    const pages = [
      { items: [{ id: 1 }, { id: 2 }], total: 4 },
      { items: [{ id: 2 }, { id: 3 }], total: 4 },
    ];
    let index = 0;
    const result = await collectFilteredProductIds(async () => pages[index++] ?? { items: [], total: 4 }, 2);
    expect(result.ids).toEqual([1, 2, 3]);
  });
});

function product(id: number, name: string, extra: Partial<DuplicatePlanProduct> = {}): DuplicatePlanProduct {
  return {
    id,
    name,
    concentration: "500mg",
    presentation: "caixa",
    manufacturer: "Lab",
    activeIngredient: "Ativo",
    price: "10.00",
    ...extra,
  };
}

describe("buildDuplicateSelectionPlan", () => {
  it("separa grupo totalmente selecionado de grupo parcial", () => {
    const catalog = [
      product(1, "Amoxicilina 500mg caixa 20"),
      product(2, "Amoxicilina 500mg caixa c 20"),
      product(3, "Cefalexina 500mg caixa 20"),
      product(4, "Cefalexina 500mg caixa c 20"),
      product(5, "Mesa escritório 120cm", { concentration: null, activeIngredient: null }),
    ];

    const plan = buildDuplicateSelectionPlan(catalog, [1, 2, 3], 0.78);
    expect(plan.actionable).toHaveLength(1);
    expect(plan.actionable[0].products.map((p) => p.id).sort()).toEqual([1, 2]);
    expect(plan.skippedPartial).toHaveLength(1);
    expect(plan.skippedPartial[0].products.map((p) => [p.id, p.selected])).toEqual([
      [3, true],
      [4, false],
    ]);
  });

  it("recomenda como mestre o cadastro mais completo", () => {
    const plan = buildDuplicateSelectionPlan([
      product(10, "Meloxicam 2% frasco 50ml", { manufacturer: null, activeIngredient: null, price: null }),
      product(11, "Meloxicam 2% frasco 50 ml"),
    ], [10, 11], 0.78);

    expect(plan.actionable).toHaveLength(1);
    expect(plan.actionable[0].recommendedMasterId).toBe(11);
  });
});
