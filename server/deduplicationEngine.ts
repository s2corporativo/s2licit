import { resolveProductIdentity, type IdentityAction, type IdentityResult } from "./services/productIdentityService";

export type DuplicateAction = IdentityAction;
export interface DuplicateAnalysis extends IdentityResult {}

/**
 * Mantido por compatibilidade com testes/consumidores antigos. A busca real não
 * depende mais deste array: o ProductIdentityService prioriza identificadores
 * exatos e depois cria um conjunto pequeno de candidatos fuzzy.
 */
export function buildMatchFields(
  importedProduct: { name?: string; principioAtivo?: string; ean?: string },
  tipoCatalogo: string,
): Array<{ column: "activeIngredient" | "ean" | "name"; value: string }> {
  const fields: Array<{ column: "activeIngredient" | "ean" | "name"; value: string }> = [];
  if (tipoCatalogo === "medicamento_veterinario" || tipoCatalogo === "medicamento_humano") {
    if (importedProduct.principioAtivo) fields.push({ column: "activeIngredient", value: importedProduct.principioAtivo });
    if (importedProduct.ean) fields.push({ column: "ean", value: importedProduct.ean });
  } else {
    if (importedProduct.name) fields.push({ column: "name", value: importedProduct.name });
    if (importedProduct.ean) fields.push({ column: "ean", value: importedProduct.ean });
  }
  return fields;
}

/**
 * Fachada legada do motor de deduplicação. Todos os importadores passam agora
 * pelo mesmo resolvedor canônico usado pelo catálogo.
 */
export async function detectDuplicate(
  importedProduct: {
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
  },
  options?: { supplierId?: number },
): Promise<DuplicateAnalysis> {
  return resolveProductIdentity(importedProduct, options);
}
