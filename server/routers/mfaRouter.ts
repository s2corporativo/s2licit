import { z } from "zod";
import { eq } from "drizzle-orm";
import { authenticatedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { users } from "../../drizzle/schema";
import { generateTotpSecret, otpauthUri, verifyTotp } from "../services/totp";
import { encryptPassword, decryptPassword } from "../utils/encryption";
import { recordAudit, requestOrigin } from "../services/auditService";

/**
 * MFA (TOTP) — configuração pelo próprio usuário (§16).
 *
 * Fluxo: setup (gera segredo, guarda cifrado, ainda desativado) → o usuário
 * escaneia o QR/insere a chave no app autenticador → enable (confirma um código
 * válido e ativa). disable exige um código válido para desligar.
 */
const ISSUER = "Sistema S2";

export const mfaRouter = router({
  status: authenticatedProcedure.query(({ ctx }) => {
    return { enabled: !!ctx.user.mfaEnabled };
  }),

  /** Gera um novo segredo (desativado até confirmar) e devolve a URI otpauth. */
  setup: authenticatedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Banco de dados indisponível");

    const secret = generateTotpSecret();
    await db.update(users)
      .set({ mfaSecret: encryptPassword(secret), mfaEnabled: false })
      .where(eq(users.id, ctx.user.id));

    return {
      secret, // exibido uma única vez para configuração manual
      otpauthUri: otpauthUri(secret, { issuer: ISSUER, account: ctx.user.email ?? String(ctx.user.id) }),
    };
  }),

  /** Confirma um código válido e ATIVA o MFA. */
  enable: authenticatedProcedure
    .input(z.object({ token: z.string().min(6).max(8) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco de dados indisponível");
      if (!ctx.user.mfaSecret) throw new Error("Inicie a configuração do MFA antes de ativar.");

      const secret = decryptPassword(ctx.user.mfaSecret);
      if (!verifyTotp(secret, input.token, Date.now())) {
        throw new Error("Código inválido. Verifique o relógio do dispositivo e tente novamente.");
      }

      await db.update(users).set({ mfaEnabled: true }).where(eq(users.id, ctx.user.id));
      await recordAudit({
        userId: ctx.user.id, action: "mfa_ativado", entity: "auth", entityId: ctx.user.id,
        origin: "mfa", summary: "MFA (TOTP) ativado", ...requestOrigin(ctx.req),
      });
      return { enabled: true };
    }),

  /** Desativa o MFA mediante um código válido. */
  disable: authenticatedProcedure
    .input(z.object({ token: z.string().min(6).max(8) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco de dados indisponível");
      if (!ctx.user.mfaEnabled || !ctx.user.mfaSecret) return { enabled: false };

      const secret = decryptPassword(ctx.user.mfaSecret);
      if (!verifyTotp(secret, input.token, Date.now())) {
        throw new Error("Código inválido — MFA não foi desativado.");
      }

      await db.update(users).set({ mfaEnabled: false, mfaSecret: null }).where(eq(users.id, ctx.user.id));
      await recordAudit({
        userId: ctx.user.id, action: "mfa_desativado", entity: "auth", entityId: ctx.user.id,
        origin: "mfa", summary: "MFA (TOTP) desativado", ...requestOrigin(ctx.req),
      });
      return { enabled: false };
    }),
});
