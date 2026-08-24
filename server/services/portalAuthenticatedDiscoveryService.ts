import { desc, and, eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { portalCredentials } from "../../drizzle/schema";
import { credentialEncryptionService } from "./credentialEncryptionService";
import {
  CaptchaRequerIntervencaoError,
  CredencialInvalidaError,
  PORTAL_CONFIGS,
  PropostaAgente,
  type PortalSessionCookie,
  type PortalType,
} from "./propostaAgent";
// Efeito colateral necessário: registra CEMIG/FIEMG/COPASA/FUNARBE com as
// configurações reais de login usadas pela operação S2 em PORTAL_CONFIGS.
import "./s2PortalAgentExtension";
import {
  FUNARBE_PROVIDER_LIST_URLS,
  getS2PortalUrl,
  type S2TargetPortal,
} from "./s2TargetPortals";
import {
  combineAgregaListHtmls,
  isFunarbeProviderPortal,
} from "./funarbeProviderPortal";
import { logger } from "../_core/logger";

/**
 * Descoberta autenticada de cotações nos portais-alvo (Funarbe, Compras MG,
 * FIEMG, Fundep, COPASA, CEMIG), usando as credenciais cadastradas no cofre.
 * CAPTCHA nunca é resolvido: o fluxo interrompe e pede intervenção humana.
 */

const DEFAULT_SESSION_TTL_HOURS = 6;
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

function isValidCookieArray(value: unknown): value is PortalSessionCookie[] {
  if (!Array.isArray(value)) return false;
  return value.every(
    (c) =>
      c && typeof c === "object" &&
      typeof (c as Record<string, unknown>).name === "string" &&
      typeof (c as Record<string, unknown>).value === "string" &&
      typeof (c as Record<string, unknown>).domain === "string",
  );
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
      const parsed = JSON.parse(credentialEncryptionService.decrypt(row.sessaoCookies));
      sessaoCookies = isValidCookieArray(parsed) ? parsed : null;
    } catch {
      sessaoCookies = null;
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

async function resetLoginFailures(credentialId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(portalCredentials).set({ loginFailCount: 0 }).where(eq(portalCredentials.id, credentialId));
}

async function recordLoginFailure(credentialId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  await db
    .update(portalCredentials)
    .set({ loginFailCount: sql`${portalCredentials.loginFailCount} + 1` })
    .where(eq(portalCredentials.id, credentialId));
  const [row] = await db
    .select({ loginFailCount: portalCredentials.loginFailCount })
    .from(portalCredentials)
    .where(eq(portalCredentials.id, credentialId))
    .limit(1);
  return row?.loginFailCount ?? 0;
}

function isFalhaDeCredencial(err: unknown): boolean {
  return err instanceof CredencialInvalidaError;
}

/**
 * Coleta a área autenticada. Na Funarbe, percorre sequencialmente as páginas
 * de novas oportunidades usando a MESMA sessão do navegador. Navegação
 * concorrente na mesma Page do Puppeteer é intencionalmente evitada porque
 * uma chamada poderia cancelar a navegação da outra e produzir HTML trocado.
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

  if (!sessaoValida && credential.loginFailCount >= LOGIN_FAIL_THRESHOLD) {
    logger.warn(
      `[PortalAuthDiscovery] ${source}: credencial bloqueada após ${credential.loginFailCount} falha(s) de login ` +
        "consecutivas — recadastre a credencial no cofre para tentar novamente.",
    );
    return null;
  }

  const publicOrConfiguredUrl = getS2PortalUrl(source);
  const agente = new PropostaAgente();
  try {
    await agente.init();

    let autenticado = false;
    if (sessaoValida) {
      autenticado = await agente.restaurarSessao(
        {
          portal: portalType,
          loginUrl: credential.loginUrl,
          email: credential.usuario,
          password: credential.senha,
          cnpj: credential.cnpj,
        },
        credential.sessaoCookies!,
        credential.loginUrl || PORTAL_CONFIGS[portalType].loginUrl || publicOrConfiguredUrl,
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
        if (isFalhaDeCredencial(err)) {
          const falhas = await recordLoginFailure(credential.id);
          logger.warn(`[PortalAuthDiscovery] ${source}: falha de login (${falhas}/${LOGIN_FAIL_THRESHOLD}).`);
        } else {
          logger.warn(`[PortalAuthDiscovery] ${source}: falha operacional de login (não conta para bloqueio): ${(err as Error).message}`);
        }
        throw err;
      }
      const cookies = await agente.exportarCookies();
      if (cookies.length > 0) await saveSession(credential.id, cookies);
      else await resetLoginFailures(credential.id);
    }

    if (!isFunarbeProviderPortal(source)) {
      return await agente.coletarHtml(publicOrConfiguredUrl);
    }

    const pages: Array<{ url: string; html: string }> = [];
    for (const targetUrl of FUNARBE_PROVIDER_LIST_URLS) {
      try {
        const html = await agente.coletarHtml(targetUrl);
        if (html.trim()) pages.push({ url: targetUrl, html });
      } catch (error) {
        logger.warn(
          `[PortalAuthDiscovery] funarbe: falha ao coletar ${targetUrl} — ${(error as Error).message}`,
        );
      }
    }
    const combined = combineAgregaListHtmls(pages);
    return combined || null;
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
 * Teste de fumaça: só tenta logar, sem coletar oportunidades nem preencher
 * proposta. Não reaproveita sessão antiga para detectar quebra de seletor.
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

  if (credential.loginFailCount >= LOGIN_FAIL_THRESHOLD) {
    return {
      source,
      hasCredential: true,
      ok: false,
      detail: `Credencial bloqueada após ${credential.loginFailCount} falha(s) de login consecutivas — recadastre no cofre para testar novamente.`,
    };
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
    if (isFalhaDeCredencial(err)) await recordLoginFailure(credential.id);
    const detail = err instanceof CaptchaRequerIntervencaoError
      ? "CAPTCHA exigiu intervenção humana (não é necessariamente quebra de seletor)."
      : (err as Error).message;
    return { source, hasCredential: true, ok: false, detail };
  } finally {
    await agente.fechar();
  }
}
