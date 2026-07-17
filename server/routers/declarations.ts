import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { asc, eq } from "drizzle-orm";
import { declarationTemplates, proposalDeclarations } from "../../drizzle/schema";
import { getDb } from "../db";

export const declarationsRouter = router({
    listTemplates: protectedProcedure.query(async () => {
      const db = await getDb();
      return (db as any).select().from(declarationTemplates).orderBy(asc(declarationTemplates.sortOrder));
    }),
    upsertTemplate: protectedProcedure
      .input(z.object({
        id: z.number().optional(),
        title: z.string().min(1).max(256),
        content: z.string(),
        sortOrder: z.number().optional(),
        isActive: z.enum(["yes", "no"]).optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (input.id) {
          await (db as any).update(declarationTemplates).set({
            title: input.title,
            content: input.content,
            sortOrder: input.sortOrder ?? 0,
            isActive: input.isActive ?? "yes",
          }).where(eq(declarationTemplates.id, input.id));
          return { id: input.id };
        }
        const [res] = await (db as any).insert(declarationTemplates).values({
          title: input.title,
          content: input.content,
          sortOrder: input.sortOrder ?? 0,
          isActive: input.isActive ?? "yes",
        });
        return { id: (res as any).insertId };
      }),
    deleteTemplate: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        await (db as any).delete(declarationTemplates).where(eq(declarationTemplates.id, input.id));
        return { ok: true };
      }),
    // Snapshot: gravar declarações na proposta
    saveSnapshot: protectedProcedure
      .input(z.object({
        proposalId: z.number(),
        declarations: z.array(z.object({
          templateId: z.number().optional().nullable(),
          title: z.string(),
          content: z.string(),
          sortOrder: z.number().optional(),
        })),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        // Remove existing and re-insert
        await (db as any).delete(proposalDeclarations).where(eq(proposalDeclarations.proposalId, input.proposalId));
        if (input.declarations.length > 0) {
          await (db as any).insert(proposalDeclarations).values(
            input.declarations.map((d, i) => ({
              proposalId: input.proposalId,
              templateId: d.templateId ?? null,
              title: d.title,
              content: d.content,
              sortOrder: d.sortOrder ?? i,
            }))
          );
        }
        return { ok: true };
      }),
    getForProposal: protectedProcedure
      .input(z.object({ proposalId: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        return (db as any).select().from(proposalDeclarations)
          .where(eq(proposalDeclarations.proposalId, input.proposalId))
          .orderBy(asc(proposalDeclarations.sortOrder));
      }),
  });
