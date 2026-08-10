import { and, eq, like, or } from "drizzle-orm";
import { productSupplierOffers, products } from "../../drizzle/schema";
import { getDb } from "../db";
import { escapeLike } from "../db/_helpers";
import { combinedStringSimilarity, normalizeText } from "../matching/productMatcher";

export type IdentityAction = "criar_novo" | "atualizar_existente" | "novo_fornecedor" | "atualizar_preco" | "revisar_manual";

export type IdentityInput = {
  name: string;
  principioAtivo?: string;
  concentracao?: string;
  formaFarmaceutica?: string;
  fabricante?: string;
  categoria?: string;
  fichaTecnica?: string;
  tipoCatalogo?: string;
  ean?: string;
  gtin?: string;
  barcode?: string;
  mapa?: string;
  catmatCode?: string;
  catmasCode?: string;
  supplierId?: number;
};

export type IdentityResult = {
  action: IdentityAction;
  matchedProductId?: number;
  confidence: number;
  reason: string;
  suggestedMerge?: Array<{ productId: number; name: string; similarity: number }>;
  matchKey?: string;
};

function digits(value?: string | null) {
  const normalized = (value ?? "").replace(/\D/g, "");
  return normalized || null;
}

function normalized(value?: string | null) {
  return normalizeText(value ?? "");
}

function concentrationCompatible(a?: string | null, b?: string | null) {
  const left = normalized(a).replace(",", ".");
  const right = normalized(b).replace(",", ".");
  if (!left || !right) return null;
  if (left === right) return 1;
  const parse = (value: string) => {
    const match = value.match(/([0-9]+(?:\.[0-9]+)?)\s*([a-z%]+(?:\/[a-z%]+)?)/i);
    return match ? { value: Number(match[1]), unit: match[2] } : null;
  };
  const p1 = parse(left);
  const p2 = parse(right);
  if (!p1 || !p2) return combinedStringSimilarity(left, right);
  if (p1.unit !== p2.unit) return 0;
  if (p1.value === 0) return p2.value === 0 ? 1 : 0;
  const delta = Math.abs(p1.value - p2.value) / p1.value;
  return delta <= 0.02 ? 1 : delta <= 0.05 ? 0.7 : 0;
}

function identityScore(input: IdentityInput, candidate: any) {
  const inputEan = digits(input.ean || input.gtin || input.barcode);
  const candidateIds = [candidate.ean, candidate.gtin, candidate.barcode]
    .map(digits)
    .filter(Boolean);
  if (inputEan && candidateIds.includes(inputEan)) return { score: 100, key: "EAN/GTIN" };
  if (input.mapa && candidate.mapa && normalized(input.mapa) === normalized(candidate.mapa)) {
    return { score: 100, key: "MAPA/ANVISA" };
  }
  if (input.catmatCode && candidate.catmatCode && normalized(input.catmatCode) === normalized(candidate.catmatCode)) {
    return { score: 100, key: "CATMAT" };
  }
  if (input.catmasCode && candidate.catmasCode && normalized(input.catmasCode) === normalized(candidate.catmasCode)) {
    return { score: 100, key: "CATMAS" };
  }

  let earned = 0;
  let possible = 0;
  const add = (weight: number, score: number | null) => {
    if (score === null) return;
    possible += weight;
    earned += weight * Math.max(0, Math.min(1, score));
  };

  add(35, combinedStringSimilarity(input.name, candidate.name));
  add(
    30,
    input.principioAtivo && candidate.activeIngredient
      ? combinedStringSimilarity(input.principioAtivo, candidate.activeIngredient)
      : null,
  );
  add(20, concentrationCompatible(input.concentracao, candidate.concentration));
  add(
    10,
    input.formaFarmaceutica && (candidate.pharmaceuticalForm || candidate.presentation)
      ? combinedStringSimilarity(input.formaFarmaceutica, candidate.pharmaceuticalForm || candidate.presentation)
      : null,
  );
  add(
    5,
    input.fabricante && (candidate.manufacturer || candidate.laboratorio)
      ? combinedStringSimilarity(input.fabricante, candidate.manufacturer || candidate.laboratorio)
      : null,
  );

  return {
    score: possible ? Math.round((earned / possible) * 100) : 0,
    key: "multi_campo",
  };
}

/**
 * Identidade do produto é global no catálogo. O fornecedor NÃO restringe a
 * busca: ele é uma dimensão comercial da oferta e nunca parte da identidade
 * canônica. Isso evita criar dois produtos idênticos só porque vieram de
 * fornecedores diferentes.
 */
async function findCandidates(input: IdentityInput) {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [eq(products.isActive, "yes")];

  const exact: any[] = [];
  const ean = (input.ean || input.gtin || input.barcode)?.trim();
  if (ean) {
    exact.push(or(eq(products.ean, ean), eq(products.gtin, ean), eq(products.barcode, ean)));
  }
  if (input.mapa?.trim()) exact.push(eq(products.mapa, input.mapa.trim()));
  if (input.catmatCode?.trim()) exact.push(eq(products.catmatCode, input.catmatCode.trim()));
  if (input.catmasCode?.trim()) exact.push(eq(products.catmasCode, input.catmasCode.trim()));

  if (exact.length) {
    const rows = await db.select().from(products).where(and(...conditions, or(...exact))).limit(50);
    if (rows.length) return rows;
  }

  const fuzzy: any[] = [];
  if (input.principioAtivo?.trim()) {
    fuzzy.push(like(products.activeIngredient, `%${escapeLike(input.principioAtivo.trim())}%`));
  }
  const firstToken = normalized(input.name).split(" ").find((token) => token.length >= 3);
  if (firstToken) fuzzy.push(like(products.name, `%${escapeLike(firstToken)}%`));
  if (input.fabricante?.trim()) {
    fuzzy.push(like(products.manufacturer, `%${escapeLike(input.fabricante.trim())}%`));
  }

  if (!fuzzy.length) return [];
  return db.select().from(products).where(and(...conditions, or(...fuzzy))).limit(120);
}

export async function resolveProductIdentity(
  input: IdentityInput,
  _options?: { supplierId?: number },
): Promise<IdentityResult> {
  const db = await getDb();
  if (!db) return { action: "criar_novo", confidence: 0, reason: "Banco indisponível" };

  const candidates = await findCandidates(input);
  if (!candidates.length) {
    return {
      action: "criar_novo",
      confidence: 100,
      reason: "Nenhum produto canônico compatível encontrado",
    };
  }

  const scored = candidates
    .map((candidate) => ({ candidate, ...identityScore(input, candidate) }))
    .sort((a, b) => b.score - a.score);
  const best = scored[0];

  if (best.score >= 95) {
    if (input.supplierId) {
      const existingOffer = await db
        .select({ id: productSupplierOffers.id })
        .from(productSupplierOffers)
        .where(
          and(
            eq(productSupplierOffers.productId, best.candidate.id),
            eq(productSupplierOffers.supplierId, input.supplierId),
          ),
        )
        .limit(1);
      return {
        action: existingOffer.length ? "atualizar_preco" : "novo_fornecedor",
        matchedProductId: best.candidate.id,
        confidence: best.score,
        reason: existingOffer.length
          ? "Produto canônico e oferta do fornecedor já existem; atualizar oferta"
          : "Produto canônico existe; vincular oferta do novo fornecedor",
        matchKey: best.key,
      };
    }

    return {
      action: "atualizar_existente",
      matchedProductId: best.candidate.id,
      confidence: best.score,
      reason: `Produto canônico identificado por ${best.key}`,
      matchKey: best.key,
    };
  }

  if (best.score >= 70) {
    return {
      action: "revisar_manual",
      matchedProductId: best.candidate.id,
      confidence: best.score,
      reason: `Possível identidade com ${best.score}% de compatibilidade; requer revisão`,
      suggestedMerge: scored
        .filter((item) => item.score >= 70)
        .slice(0, 10)
        .map((item) => ({
          productId: item.candidate.id,
          name: item.candidate.name,
          similarity: item.score,
        })),
      matchKey: best.key,
    };
  }

  return {
    action: "criar_novo",
    confidence: Math.max(1, 100 - best.score),
    reason: "Nenhuma identidade suficientemente compatível",
  };
}
