import { and, eq } from "drizzle-orm";
import { products, suppliers } from "../../drizzle/schema";
import { getDb } from "../db";

export interface CreateSupplierResult {
  id: number;
  name: string;
  isNew: boolean;
}

export interface CreateProductResult {
  id: number;
  name: string;
  ean?: string;
  price: number;
  supplierId: number;
  isNew: boolean;
}

/** Cria ou retorna fornecedor existente pelo nome normalizado. */
export async function createOrGetSupplier(supplierName: string): Promise<CreateSupplierResult> {
  const name = supplierName.trim();
  if (!name) throw new Error("Nome do fornecedor não informado");

  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const existing = await db
    .select()
    .from(suppliers)
    .where(eq(suppliers.name, name))
    .limit(1);

  if (existing[0]) {
    return { id: existing[0].id, name: existing[0].name, isNew: false };
  }

  const [result] = await db.insert(suppliers).values({ name, isActive: "yes" });
  const id = Number((result as { insertId?: number }).insertId);
  if (!Number.isInteger(id) || id <= 0) throw new Error("Falha ao obter o ID do fornecedor criado");

  return { id, name, isNew: true };
}

/**
 * Importa todos os itens da NF-e em uma única transação.
 * Qualquer erro reverte o lote inteiro, evitando histórico "concluído" com
 * apenas parte dos produtos efetivamente gravados.
 */
export async function createProductsFromNfe(
  supplierId: number,
  nfeProducts: Array<{
    productName: string;
    ean?: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    unit?: string;
  }>,
): Promise<CreateProductResult[]> {
  if (!Number.isInteger(supplierId) || supplierId <= 0) throw new Error("Fornecedor inválido");
  if (nfeProducts.length === 0) throw new Error("Nenhum produto selecionado para importação");

  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  return db.transaction(async (tx) => {
    const imported: CreateProductResult[] = [];

    for (const item of nfeProducts) {
      const name = item.productName.trim();
      const ean = item.ean?.trim() || undefined;
      const quantity = Number(item.quantity);
      const price = Number(item.unitPrice);

      if (!name) throw new Error("Produto da NF-e sem nome");
      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new Error(`Quantidade inválida para ${name}`);
      }
      if (!Number.isFinite(price) || price < 0) {
        throw new Error(`Preço inválido para ${name}`);
      }

      const existing = ean
        ? await tx
            .select()
            .from(products)
            .where(and(eq(products.ean, ean), eq(products.supplierId, supplierId)))
            .limit(1)
        : [];

      if (existing[0]) {
        await tx
          .update(products)
          .set({
            name,
            price: price.toFixed(2),
            priceUnit: item.unit ?? existing[0].priceUnit ?? "UN",
            stock: quantity.toString(),
            updatedAt: new Date(),
          })
          .where(eq(products.id, existing[0].id));

        imported.push({
          id: existing[0].id,
          name,
          ean,
          price,
          supplierId,
          isNew: false,
        });
        continue;
      }

      const [result] = await tx.insert(products).values({
        name,
        supplierId,
        ean: ean ?? null,
        price: price.toFixed(2),
        priceUnit: item.unit ?? "UN",
        stock: quantity.toString(),
        description: "Importado de NF-e; pendente de enriquecimento e revisão técnica.",
        imageUrl: null,
        isActive: "yes",
        tipoCatalogo: "produto_nao_medicamentoso",
        statusConfiabilidade: "incompleto",
      });

      const id = Number((result as { insertId?: number }).insertId);
      if (!Number.isInteger(id) || id <= 0) {
        throw new Error(`Falha ao obter o ID do produto ${name}`);
      }

      imported.push({ id, name, ean, price, supplierId, isNew: true });
    }

    if (imported.length !== nfeProducts.length) {
      throw new Error(`Importação incompleta: ${imported.length} de ${nfeProducts.length} itens`);
    }

    return imported;
  });
}
