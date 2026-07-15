import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { adminProcedure, editorProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { portalCredentials } from "../../drizzle/schema";
import { credentialEncryptionService } from "../services/credentialEncryptionService";
import { PORTAL_CONFIGS, type PortalType } from "../services/propostaAgent";

/**
 * Cofre de credenciais dos portais de licitação (uso interno).
 * A senha é guardada criptografada (AES-256-GCM) e nunca retornada em texto.
 */

const PORTAIS = Object.keys(PORTAL_CONFIGS) as PortalType[];

const CredencialInput = z.object({
  portal: z.enum(PORTAIS as [string, ...string[]]),
  apelido: z.string().max(128).optional(),
  loginUrl: z.string().max(1000).optional(),
  usuario: z.string().min(1).max(256),
  senha: z.string().min(1).max(500),
  cnpj: z.string().max(18).optional(),
});

export const portalCredentialsRouter = router({
  /** Lista os portais suportados (com URL e notas). */
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
