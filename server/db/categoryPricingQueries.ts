import { eq } from "drizzle-orm";
import { getDb } from "../db";
import {
  categoryPricingRules,
  InsertCategoryPricingRule,
  CategoryPricingRule,
} from "../../drizzle/schema";

/**
 * Listar todas as regras de precificação por categoria
 */
export async function listCategoryPricingRules(): Promise<CategoryPricingRule[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(categoryPricingRules);
}

/**
 * Obter regra de precificação por ID de categoria
 */
export async function getCategoryPricingRule(categoryId: number): Promise<CategoryPricingRule | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select()
    .from(categoryPricingRules)
    .where(eq(categoryPricingRules.categoryId, categoryId))
    .limit(1);
  return result[0] || null;
}

/**
 * Criar nova regra de precificação
 */
export async function createCategoryPricingRule(
  data: InsertCategoryPricingRule
): Promise<CategoryPricingRule> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  const result = await db.insert(categoryPricingRules).values(data);
  const id = (result as any).insertId;
  
  const created = await db
    .select()
    .from(categoryPricingRules)
    .where(eq(categoryPricingRules.id, Number(id)))
    .limit(1);
  
  if (!created[0]) {
    throw new Error("Falha ao criar regra de precificação");
  }
  
  return created[0];
}

/**
 * Atualizar regra de precificação existente
 */
export async function updateCategoryPricingRule(
  categoryId: number,
  data: Partial<InsertCategoryPricingRule>
): Promise<CategoryPricingRule> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  await db
    .update(categoryPricingRules)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(categoryPricingRules.categoryId, categoryId));
  
  const updated = await getCategoryPricingRule(categoryId);
  if (!updated) {
    throw new Error("Regra não encontrada após atualização");
  }
  
  return updated;
}

/**
 * Deletar regra de precificação
 */
export async function deleteCategoryPricingRule(categoryId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  await db
    .delete(categoryPricingRules)
    .where(eq(categoryPricingRules.categoryId, categoryId));
  
  return true;
}

/**
 * Obter regras ativas por categoria
 */
export async function getActiveCategoryPricingRules(): Promise<CategoryPricingRule[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(categoryPricingRules)
    .where(eq(categoryPricingRules.isActive, "yes"));
}

/**
 * Obter regras por múltiplas categorias
 */
export async function getCategoryPricingRulesByIds(
  categoryIds: number[]
): Promise<CategoryPricingRule[]> {
  if (categoryIds.length === 0) return [];
  
  const db = await getDb();
  if (!db) return [];
  
  // Buscar regras para cada categoria
  const rules: CategoryPricingRule[] = [];
  for (const categoryId of categoryIds) {
    const rule = await getCategoryPricingRule(categoryId);
    if (rule) rules.push(rule);
  }
  return rules;
}
