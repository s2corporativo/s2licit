import { desc, and, eq } from "drizzle-orm";
import { getDb } from "../db";
import { portalCredentials } from "../../drizzle/schema";
import { credentialEncryptionService } from "./credentialEncryptionService";
import {
  CaptchaRequerIntervencaoError,
  PORTAL_CONFIGS,
  PropostaAgente,
  type PortalSessionCookie,
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
// Depois de N falhas de login CONSECUTIVAS, para de tentar — a maioria dos
// portais de fornecedor bloqueia a conta após um pequeno número de
// tentativas, e uma conta bloqueada também impede o operador humano.
// Reseta ao logar com sucesso, ou recadastrando a credencial no cofre.
const LOGIN_FAIL_THRESHOLD = 3;

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
  sessaoCookies: PortalSessionCookie[] | null;
  sessaoExpiraEm: Date | null;
  loginFailCount: number;
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

  let sessaoCookies: PortalSessionCookie[] | null = null;
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
    loginFailCount: row.loginFailCount ?? 0,
  };
}

/** Persiste a sessão (cookies) da credencial, criptografada, com validade, e zera o contador de falhas. */
async function saveSession(credentialId: number, cookies: PortalSessionCookie[]): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db
      .update(portalCredentials)
      .set({
        sessaoCookies: credentialEncryptionService.encrypt(JSON.stringify(cookies)),
        sessaoExpiraEm: new Date(Date.now() + sessionTtlHours() * 60 * 60 * 1000),
        loginFailCount: 0,
      })
      .where(eq(portalCredentials.id, credentialId));
  } catch (err) {
    logger.warn(`[PortalAuthDiscovery] Falha ao salvar sessão da credencial ${credentialId}: ${(err as Error).message}`);
  }
}

/** Login bem-sucedido sem cookies aproveitáveis (ex.: fluxo custom) — ainda assim zera o contador de falhas. */
async function resetLoginFailures(credentialId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(portalCredentials).set({ loginFailCount: 0 }).where(eq(portalCredentials.id, credentialId));
}

/** Incrementa o contador de falhas consecutivas de login da credencial. */
async function recordLoginFailure(credentialId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const [row] = await db
    .select({ loginFailCount: portalCredentials.loginFailCount })
    .from(portalCredentials)
    .where(eq(portalCredentials.id, credentialId))
    .limit(1);
  const next = (row?.loginFailCount ?? 0) + 1;
  await db.update(portalCredentials).set({ loginFailCount: next }).where(eq(portalCredentials.id, credentialId));
  return next;
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

  const sessaoValida =
    credential.sessaoCookies != null &&
    credential.sessaoExpiraEm != null &&
    new Date(credential.sessaoExpiraEm).getTime() > Date.now();

  // Credencial bloqueada: só a sessão salva pode ser usada — nenhuma NOVA
  // tentativa de login até o operador corrigir (recadastrar a credencial no
  // cofre, o que cria uma linha nova com o contador zerado).
  if (!sessaoValida && credential.loginFailCount >= LOGIN_FAIL_THRESHOLD) {
    logger.warn(
      `[PortalAuthDiscovery] ${source}: credencial bloqueada após ${credential.loginFailCount} falha(s) de login ` +
        "consecutivas — recadastre a credencial no cofre para tentar novamente.",
    );
    return null;
  }

  const url = getS2PortalUrl(source);
  const agente = new PropostaAgente();
  try {
    await agente.init();

    let autenticado = false;
    if (sessaoValida) {
      autenticado = await agente.restaurarSessao(
        { portal: portalType, loginUrl: credential.loginUrl, email: credential.usuario, password: credential.senha, cnpj: credential.cnpj },
        credential.sessaoCookies!,
        credential.loginUrl || PORTAL_CONFIGS[portalType].loginUrl || url,
      );
    }

    if (!autenticado) {
      try {
        await agente.login({
          portal: portalType,
          loginUrl: credential.loginUrl,
          email: credential.usuario,
          password: credential.senha,
          cnpj: credential.cnpj,
        });
      } catch (err) {
        const falhas = await recordLoginFailure(credential.id);
        logger.warn(`[PortalAuthDiscovery] ${source}: falha de login (${falhas}/${LOGIN_FAIL_THRESHOLD}).`);
        throw err;
      }
      const cookies = await agente.exportarCookies();
      if (cookies.length > 0) await saveSession(credential.id, cookies);
      else await resetLoginFailures(credential.id);
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
    await resetLoginFailures(credential.id);
    return { source, hasCredential: true, ok: true, detail: "Login confirmado." };
  } catch (err) {
    await recordLoginFailure(credential.id);
    const detail = err instanceof CaptchaRequerIntervencaoError
      ? "CAPTCHA exigiu intervenção humana (não é necessariamente quebra de seletor)."
      : (err as Error).message;
    return { source, hasCredential: true, ok: false, detail };
  } finally {
    await agente.fechar();
  }
}
