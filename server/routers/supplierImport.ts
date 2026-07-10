import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { suppliers, supplierImports, products } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { parseStringPromise } from "xml2js";
import { sql } from "drizzle-orm";

const importSupplierXmlSchema = z.object({
  supplierId: z.number(),
  xmlContent: z.string().min(1),
});

interface XmlProduct {
  nome?: string[];
  codigo?: string[];
  ean?: string[];
  preco?: string[];
  descricao?: string[];
  principioAtivo?: string[];
  concentracao?: string[];
  apresentacao?: string[];
  fabricante?: string[];
}

export const supplierImportRouter = router({
  /**
   * Importar produtos de fornecedor via XML
   */
  importXml: adminProcedure
    .input(importSupplierXmlSchema)
    .mutation(async ({ input }: { input: { supplierId: number; xmlContent: string } }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco de dados não disponível");

      // Criar registro de importação
      await db
        .insert(supplierImports)
        .values({
          supplierId: input.supplierId,
          fileName: `import-${Date.now()}.xml`,
          fileContent: input.xmlContent,
          status: "processing",
        });

      // Obter ID da importação criada
      const importRecords = await db
        .select()
        .from(supplierImports)
        .where(eq(supplierImports.supplierId, input.supplierId))
        .orderBy((t) => t.id)
        .limit(1);

      const importId = importRecords[0]?.id;
      if (!importId) throw new Error("Falha ao criar registro de importação");

      try {
        // Parsear XML
        const parsed = await parseStringPromise(input.xmlContent);
        const items = parsed.produtos?.produto || [];

        if (!Array.isArray(items)) {
          throw new Error("Formato XML inválido");
        }

        let productsImported = 0;
        let productsMatched = 0;

        // Processar cada produto
        for (const item of items) {
          const xmlProduct = item as XmlProduct;
          const nome = xmlProduct.nome?.[0] || "";
          const codigo = xmlProduct.codigo?.[0];
          const ean = xmlProduct.ean?.[0];
          const preco = xmlProduct.preco?.[0];
          const descricao = xmlProduct.descricao?.[0];
          const principioAtivo = xmlProduct.principioAtivo?.[0];
          const concentracao = xmlProduct.concentracao?.[0];
          const apresentacao = xmlProduct.apresentacao?.[0];
          const fabricante = xmlProduct.fabricante?.[0];

          if (!nome) continue;

          // Verificar se produto já existe
          const existing = await db
            .select()
            .from(products)
            .where(eq(products.supplierId, input.supplierId))
            .limit(1);

          if (existing.length > 0) {
            productsMatched++;
          }

          // Converter preço para string DECIMAL
          let priceValue: string | null = null;
          if (preco) {
            const parsed = parseFloat(preco);
            if (!isNaN(parsed) && parsed > 0) {
              priceValue = parsed.toFixed(2);
            }
          }

          // Inserir ou atualizar produto
          await db
            .insert(products)
            .values({
              supplierId: input.supplierId,
              name: nome,
              code: codigo,
              ean: ean,
              price: priceValue ? sql`CAST(${priceValue} AS DECIMAL(12,2))` : null,
              description: descricao,
              activeIngredient: principioAtivo,
              concentration: concentracao,
              presentation: apresentacao,
              manufacturer: fabricante,
              isActive: "yes",
            })
            .onDuplicateKeyUpdate({
              set: {
                name: nome,
                price: priceValue ? sql`CAST(${priceValue} AS DECIMAL(12,2))` : null,
                description: descricao,
                activeIngredient: principioAtivo,
                concentration: concentracao,
                presentation: apresentacao,
                manufacturer: fabricante,
              },
            });

          productsImported++;
        }

        // Atualizar registro de importação
        await db
          .update(supplierImports)
          .set({
            status: "completed",
            productsImported,
            productsMatched,
          })
          .where(eq(supplierImports.id, importId));

        return {
          success: true,
          importId,
          productsImported,
          productsMatched,
          message: `${productsImported} produtos importados com sucesso`,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";

        // Registrar erro
        await db
          .update(supplierImports)
          .set({
            status: "failed",
            errorMessage,
          })
          .where(eq(supplierImports.id, importId));

        throw new Error(`Falha na importação: ${errorMessage}`);
      }
    }),

  /**
   * Listar importações de um fornecedor
   */
  listImports: protectedProcedure
    .input(z.object({ supplierId: z.number() }))
    .query(async ({ input }: { input: { supplierId: number } }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco de dados não disponível");

      const imports = await db
        .select()
        .from(supplierImports)
        .where(eq(supplierImports.supplierId, input.supplierId));

      return imports;
    }),

  /**
   * Obter detalhes de uma importação
   */
  getImport: protectedProcedure
    .input(z.object({ importId: z.number() }))
    .query(async ({ input }: { input: { importId: number } }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco de dados não disponível");

      const importRecord = await db
        .select()
        .from(supplierImports)
        .where(eq(supplierImports.id, input.importId));

      if (importRecord.length === 0) {
        throw new Error("Importação não encontrada");
      }

      return importRecord[0];
    }),

  /**
   * Deletar importação
   */
  deleteImport: adminProcedure
    .input(z.object({ importId: z.number() }))
    .mutation(async ({ input }: { input: { importId: number } }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco de dados não disponível");

      await db.delete(supplierImports).where(eq(supplierImports.id, input.importId));

      return { success: true, message: "Importação deletada com sucesso" };
    }),
});
