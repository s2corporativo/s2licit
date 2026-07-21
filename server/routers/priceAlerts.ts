import { z } from "zod";
import { protectedProcedure, editorProcedure, router } from "../_core/trpc";
import {
  createPriceVariationAlert,
  calculateAlertStats,
  generateAlertSummary,
  acknowledgeAlert,
  getCriticalAlerts,
  type PriceVariationAlert,
  type PriceAlertConfig,
} from "../services/priceVariationAlertService";
import { notifyOwner } from "../_core/notification";

// In-memory storage for alerts (in production, use database)
const alertsStore = new Map<string, PriceVariationAlert[]>();
const configStore = new Map<number, PriceAlertConfig>();

// Default configuration
const defaultConfig: PriceAlertConfig = {
  lowVariationThreshold: 5,
  mediumVariationThreshold: 10,
  highVariationThreshold: 20,
  criticalVariationThreshold: 30,
  enableNotifications: true,
  notifyOnIncrease: true,
  notifyOnDecrease: true,
};

export const priceAlertsRouter = router({
  /**
   * Create a price variation alert
   */
  createAlert: protectedProcedure
    .input(
      z.object({
        productId: z.number(),
        productName: z.string(),
        previousPrice: z.number(),
        currentPrice: z.number(),
        supplierId: z.number().optional(),
        supplierName: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const config = configStore.get(input.productId) || defaultConfig;

      const alert = createPriceVariationAlert(
        input.productId,
        input.productName,
        input.previousPrice,
        input.currentPrice,
        input.supplierId,
        input.supplierName,
        config
      );

      // Store alert
      const key = `alerts-${ctx.user.id}`;
      if (!alertsStore.has(key)) {
        alertsStore.set(key, []);
      }
      alertsStore.get(key)!.push(alert);

      // Send notification for critical alerts
      if (alert.severity === "critical") {
        const summary = `⚠️ ALERTA CRÍTICO DE PREÇO\n\n${alert.productName}\n${alert.previousPrice.toFixed(2)} → ${alert.currentPrice.toFixed(2)} (${alert.variationPercentage.toFixed(2)}%)`;

        await notifyOwner({
          title: `Alerta Crítico: ${alert.productName}`,
          content: summary,
        });
      }

      return alert;
    }),

  /**
   * Get all alerts for current user
   */
  getAlerts: protectedProcedure
    .input(
      z.object({
        limit: z.number().default(50),
        offset: z.number().default(0),
        severity: z.enum(["low", "medium", "high", "critical"]).optional(),
        acknowledged: z.boolean().optional(),
      })
    )
    .query(({ input, ctx }) => {
      const key = `alerts-${ctx.user.id}`;
      let alerts = alertsStore.get(key) || [];

      // Filter by severity
      if (input.severity) {
        alerts = alerts.filter(a => a.severity === input.severity);
      }

      // Filter by acknowledged status
      if (input.acknowledged !== undefined) {
        alerts = alerts.filter(a => a.acknowledged === input.acknowledged);
      }

      // Sort by date descending
      alerts = alerts.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      // Paginate
      const total = alerts.length;
      const paginatedAlerts = alerts.slice(input.offset, input.offset + input.limit);

      return {
        alerts: paginatedAlerts,
        total,
        limit: input.limit,
        offset: input.offset,
      };
    }),

  /**
   * Get critical alerts
   */
  getCriticalAlerts: protectedProcedure.query(({ ctx }) => {
    const key = `alerts-${ctx.user.id}`;
    const alerts = alertsStore.get(key) || [];
    return getCriticalAlerts(alerts);
  }),

  /**
   * Get alert statistics
   */
  getAlertStats: protectedProcedure.query(({ ctx }) => {
    const key = `alerts-${ctx.user.id}`;
    const alerts = alertsStore.get(key) || [];
    return calculateAlertStats(alerts);
  }),

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert: protectedProcedure
    .input(
      z.object({
        alertId: z.string(),
      })
    )
    .mutation(({ input, ctx }) => {
      const key = `alerts-${ctx.user.id}`;
      const alerts = alertsStore.get(key) || [];

      const index = alerts.findIndex(a => a.id === input.alertId);
      if (index === -1) {
        throw new Error("Alert not found");
      }

      alerts[index] = acknowledgeAlert(alerts[index]);
      return alerts[index];
    }),

  /**
   * Acknowledge multiple alerts
   */
  acknowledgeAlerts: protectedProcedure
    .input(
      z.object({
        alertIds: z.array(z.string()),
      })
    )
    .mutation(({ input, ctx }) => {
      const key = `alerts-${ctx.user.id}`;
      const alerts = alertsStore.get(key) || [];

      for (const alertId of input.alertIds) {
        const index = alerts.findIndex(a => a.id === alertId);
        if (index !== -1) {
          alerts[index] = acknowledgeAlert(alerts[index]);
        }
      }

      return alerts;
    }),

  /**
   * Get alert configuration for a product
   */
  getAlertConfig: protectedProcedure
    .input(
      z.object({
        productId: z.number(),
      })
    )
    .query(({ input }) => {
      return configStore.get(input.productId) || defaultConfig;
    }),

  /**
   * Update alert configuration for a product
   */
  updateAlertConfig: protectedProcedure
    .input(
      z.object({
        productId: z.number(),
        lowVariationThreshold: z.number().optional(),
        mediumVariationThreshold: z.number().optional(),
        highVariationThreshold: z.number().optional(),
        criticalVariationThreshold: z.number().optional(),
        enableNotifications: z.boolean().optional(),
        notifyOnIncrease: z.boolean().optional(),
        notifyOnDecrease: z.boolean().optional(),
      })
    )
    .mutation(({ input }) => {
      const productId = input.productId;
      const currentConfig = configStore.get(productId) || { ...defaultConfig };

      const updatedConfig: PriceAlertConfig = {
        ...currentConfig,
        lowVariationThreshold: input.lowVariationThreshold ?? currentConfig.lowVariationThreshold,
        mediumVariationThreshold: input.mediumVariationThreshold ?? currentConfig.mediumVariationThreshold,
        highVariationThreshold: input.highVariationThreshold ?? currentConfig.highVariationThreshold,
        criticalVariationThreshold: input.criticalVariationThreshold ?? currentConfig.criticalVariationThreshold,
        enableNotifications: input.enableNotifications ?? currentConfig.enableNotifications,
        notifyOnIncrease: input.notifyOnIncrease ?? currentConfig.notifyOnIncrease,
        notifyOnDecrease: input.notifyOnDecrease ?? currentConfig.notifyOnDecrease,
      };

      configStore.set(productId, updatedConfig);
      return updatedConfig;
    }),

  /**
   * Send alert summary notification
   */
  sendAlertSummary: editorProcedure.mutation(async ({ ctx }) => {
    const key = `alerts-${ctx.user.id}`;
    const alerts = alertsStore.get(key) || [];

    if (alerts.length === 0) {
      return { success: true, message: "No alerts to send" };
    }

    const summary = generateAlertSummary(alerts);

    const success = await notifyOwner({
      title: "Resumo de Alertas de Preço",
      content: summary,
    });

    return {
      success,
      alertsCount: alerts.length,
      criticalCount: getCriticalAlerts(alerts).length,
    };
  }),

  /**
   * Clear all alerts
   */
  clearAlerts: editorProcedure.mutation(({ ctx }) => {
    const key = `alerts-${ctx.user.id}`;
    alertsStore.delete(key);
    return { success: true };
  }),

  /**
   * Delete specific alert
   */
  deleteAlert: protectedProcedure
    .input(
      z.object({
        alertId: z.string(),
      })
    )
    .mutation(({ input, ctx }) => {
      const key = `alerts-${ctx.user.id}`;
      const alerts = alertsStore.get(key) || [];

      const filtered = alerts.filter(a => a.id !== input.alertId);
      alertsStore.set(key, filtered);

      return { success: true };
    }),
});
