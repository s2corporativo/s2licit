import { publicProcedure, router } from "../_core/trpc";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "../_core/cookies";

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
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  });
