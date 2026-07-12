import { getDb } from "../db";
import { scraperConfigs, suppliers } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { encryptPassword, decryptPassword } from "../utils/encryption";
import { TRPCError } from "@trpc/server";

export interface SupplierCredential {
  id: number;
  supplierId: number;
  supplierName: string;
  scraperType: string;
  email: string;
  password: string; // Decrypted
  scheduleTime: string;
  enabled: boolean;
  lastRunAt: Date | null;
  lastRunStatus: string | null;
  lastRunErrorMessage: string | null | undefined;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateSupplierCredentialInput {
  supplierId: number;
  scraperType: string;
  email: string;
  password: string;
  scheduleTime?: string;
}

export interface UpdateSupplierCredentialInput {
  id: number;
  email?: string;
  password?: string;
  scheduleTime?: string;
  enabled?: boolean;
}

/**
 * Supplier Credentials Management Service
 * Handles secure storage and retrieval of supplier login credentials
 */
export class SupplierCredentialsService {
  /**
   * List all supplier credentials (passwords decrypted)
   */
  static async listCredentials(): Promise<SupplierCredential[]> {
    const db = await getDb();
    if (!db) return [];
    
    const configs = await db
      .select({
        id: scraperConfigs.id,
        supplierId: scraperConfigs.supplierId,
        scraperType: scraperConfigs.scraperType,
        email: scraperConfigs.email,
        passwordHash: scraperConfigs.passwordHash,
        scheduleTime: scraperConfigs.scheduleTime,
        enabled: scraperConfigs.enabled,
        lastRunAt: scraperConfigs.lastRunAt,
        lastRunStatus: scraperConfigs.lastRunStatus,
        lastRunErrorMessage: scraperConfigs.lastRunErrorMessage,
        createdAt: scraperConfigs.createdAt,
        updatedAt: scraperConfigs.updatedAt,
        supplierName: suppliers.name,
      })
      .from(scraperConfigs)
      .innerJoin(suppliers, eq(scraperConfigs.supplierId, suppliers.id));

    return configs.map((config) => ({
      id: config.id,
      supplierId: config.supplierId,
      supplierName: config.supplierName,
      scraperType: config.scraperType,
      email: config.email,
      // Nunca devolver a senha em claro numa listagem para a UI. O scraper
      // decifra a senha server-side no momento do uso (não por esta lista).
      password: config.passwordHash ? "••••••••" : "",
      scheduleTime: config.scheduleTime || "02:00",
      enabled: config.enabled === "yes",
      lastRunAt: config.lastRunAt,
      lastRunStatus: config.lastRunStatus,
      lastRunErrorMessage: config.lastRunErrorMessage,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    }));
  }

  /**
   * Get credential by ID
   */
  static async getCredentialById(id: number): Promise<SupplierCredential | null> {
    const db = await getDb();
    if (!db) return null;
    
    const config = await db
      .select({
        id: scraperConfigs.id,
        supplierId: scraperConfigs.supplierId,
        scraperType: scraperConfigs.scraperType,
        email: scraperConfigs.email,
        passwordHash: scraperConfigs.passwordHash,
        scheduleTime: scraperConfigs.scheduleTime,
        enabled: scraperConfigs.enabled,
        lastRunAt: scraperConfigs.lastRunAt,
        lastRunStatus: scraperConfigs.lastRunStatus,
        lastRunErrorMessage: scraperConfigs.lastRunErrorMessage,
        createdAt: scraperConfigs.createdAt,
        updatedAt: scraperConfigs.updatedAt,
        supplierName: suppliers.name,
      })
      .from(scraperConfigs)
      .innerJoin(suppliers, eq(scraperConfigs.supplierId, suppliers.id))
      .where(eq(scraperConfigs.id, id))
      .limit(1);

    if (!config.length) return null;

    const c = config[0];
    return {
      id: c.id,
      supplierId: c.supplierId,
      supplierName: c.supplierName,
      scraperType: c.scraperType,
      email: c.email,
      password: decryptPassword(c.passwordHash),
      scheduleTime: c.scheduleTime || "02:00",
      enabled: c.enabled === "yes",
      lastRunAt: c.lastRunAt,
      lastRunStatus: c.lastRunStatus,
      lastRunErrorMessage: c.lastRunErrorMessage,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    };
  }

  /**
   * Get credential by supplier ID
   */
  static async getCredentialBySupplier(supplierId: number): Promise<SupplierCredential | null> {
    const db = await getDb();
    if (!db) return null;
    
    const config = await db
      .select({
        id: scraperConfigs.id,
        supplierId: scraperConfigs.supplierId,
        scraperType: scraperConfigs.scraperType,
        email: scraperConfigs.email,
        passwordHash: scraperConfigs.passwordHash,
        scheduleTime: scraperConfigs.scheduleTime,
        enabled: scraperConfigs.enabled,
        lastRunAt: scraperConfigs.lastRunAt,
        lastRunStatus: scraperConfigs.lastRunStatus,
        lastRunErrorMessage: scraperConfigs.lastRunErrorMessage,
        createdAt: scraperConfigs.createdAt,
        updatedAt: scraperConfigs.updatedAt,
        supplierName: suppliers.name,
      })
      .from(scraperConfigs)
      .innerJoin(suppliers, eq(scraperConfigs.supplierId, suppliers.id))
      .where(eq(scraperConfigs.supplierId, supplierId))
      .limit(1);

    if (!config.length) return null;

    const c = config[0];
    return {
      id: c.id,
      supplierId: c.supplierId,
      supplierName: c.supplierName,
      scraperType: c.scraperType,
      email: c.email,
      password: decryptPassword(c.passwordHash),
      scheduleTime: c.scheduleTime || "02:00",
      enabled: c.enabled === "yes",
      lastRunAt: c.lastRunAt,
      lastRunStatus: c.lastRunStatus,
      lastRunErrorMessage: c.lastRunErrorMessage,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    };
  }

  /**
   * Create new supplier credential
   */
  static async createCredential(input: CreateSupplierCredentialInput): Promise<SupplierCredential> {
    const db = await getDb();
    if (!db) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Falha ao conectar ao banco de dados",
      });
    }

    // Validate supplier exists
    const supplier = await db
      .select()
      .from(suppliers)
      .where(eq(suppliers.id, input.supplierId))
      .limit(1);

    if (!supplier.length) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Fornecedor não encontrado",
      });
    }

    // Check if credential already exists for this supplier
    const existing = await db
      .select()
      .from(scraperConfigs)
      .where(eq(scraperConfigs.supplierId, input.supplierId))
      .limit(1);

    if (existing.length) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "Já existe uma configuração de scraper para este fornecedor",
      });
    }

    const encryptedPassword = encryptPassword(input.password);

    await db.insert(scraperConfigs).values({
      supplierId: input.supplierId,
      scraperType: input.scraperType,
      email: input.email,
      passwordHash: encryptedPassword,
      scheduleTime: input.scheduleTime || "02:00",
      enabled: "yes" as const,
      lastRunStatus: "pending" as const,
    });

    // Get the created credential
    const created = await db
      .select()
      .from(scraperConfigs)
      .where(eq(scraperConfigs.supplierId, input.supplierId))
      .limit(1);
    
    const id = created[0]?.id;
    if (!id) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Falha ao obter ID da credencial criada",
      });
    }
    const credential = await this.getCredentialById(id);

    if (!credential) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Falha ao criar credencial",
      });
    }

    return credential;
  }

  /**
   * Update supplier credential
   */
  static async updateCredential(input: UpdateSupplierCredentialInput): Promise<SupplierCredential> {
    const db = await getDb();
    if (!db) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Falha ao conectar ao banco de dados",
      });
    }

    const existing = await this.getCredentialById(input.id);
    if (!existing) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Credencial não encontrada",
      });
    }

    const updateData: any = {};

    if (input.email !== undefined) {
      updateData.email = input.email;
    }
    if (input.password !== undefined) {
      updateData.passwordHash = encryptPassword(input.password);
    }
    if (input.scheduleTime !== undefined) {
      updateData.scheduleTime = input.scheduleTime;
    }
    if (input.enabled !== undefined) {
      updateData.enabled = input.enabled ? "yes" : "no";
    }

    await db
      .update(scraperConfigs)
      .set(updateData)
      .where(eq(scraperConfigs.id, input.id));

    const credential = await this.getCredentialById(input.id);
    if (!credential) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Falha ao atualizar credencial",
      });
    }

    return credential;
  }

  /**
   * Delete supplier credential
   */
  static async deleteCredential(id: number): Promise<boolean> {
    const db = await getDb();
    if (!db) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Falha ao conectar ao banco de dados",
      });
    }

    const existing = await this.getCredentialById(id);
    if (!existing) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Credencial não encontrada",
      });
    }

    await db
      .delete(scraperConfigs)
      .where(eq(scraperConfigs.id, id));

    return true;
  }

  /**
   * Test connection to supplier website
   */
  static async testConnection(email: string, password: string): Promise<{ success: boolean; message: string }> {
    try {
      // For now, just validate that credentials are not empty
      if (!email || !password) {
        return {
          success: false,
          message: "Email e senha são obrigatórios",
        };
      }

      // In a real scenario, you would test login here
      return {
        success: true,
        message: "Credenciais validadas",
      };
    } catch (error) {
      return {
        success: false,
        message: `Erro ao validar credenciais: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}
