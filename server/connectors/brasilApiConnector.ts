import { z } from "zod";
import { externalHttpRequest } from "../integrations/core/externalHttpClient";
import { IntegrationError } from "../integrations/core/integrationError";

/** Consulta pública de CNPJ na BrasilAPI. */
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

const BrasilApiCnpjSchema = z.object({
  cnpj: z.union([z.string(), z.number()]).optional(),
  razao_social: z.string().optional().nullable(),
  nome_fantasia: z.string().optional().nullable(),
  descricao_situacao_cadastral: z.string().optional().nullable(),
  uf: z.string().optional().nullable(),
  municipio: z.string().optional().nullable(),
  cnae_fiscal_descricao: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  ddd_telefone_1: z.union([z.string(), z.number()]).optional().nullable(),
}).passthrough();

function sanitizeCnpj(cnpj: string): string {
  return cnpj.replace(/\D/g, "");
}

export async function consultarCnpj(cnpjRaw: string): Promise<CnpjInfo> {
  const cnpj = sanitizeCnpj(cnpjRaw);
  if (cnpj.length !== 14) throw new Error("CNPJ inválido: informe 14 dígitos.");

  const response = await externalHttpRequest<unknown>({
    source: "brasilapi",
    operation: "cnpj.lookup",
    url: `https://brasilapi.com.br/api/cnpj/v1/${cnpj}`,
    expected: "json",
    timeoutMs: 15_000,
    maxRetries: 2,
  });
  if (!response.ok || !response.data) {
    throw new Error(
      response.error?.message ?? `Falha ao consultar CNPJ (status ${response.statusCode}).`,
    );
  }

  const parsed = BrasilApiCnpjSchema.safeParse(response.data);
  if (!parsed.success) {
    throw new IntegrationError("BrasilAPI alterou o contrato esperado da consulta de CNPJ.", {
      type: "CONTRACT",
      code: "BRASILAPI_CNPJ_SCHEMA",
      cause: parsed.error,
    });
  }
  const data = parsed.data;
  return {
    cnpj: data.cnpj != null ? String(data.cnpj) : cnpj,
    razaoSocial: data.razao_social ?? "",
    nomeFantasia: data.nome_fantasia ?? null,
    situacao: data.descricao_situacao_cadastral ?? null,
    uf: data.uf ?? null,
    municipio: data.municipio ?? null,
    cnaePrincipal: data.cnae_fiscal_descricao ?? null,
    email: data.email ?? null,
    telefone: data.ddd_telefone_1 != null ? String(data.ddd_telefone_1) : null,
  };
}
