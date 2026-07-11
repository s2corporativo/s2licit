import { getDb } from "../db";
import { suppliers, products } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

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

/**
 * Cria ou retorna fornecedor existente baseado em nome
 */
export async function createOrGetSupplier(
  supplierName: string
): Promise<CreateSupplierResult> {
  try {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");

    // Procurar fornecedor existente por nome
    const existing = await db
      .select()
      .from(suppliers)
      .where(eq(suppliers.name, supplierName))
      .limit(1);

    if (existing.length > 0) {
      return {
        id: existing[0].id,
        name: existing[0].name,
        isNew: false,
      };
    }

    // Criar novo fornecedor
    await db.insert(suppliers).values({
      name: supplierName,
      isActive: "yes",
    });

    // Obter ID do novo fornecedor
    const newSupplier = await db
      .select()
      .from(suppliers)
      .where(eq(suppliers.name, supplierName))
      .limit(1);

    if (!newSupplier || newSupplier.length === 0) {
      throw new Error("Falha ao criar fornecedor");
    }

    return {
      id: newSupplier[0].id,
      name: newSupplier[0].name,
      isNew: true,
    };
  } catch (error) {
    console.error("[createOrGetSupplier] Erro:", error instanceof Error ? error.message : String(error));
    throw error;
  }
}

/**
 * Cria produtos para um fornecedor baseado em dados de NFe
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
  }>
): Promise<CreateProductResult[]> {
  try {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");

    const createdProducts: CreateProductResult[] = [];

    for (const nfeProduct of nfeProducts) {
      try {
        // Procurar produto existente por EAN
        let existingProduct = null;
        if (nfeProduct.ean) {
          const found = await db
            .select()
            .from(products)
            .where(eq(products.ean, nfeProduct.ean))
            .limit(1);
          existingProduct = found.length > 0 ? found[0] : null;
        }

        if (existingProduct) {
          createdProducts.push({
            id: existingProduct.id,
            name: existingProduct.name,
            ean: existingProduct.ean ?? undefined,
            price: nfeProduct.unitPrice,
            supplierId,
            isNew: false,
          });
          continue;
        }

        // Criar novo produto
        await db.insert(products).values({
          name: nfeProduct.productName,
          supplierId,
          ean: nfeProduct.ean ?? null,
          price: nfeProduct.unitPrice.toString(),
          priceUnit: nfeProduct.unit ?? "UN",
          stock: nfeProduct.quantity.toString(),
          description: `Importado via NFe - Preço: R$ ${nfeProduct.unitPrice.toFixed(2)}`,
          imageUrl: null,
          isActive: "yes",
          tipoCatalogo: "produto_nao_medicamentoso",
          statusConfiabilidade: "incompleto",
        });

        // Obter produto criado
        const newProduct = await db
          .select()
          .from(products)
          .where(eq(products.ean, nfeProduct.ean ?? ""))
          .limit(1);

        if (newProduct && newProduct.length > 0) {
          createdProducts.push({
            id: newProduct[0].id,
            name: newProduct[0].name,
            ean: newProduct[0].ean ?? undefined,
            price: nfeProduct.unitPrice,
            supplierId,
            isNew: true,
          });
        }
      } catch (productError) {
        console.warn(`[createProductsFromNfe] Erro ao criar produto ${nfeProduct.productName}:`, productError instanceof Error ? productError.message : String(productError));
        // Continuar com próximo produto
      }
    }

    return createdProducts;
  } catch (error) {
    console.error("[createProductsFromNfe] Erro:", error instanceof Error ? error.message : String(error));
    throw error;
  }
}
