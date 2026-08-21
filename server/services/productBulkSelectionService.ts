import { jaroWinklerSimilarity } from "../matching/productMatcher";

export type ProductSelectionFilters = {
  search?: string;
  categoryId?: number;
  incomplete?: boolean;
  isActive?: "yes" | "no";
};

export type ProductIdPage = {
  items: Array<{ id: number }>;
  total: number;
};

export async function collectFilteredProductIds(
  fetchPage: (offset: number, limit: number) => Promise<ProductIdPage>,
  batchSize = 500,
): Promise<{ ids: number[]; total: number }> {
  const ids = new Set<number>();
  let offset = 0;
  let total = 0;

  for (;;) {
    const page = await fetchPage(offset, batchSize);
    total = Number(page.total ?? 0);
    for (const row of page.items) ids.add(row.id);
    offset += page.items.length;
    if (page.items.length === 0 || offset >= total) break;
  }

  return { ids: Array.from(ids), total };
}

export type DuplicatePlanProduct = {
  id: number;
  name: string;
  concentration: string | null;
  presentation: string | null;
  manufacturer: string | null;
  activeIngredient: string | null;
  price: string | null;
};

export type DuplicateSelectionGroup = {
  groupId: string;
  similarity: number;
  recommendedMasterId: number;
  products: Array<DuplicatePlanProduct & { selected: boolean }>;
};

export type DuplicateSelectionPlan = {
  actionable: DuplicateSelectionGroup[];
  skippedPartial: DuplicateSelectionGroup[];
};

function compactName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function blockingKeys(product: DuplicatePlanProduct): string[] {
  const compact = compactName(product.name);
  if (!compact) return [`id:${product.id}`];
  const keys = new Set<string>();
  keys.add(`p8:${compact.slice(0, Math.min(8, compact.length))}`);
  if (compact.length >= 12) keys.add(`p12:${compact.slice(0, 12)}`);
  return Array.from(keys);
}

function pairKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function similarity(a: DuplicatePlanProduct, b: DuplicatePlanProduct): number {
  const name = jaroWinklerSimilarity(a.name.toLowerCase().trim(), b.name.toLowerCase().trim());
  const concentration =
    !a.concentration && !b.concentration
      ? 1
      : a.concentration && b.concentration
        ? jaroWinklerSimilarity(a.concentration.toLowerCase().trim(), b.concentration.toLowerCase().trim())
        : 0;
  return name * 0.7 + concentration * 0.3;
}

function completeness(product: DuplicatePlanProduct): number {
  const values = [
    product.activeIngredient,
    product.concentration,
    product.presentation,
    product.manufacturer,
    product.price,
  ];
  return product.name.length + values.reduce((sum, value) => sum + (value ? 10 : 0), 0);
}

export function buildDuplicateSelectionPlan(
  allProducts: DuplicatePlanProduct[],
  selectedIds: number[],
  minSimilarity = 0.78,
): DuplicateSelectionPlan {
  const selected = new Set(selectedIds);
  const buckets = new Map<string, DuplicatePlanProduct[]>();
  for (const product of allProducts) {
    for (const key of blockingKeys(product)) {
      const bucket = buckets.get(key) ?? [];
      bucket.push(product);
      buckets.set(key, bucket);
    }
  }

  const pairs = new Map<string, [DuplicatePlanProduct, DuplicatePlanProduct]>();
  for (const bucket of buckets.values()) {
    for (let i = 0; i < bucket.length; i++) {
      for (let j = i + 1; j < bucket.length; j++) {
        const a = bucket[i];
        const b = bucket[j];
        const key = pairKey(a.id, b.id);
        if (!pairs.has(key)) pairs.set(key, [a, b]);
      }
    }
  }

  const adjacency = new Map<number, Array<{ product: DuplicatePlanProduct; score: number }>>();
  for (const [a, b] of pairs.values()) {
    const score = similarity(a, b);
    if (score < minSimilarity) continue;
    adjacency.set(a.id, [...(adjacency.get(a.id) ?? []), { product: b, score }]);
    adjacency.set(b.id, [...(adjacency.get(b.id) ?? []), { product: a, score }]);
  }

  const byId = new Map(allProducts.map((product) => [product.id, product]));
  const visited = new Set<number>();
  const actionable: DuplicateSelectionGroup[] = [];
  const skippedPartial: DuplicateSelectionGroup[] = [];

  for (const product of allProducts) {
    if (visited.has(product.id) || !adjacency.has(product.id)) continue;
    const queue = [product.id];
    const component = new Set<number>();
    while (queue.length) {
      const id = queue.shift()!;
      if (component.has(id)) continue;
      component.add(id);
      visited.add(id);
      for (const neighbor of adjacency.get(id) ?? []) {
        if (!component.has(neighbor.product.id)) queue.push(neighbor.product.id);
      }
    }
    if (component.size < 2) continue;

    const members = Array.from(component)
      .map((id) => byId.get(id))
      .filter((row): row is DuplicatePlanProduct => Boolean(row));
    const selectedCount = members.filter((row) => selected.has(row.id)).length;
    if (selectedCount === 0) continue;

    const recommendedMasterId = [...members].sort((a, b) => completeness(b) - completeness(a))[0].id;
    const scores: number[] = [];
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) scores.push(similarity(members[i], members[j]));
    }
    const avg = scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : 1;
    const group: DuplicateSelectionGroup = {
      groupId: `group_${members[0].id}`,
      similarity: avg,
      recommendedMasterId,
      products: members.map((row) => ({ ...row, selected: selected.has(row.id) })),
    };

    if (selectedCount === members.length && selectedCount >= 2) actionable.push(group);
    else skippedPartial.push(group);
  }

  return { actionable, skippedPartial };
}
