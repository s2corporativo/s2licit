import type { NextFunction, Request, Response } from "express";

/**
 * Rate limiter em memória por IP (janela deslizante simples).
 *
 * Suficiente para uma instância única. Se o sistema um dia rodar com
 * múltiplas réplicas, trocar por um limitador com armazenamento
 * compartilhado (Redis).
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const CLEANUP_INTERVAL_MS = 60_000;

export function createRateLimiter(options: {
  windowMs: number;
  max: number;
  message?: string;
}) {
  const buckets = new Map<string, Bucket>();

  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }, CLEANUP_INTERVAL_MS);
  // Não impedir o processo de encerrar por causa do timer
  cleanup.unref?.();

  return function rateLimit(req: Request, res: Response, next: NextFunction) {
    const key = req.ip ?? "unknown";
    const now = Date.now();

    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + options.windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;

    if (bucket.count > options.max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfterSeconds));
      res.status(429).json({
        error: options.message ?? "Muitas requisições. Tente novamente em instantes.",
      });
      return;
    }

    next();
  };
}

/** Limite geral da API: 600 requisições por minuto por IP. */
export const apiRateLimiter = createRateLimiter({ windowMs: 60_000, max: 600 });

/** Limite estrito para autenticação: 10 tentativas por minuto por IP. */
export const authRateLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 10,
  message: "Muitas tentativas de login. Aguarde um minuto e tente novamente.",
});
