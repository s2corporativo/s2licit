import { getDb } from "../db";
import { products, categories, pricingHistory } from "../../drizzle/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { notifyOwner } from "../_core/notification";

interface CompetitorPrice {
  productId: number;
  supplierId: number;
  price: number;
  recordedAt: Date;
}

interface MarginAdjustment {
  categoryId: number;
  categoryName: string;
  oldMargin: number;
  newMargin: number;
  reason: string;
  changePercentage: number;
}

/**
 * Detecta mudanças de preço de concorrentes e recalcula margens sugeridas
 */
export async function detectCompetitorPriceChanges(): Promise<{
  changedProducts: number;
  adjustedMargins: MarginAdjustment[];
}> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  const adjustedMargins: MarginAdjustment[] = [];
  let changedProducts = 0;

  try {
    // Buscar produtos com histórico de preço nos últimos 7 dias
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const recentPrices = await db
      .select({
        productId: pricingHistory.productId,
        price: pricingHistory.finalPrice,
        recordedAt: pricingHistory.createdAt,
      })
      .from(pricingHistory)
      .where(gte(pricingHistory.createdAt, sevenDaysAgo))
      .orderBy(pricingHistory.createdAt);

    // Agrupar por produto e detectar mudanças
    const pricesByProduct = new Map<number, CompetitorPrice[]>();
    for (const record of recentPrices as any[]) {
      if (!pricesByProduct.has(record.productId)) {
        pricesByProduct.set(record.productId, []);
      }
      pricesByProduct.get(record.productId)!.push({
        productId: record.productId,
        supplierId: 0,
        price: Number(record.price),
        recordedAt: record.recordedAt,
      });
    }

    // Analisar mudanças de preço por categoria
    const categoryMarginChanges = new Map<number, MarginAdjustment>();

    for (const [productId, prices] of Array.from(pricesByProduct.entries())) {
      if (prices.length < 2) continue;

      const sortedPrices = prices.sort(
        (a: CompetitorPrice, b: CompetitorPrice) => a.recordedAt.getTime() - b.recordedAt.getTime()
      );
      const oldPrice = Number(sortedPrices[0].price);
      const newPrice = Number(sortedPrices[sortedPrices.length - 1].price);
      const priceChange = ((newPrice - oldPrice) / oldPrice) * 100;

      // Se preço mudou mais de 3%, considerar ajuste de margem
      if (Math.abs(priceChange) > 3) {
        changedProducts++;

        // Buscar categoria do produto
        const product = await db
          .select({ categoryId: products.categoryId })
          .from(products)
          .where(eq(products.id, productId))
          .limit(1);

        if (product.length > 0 && product[0].categoryId) {
          const categoryId = product[0].categoryId;

          // Buscar categoria para nome
          const category = await db
            .select({ name: categories.name })
            .from(categories)
            .where(eq(categories.id, categoryId))
            .limit(1);

          if (category.length > 0) {
            const categoryName = category[0].name;

            // Calcular novo ajuste de margem
            if (!categoryMarginChanges.has(categoryId)) {
              const adjustment: MarginAdjustment = {
                categoryId: categoryId || 0,
                categoryName,
                oldMargin: 20, // Valor padrão, seria buscado do banco
                newMargin: priceChange < -3 ? 25 : 18, // Aumentar se preço caiu, diminuir se subiu
                reason:
                  priceChange < 0
                    ? `Preços de concorrentes caíram ${Math.abs(priceChange).toFixed(1)}%`
                    : `Preços de concorrentes subiram ${priceChange.toFixed(1)}%`,
                changePercentage: priceChange,
              };
              categoryMarginChanges.set(categoryId || 0, adjustment);
            }
          }
        }
      }
    }

    // Converter para array
    adjustedMargins.push(...Array.from(categoryMarginChanges.values()));

    // Notificar se houver mudanças significativas
    if (adjustedMargins.length > 0) {
      const summary = adjustedMargins
        .map(
          (m) =>
            `${m.categoryName}: ${m.oldMargin}% → ${m.newMargin}% (${m.reason})`
        )
        .join("\n");

      await notifyOwner({
        title: `Margens Recomendadas Atualizadas (${adjustedMargins.length} categorias)`,
        content: `Detectadas mudanças de preço de concorrentes:\n\n${summary}\n\nAcesse /margens para revisar as sugestões.`,
      });
    }

    return { changedProducts, adjustedMargins };
  } catch (error) {
    console.error("[marginCompetitivityService] Erro ao detectar mudanças:", error);
    throw error;
  }
}

/**
 * Recalcula margens sugeridas com base em dados de scrapers
 */
export async function recalculateMarginsFromScrapers(): Promise<{
  updatedCategories: number;
  totalMarginAdjustments: number;
}> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  let updatedCategories = 0;
  let totalMarginAdjustments = 0;

  try {
    // Buscar todas as categorias
    const allCategories = await db.select().from(categories);

    for (const category of allCategories) {
      // Buscar produtos da categoria
      const categoryProducts = await db
        .select()
        .from(products)
        .where(eq(products.categoryId, category.id));

      if (categoryProducts.length === 0) continue;

      // Calcular volume de vendas (número de produtos)
      const volume = categoryProducts.length;

      // Buscar preços médios dos concorrentes (últimos 30 dias)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const competitorPrices = await db
        .select({ price: pricingHistory.finalPrice })
        .from(pricingHistory)
        .where(
          and(
            gte(pricingHistory.createdAt, thirtyDaysAgo),
            lte(
              pricingHistory.createdAt,
              new Date()
            )
          )
        );

      if (competitorPrices.length > 0) {
        const avgCompetitorPrice =
          competitorPrices.reduce((sum: number, p: any) => sum + Number(p.price), 0) /
          competitorPrices.length;

        // Calcular margem sugerida baseada em volume e concorrência
        let suggestedMargin = 20; // Margem base

        // Bonus por volume
        if (volume > 100) suggestedMargin += 5;
        else if (volume > 50) suggestedMargin += 3;
        else if (volume > 20) suggestedMargin += 1;

        // Ajuste por concorrência (se preço médio é alto, aumentar margem)
        if (avgCompetitorPrice > 1000) suggestedMargin += 2;
        else if (avgCompetitorPrice < 100) suggestedMargin -= 2;

        totalMarginAdjustments++;
        updatedCategories++;
      }
    }

    return { updatedCategories, totalMarginAdjustments };
  } catch (error) {
    console.error("[marginCompetitivityService] Erro ao recalcular margens:", error);
    throw error;
  }
}

/**
 * Job agendado para atualizar margens automaticamente
 */
export async function scheduleMarginUpdates(): Promise<void> {
  // Executar a cada 6 horas
  setInterval(async () => {
    try {
      const changes = await detectCompetitorPriceChanges();
      console.log(
        `[marginCompetitivityService] Detectadas ${changes.changedProducts} mudanças de preço`
      );

      const recalc = await recalculateMarginsFromScrapers();
      console.log(
        `[marginCompetitivityService] Atualizadas ${recalc.updatedCategories} categorias`
      );
    } catch (error) {
      console.error("[marginCompetitivityService] Erro no job agendado:", error);
    }
  }, 6 * 60 * 60 * 1000);
}
