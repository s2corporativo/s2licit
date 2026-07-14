import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

// Hierarquia única usada por toda a API. Consultas autenticadas aceitam Viewer;
// mutações exigem Editor por padrão, mesmo em routers legados que ainda usam
// `protectedProcedure` em vez de declarar `editorProcedure` explicitamente.
const ROLE_RANK: Record<string, number> = { user: 0, viewer: 1, editor: 2, admin: 3 };

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  if (opts.type === "mutation") {
    const rank = ROLE_RANK[(ctx.user.role as string) ?? "user"] ?? 0;
    if (rank < ROLE_RANK.editor) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Requer perfil Editor ou superior" });
    }
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

// Use explicitamente quando a própria definição do endpoint deve comunicar que
// se trata de uma operação de escrita (a proteção central acima continua sendo
// a rede de segurança para routers legados).
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
