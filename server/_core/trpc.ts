import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

// Hierarquia única de autorização do backend.
// Leitura: qualquer usuário autenticado.
// Escrita: editor ou admin, mesmo quando a rota antiga ainda usa protectedProcedure.
const ROLE_RANK: Record<string, number> = { user: 0, viewer: 1, editor: 2, admin: 3 };

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  const rank = ROLE_RANK[(ctx.user.role as string) ?? "user"] ?? 0;
  if (opts.type === "mutation" && rank < ROLE_RANK.editor) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Operações de alteração exigem perfil Editor ou superior",
    });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

export const editorProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;
    const rank = ROLE_RANK[(ctx.user?.role as string) ?? "user"] ?? 0;
    if (!ctx.user || rank < ROLE_RANK.editor) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Requer perfil Editor ou superior" });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  }),
);
