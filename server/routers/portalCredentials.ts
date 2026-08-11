import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { adminProcedure, editorProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { portalCredentials } from "../../drizzle/schema";
import { credentialEncryptionService } from "../services/credentialEncryptionService";
import { PORTAL_CONFIGS, type PortalType } from "../services/propostaAgent";
import { checkPortalLoginHealth } from "../services/portalAuthenticatedDiscoveryService";
import { S2_TARGET_PORTALS, type S2TargetPortal } from "../services/s2TargetPortals";

/**
 * Cofre de credenciais dos portais de licitação (uso interno).
 * A senha é guardada criptografada (AES-256-GCM) e nunca retornada em texto.
 */

// A operação S2 está deliberadamente restrita aos seis portais institucionais
// homologados no radar. Não derive a lista de PORTAL_CONFIGS: esse objeto ainda
// contém tipos legados usados pelo agente e pode mudar por extensão em runtime.
const PORTAIS = [...S2_TARGET_PORTALS] as [S2TargetPortal, ...S2TargetPortal[]];
const PortalSchema = z.enum(PORTAIS);

const CredencialInput = z.object({
  portal: PortalSchema,
  apelido: z.string().max(128).optional(),
  loginUrl: z.string().max(1000).optional(),
  usuario: z.string().min(1).max(256),
  senha: z.string().min(1).max(500),
  cnpj: z.string().max(18).optional(),
});

export const portalCredentialsRouter = router({
  /** Lista os seis portais suportados pela operação S2 (com URL e notas). */
  portais: editorProcedure.query(() =>
    PORTAIS.map((p) => ({
      portal: p,
      nome: PORTAL_CONFIGS[p].nome,
      loginUrl: PORTAL_CONFIGS[p].loginUrl,
      notas: PORTAL_CONFIGS[p].notasImportantes ?? "",
    })),
  ),

  /** Lista credenciais salvas (sem a senha). */
  list: editorProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db.select().from(portalCredentials).where(eq(portalCredentials.ativo, true));
    return rows.map((r) => ({
      id: r.id,
      portal: r.portal,
      apelido: r.apelido,
      loginUrl: r.loginUrl,
      usuario: r.usuario,
      cnpj: r.cnpj,
      nomePortal: PORTAL_CONFIGS[r.portal as PortalType]?.nome ?? r.portal,
    }));
  }),

  /** Salva uma credencial (senha criptografada). */
  salvar: adminProcedure.input(CredencialInput).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível." });
    const senhaCriptografada = credentialEncryptionService.encrypt(input.senha);
    const [res] = await db.insert(portalCredentials).values({
      portal: input.portal,
      apelido: input.apelido ?? null,
      loginUrl: input.loginUrl ?? null,
      usuario: input.usuario,
      senhaCriptografada,
      cnpj: input.cnpj ?? null,
    });
    return { id: (res as any).insertId as number };
  }),

  /**
   * Testa somente o login do portal usando a mesma credencial ativa que o
   * radar autenticado utiliza. Não coleta oportunidades nem preenche proposta.
   * CAPTCHA/MFA continuam sendo tratados como intervenção humana.
   */
  testarAcesso: adminProcedure
    .input(z.object({ portal: PortalSchema }))
    .mutation(async ({ input }) => checkPortalLoginHealth(input.portal)),

  /** Remove (desativa) uma credencial. */
  remover: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível." });
    await db.update(portalCredentials).set({ ativo: false }).where(eq(portalCredentials.id, input.id));
    return { success: true };
  }),
});

/**
 * Recupera uma credencial descriptografada para uso pelo agente de portais.
 * Não exposto via tRPC — uso interno do servidor.
 */
export async function getPortalCredentialDecrypted(id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(portalCredentials).where(eq(portalCredentials.id, id)).limit(1);
  const r = rows[0];
  if (!r || !r.ativo) return null;
  return {
    portal: r.portal as PortalType,
    loginUrl: r.loginUrl ?? PORTAL_CONFIGS[r.portal as PortalType]?.loginUrl ?? "",
    usuario: r.usuario,
    senha: credentialEncryptionService.decrypt(r.senhaCriptografada),
    cnpj: r.cnpj ?? undefined,
  };
}
