import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { ENV } from "./env";
import { getAuthDisabledUser } from "./authDisabled";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  // AUTH_DISABLED=true desativa autenticação: todos os requests são aceitos como
  // admin. O usuário devolvido é uma linha REAL de `users` (ver authDisabled.ts):
  // as colunas de auditoria têm FK para users.id e rejeitariam um id sintético.
  if (ENV.authDisabled) {
    return {
      req: opts.req,
      res: opts.res,
      user: await getAuthDisabledUser(),
    };
  }

  try {
    user = await sdk.authenticateRequest(opts.req);
    // Conta desativada/revogada: trata como não autenticada (bloqueia acesso
    // mesmo para usuários OAuth recriados a partir de uma sessão válida).
    if (user?.disabled) user = null;
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
