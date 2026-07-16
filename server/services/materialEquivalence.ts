/**
 * materialEquivalence.ts
 *
 * Equivalência técnica de materiais e equipamentos (spec §6). Compara atributos
 * como composição/material, dimensões, capacidade, potência, desempenho, modelo,
 * compatibilidade, certificação, norma e garantia — com justificativa objetiva.
 *
 * Regras da spec:
 *  - não considerar equivalente só pela semelhança do nome;
 *  - toda equivalência tem justificativa técnica;
 *  - atributo CRÍTICO divergente impede uso automático (§6, regra dos 75%).
 *
 * Puro e testável; usa a classificação canônica (matchClassification).
 */

import { classificarCompatibilidade, type ClassificacaoCompatibilidade } from "./matchClassification";

export interface AtributoMaterial {
  nome: string;
  solicitado?: string | number | null;
  ofertado?: string | number | null;
  /** Tolerância percentual para atributos numéricos (ex.: dimensões). */
  toleranciaPct?: number;
  /** Peso relativo no score (padrão 1). */
  peso?: number;
  /** Atributo crítico: divergência impede uso automático (padrão false). */
  critico?: boolean;
}

export interface ResultadoEquivalenciaMaterial {
  score: number; // 0–1
  classificacao: ClassificacaoCompatibilidade;
  justificativa: string[];
  divergencias: string[];
  atributosAvaliados: number;
}

const normalizar = (s: string): string =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Extrai o primeiro número de um texto (aceita vírgula decimal). */
export function extrairNumero(v: string | number): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const m = String(v).replace(/\./g, "").replace(",", ".").match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

/** Score 0–1 de um único atributo (numérico com tolerância, ou textual). */
export function compararAtributo(attr: AtributoMaterial): number | null {
  const { solicitado, ofertado } = attr;
  if (solicitado == null || solicitado === "" || ofertado == null || ofertado === "") {
    return null; // sem dados suficientes → não pontua (não inventa)
  }

  const nSolic = extrairNumero(solicitado);
  const nOfer = extrairNumero(ofertado);
  const ambosNumericos = nSolic != null && nOfer != null && typeof solicitado !== "string"
    ? true
    : nSolic != null && nOfer != null && /\d/.test(String(solicitado)) && /\d/.test(String(ofertado));

  if (ambosNumericos && nSolic != null && nOfer != null) {
    if (nSolic === nOfer) return 1;
    const tol = attr.toleranciaPct ?? 0;
    const base = Math.max(Math.abs(nSolic), 1e-9);
    const difPct = (Math.abs(nOfer - nSolic) / base) * 100;
    if (difPct <= tol) return 1;
    // Fora da tolerância: decai linearmente; 2× a tolerância → 0.
    if (tol > 0) return Math.max(0, 1 - (difPct - tol) / tol);
    // Sem tolerância definida: pequena diferença ainda vale parcialmente.
    return Math.max(0, 1 - difPct / 10);
  }

  const a = normalizar(String(solicitado));
  const b = normalizar(String(ofertado));
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.75;
  return 0;
}

export function compararMateriais(atributos: AtributoMaterial[]): ResultadoEquivalenciaMaterial {
  const justificativa: string[] = [];
  const divergencias: string[] = [];
  let somaPeso = 0;
  let somaScore = 0;
  let criticoReprovado = false;
  let avaliados = 0;

  for (const attr of atributos) {
    const s = compararAtributo(attr);
    if (s == null) {
      justificativa.push(`• ${attr.nome}: dados insuficientes para comparar`);
      continue;
    }
    avaliados++;
    const peso = attr.peso ?? 1;
    somaPeso += peso;
    somaScore += s * peso;

    const ok = s >= 0.9;
    justificativa.push(
      `${ok ? "✓" : "✗"} ${attr.nome}: solicitado "${attr.solicitado}" × ofertado "${attr.ofertado}"` +
        (ok ? "" : ` (compatibilidade ${(s * 100).toFixed(0)}%)`),
    );
    if (!ok) {
      divergencias.push(`${attr.nome}: "${attr.solicitado}" ≠ "${attr.ofertado}"`);
      if (attr.critico) criticoReprovado = true;
    }
  }

  let score = somaPeso > 0 ? somaScore / somaPeso : 0;
  // Atributo crítico divergente impede uso automático (limita abaixo de 75%).
  if (criticoReprovado) score = Math.min(score, 0.74);

  return {
    score: Math.round(score * 1000) / 1000,
    classificacao: classificarCompatibilidade(score),
    justificativa,
    divergencias,
    atributosAvaliados: avaliados,
  };
}
