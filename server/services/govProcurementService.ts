/**
 * govProcurementService.ts
 * Serviço de integração com múltiplas plataformas de compras governamentais
 * 
 * Plataformas suportadas:
 * - PNCP (Portal Nacional de Compras Públicas)
 * - Compras MG (Portal de Compras de Minas Gerais)
 * - Portal de Compras Públicas (web scraping)
 */

export interface PregoItem {
  id: string;
  platform: "pncp" | "compras-mg" | "portal-compras";
  description: string;
  quantity: number;
  unit: string;
  estimatedValue?: number;
  orgName?: string;
  processNumber?: string;
  editalUrl?: string;
  rawData?: Record<string, any>;
}

export interface PregoSearchResult {
  platform: "pncp" | "compras-mg" | "portal-compras";
  items: PregoItem[];
  totalFound: number;
  error?: string;
}

/**
 * Adapter para PNCP
 */
async function searchPNCPItems(
  cnpj: string,
  ano: number,
  sequencial: number
): Promise<PregoSearchResult> {
  try {
    const url = `https://pncp.gov.br/api/v1/orgaos/${cnpj}/compras/${ano}/${sequencial}/itens`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    const response = await fetch(url, {
      headers: {
        "Accept": "application/json",
      },
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        platform: "pncp",
        items: [],
        totalFound: 0,
        error: `PNCP API retornou ${response.status}`,
      };
    }

    const data = await response.json();
    const items = Array.isArray(data) ? data : data.itens || [];

    return {
      platform: "pncp",
      items: items.map((item: any, idx: number) => ({
        id: `pncp-${cnpj}-${ano}-${sequencial}-${idx}`,
        platform: "pncp" as const,
        description: item.descricao || item.description || "",
        quantity: item.quantidade || item.quantity || 1,
        unit: item.unidade || item.unit || "unidade",
        estimatedValue: item.valorEstimado || item.estimatedValue,
        processNumber: `${ano}/${sequencial}`,
        rawData: item,
      })),
      totalFound: items.length,
    };
  } catch (error) {
    console.error("Erro ao buscar itens no PNCP:", error);
    return {
      platform: "pncp",
      items: [],
      totalFound: 0,
      error: `Erro ao conectar ao PNCP: ${error instanceof Error ? error.message : "Desconhecido"}`,
    };
  }
}

/**
 * Adapter para Compras MG
 */
async function searchComprasMGItems(
  editalId: string
): Promise<PregoSearchResult> {
  try {
    // URL da API de Compras MG (baseado na documentação fornecida)
    const url = `https://api.compras.mg.gov.br/api/v1/editais/${editalId}/itens`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    const response = await fetch(url, {
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        platform: "compras-mg",
        items: [],
        totalFound: 0,
        error: `Compras MG API retornou ${response.status}`,
      };
    }

    const data = await response.json();
    const items = Array.isArray(data) ? data : data.items || data.itens || [];

    return {
      platform: "compras-mg",
      items: items.map((item: any, idx: number) => ({
        id: `compras-mg-${editalId}-${idx}`,
        platform: "compras-mg" as const,
        description: item.descricao || item.description || item.nome || "",
        quantity: item.quantidade || item.quantity || 1,
        unit: item.unidade || item.unit || "unidade",
        estimatedValue: item.valorEstimado || item.estimatedValue || item.valor,
        orgName: item.orgao || item.organization,
        editalUrl: `https://www.compras.mg.gov.br/portal/editais/${editalId}`,
        rawData: item,
      })),
      totalFound: items.length,
    };
  } catch (error) {
    console.error("Erro ao buscar itens em Compras MG:", error);
    return {
      platform: "compras-mg",
      items: [],
      totalFound: 0,
      error: `Erro ao conectar a Compras MG: ${error instanceof Error ? error.message : "Desconhecido"}`,
    };
  }
}

/**
 * Adapter para Portal de Compras Públicas com Web Scraping
 */
async function searchPortalComprasPublicasItems(
  processNumber: string
): Promise<PregoSearchResult> {
  try {
    // Web scraping do Portal de Compras Públicas removido
    const result = { items: [], totalFound: 0, error: "Funcionalidade removida" };

    return {
      platform: "portal-compras",
      items: result.items,
      totalFound: result.totalFound,
      error: result.error,
    };
  } catch (error) {
    console.error("Erro ao buscar itens em Portal de Compras Públicas:", error);
    return {
      platform: "portal-compras",
      items: [],
      totalFound: 0,
      error: `Erro ao conectar a Portal de Compras Públicas: ${error instanceof Error ? error.message : "Desconhecido"}`,
    };
  }
}

/**
 * Busca itens de pregão em múltiplas plataformas simultaneamente
 */
export async function searchPregoItemsMultiPlatform(
  params: {
    pncp?: { cnpj: string; ano: number; sequencial: number };
    comprasMG?: { editalId: string };
    portalCompras?: { processNumber: string };
  }
): Promise<PregoSearchResult[]> {
  const results: PregoSearchResult[] = [];

  // Buscar no PNCP
  if (params.pncp) {
    const pncpResult = await searchPNCPItems(
      params.pncp.cnpj,
      params.pncp.ano,
      params.pncp.sequencial
    );
    results.push(pncpResult);
  }

  // Buscar em Compras MG
  if (params.comprasMG) {
    const comprasMGResult = await searchComprasMGItems(params.comprasMG.editalId);
    results.push(comprasMGResult);
  }

  // Buscar em Portal de Compras Públicas
  if (params.portalCompras) {
    const portalResult = await searchPortalComprasPublicasItems(
      params.portalCompras.processNumber
    );
    results.push(portalResult);
  }

  return results;
}

/**
 * Consolida resultados de múltiplas plataformas
 */
export function consolidateResults(results: PregoSearchResult[]): {
  allItems: PregoItem[];
  byPlatform: Record<string, PregoItem[]>;
  totalFound: number;
  errors: string[];
} {
  const allItems: PregoItem[] = [];
  const byPlatform: Record<string, PregoItem[]> = {};
  const errors: string[] = [];

  for (const result of results) {
    byPlatform[result.platform] = result.items;
    allItems.push(...result.items);
    
    if (result.error) {
      errors.push(`${result.platform}: ${result.error}`);
    }
  }

  return {
    allItems,
    byPlatform,
    totalFound: allItems.length,
    errors,
  };
}

/**
 * Detecta plataforma a partir de identificadores
 */
export function detectPlatform(identifier: string): "pncp" | "compras-mg" | "portal-compras" | null {
  // PNCP: formato CNPJ/YYYY/NNNNNN
  if (/^\d{14}\/\d{4}\/\d{6}$/.test(identifier)) {
    return "pncp";
  }

  // Compras MG: ID numérico ou formato específico
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(identifier)) {
    return "compras-mg";
  }

  // Portal de Compras Públicas: formato de processo
  if (/^\d{4}\.\d{4}\/\d{4}-\d{2}$/.test(identifier)) {
    return "portal-compras";
  }

  return null;
}
