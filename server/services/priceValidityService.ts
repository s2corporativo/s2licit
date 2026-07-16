/**
 * priceValidityService.ts
 *
 * Validade da consulta de preço (spec §13).
 *
 * "Antes de emitir a proposta, validar se o preço ainda está vigente." O
 * usuário configura a validade máxima da consulta (1h, 6h, 12h, 24h, 3 dias
 * ou personalizado); um preço mais velho que isso deve ser revalidado antes
 * de entrar na proposta.
 *
 * Módulo puro (sem I/O) para ser testável e reutilizável.
 */

export type ValidadePreset = "1h" | "6h" | "12h" | "24h" | "3d" | "custom";

const HORA_MS = 60 * 60 * 1000;

export const PRESET_HORAS: Record<Exclude<ValidadePreset, "custom">, number> = {
  "1h": 1,
  "6h": 6,
  "12h": 12,
  "24h": 24,
  "3d": 72,
};

/** TTL em ms a partir do preset configurado (custom usa customHoras). */
export function ttlMs(preset: ValidadePreset, customHoras?: number): number {
  if (preset === "custom") {
    const h = Number(customHoras);
    if (!Number.isFinite(h) || h <= 0) {
      throw new Error("Validade personalizada requer um número de horas > 0");
    }
    return h * HORA_MS;
  }
  return PRESET_HORAS[preset] * HORA_MS;
}

export interface ValidadePreco {
  /** Idade do preço em ms (agora − consulta). */
  idadeMs: number;
  /** true se o preço ainda está dentro da validade. */
  vigente: boolean;
  /** true se o preço venceu e precisa ser revalidado. */
  vencido: boolean;
  /** ms restantes até vencer (0 se já vencido). */
  restanteMs: number;
  /** momento em que o preço vence. */
  expiraEm: Date;
}

/**
 * Avalia a validade de um preço consultado em `consultadoEm`, com validade
 * `ttl` (ms), no instante `agora` (epoch ms).
 *
 * Preço sem data de consulta (null/invalid) é tratado como VENCIDO — nunca
 * assume que um preço sem proveniência está vigente (§15: não usar preço antigo
 * como atual).
 */
export function avaliarValidade(
  consultadoEm: Date | string | null | undefined,
  ttl: number,
  agora: number,
): ValidadePreco {
  const consulta = consultadoEm ? new Date(consultadoEm) : null;
  const consultaMs = consulta ? consulta.getTime() : NaN;

  if (!Number.isFinite(consultaMs)) {
    return {
      idadeMs: Infinity,
      vigente: false,
      vencido: true,
      restanteMs: 0,
      expiraEm: new Date(agora),
    };
  }

  const idadeMs = agora - consultaMs;
  const restanteMs = Math.max(0, ttl - idadeMs);
  const vigente = idadeMs <= ttl;
  return {
    idadeMs,
    vigente,
    vencido: !vigente,
    restanteMs,
    expiraEm: new Date(consultaMs + ttl),
  };
}

/** Atalho: o preço precisa ser revalidado antes de entrar na proposta? */
export function precisaRevalidar(
  consultadoEm: Date | string | null | undefined,
  ttl: number,
  agora: number,
): boolean {
  return avaliarValidade(consultadoEm, ttl, agora).vencido;
}

const PRESETS_VALIDOS = new Set<ValidadePreset>(["1h", "6h", "12h", "24h", "3d", "custom"]);

/**
 * Resolve o TTL (ms) a partir da configuração da empresa (§13). Preset ausente
 * ou inválido cai no padrão de 24h.
 */
export function ttlDeConfiguracao(
  settings?: { priceValidityPreset?: string | null; priceValidityCustomHours?: number | null } | null,
): number {
  const preset = settings?.priceValidityPreset as ValidadePreset | undefined;
  if (!preset || !PRESETS_VALIDOS.has(preset)) return ttlMs("24h");
  try {
    return ttlMs(preset, settings?.priceValidityCustomHours ?? undefined);
  } catch {
    return ttlMs("24h");
  }
}

export interface ItemValidadePreco {
  id: number;
  consultadoEm: Date | string | null | undefined;
}

/**
 * Avalia a validade de um lote de preços (para a tela de revisão). Retorna, por
 * item, o diagnóstico de validade — o consumidor destaca os vencidos.
 */
export function avaliarValidadeLote(
  itens: ItemValidadePreco[],
  ttl: number,
  agora: number,
): Array<{ id: number } & ValidadePreco> {
  return itens.map((it) => ({ id: it.id, ...avaliarValidade(it.consultadoEm, ttl, agora) }));
}
