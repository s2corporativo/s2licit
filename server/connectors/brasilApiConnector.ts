import { safeFetch } from "../utils/safeFetch";

/**
 * Consulta de CNPJ na BrasilAPI (pública, gratuita).
 * https://brasilapi.com.br/docs#tag/CNPJ
 */

export interface CnpjInfo {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  situacao: string | null;
  uf: string | null;
  municipio: string | null;
  cnaePrincipal: string | null;
  email: string | null;
  telefone: string | null;
}

function sanitizeCnpj(cnpj: string): string {
  return cnpj.replace(/\D/g, "");
}

export async function consultarCnpj(cnpjRaw: string): Promise<CnpjInfo> {
  const cnpj = sanitizeCnpj(cnpjRaw);
  if (cnpj.length !== 14) {
    throw new Error("CNPJ inválido: informe 14 dígitos.");
  }

  const result = await safeFetch<any>(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
    timeoutMs: 15_000,
    maxRetries: 2,
    context: "brasilapi-cnpj",
  });

  if (!result.ok || !result.data) {
    throw new Error(result.error ?? `Falha ao consultar CNPJ (status ${result.status}).`);
  }

  const d = result.data;
  return {
    cnpj: d.cnpj ?? cnpj,
    razaoSocial: d.razao_social ?? "",
    nomeFantasia: d.nome_fantasia ?? null,
    situacao: d.descricao_situacao_cadastral ?? null,
    uf: d.uf ?? null,
    municipio: d.municipio ?? null,
    cnaePrincipal: d.cnae_fiscal_descricao ?? null,
    email: d.email ?? null,
    telefone: d.ddd_telefone_1 ?? null,
  };
}
