import { notifyOwner } from "../_core/notification";
import { SyncStats } from "./priceSyncService";

/**
 * Sends notification to owner about price synchronization
 */
export async function notifyPriceSync(
  stats: SyncStats,
  supplierName: string
): Promise<boolean> {
  try {
    // Build title
    const title = `Sincronização de Preços - ${supplierName}`;

    // Build content
    const lines = [
      `📊 Sincronização de preços concluída com sucesso!`,
      ``,
      `Fornecedor: ${supplierName}`,
      `Data/Hora: ${stats.timestamp.toLocaleString("pt-BR")}`,
      ``,
      `📈 Resumo da Sincronização:`,
      `• Produtos atualizados: ${stats.totalProductsUpdated}`,
      `• Mudanças de preço: ${stats.totalPriceChanges}`,
      `• Novos fornecedores: ${stats.newSuppliersAdded}`,
    ];

    if (stats.priceIncreases > 0) {
      lines.push(`• Aumentos de preço: ${stats.priceIncreases}`);
    }

    if (stats.priceDecreases > 0) {
      lines.push(`• Reduções de preço: ${stats.priceDecreases}`);
    }

    if (stats.averagePriceChange !== 0) {
      const direction = stats.averagePriceChange > 0 ? "↑" : "↓";
      lines.push(
        `• Variação média: ${direction} ${Math.abs(stats.averagePriceChange).toFixed(2)}%`
      );
    }

    lines.push(``, `Acesse o sistema para visualizar os detalhes completos.`);

    const content = lines.join("\n");

    // Send notification
    const result = await notifyOwner({
      title,
      content,
    });

    return result;
  } catch (error) {
    console.error("Error sending price sync notification:", error);
    return false;
  }
}

/**
 * Sends notification for price sync errors
 */
export async function notifyPriceSyncError(
  error: string,
  supplierName: string
): Promise<boolean> {
  try {
    const title = `Erro na Sincronização de Preços - ${supplierName}`;
    const content = `Ocorreu um erro ao sincronizar preços para o fornecedor ${supplierName}:\n\n${error}\n\nPor favor, verifique o sistema e tente novamente.`;

    const result = await notifyOwner({
      title,
      content,
    });

    return result;
  } catch (err) {
    console.error("Error sending price sync error notification:", err);
    return false;
  }
}

/**
 * Sends notification for new suppliers detected
 */
export async function notifyNewSuppliersDetected(
  newSuppliers: Array<{ id: number; name: string }>,
  sourceNfe: string
): Promise<boolean> {
  try {
    if (newSuppliers.length === 0) return true;

    const title = `Novos Fornecedores Detectados - NFe ${sourceNfe}`;

    const supplierList = newSuppliers
      .map((s) => `• ${s.name} (ID: ${s.id})`)
      .join("\n");

    const content = `${newSuppliers.length} novo(s) fornecedor(es) foi/foram detectado(s) na NFe ${sourceNfe}:\n\n${supplierList}\n\nOs preços destes fornecedores foram adicionados à tabela de comparação.`;

    const result = await notifyOwner({
      title,
      content,
    });

    return result;
  } catch (error) {
    console.error("Error sending new suppliers notification:", error);
    return false;
  }
}

/**
 * Sends notification for significant price changes
 */
export async function notifySignificantPriceChanges(
  changes: Array<{
    productName: string;
    supplierName: string;
    oldPrice: number;
    newPrice: number;
    changePercent: number;
  }>,
  threshold: number = 10 // 10% threshold by default
): Promise<boolean> {
  try {
    const significantChanges = changes.filter(
      (c) => Math.abs(c.changePercent) >= threshold
    );

    if (significantChanges.length === 0) return true;

    const title = `Mudanças Significativas de Preço Detectadas`;

    const changesList = significantChanges
      .map((c) => {
        const direction = c.changePercent > 0 ? "↑" : "↓";
        return `• ${c.productName} (${c.supplierName}): ${direction} ${Math.abs(c.changePercent).toFixed(2)}% (R$ ${c.oldPrice.toFixed(2)} → R$ ${c.newPrice.toFixed(2)})`;
      })
      .join("\n");

    const content = `${significantChanges.length} produto(s) com mudança(s) de preço acima de ${threshold}%:\n\n${changesList}\n\nRevise os preços e atualize sua estratégia de compras se necessário.`;

    const result = await notifyOwner({
      title,
      content,
    });

    return result;
  } catch (error) {
    console.error("Error sending significant price changes notification:", error);
    return false;
  }
}
