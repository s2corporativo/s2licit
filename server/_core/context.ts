import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { ENV } from "./env";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  // AUTH_DISABLED=true desativa autenticação: todos os requests são aceitos como admin
  if (ENV.authDisabled) {
    user = {
      id: -1,
      email: "[AUTH_DISABLED]",
      role: "admin",
      disabled: false,  // Nota: disabled é ignorado quando AUTH_DISABLED=true
    } as User;
    return {
      req: opts.req,
      res: opts.res,
      user,
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
