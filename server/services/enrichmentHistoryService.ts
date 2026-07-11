import { getDb } from "../db";
import {
  enrichmentHistory,
  enrichmentResults,
  EnrichmentHistory,
  InsertEnrichmentHistory,
  EnrichmentResult,
  InsertEnrichmentResult,
} from "../../drizzle/schema";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

export interface EnrichmentExecutionStats {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  totalProductsProcessed: number;
  averageSuccessRate: number;
  averageConfidenceScore: number;
}

export interface EnrichmentExecutionDetail extends EnrichmentHistory {
  results: EnrichmentResult[];
  resultStats: {
    approved: number;
    rejected: number;
    applied: number;
    pending: number;
  };
}

export class EnrichmentHistoryService {
  private async getDatabase() {
    const db = await getDb();
    if (!db) throw new Error("Database connection failed");
    return db;
  }

  async createExecution(
    source: "nfe_import" | "manual" | "batch_job" | "api",
    totalProducts: number,
    metadata?: Record<string, any>
  ): Promise<string> {
    const db = await this.getDatabase();
    const executionId = uuidv4();
    await db.insert(enrichmentHistory).values({
      executionId,
      source,
      status: "pending",
      totalProducts,
      metadata: metadata ? JSON.stringify(metadata) : null,
    });
    return executionId;
  }

  async updateExecutionStatus(
    executionId: string,
    status: "pending" | "running" | "completed" | "failed",
    updates?: {
      successCount?: number;
      failureCount?: number;
      skippedCount?: number;
      averageConfidenceScore?: number;
      errorMessage?: string;
    }
  ): Promise<void> {
    const db = await this.getDatabase();
    const data: any = { status };
    if (updates?.successCount !== undefined) data.successCount = updates.successCount;
    if (updates?.failureCount !== undefined) data.failureCount = updates.failureCount;
    if (updates?.skippedCount !== undefined) data.skippedCount = updates.skippedCount;
    if (updates?.averageConfidenceScore !== undefined) {
      data.averageConfidenceScore = updates.averageConfidenceScore;
    }
    if (updates?.errorMessage !== undefined) data.errorMessage = updates.errorMessage;
    if (status === "completed" || status === "failed") {
      data.completedAt = new Date();
    }

    await db.update(enrichmentHistory).set(data).where(eq(enrichmentHistory.executionId, executionId));
  }

  async addResult(
    executionId: string,
    productId: number,
    fieldName: string,
    originalValue: string | null,
    suggestedValue: string | null,
    confidenceScore: number
  ): Promise<void> {
    const db = await this.getDatabase();
    await db.insert(enrichmentResults).values({
      executionId,
      productId,
      fieldName,
      originalValue,
      suggestedValue,
      confidenceScore: confidenceScore.toString(),
      status: "pending",
    });
  }

  async approveResult(resultId: number, appliedValue: string): Promise<void> {
    const db = await this.getDatabase();
    await db
      .update(enrichmentResults)
      .set({
        status: "approved",
        appliedValue,
        reviewedAt: new Date(),
      })
      .where(eq(enrichmentResults.id, resultId));
  }

  async rejectResult(resultId: number, reviewNotes?: string): Promise<void> {
    const db = await this.getDatabase();
    await db
      .update(enrichmentResults)
      .set({
        status: "rejected",
        reviewNotes,
        reviewedAt: new Date(),
      })
      .where(eq(enrichmentResults.id, resultId));
  }

  async applyResult(resultId: number): Promise<void> {
    const db = await this.getDatabase();
    await db
      .update(enrichmentResults)
      .set({
        status: "applied",
      })
      .where(eq(enrichmentResults.id, resultId));
  }

  async listExecutions(
    limit: number = 50,
    offset: number = 0,
    filters?: {
      source?: "nfe_import" | "manual" | "batch_job" | "api";
      status?: "pending" | "running" | "completed" | "failed";
      startDate?: Date;
      endDate?: Date;
    }
  ): Promise<{ executions: EnrichmentHistory[]; total: number }> {
    const db = await this.getDatabase();
    const conditions = [];

    if (filters?.source) {
      conditions.push(eq(enrichmentHistory.source, filters.source));
    }
    if (filters?.status) {
      conditions.push(eq(enrichmentHistory.status, filters.status));
    }
    if (filters?.startDate) {
      conditions.push(gte(enrichmentHistory.createdAt, filters.startDate));
    }
    if (filters?.endDate) {
      conditions.push(lte(enrichmentHistory.createdAt, filters.endDate));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const executions = await db
      .select()
      .from(enrichmentHistory)
      .where(whereClause)
      .orderBy(desc(enrichmentHistory.createdAt))
      .limit(limit)
      .offset(offset);

    const countResult = await db
      .select({ count: enrichmentHistory.id })
      .from(enrichmentHistory)
      .where(whereClause);

    return {
      executions,
      total: countResult[0]?.count || 0,
    };
  }

  async getExecutionDetail(executionId: string): Promise<EnrichmentExecutionDetail | null> {
    const db = await this.getDatabase();
    const execution = await db
      .select()
      .from(enrichmentHistory)
      .where(eq(enrichmentHistory.executionId, executionId))
      .limit(1);

    if (!execution || execution.length === 0) {
      return null;
    }

    const results = await db
      .select()
      .from(enrichmentResults)
      .where(eq(enrichmentResults.executionId, executionId));

    const resultStats = {
      approved: results.filter((r) => r.status === "approved").length,
      rejected: results.filter((r) => r.status === "rejected").length,
      applied: results.filter((r) => r.status === "applied").length,
      pending: results.filter((r) => r.status === "pending").length,
    };

    return {
      ...execution[0],
      results,
      resultStats,
    };
  }

  async getStats(): Promise<EnrichmentExecutionStats> {
    const db = await this.getDatabase();
    const executions = await db.select().from(enrichmentHistory);

    if (executions.length === 0) {
      return {
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        totalProductsProcessed: 0,
        averageSuccessRate: 0,
        averageConfidenceScore: 0,
      };
    }

    const successful = executions.filter((e) => e.status === "completed").length;
    const failed = executions.filter((e) => e.status === "failed").length;
    const totalProducts = executions.reduce((sum, e) => sum + (e.totalProducts || 0), 0);
    const totalSuccessful = executions.reduce((sum, e) => sum + (e.successCount || 0), 0);

    const allResults = await db.select().from(enrichmentResults);
    const avgConfidence =
      allResults.length > 0
        ? allResults.reduce((sum: number, r: EnrichmentResult) => sum + parseFloat(r.confidenceScore?.toString() || "0"), 0) /
          allResults.length
        : 0;

    return {
      totalExecutions: executions.length,
      successfulExecutions: successful,
      failedExecutions: failed,
      totalProductsProcessed: totalProducts,
      averageSuccessRate: totalProducts > 0 ? (totalSuccessful / totalProducts) * 100 : 0,
      averageConfidenceScore: avgConfidence,
    };
  }

  async getResultsByExecution(
    executionId: string,
    status?: "pending" | "approved" | "rejected" | "applied"
  ): Promise<EnrichmentResult[]> {
    const db = await this.getDatabase();
    const conditions = [eq(enrichmentResults.executionId, executionId)];
    if (status) {
      conditions.push(eq(enrichmentResults.status, status));
    }

    return db
      .select()
      .from(enrichmentResults)
      .where(and(...conditions))
      .orderBy(desc(enrichmentResults.createdAt));
  }

  async getExecutionsByDateRange(startDate: Date, endDate: Date): Promise<EnrichmentHistory[]> {
    const db = await this.getDatabase();
    return db
      .select()
      .from(enrichmentHistory)
      .where(and(gte(enrichmentHistory.createdAt, startDate), lte(enrichmentHistory.createdAt, endDate)))
      .orderBy(desc(enrichmentHistory.createdAt));
  }

  async getExecutionsBySource(
    source: "nfe_import" | "manual" | "batch_job" | "api"
  ): Promise<EnrichmentHistory[]> {
    const db = await this.getDatabase();
    return db
      .select()
      .from(enrichmentHistory)
      .where(eq(enrichmentHistory.source, source))
      .orderBy(desc(enrichmentHistory.createdAt));
  }
}

export const enrichmentHistoryService = new EnrichmentHistoryService();
