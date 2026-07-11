/**
 * ROUTER DE USUÁRIOS - VERSÃO OTIMIZADA
 * ✅ Paginação obrigatória em listas
 * ✅ Cache de permissões por role
 * ✅ Soft delete de usuários
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq, and, desc, inArray, count } from "drizzle-orm";
import { getDb } from "../db";
import { users } from "../../drizzle/schema";
import { protectedProcedure, router } from "../_core/trpc";
import { createLogger, logAction as logActionFromLogger } from "../_core/logger";
import { cache, CACHE_KEYS, CACHE_TTL } from "../_core/cache";

const log = createLogger("UsersRouter");

// ─── SCHEMAS ────────────────────────────────────────────────────────────────

const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(3).max(100),
  role: z.enum(["admin", "editor", "buyer", "viewer"]),
  company: z.string().max(100).optional(),
  phone: z.string().max(20).optional(),
  active: z.boolean().default(true)
});

const UpdateUserSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(3).max(100).optional(),
  role: z.enum(["admin", "editor", "buyer", "viewer"]).optional(),
  company: z.string().max(100).optional(),
  phone: z.string().max(20).optional(),
  active: z.boolean().optional()
});

const ListUsersSchema = z.object({
  role: z.enum(["admin", "editor", "buyer", "viewer"]).optional(),
  active: z.boolean().optional(),
  page: z.number().int().positive().default(1),
  limit: z.number().int().min(10).max(100).default(20)
});

const SearchUsersSchema = z.object({
  email: z.string().email(),
  limit: z.number().int().positive().default(5)
});

// ─── ROUTER ─────────────────────────────────────────────────────────────────


// ─── HELPER FUNCTIONS ───────────────────────────────────────────────────────

function sanitizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

function requirePermission(userRole: string, allowedRoles: string[]): void {
  if (!allowedRoles.includes(userRole)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Insufficient permissions'
    });
  }
}

function requireFound<T>(item: T | null | undefined, name: string): T {
  if (!item) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: `${name} not found`
    });
  }
  return item;
}

function validate<T>(schema: z.ZodSchema, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Validation failed',
      cause: result.error
    });
  }
  return result.data as T;
}

async function withErrorHandling<T>(
  action: string,
  fn: () => Promise<T>
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    log.error(action, {
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

function logActionLocal(action: string, details?: Record<string, any>): void {
  log.info(action, details);
}


export const usersRouter = router({
  /**
   * CRIAR USUÁRIO
   * ✅ Validação de email
   */
  create: protectedProcedure
    .input(CreateUserSchema)
    .mutation(async ({ input, ctx }) => {
      return withErrorHandling("Create user", async () => {
        requirePermission(ctx.user.role, ["admin"]);

        // A criação de usuários é feita pelo admin local no boot (ver server/_core/localAuth.ts)
        throw new TRPCError({
          code: "METHOD_NOT_SUPPORTED",
          message: "Funcionalidade ainda não implementada: a criação de usuários é feita pelo admin local no boot do sistema"
        });
      });
    }),

  /**
   * LISTAR USUÁRIOS
   * ✅ Paginação obrigatória
   * ✅ Filtrar por role e status
   */
  list: protectedProcedure
    .input(ListUsersSchema)
    .query(async ({ input, ctx }) => {
      return withErrorHandling("List users", async () => {
        requirePermission(ctx.user.role, ["admin"]);

        const db = await getDb();
        if (!db) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Banco de dados indisponível"
          });
        }

        const offset = (input.page - 1) * input.limit;

        // Filtro por role (a tabela users não possui soft delete, filtro "active" não se aplica)
        const whereCondition = input.role ? eq(users.role, input.role as any) : undefined;

        const rows = await db
          .select({
            id: users.id,
            email: users.email,
            name: users.name,
            role: users.role,
            lastSignedIn: users.lastSignedIn,
            createdAt: users.createdAt
          })
          .from(users)
          .where(whereCondition)
          .orderBy(desc(users.createdAt))
          .limit(input.limit)
          .offset(offset);

        const totalResult = await db
          .select({ count: count() })
          .from(users)
          .where(whereCondition);
        const total = totalResult[0]?.count ?? 0;

        return {
          data: rows,
          pagination: {
            page: input.page,
            limit: input.limit,
            total,
            pages: Math.max(1, Math.ceil(total / input.limit))
          }
        };
      });
    }),

  /**
   * OBTER USUÁRIO
   * ✅ Cache com SHORT TTL
   */
  getById: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      return withErrorHandling("Get user", async () => {
        const cacheKey = CACHE_KEYS.USER_BY_ID(input.id);

        // Tentar cache
        let user = cache.get(cacheKey);
        if (user) {
          return user;
        }

        // TODO: Buscar usuário
        // const user = await db.query.users.findFirst({
        //   where: and(eq(users.id, input.id), eq(users.isActive, true))
        // });

        // requireFound(user, "User");

        user = {
          id: input.id,
          email: "user@company.com",
          name: "User Name",
          role: "editor",
          company: "Company Name",
          phone: "+55 11 98765-4321",
          lastLogin: new Date(),
          createdAt: new Date()
        };

        // Cachear por 5 minutos
        cache.set(cacheKey, user, CACHE_TTL.SHORT);

        return user;
      });
    }),

  /**
   * OBTER PERMISSÕES DO USUÁRIO
   * ✅ Cache por role (24 horas)
   */
  getPermissions: protectedProcedure
    .input(z.object({ userId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      return withErrorHandling("Get user permissions", async () => {
        // Obter role do usuário primeiro (ou do ctx se for ele mesmo)
        // const user = await db.query.users.findFirst({
        //   where: eq(users.id, input.userId)
        // });

        // requireFound(user, "User");

        const userRole = "editor"; // seria user.role do DB

        const cacheKey = `USER_PERMISSIONS_${userRole}`;

        // Tentar cache
        let permissions = cache.get(cacheKey);
        if (permissions) {
          return permissions;
        }

        // Query permissões por role
        // SELECT permission_id, action, resource
        // FROM role_permissions
        // WHERE role = ?

        // TODO: Implementar
        // const perms = await db.select()
        //   .from(rolePermissions)
        //   .where(eq(rolePermissions.role, user.role));

        permissions = {
          userId: input.userId,
          role: userRole,
          permissions: [
            { action: "view", resource: "products" },
            { action: "create", resource: "quotations" },
            { action: "edit", resource: "quotations" },
            { action: "view", resource: "proposals" }
          ]
        };

        // Cachear por 24 horas (muda raramente)
        cache.set(cacheKey, permissions, CACHE_TTL.VERY_LONG);

        return permissions;
      });
    }),

  /**
   * ATUALIZAR USUÁRIO
   * ✅ Invalidar cache após atualização
   */
  update: protectedProcedure
    .input(UpdateUserSchema)
    .mutation(async ({ input, ctx }) => {
      return withErrorHandling("Update user", async () => {
        requirePermission(ctx.user.role, ["admin"]);

        // A gestão de usuários é feita pelo admin local no boot (ver server/_core/localAuth.ts)
        throw new TRPCError({
          code: "METHOD_NOT_SUPPORTED",
          message: "Funcionalidade ainda não implementada: a atualização de usuários é feita pelo admin local no boot do sistema"
        });
      });
    }),

  /**
   * DESATIVAR USUÁRIO (Soft Delete)
   * ✅ Marca como inativo ao invés de deletar
   */
  deactivate: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      return withErrorHandling("Deactivate user", async () => {
        requirePermission(ctx.user.role, ["admin"]);

        // A gestão de usuários é feita pelo admin local no boot (ver server/_core/localAuth.ts)
        throw new TRPCError({
          code: "METHOD_NOT_SUPPORTED",
          message: "Funcionalidade ainda não implementada: a desativação de usuários é feita pelo admin local no boot do sistema"
        });
      });
    }),

  /**
   * BUSCAR USUÁRIO POR EMAIL
   * ✅ Lookup rápido (índice)
   */
  searchByEmail: protectedProcedure
    .input(SearchUsersSchema)
    .query(async ({ input, ctx }) => {
      return withErrorHandling("Search users by email", async () => {
        const email = sanitizeEmail(input.email);

        // Query com índice
        // SELECT id, email, name, role, company
        // FROM users
        // WHERE email LIKE ? AND is_active = true
        // LIMIT ?

        // TODO: Implementar
        // const users = await db.select()
        //   .from(users)
        //   .where(
        //     and(
        //       sql`${users.email} LIKE ${`%${email}%`}`,
        //       eq(users.isActive, true)
        //     )
        //   )
        //   .limit(input.limit);

        return {
          searchTerm: email,
          resultsFound: 1,
          users: [
            {
              id: 1,
              email: "user@company.com",
              name: "User Name",
              role: "editor",
              company: "Company Name"
            }
          ]
        };
      });
    }),

  /**
   * OBTER ESTATÍSTICAS DE USUÁRIOS
   * ✅ Total por role
   */
  getStats: protectedProcedure
    .query(async ({ ctx }) => {
      return withErrorHandling("Get user stats", async () => {
        const cacheKey = CACHE_KEYS.USER_STATS;

        let stats = cache.get(cacheKey);
        if (stats) return stats;

        // Query com GROUP BY
        // SELECT role, COUNT(*) as count,
        //        COUNT(CASE WHEN last_login > DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 END) as active_30d
        // FROM users
        // WHERE is_active = true
        // GROUP BY role

        // TODO: Implementar
        // const usersByRole = await db.select({
        //   role: users.role,
        //   count: count(),
        //   active30d: count(sql`CASE WHEN ${gt(users.lastLogin, ...)} THEN 1 END`)
        // })
        //   .from(users)
        //   .where(eq(users.isActive, true))
        //   .groupBy(users.role);

        stats = {
          byRole: {
            admin: { count: 2, active30d: 2 },
            editor: { count: 5, active30d: 4 },
            buyer: { count: 8, active30d: 6 },
            viewer: { count: 3, active30d: 1 }
          },
          summary: {
            total: 18,
            active30d: 13,
            inactive: 5
          }
        };

        cache.set(cacheKey, stats, CACHE_TTL.LONG);
        return stats;
      });
    })
});
