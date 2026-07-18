import { publicProcedure, router } from "../_core/trpc";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "../_core/cookies";
import { sql, eq } from "drizzle-orm";
import { users } from "../../drizzle/schema";
import { getDb } from "../db";

export const authRouter = router({
    me: publicProcedure.query((opts) => {
      const u = opts.ctx.user;
      if (!u) return null;
      // Nunca serializar o hash de senha nem o segredo MFA para o cliente.
      const { passwordHash, mfaSecret, ...safe } = u as typeof u & {
        passwordHash?: unknown;
        mfaSecret?: unknown;
      };
      return safe;
    }),
    logout: publicProcedure.mutation(async ({ ctx }) => {
      // Revogação real: além de limpar o cookie, incrementa a versão de sessão
      // do usuário — qualquer token antigo (inclusive um capturado) morre aqui,
      // em vez de continuar válido pelos 7 dias do TTL.
      if (ctx.user) {
        try {
          const db = await getDb();
          if (db) {
            await db
              .update(users)
              .set({ sessionVersion: sql`${users.sessionVersion} + 1` })
              .where(eq(users.id, ctx.user.id));
          }
        } catch {
          // Logout nunca falha por indisponibilidade de banco: o cookie some
          // do navegador de qualquer forma.
        }
      }
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  });
