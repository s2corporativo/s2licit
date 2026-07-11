/**
 * Service for detecting and managing price variation alerts
 */

export interface PriceVariationAlert {
  id?: string;
  productId: number;
  productName: string;
  previousPrice: number;
  currentPrice: number;
  variationPercentage: number;
  variationType: "increase" | "decrease";
  severity: "low" | "medium" | "high" | "critical";
  supplierId?: number;
  supplierName?: string;
  createdAt: Date;
  acknowledged: boolean;
}

export interface PriceAlertConfig {
  id?: string;
  productId?: number;
  lowVariationThreshold: number; // e.g., 5%
  mediumVariationThreshold: number; // e.g., 10%
  highVariationThreshold: number; // e.g., 20%
  criticalVariationThreshold: number; // e.g., 30%
  enableNotifications: boolean;
  notifyOnIncrease: boolean;
  notifyOnDecrease: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Calculate variation percentage between two prices
 */
export function calculateVariationPercentage(
  previousPrice: number,
  currentPrice: number
): number {
  if (previousPrice === 0) return 0;
  return ((currentPrice - previousPrice) / previousPrice) * 100;
}

/**
 * Determine severity level based on variation percentage
 */
export function determineSeverity(
  variationPercentage: number,
  config: PriceAlertConfig
): "low" | "medium" | "high" | "critical" {
  const absVariation = Math.abs(variationPercentage);

  if (absVariation >= config.criticalVariationThreshold) {
    return "critical";
  } else if (absVariation >= config.highVariationThreshold) {
    return "high";
  } else if (absVariation >= config.mediumVariationThreshold) {
    return "medium";
  } else if (absVariation >= config.lowVariationThreshold) {
    return "low";
  }

  return "low";
}

/**
 * Check if price variation should trigger an alert
 */
export function shouldTriggerAlert(
  variationPercentage: number,
  variationType: "increase" | "decrease",
  config: PriceAlertConfig
): boolean {
  if (!config.enableNotifications) {
    return false;
  }

  if (variationType === "increase" && !config.notifyOnIncrease) {
    return false;
  }

  if (variationType === "decrease" && !config.notifyOnDecrease) {
    return false;
  }

  const absVariation = Math.abs(variationPercentage);
  return absVariation >= config.lowVariationThreshold;
}

/**
 * Create price variation alert
 */
export function createPriceVariationAlert(
  productId: number,
  productName: string,
  previousPrice: number,
  currentPrice: number,
  supplierId?: number,
  supplierName?: string,
  config?: PriceAlertConfig
): PriceVariationAlert {
  const variationPercentage = calculateVariationPercentage(previousPrice, currentPrice);
  const variationType = currentPrice > previousPrice ? "increase" : "decrease";

  const defaultConfig: PriceAlertConfig = {
    lowVariationThreshold: 5,
    mediumVariationThreshold: 10,
    highVariationThreshold: 20,
    criticalVariationThreshold: 30,
    enableNotifications: true,
    notifyOnIncrease: true,
    notifyOnDecrease: true,
  };

  const finalConfig = config || defaultConfig;
  const severity = determineSeverity(variationPercentage, finalConfig);

  return {
    id: `alert-${productId}-${Date.now()}`,
    productId,
    productName,
    previousPrice,
    currentPrice,
    variationPercentage,
    variationType,
    severity,
    supplierId,
    supplierName,
    createdAt: new Date(),
    acknowledged: false,
  };
}

/**
 * Filter alerts by severity
 */
export function filterAlertsBySeverity(
  alerts: PriceVariationAlert[],
  severity: "low" | "medium" | "high" | "critical"
): PriceVariationAlert[] {
  return alerts.filter(alert => alert.severity === severity);
}

/**
 * Get critical alerts
 */
export function getCriticalAlerts(alerts: PriceVariationAlert[]): PriceVariationAlert[] {
  return alerts.filter(alert => alert.severity === "critical");
}

/**
 * Group alerts by product
 */
export function groupAlertsByProduct(
  alerts: PriceVariationAlert[]
): Map<number, PriceVariationAlert[]> {
  const grouped = new Map<number, PriceVariationAlert[]>();

  for (const alert of alerts) {
    if (!grouped.has(alert.productId)) {
      grouped.set(alert.productId, []);
    }
    grouped.get(alert.productId)!.push(alert);
  }

  return grouped;
}

/**
 * Group alerts by supplier
 */
export function groupAlertsBySupplier(
  alerts: PriceVariationAlert[]
): Map<number | undefined, PriceVariationAlert[]> {
  const grouped = new Map<number | undefined, PriceVariationAlert[]>();

  for (const alert of alerts) {
    const supplierId = alert.supplierId;
    if (!grouped.has(supplierId)) {
      grouped.set(supplierId, []);
    }
    grouped.get(supplierId)!.push(alert);
  }

  return grouped;
}

/**
 * Calculate alert statistics
 */
export function calculateAlertStats(alerts: PriceVariationAlert[]): {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  acknowledged: number;
  unacknowledged: number;
  averageVariation: number;
  maxVariation: number;
  minVariation: number;
} {
  const critical = alerts.filter(a => a.severity === "critical").length;
  const high = alerts.filter(a => a.severity === "high").length;
  const medium = alerts.filter(a => a.severity === "medium").length;
  const low = alerts.filter(a => a.severity === "low").length;
  const acknowledged = alerts.filter(a => a.acknowledged).length;
  const unacknowledged = alerts.filter(a => !a.acknowledged).length;

  const variations = alerts.map(a => Math.abs(a.variationPercentage));
  const averageVariation = variations.length > 0 ? variations.reduce((a, b) => a + b) / variations.length : 0;
  const maxVariation = variations.length > 0 ? Math.max(...variations) : 0;
  const minVariation = variations.length > 0 ? Math.min(...variations) : 0;

  return {
    total: alerts.length,
    critical,
    high,
    medium,
    low,
    acknowledged,
    unacknowledged,
    averageVariation,
    maxVariation,
    minVariation,
  };
}

/**
 * Generate alert summary for notification
 */
export function generateAlertSummary(alerts: PriceVariationAlert[]): string {
  const stats = calculateAlertStats(alerts);
  const criticalAlerts = alerts.filter(a => a.severity === "critical");

  const lines = [
    `📊 RESUMO DE ALERTAS DE PREÇO`,
    `Total de alertas: ${stats.total}`,
    `  🔴 Críticos: ${stats.critical}`,
    `  🟠 Altos: ${stats.high}`,
    `  🟡 Médios: ${stats.medium}`,
    `  🟢 Baixos: ${stats.low}`,
    ``,
    `Variação média: ${stats.averageVariation.toFixed(2)}%`,
    `Variação máxima: ${stats.maxVariation.toFixed(2)}%`,
  ];

  if (criticalAlerts.length > 0) {
    lines.push(``);
    lines.push(`⚠️ ALERTAS CRÍTICOS:`);
    for (const alert of criticalAlerts.slice(0, 5)) {
      const direction = alert.variationType === "increase" ? "📈" : "📉";
      lines.push(
        `${direction} ${alert.productName}: ${alert.previousPrice.toFixed(2)} → ${alert.currentPrice.toFixed(2)} (${alert.variationPercentage.toFixed(2)}%)`
      );
    }

    if (criticalAlerts.length > 5) {
      lines.push(`... e ${criticalAlerts.length - 5} mais alertas críticos`);
    }
  }

  return lines.join("\n");
}

/**
 * Acknowledge alert
 */
export function acknowledgeAlert(alert: PriceVariationAlert): PriceVariationAlert {
  return {
    ...alert,
    acknowledged: true,
  };
}

/**
 * Acknowledge multiple alerts
 */
export function acknowledgeAlerts(alerts: PriceVariationAlert[]): PriceVariationAlert[] {
  return alerts.map(alert => acknowledgeAlert(alert));
}
