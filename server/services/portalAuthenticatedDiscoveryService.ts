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
// Efeito colateral necessário: registra CEMIG/FIEMG/COPASA com as
// configurações reais de login usadas pela operação S2 em PORTAL_CONFIGS
// (o mapa base em propostaAgent.ts é só um fallback tipado).
import "./s2PortalAgentExtension";
import { getS2PortalUrl, type S2TargetPortal } from "./s2TargetPortals";
import { logger } from "../_core/logger";

/**
 * Descoberta autenticada de cotações nos portais-alvo (Funarbe, Compras MG,
 * FIEMG, Fundep, COPASA, CEMIG), usando as credenciais cadastradas no cofre.
 *
 * Complementa o radar público: quando o mural aberto não lista as cotações
 * (portais que só exibem processos ao fornecedor logado), o robô entra com o
 * login/senha do cofre, coleta o HTML da área autenticada e devolve para os
 * mesmos parsers do radar. Conformidade preservada: CAPTCHA nunca é resolvido —
 * detectado, interrompe e pede intervenção humana.
 *
 * Reuso de sessão: a sessão (cookies) fica salva e criptografada junto da
 * credencial; enquanto válida, evita um novo login a cada execução do radar
 * — menos exposição a CAPTCHA e menor risco de bloqueio de conta por
 * tentativas repetidas.
 *
 * Desligável com PORTAL_AUTH_DISCOVERY_ENABLED=false.
 */

const DEFAULT_SESSION_TTL_HOURS = 6;

export function isPortalAuthDiscoveryEnabled(): boolean {
  const flag = process.env.PORTAL_AUTH_DISCOVERY_ENABLED;
  return flag == null || flag === "" || (flag !== "false" && flag !== "0");
}

function sessionTtlHours(): number {
  const raw = Number(process.env.PORTAL_SESSION_REUSE_TTL_HOURS);
  return Number.isFinite(raw) && raw > 0 && raw <= 48 ? raw : DEFAULT_SESSION_TTL_HOURS;
}

/** Mapeia o portal do radar S2 para o tipo de portal do cofre de credenciais. */
export function portalTypeForSource(source: S2TargetPortal): PortalType | null {
  switch (source) {
    case "comprasmg":
    case "funarbe":
    case "fiemg":
    case "fundep":
    case "copasa":
    case "cemig":
      return source;
    default:
      return null;
  }
}

export interface DecryptedPortalCredential {
  id: number;
  portal: PortalType;
  loginUrl?: string;
  usuario: string;
  senha: string;
  cnpj?: string;
  sessaoCookies: Record<string, string> | null;
  sessaoExpiraEm: Date | null;
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

  let sessaoCookies: Record<string, string> | null = null;
  if (row.sessaoCookies) {
    try {
      sessaoCookies = JSON.parse(credentialEncryptionService.decrypt(row.sessaoCookies));
    } catch {
      sessaoCookies = null; // sessão corrompida/formato antigo — cai no login completo
    }
  }

  return {
    id: row.id,
    portal,
    loginUrl: row.loginUrl ?? undefined,
    usuario: row.usuario,
    senha: credentialEncryptionService.decrypt(row.senhaCriptografada),
    cnpj: row.cnpj ?? undefined,
    sessaoCookies,
    sessaoExpiraEm: row.sessaoExpiraEm ?? null,
  };
}

/** Persiste a sessão (cookies) da credencial, criptografada, com validade. */
async function saveSession(credentialId: number, cookies: Record<string, string>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db
      .update(portalCredentials)
      .set({
        sessaoCookies: credentialEncryptionService.encrypt(JSON.stringify(cookies)),
        sessaoExpiraEm: new Date(Date.now() + sessionTtlHours() * 60 * 60 * 1000),
      })
      .where(eq(portalCredentials.id, credentialId));
  } catch (err) {
    logger.warn(`[PortalAuthDiscovery] Falha ao salvar sessão da credencial ${credentialId}: ${(err as Error).message}`);
  }
}

/**
 * Faz login no portal com a credencial do cofre (reaproveitando sessão salva
 * e válida quando possível) e devolve o HTML da página de oportunidades da
 * área autenticada. Retorna null quando a descoberta autenticada está
 * desligada ou não há credencial cadastrada para o portal. Lança erro em
 * falha de login/CAPTCHA — o chamador registra o aviso e segue.
 */
export async function fetchAuthenticatedPortalHtml(
  source: S2TargetPortal,
): Promise<string | null> {
  if (!isPortalAuthDiscoveryEnabled()) return null;

  const portalType = portalTypeForSource(source);
  if (!portalType || !PORTAL_CONFIGS[portalType]) return null;

  const credential = await getPortalCredentialForPortal(portalType);
  if (!credential) return null;

  const url = getS2PortalUrl(source);
  const agente = new PropostaAgente();
  try {
    await agente.init();

    const sessaoValida =
      credential.sessaoCookies != null &&
      credential.sessaoExpiraEm != null &&
      new Date(credential.sessaoExpiraEm).getTime() > Date.now();

    let autenticado = false;
    if (sessaoValida) {
      autenticado = await agente.restaurarSessao(
        { portal: portalType, loginUrl: credential.loginUrl, email: credential.usuario, password: credential.senha, cnpj: credential.cnpj },
        credential.sessaoCookies!,
        credential.loginUrl || PORTAL_CONFIGS[portalType].loginUrl || url,
      );
    }

    if (!autenticado) {
      await agente.login({
        portal: portalType,
        loginUrl: credential.loginUrl,
        email: credential.usuario,
        password: credential.senha,
        cnpj: credential.cnpj,
      });
      const cookies = await agente.exportarCookies();
      if (Object.keys(cookies).length > 0) await saveSession(credential.id, cookies);
    }

    return await agente.coletarHtml(url);
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

export interface PortalLoginHealth {
  source: S2TargetPortal;
  hasCredential: boolean;
  ok: boolean;
  detail: string;
}

/**
 * Teste de fumaça: só tenta logar (sem coletar nem preencher nada) e reporta
 * se o login ainda funciona. Não usa nem altera a sessão salva — é uma
 * verificação independente, para não mascarar uma quebra de seletor por uma
 * sessão antiga ainda válida.
 */
export async function checkPortalLoginHealth(source: S2TargetPortal): Promise<PortalLoginHealth> {
  const portalType = portalTypeForSource(source);
  if (!portalType || !PORTAL_CONFIGS[portalType]) {
    return { source, hasCredential: false, ok: false, detail: "Portal sem automação de login mapeada." };
  }

  const credential = await getPortalCredentialForPortal(portalType);
  if (!credential) {
    return { source, hasCredential: false, ok: false, detail: "Sem credencial cadastrada no cofre." };
  }

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
    return { source, hasCredential: true, ok: true, detail: "Login confirmado." };
  } catch (err) {
    const detail = err instanceof CaptchaRequerIntervencaoError
      ? "CAPTCHA exigiu intervenção humana (não é necessariamente quebra de seletor)."
      : (err as Error).message;
    return { source, hasCredential: true, ok: false, detail };
  } finally {
    await agente.fechar();
  }
}
