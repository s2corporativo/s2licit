export interface TechnicalMatchCandidate {
  name?: string | null;
  activeIngredient?: string | null;
  concentration?: string | null;
  presentation?: string | null;
  pharmaceuticalForm?: string | null;
  administrationRoute?: string | null;
  manufacturer?: string | null;
  codigoMapa?: string | null;
}

export interface TechnicalMatchRequest extends TechnicalMatchCandidate {
  tipoCatalogo?: string | null;
  /** Quando true, fabricante/marca faz parte do requisito do TR. */
  manufacturerRequired?: boolean;
}

export interface TechnicalGuardResult {
  safe: boolean;
  reasons: string[];
}

function norm(value?: string | null): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9%.,/+-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sameWhenRequired(label: string, expected?: string | null, actual?: string | null): string | null {
  const e = norm(expected);
  if (!e) return null;
  const a = norm(actual);
  if (!a) return `${label} não informado no produto candidato.`;
  if (a !== e) return `${label} divergente: esperado "${expected}", candidato "${actual}".`;
  return null;
}

/**
 * Validação determinística que deve ocorrer DEPOIS da recuperação fuzzy/vetorial
 * e ANTES de qualquer auto-confirmação. Em medicamentos, atributos técnicos
 * informados no TR são mandatórios; similaridade de nome nunca substitui isso.
 */
export function validateTechnicalMatch(
  request: TechnicalMatchRequest,
  candidate: TechnicalMatchCandidate,
): TechnicalGuardResult {
  const reasons: string[] = [];
  const tipo = norm(request.tipoCatalogo);
  const medicamento = tipo.includes("medicamento");

  const checks: Array<[string, string | null | undefined, string | null | undefined]> = [
    ["Princípio ativo", request.activeIngredient, candidate.activeIngredient],
    ["Concentração", request.concentration, candidate.concentration],
    ["Apresentação", request.presentation, candidate.presentation],
    ["Forma farmacêutica", request.pharmaceuticalForm, candidate.pharmaceuticalForm],
    ["Via de administração", request.administrationRoute, candidate.administrationRoute],
    ["Código MAPA", request.codigoMapa, candidate.codigoMapa],
  ];

  for (const [label, expected, actual] of checks) {
    const reason = sameWhenRequired(label, expected, actual);
    if (reason) reasons.push(reason);
  }

  if (request.manufacturerRequired) {
    const reason = sameWhenRequired("Fabricante/marca", request.manufacturer, candidate.manufacturer);
    if (reason) reasons.push(reason);
  }

  // Para medicamentos, se o pedido contém informação técnica, qualquer
  // divergência bloqueia auto-match. Se o pedido não traz atributo técnico
  // suficiente, o resultado pode ser candidato, mas não auto-confirmado.
  if (medicamento) {
    const hasTechnicalRequirement = [
      request.activeIngredient,
      request.concentration,
      request.presentation,
      request.pharmaceuticalForm,
      request.administrationRoute,
      request.codigoMapa,
    ].some((v) => norm(v).length > 0);
    if (!hasTechnicalRequirement) {
      reasons.push("Medicamento sem atributos técnicos suficientes no TR para auto-match seguro.");
    }
  }

  return { safe: reasons.length === 0, reasons };
}
