import { parseStringPromise } from "xml2js";
import { parsePrecoBR } from "../utils/number";

export interface NfeProduct {
  id: string;
  productName: string;
  description?: string;
  ean?: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  unit?: string;
  ncm?: string;
}

export interface NfeData {
  nfeNumber: string;
  nfeDate: string;
  supplierName: string;
  supplierCnpj: string;
  products: NfeProduct[];
  totalValue: number;
  rawXml?: string;
}

export interface ParsedNfeProduct extends NfeProduct {
  matchStatus: "new" | "update" | "duplicate" | "unknown";
  masterId?: string;
  masterName?: string;
  confidence?: number;
}

function sanitizeXmlContent(xmlContent: string): string {
  const normalized = String(xmlContent ?? "")
    .replace(/^\uFEFF/, "")
    .replace(/^[\u0000-\u0008\u000B\u000C\u000E-\u001F]+/g, "")
    .trim();

  if (!normalized) {
    throw new Error("Conteúdo XML vazio");
  }

  const firstTagIndex = normalized.search(/<\?xml|<nfeProc|<NFe|<procNFe/i);
  if (firstTagIndex < 0) {
    throw new Error("Conteúdo XML inválido: nenhuma tag NF-e encontrada");
  }

  return normalized.slice(firstTagIndex).trim();
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = parsePrecoBR(String(value ?? ""));
  return parsed !== null ? parsed : fallback;
}

function cleanEan(value: unknown): string | undefined {
  const cleaned = String(value ?? "").trim();
  if (!cleaned || /^SEM\s+GTIN$/i.test(cleaned)) return undefined;
  return cleaned;
}

function getXmlNodeValue(node: Record<string, unknown>, key: string): string | undefined {
  const value = (node as Record<string, any>)[key];
  if (Array.isArray(value) && value.length > 0) {
    return String(value[0]);
  }
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  return undefined;
}

function buildStableProductId(prod: Record<string, unknown>, index: number) {
  const code = String(
    getXmlNodeValue(prod, "cProd") ??
      getXmlNodeValue(prod, "cEAN") ??
      getXmlNodeValue(prod, "xProd") ??
      `item-${index + 1}`,
  )
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);

  return `product-${index + 1}-${code || `item-${index + 1}`}`;
}

/**
 * Parse NFe XML and extract product information
 */
export async function parseNfeXml(xmlContent: string): Promise<NfeData> {
  try {
    const sanitizedXml = sanitizeXmlContent(xmlContent);
    const parsed = await parseStringPromise(sanitizedXml, {
      explicitArray: true,
      trim: true,
      normalizeTags: false,
      normalize: false,
    });

    const nfeProc = parsed.nfeProc || parsed.NFe || parsed.procNFe;
    if (!nfeProc) {
      throw new Error("Estrutura XML inválida: nfeProc ou NFe não encontrado");
    }

    const nfe = nfeProc.NFe?.[0] || nfeProc;
    const infNFe = nfe.infNFe?.[0] || nfe;

    const ide = infNFe.ide?.[0];
    const emit = infNFe.emit?.[0];
    const total = infNFe.total?.[0];

    if (!ide || !emit) {
      throw new Error("Dados obrigatórios da NFe não encontrados");
    }

    const nfeNumber = String(ide.nNF?.[0] || ide.cNF?.[0] || ide.dNF?.[0] || "DESCONHECIDO").trim();
    const nfeDate = String(ide.dhEmi?.[0] || ide.dEmi?.[0] || new Date().toISOString()).trim();
    const supplierName = String(emit.xNome?.[0] || emit.xFant?.[0] || "DESCONHECIDO").trim();
    const supplierCnpj = String(emit.CNPJ?.[0] || emit.CPF?.[0] || "DESCONHECIDO").replace(/\D/g, "");

    const details = infNFe.det || [];
    const products: NfeProduct[] = [];

    for (let i = 0; i < details.length; i++) {
      const det = details[i];
      const prod = det?.prod?.[0];

      if (!prod) continue;

      const productName = String(prod.xProd?.[0] || "Produto sem nome").trim();
      const quantity = toNumber(prod.qCom?.[0] || prod.qTrib?.[0], 0);
      const unitPrice = toNumber(prod.vUnCom?.[0] || prod.vUnTrib?.[0], 0);
      const informedTotal = toNumber(prod.vProd?.[0] || prod.vItem?.[0], 0);
      const totalPrice = informedTotal > 0 ? informedTotal : quantity * unitPrice;
      const unit = String(prod.uCom?.[0] || prod.uTrib?.[0] || "UN").trim();
      const ncm = prod.NCM?.[0] ? String(prod.NCM[0]).trim() : undefined;

      products.push({
        id: buildStableProductId(prod, i),
        productName,
        description: productName,
        ean: cleanEan(prod.cEAN?.[0] || prod.EAN?.[0] || prod.cEANTrib?.[0] || prod.EANTR?.[0]),
        quantity,
        unitPrice,
        totalPrice,
        unit,
        ncm,
      });
    }

    const totalValue = toNumber(total?.ICMSTot?.[0]?.vNF?.[0] || total?.vNF?.[0], products.reduce((sum, item) => sum + item.totalPrice, 0));

    return {
      nfeNumber,
      nfeDate,
      supplierName,
      supplierCnpj,
      products,
      totalValue,
      rawXml: sanitizedXml,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido ao parsear XML";
    throw new Error(`Erro ao parsear NFe XML: ${errorMessage}`);
  }
}

/**
 * Validate extracted NFe data
 */
export function validateNfeData(nfeData: NfeData): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!nfeData.nfeNumber || nfeData.nfeNumber === "DESCONHECIDO") {
    errors.push("Número da NFe não encontrado");
  }

  if (!nfeData.supplierName || nfeData.supplierName === "DESCONHECIDO") {
    errors.push("Nome do fornecedor não encontrado");
  }

  if (!nfeData.supplierCnpj || nfeData.supplierCnpj === "DESCONHECIDO") {
    errors.push("CNPJ do fornecedor não encontrado");
  }

  if (nfeData.products.length === 0) {
    errors.push("Nenhum produto encontrado na NFe");
  }

  for (const product of nfeData.products) {
    if (!product.productName) {
      errors.push(`Produto ${product.id}: nome não encontrado`);
    }
    if (product.quantity <= 0) {
      errors.push(`Produto ${product.productName}: quantidade inválida`);
    }
    if (product.unitPrice < 0) {
      errors.push(`Produto ${product.productName}: preço unitário inválido`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Extract product summary from NFe
 */
export function extractProductSummary(nfeData: NfeData): {
  totalProducts: number;
  totalQuantity: number;
  averagePrice: number;
  priceRange: { min: number; max: number };
} {
  const totalProducts = nfeData.products.length;
  const totalQuantity = nfeData.products.reduce((sum, p) => sum + p.quantity, 0);
  const totalPrice = nfeData.products.reduce((sum, p) => sum + p.totalPrice, 0);
  const averagePrice = totalQuantity > 0 ? totalPrice / totalQuantity : 0;

  const prices = nfeData.products.map((p) => p.unitPrice).filter((p) => p > 0);
  const priceRange = {
    min: prices.length > 0 ? Math.min(...prices) : 0,
    max: prices.length > 0 ? Math.max(...prices) : 0,
  };

  return {
    totalProducts,
    totalQuantity,
    averagePrice,
    priceRange,
  };
}

/**
 * Format NFe data for display
 */
export function formatNfeForDisplay(nfeData: NfeData): {
  nfeInfo: string;
  supplierInfo: string;
  productCount: string;
} {
  return {
    nfeInfo: `NFe #${nfeData.nfeNumber} - ${new Date(nfeData.nfeDate).toLocaleDateString("pt-BR")}`,
    supplierInfo: `${nfeData.supplierName} (CNPJ: ${nfeData.supplierCnpj})`,
    productCount: `${nfeData.products.length} produto(s) - Total: R$ ${nfeData.totalValue.toFixed(2)}`,
  };
}
