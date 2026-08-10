import { desc, and, eq } from "drizzle-orm";
import { getDb } from "../db";
import { portalCredentials } from "../../drizzle/schema";
import { credentialEncryptionService } from "./credentialEncryptionService";
import {
  CaptchaRequerIntervencaoError,
  PORTAL_CONFIGS,
  PropostaAgente,
  type PortalType,
} from "./propostaAgent";
import { getS2PortalUrl, type S2TargetPortal } from "./s2TargetPortals";
import { logger } from "../_core/logger";

/**
 * Descoberta autenticada de cotações nos portais-alvo (Funarbe, Compras MG,
 * FIEMG, Fundep, COPASA), usando as credenciais cadastradas no cofre.
 *
 * Complementa o radar público: quando o mural aberto não lista as cotações
 * (portais que só exibem processos ao fornecedor logado), o robô entra com o
 * login/senha do cofre, coleta o HTML da área autenticada e devolve para os
 * mesmos parsers do radar. Conformidade preservada: CAPTCHA nunca é resolvido —
 * detectado, interrompe e pede intervenção humana.
 *
 * Desligável com PORTAL_AUTH_DISCOVERY_ENABLED=false.
 */

export function isPortalAuthDiscoveryEnabled(): boolean {
  const flag = process.env.PORTAL_AUTH_DISCOVERY_ENABLED;
  return flag == null || flag === "" || (flag !== "false" && flag !== "0");
}

/** Mapeia o portal do radar S2 para o tipo de portal do cofre de credenciais. */
export function portalTypeForSource(source: S2TargetPortal): PortalType | null {
  switch (source) {
    case "comprasmg":
    case "funarbe":
    case "fiemg":
    case "fundep":
    case "copasa":
      return source;
    default:
      // CEMIG ainda não tem automação de login mapeada.
      return null;
  }
}

export interface DecryptedPortalCredential {
  portal: PortalType;
  loginUrl?: string;
  usuario: string;
  senha: string;
  cnpj?: string;
}

/** Busca a credencial ativa mais recente do cofre para um portal. */
export async function getPortalCredentialForPortal(
  portal: PortalType,
): Promise<DecryptedPortalCredential | null> {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .select()
    .from(portalCredentials)
    .where(and(eq(portalCredentials.portal, portal), eq(portalCredentials.ativo, true)))
    .orderBy(desc(portalCredentials.id))
    .limit(1);
  if (!row) return null;
  return {
    portal,
    loginUrl: row.loginUrl ?? undefined,
    usuario: row.usuario,
    senha: credentialEncryptionService.decrypt(row.senhaCriptografada),
    cnpj: row.cnpj ?? undefined,
  };
}

/**
 * Faz login no portal com a credencial do cofre e devolve o HTML da página de
 * oportunidades da área autenticada. Retorna null quando a descoberta
 * autenticada está desligada ou não há credencial cadastrada para o portal.
 * Lança erro em falha de login/CAPTCHA — o chamador registra o aviso e segue.
 */
export async function fetchAuthenticatedPortalHtml(
  source: S2TargetPortal,
): Promise<string | null> {
  if (!isPortalAuthDiscoveryEnabled()) return null;

  const portalType = portalTypeForSource(source);
  if (!portalType || !PORTAL_CONFIGS[portalType]) return null;

  const credential = await getPortalCredentialForPortal(portalType);
  if (!credential) return null;

  const agente = new PropostaAgente();
  try {
    await agente.init();
    await agente.login({
      portal: portalType,
      loginUrl: credential.loginUrl,
      email: credential.usuario,
      password: credential.senha,
      cnpj: credential.cnpj,
    });
    return await agente.coletarHtml(getS2PortalUrl(source));
  } catch (err) {
    if (err instanceof CaptchaRequerIntervencaoError) {
      logger.warn(
        `[PortalAuthDiscovery] ${source}: CAPTCHA detectado — descoberta autenticada requer intervenção humana.`,
      );
    }
    throw err;
  } finally {
    await agente.fechar();
  }
}
