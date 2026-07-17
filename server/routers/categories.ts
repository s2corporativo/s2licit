import { z } from "zod";
import { protectedProcedure, editorProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import { createCategory, deleteCategory, listCategories, listCategoriesHierarchy, updateCategory } from "../db";

export const categoriesRouter = router({
    list: protectedProcedure.query(() => listCategories()),
    listHierarchy: protectedProcedure.query(() => listCategoriesHierarchy()),

    create: protectedProcedure
      .input(
        z.object({
          name: z.string().min(1).max(128),
          slug: z.string().min(1).max(128),
          description: z.string().optional(),
          color: z.string().optional(),
          sortOrder: z.number().optional(),
          parentId: z.number().optional(),
        })
      )
      .mutation(({ input }) => createCategory(input)),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().min(1).max(128).optional(),
          description: z.string().optional(),
          color: z.string().optional(),
          sortOrder: z.number().optional(),
          parentId: z.number().nullable().optional(),
        })
      )
      .mutation(({ input }) => {
        const { id, ...data } = input;
        return updateCategory(id, data);
      }),

    delete: editorProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteCategory(input.id)),
    // ── Sugestão automática de categoria via LLM ──────────────────────────
    suggest: protectedProcedure
      .input(
        z.object({
          productNames: z.array(z.string()).min(1).max(100),
        })
      )
      .mutation(async ({ input }) => {
        const allCats = await listCategoriesHierarchy();
        // Montar lista plana de categorias para o LLM
        const catList = allCats.flatMap((p) => [
          { id: p.id, name: p.name, parent: null },
          ...(p.children ?? []).map((c) => ({ id: c.id, name: c.name, parent: p.name })),
        ]);
        const catSummary = catList
          .map((c) => `${c.id}: ${c.parent ? c.parent + " > " : ""}${c.name}`)
          .join("\n");
        try {
          const llmResp = await invokeLLM({
            messages: [
              {
                role: "system" as const,
                content:
                  "Você é um especialista em classificação de produtos agropecuários, veterinários e de construção. " +
                  "Para cada produto listado, escolha a categoria mais adequada da lista fornecida. " +
                  "Prefira subcategorias (com pai) quando disponíveis. Responda APENAS com JSON válido.",
              },
              {
                role: "user" as const,
                content:
                  `Categorias disponíveis:\n${catSummary}\n\n` +
                  `Produtos para classificar:\n${JSON.stringify(
                    input.productNames.map((name, idx) => ({ idx, name }))
                  )}`,
              },
            ],
            response_format: {
              type: "json_schema" as const,
              json_schema: {
                name: "category_suggestions",
                strict: true,
                schema: {
                  type: "object",
                  properties: {
                    results: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          idx: { type: "integer" },
                          categoryId: { type: "integer" },
                          categoryName: { type: "string" },
                          confidence: { type: "number" },
                        },
                        required: ["idx", "categoryId", "categoryName", "confidence"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["results"],
                  additionalProperties: false,
                },
              },
            },
          });
          const parsed = JSON.parse(llmResp.choices[0].message.content as string) as {
            results: { idx: number; categoryId: number; categoryName: string; confidence: number }[];
          };
          return { results: parsed.results };
        } catch {
          return { results: [] };
        }
      }),
  });
