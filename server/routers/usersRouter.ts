import { z } from "zod";
import { eq } from "drizzle-orm";
import { adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { users } from "../../drizzle/schema";
import { credentialEncryptionService } from "../services/credentialEncryptionService";
import { recordAudit, requestOrigin } from "../services/auditService";

/**
 * Gestão de usuários e permissões (§20) — somente admin.
 * O RBAC (papéis user/viewer/editor/admin) já existia; faltava o CRUD.
 */

const ROLES = ["user", "viewer", "editor", "admin"] as const;
type Role = (typeof ROLES)[number];

/** É o único admin do sistema? (puro, testável — evita remover/rebaixar o último). */
export function ehUltimoAdmin(usuarios: { id: number; role: string }[], alvoId: number): boolean {
  const admins = usuarios.filter((u) => u.role === "admin");
  return admins.length === 1 && admins[0].id === alvoId;
}

/** Projeção segura de um usuário (nunca serializa hash de senha nem segredo MFA). */
function usuarioSeguro(u: typeof users.$inferSelect) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    mfaEnabled: !!u.mfaEnabled,
    disabled: !!u.disabled,
    lastSignedIn: u.lastSignedIn,
    lockedUntil: u.lockedUntil,
    createdAt: u.createdAt,
  };
}

async function carregarUsuarios() {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  return { db, todos: await db.select().from(users) };
}

/**
 * Serializa as operações que podem remover/rebaixar o último admin, para que a
 * checagem (ler admins) e a escrita não sofram corrida (TOCTOU) — ex.: dois
 * admins se rebaixando ao mesmo tempo deixariam o sistema sem administrador.
 * Escopo de processo (a aplicação roda em instância única).
 */
let adminMutex: Promise<unknown> = Promise.resolve();
function comLockDeAdmin<T>(fn: () => Promise<T>): Promise<T> {
  const run = adminMutex.then(fn, fn);
  adminMutex = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export const usersRouter = router({
  list: adminProcedure.query(async () => {
    const { todos } = await carregarUsuarios();
    return todos
      .sort((a, b) => (a.email ?? "").localeCompare(b.email ?? ""))
      .map(usuarioSeguro);
  }),

  create: adminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(128),
        email: z.string().email().max(320),
        role: z.enum(ROLES).default("viewer"),
        password: z.string().min(8).max(200),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { db, todos } = await carregarUsuarios();
      const email = input.email.trim().toLowerCase();
      if (todos.some((u) => (u.email ?? "").toLowerCase() === email)) {
        throw new Error("Já existe um usuário com este e-mail.");
      }
      await db.insert(users).values({
        openId: `local:${email}`,
        name: input.name.trim(),
        email,
        loginMethod: "local",
        passwordHash: credentialEncryptionService.hashPassword(input.password),
        role: input.role,
      });
      await recordAudit({
        userId: ctx.user.id, action: "usuario_criado", entity: "user",
        origin: "admin", summary: `Criou ${email} (${input.role})`, ...requestOrigin(ctx.req),
      });
      return { success: true };
    }),

  updateRole: adminProcedure
    .input(z.object({ id: z.number().int().positive(), role: z.enum(ROLES) }))
    .mutation(({ ctx, input }) => comLockDeAdmin(async () => {
      const { db, todos } = await carregarUsuarios();
      if (input.role !== "admin" && ehUltimoAdmin(todos, input.id)) {
        throw new Error("Não é possível rebaixar o único administrador do sistema.");
      }
      await db.update(users).set({ role: input.role }).where(eq(users.id, input.id));
      await recordAudit({
        userId: ctx.user.id, action: "usuario_papel_alterado", entity: "user", entityId: input.id,
        origin: "admin", summary: `Papel alterado para ${input.role}`, ...requestOrigin(ctx.req),
      });
      return { success: true };
    })),

  resetPassword: adminProcedure
    .input(z.object({ id: z.number().int().positive(), password: z.string().min(8).max(200) }))
    .mutation(async ({ ctx, input }) => {
      const { db } = await carregarUsuarios();
      // Redefinir a senha também LIBERA a conta: sem zerar o bloqueio por
      // tentativas inválidas, o usuário continuava recebendo 429 com a senha
      // nova em mãos e o admin não tinha como saber que faltava desbloquear.
      await db.update(users)
        .set({
          passwordHash: credentialEncryptionService.hashPassword(input.password),
          failedLoginAttempts: 0,
          lockedUntil: null,
        })
        .where(eq(users.id, input.id));
      await recordAudit({
        userId: ctx.user.id, action: "usuario_senha_redefinida", entity: "user", entityId: input.id,
        origin: "admin", summary: "Senha redefinida pelo admin (conta desbloqueada)", ...requestOrigin(ctx.req),
      });
      return { success: true };
    }),

  /** Desbloqueia uma conta travada por tentativas inválidas (§16). */
  unlock: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const { db } = await carregarUsuarios();
      await db.update(users)
        .set({ failedLoginAttempts: 0, lockedUntil: null })
        .where(eq(users.id, input.id));
      await recordAudit({
        userId: ctx.user.id, action: "usuario_desbloqueado", entity: "user", entityId: input.id,
        origin: "admin", summary: "Conta desbloqueada", ...requestOrigin(ctx.req),
      });
      return { success: true };
    }),

  /**
   * Desativa/reativa uma conta (§ revogação): forma segura de revogar acesso —
   * inclusive de usuários OAuth, cuja linha seria recriada se apenas deletada.
   */
  setDisabled: adminProcedure
    .input(z.object({ id: z.number().int().positive(), disabled: z.boolean() }))
    .mutation(({ ctx, input }) => comLockDeAdmin(async () => {
      const { db, todos } = await carregarUsuarios();
      if (input.disabled && input.id === ctx.user.id) {
        throw new Error("Você não pode desativar a própria conta.");
      }
      if (input.disabled && ehUltimoAdmin(todos, input.id)) {
        throw new Error("Não é possível desativar o único administrador do sistema.");
      }
      await db.update(users).set({ disabled: input.disabled }).where(eq(users.id, input.id));
      await recordAudit({
        userId: ctx.user.id, action: input.disabled ? "usuario_desativado" : "usuario_reativado",
        entity: "user", entityId: input.id, origin: "admin",
        summary: input.disabled ? "Conta desativada (acesso revogado)" : "Conta reativada",
        ...requestOrigin(ctx.req),
      });
      return { success: true };
    })),

  remove: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ ctx, input }) => comLockDeAdmin(async () => {
      const { db, todos } = await carregarUsuarios();
      if (input.id === ctx.user.id) throw new Error("Você não pode remover a própria conta.");
      if (ehUltimoAdmin(todos, input.id)) {
        throw new Error("Não é possível remover o único administrador do sistema.");
      }
      const alvo = todos.find((u) => u.id === input.id);
      await db.delete(users).where(eq(users.id, input.id));
      await recordAudit({
        userId: ctx.user.id, action: "usuario_removido", entity: "user", entityId: input.id,
        origin: "admin", summary: `Removeu ${alvo?.email ?? input.id}`, ...requestOrigin(ctx.req),
      });
      return { success: true };
    })),
});
