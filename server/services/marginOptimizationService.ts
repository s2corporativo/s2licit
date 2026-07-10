export interface CategoryMarginData {
  categoryId: number;
  volume: number;
  avgCost: number;
  currentMargin: number;
  competitorMargin: number;
  seasonalFactor: number;
  profitHistory: number[];
}

export class MarginOptimizationService {
  static calculateOptimalMargin(data: CategoryMarginData): { margin: number; reasoning: string } {
    const baseMargin = 20;
    const volumeBonus = Math.min(data.volume / 1000 * 5, 10);
    const competitorAdjustment = Math.max(0, data.competitorMargin - 5);
    const seasonalAdjustment = (data.seasonalFactor - 1) * 10;
    const profitTrend = this.calculateProfitTrend(data.profitHistory);

    const suggestedMargin = Math.round(
      baseMargin + volumeBonus + competitorAdjustment + seasonalAdjustment + profitTrend
    );

    const reasoning = `Base: ${baseMargin}% + Volume: ${volumeBonus.toFixed(1)}% + Concorrência: ${competitorAdjustment.toFixed(1)}% + Sazonalidade: ${seasonalAdjustment.toFixed(1)}% + Trend: ${profitTrend.toFixed(1)}%`;

    return { margin: Math.max(5, Math.min(50, suggestedMargin)), reasoning };
  }

  private static calculateProfitTrend(history: number[]): number {
    if (history.length < 2) return 0;
    const recent = history.slice(-3).reduce((a, b) => a + b, 0) / Math.min(3, history.length);
    const older = history.slice(0, -3).reduce((a, b) => a + b, 0) / Math.max(1, history.length - 3);
    return recent > older ? 2 : recent < older ? -2 : 0;
  }

  static batchOptimizeMargins(categories: CategoryMarginData[]): Array<{ categoryId: number; margin: number }> {
    return categories.map(cat => ({
      categoryId: cat.categoryId,
      margin: this.calculateOptimalMargin(cat).margin,
    }));
  }
}
