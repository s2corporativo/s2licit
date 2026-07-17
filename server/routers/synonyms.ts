import { sql } from "drizzle-orm";
import { z } from "zod";
import { editorProcedure, protectedProcedure, router } from "../_core/trpc";
import { bulkCreateSynonyms, bulkDeleteSynonyms, bulkToggleSynonyms, createSynonym, deleteSynonym, getDb, listSynonyms, updateSynonym } from "../db";

export const synonymsRouter = router({
    list: protectedProcedure
      .input(z.object({
        category: z.string().optional(),
        search: z.string().optional(),
        activeOnly: z.boolean().optional(),
      }).optional())
      .query(({ input }) => listSynonyms(input ?? {})),

    create: protectedProcedure
      .input(z.object({
        term: z.string().min(1).max(256),
        canonical: z.string().min(1).max(256),
        category: z.string().optional(),
        isActive: z.enum(["yes", "no"]).optional(),
      }))
      .mutation(({ input }) => createSynonym(input as any)),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        term: z.string().min(1).max(256).optional(),
        canonical: z.string().min(1).max(256).optional(),
        category: z.string().optional(),
        isActive: z.enum(["yes", "no"]).optional(),
      }))
      .mutation(({ input }) => {
        const { id, ...data } = input;
        return updateSynonym(id, data as any);
      }),

    delete: editorProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteSynonym(input.id)),

    bulkCreate: protectedProcedure
      .input(z.object({
        items: z.array(z.object({
          term: z.string().min(1).max(256),
          canonical: z.string().min(1).max(256),
          category: z.string().optional(),
        })),
      }))
      .mutation(({ input }) =>
        bulkCreateSynonyms(input.items.map((i) => ({ ...i, isActive: "yes" as const })))
      ),

    bulkToggle: protectedProcedure
      .input(z.object({
        ids: z.array(z.number()).min(1).max(500),
        isActive: z.enum(["yes", "no"]),
      }))
      .mutation(({ input }) => bulkToggleSynonyms(input.ids, input.isActive)),
    bulkDelete: protectedProcedure
      .input(z.object({
        ids: z.array(z.number()).min(1).max(500),
      }))
      .mutation(({ input }) => bulkDeleteSynonyms(input.ids)),
    // Retorna estatísticas de uso dos sinônimos
    stats: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return { total: 0, byCategory: [] };
      const [rows] = await (db as any).execute(sql`
        SELECT category, COUNT(*) as count
        FROM synonyms
        WHERE isActive = 'yes'
        GROUP BY category
        ORDER BY count DESC
      `);
      const rowsArr = Array.isArray(rows) ? rows : [];
      const total = rowsArr.reduce((s: number, r: any) => s + Number(r.count), 0);
      return { total, byCategory: rowsArr as Array<{ category: string; count: number }> };
    }),
  });
