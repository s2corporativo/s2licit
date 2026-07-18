/**
 * integrationSettingsService: credenciais de integrações configuradas pela
 * interface (WhatsApp e parâmetros gerais), guardadas criptografadas em
 * `integration_settings` e aplicadas em process.env no boot e a cada
 * salvamento — os serviços (whatsappService etc.) leem process.env em tempo
 * de execução, então a config da tela vale para o sistema inteiro na hora.
 *
 * IA e e-mail têm serviços próprios (aiConfigService / emailConfigService);
 * este cobre o restante através de uma lista-branca de chaves conhecidas.
 */
import { eq, inArray } from "drizzle-orm";
import { integrationSettings } from "../../drizzle/schema";
import { getDb } from "../db";
import { encryptPassword, decryptPassword } from "../utils/encryption";
import { logger } from "../_core/logger";

/**
 * Lista-branca de chaves aceitas. `secreta` controla se o valor volta mascarado
 * para a tela (tokens/senhas) ou em claro (parâmetros não sensíveis).
 */
export const INTEGRATION_KEYS: Record<string, { label: string; secreta: boolean; grupo: string }> = {
  WHATSAPP_PHONE_ID: { label: "ID do telefone (Meta Cloud API)", secreta: false, grupo: "whatsapp" },
  WHATSAPP_TOKEN: { label: "Token de acesso", secreta: true, grupo: "whatsapp" },
  WHATSAPP_API_VERSION: { label: "Versão da API", secreta: false, grupo: "whatsapp" },
  WHATSAPP_WEBHOOK_URL: { label: "Webhook próprio (Z-API/Twilio/n8n)", secreta: true, grupo: "whatsapp" },
  WHATSAPP_TO: { label: "Número(s) de destino", secreta: false, grupo: "whatsapp" },
  USD_BRL_RATE: { label: "Cotação USD→BRL (custo de IA)", secreta: false, grupo: "geral" },
};

type KeyName = keyof typeof INTEGRATION_KEYS;

export type IntegrationView = Array<{
  chave: string;
  label: string;
  grupo: string;
  secreta: boolean;
  /** Valor em claro só para chaves NÃO secretas; secretas voltam null. */
  valor: string | null;
  temValor: boolean;
  origem: "interface" | "ambiente" | "nao_configurado";
}>;

export async function getIntegrationView(): Promise<IntegrationView> {
  const db = await getDb().catch(() => null);
  const rows = db
    ? await db
        .select()
        .from(integrationSettings)
        .where(inArray(integrationSettings.chave, Object.keys(INTEGRATION_KEYS)))
    : [];
  const byKey = new Map(rows.map((r) => [r.chave, r] as const));

  return Object.entries(INTEGRATION_KEYS).map(([chave, meta]) => {
    const row = byKey.get(chave);
    const noBanco = Boolean(row?.valorEnc);
    const noAmbiente = Boolean(process.env[chave]);
    let valor: string | null = null;
    if (!meta.secreta) {
      if (noBanco) {
        try {
          valor = decryptPassword(row!.valorEnc!);
        } catch {
          valor = null;
        }
      } else if (noAmbiente) {
        valor = process.env[chave] ?? null;
      }
    }
    return {
      chave,
      label: meta.label,
      grupo: meta.grupo,
      secreta: meta.secreta,
      valor,
      temValor: noBanco || noAmbiente,
      origem: noBanco ? "interface" : noAmbiente ? "ambiente" : "nao_configurado",
    };
  });
}

/**
 * Salva um conjunto de chaves (upsert). Valor vazio/undefined mantém o atual;
 * a string especial "__limpar__" remove a chave do banco (volta ao ambiente).
 */
export async function saveIntegrationSettings(entries: Record<string, string>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");

  for (const [chave, valor] of Object.entries(entries)) {
    if (!(chave in INTEGRATION_KEYS)) continue; // ignora chave fora da lista-branca
    if (valor === "" || valor == null) continue; // vazio = manter
    if (valor === "__limpar__") {
      await db.delete(integrationSettings).where(eq(integrationSettings.chave, chave));
      delete process.env[chave as KeyName];
      continue;
    }
    const valorEnc = encryptPassword(valor);
    const [existing] = await db
      .select({ id: integrationSettings.id })
      .from(integrationSettings)
      .where(eq(integrationSettings.chave, chave))
      .limit(1);
    if (existing) {
      await db.update(integrationSettings).set({ valorEnc }).where(eq(integrationSettings.id, existing.id));
    } else {
      await db.insert(integrationSettings).values({ chave, valorEnc });
    }
  }
  await applyIntegrationSettingsFromDb();
}

/** Aplica as chaves do banco em process.env (boot + após salvar). */
export async function applyIntegrationSettingsFromDb(): Promise<void> {
  try {
    const db = await getDb().catch(() => null);
    if (!db) return;
    const rows = await db
      .select()
      .from(integrationSettings)
      .where(inArray(integrationSettings.chave, Object.keys(INTEGRATION_KEYS)));
    for (const row of rows) {
      if (!row.valorEnc) continue;
      try {
        process.env[row.chave] = decryptPassword(row.valorEnc);
      } catch (err) {
        logger.error(`[Integrações] Falha ao decriptar ${row.chave}:`, err);
      }
    }
    if (rows.length > 0) {
      logger.info(`[Integrações] ${rows.length} chave(s) de integração aplicadas da interface.`);
    }
  } catch (err) {
    logger.error("[Integrações] Falha ao aplicar configuração do banco:", err);
  }
}
