import { asc, eq, sql } from "drizzle-orm";
import { suppliers, type InsertSupplier } from "../../drizzle/schema";
import { getDb } from "./_client";

export type SupplierContactFields = {
  code?: string | null;
  contact?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
};

export type SupplierWrite = InsertSupplier & SupplierContactFields;

let contactColumnsEnsured = false;

/**
 * O formulário de fornecedores já expunha estes campos, mas o schema Drizzle
 * legado continha somente name/isActive. Em produção isso fazia os valores
 * extras serem descartados silenciosamente. A reconciliação abaixo é
 * idempotente: cria somente as colunas ausentes e tolera ER_DUP_FIELDNAME em
 * bancos que já tenham sido corrigidos manualmente.
 */
async function ensureSupplierContactColumns() {
  if (contactColumnsEnsured) return;
  const db = await getDb();
  if (!db) return;

  const statements = [
    "ALTER TABLE suppliers ADD COLUMN code VARCHAR(128) NULL AFTER name",
    "ALTER TABLE suppliers ADD COLUMN contact VARCHAR(256) NULL AFTER code",
    "ALTER TABLE suppliers ADD COLUMN email VARCHAR(320) NULL AFTER contact",
    "ALTER TABLE suppliers ADD COLUMN phone VARCHAR(64) NULL AFTER email",
    "ALTER TABLE suppliers ADD COLUMN notes TEXT NULL AFTER phone",
  ];

  for (const statement of statements) {
    try {
      await db.execute(sql.raw(statement));
    } catch (error: any) {
      // MySQL ER_DUP_FIELDNAME = 1060. Alguns drivers expõem code, outros errno.
      if (error?.code === "ER_DUP_FIELDNAME" || error?.errno === 1060 || error?.cause?.code === "ER_DUP_FIELDNAME") {
        continue;
      }
      throw error;
    }
  }
  contactColumnsEnsured = true;
}

function supplierSelection() {
  return {
    id: suppliers.id,
    name: suppliers.name,
    code: sql<string | null>`suppliers.code`.as("code"),
    contact: sql<string | null>`suppliers.contact`.as("contact"),
    email: sql<string | null>`suppliers.email`.as("email"),
    phone: sql<string | null>`suppliers.phone`.as("phone"),
    notes: sql<string | null>`suppliers.notes`.as("notes"),
    isActive: suppliers.isActive,
    createdAt: suppliers.createdAt,
    updatedAt: suppliers.updatedAt,
  };
}

export async function listSuppliers(activeOnly = false) {
  const db = await getDb();
  if (!db) return [];
  await ensureSupplierContactColumns();
  const select = supplierSelection();
  if (activeOnly) {
    return db
      .select(select)
      .from(suppliers)
      .where(eq(suppliers.isActive, "yes"))
      .orderBy(asc(suppliers.name));
  }
  return db.select(select).from(suppliers).orderBy(asc(suppliers.name));
}

export async function getSupplierById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  await ensureSupplierContactColumns();
  const result = await db
    .select(supplierSelection())
    .from(suppliers)
    .where(eq(suppliers.id, id))
    .limit(1);
  return result[0];
}

export async function createSupplier(data: SupplierWrite) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await ensureSupplierContactColumns();

  const { code, contact, email, phone, notes, ...base } = data;
  const [result] = await db.insert(suppliers).values(base);
  const id = Number((result as any).insertId);
  if (id > 0) {
    await db.execute(sql`
      UPDATE suppliers
      SET code = ${code ?? null},
          contact = ${contact ?? null},
          email = ${email ?? null},
          phone = ${phone ?? null},
          notes = ${notes ?? null}
      WHERE id = ${id}
    `);
  }
  return result;
}

export async function updateSupplier(id: number, data: Partial<SupplierWrite>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await ensureSupplierContactColumns();

  const { code, contact, email, phone, notes, ...base } = data;
  if (Object.keys(base).length > 0) {
    await db.update(suppliers).set(base).where(eq(suppliers.id, id));
  }
  if (code !== undefined) await db.execute(sql`UPDATE suppliers SET code = ${code} WHERE id = ${id}`);
  if (contact !== undefined) await db.execute(sql`UPDATE suppliers SET contact = ${contact} WHERE id = ${id}`);
  if (email !== undefined) await db.execute(sql`UPDATE suppliers SET email = ${email} WHERE id = ${id}`);
  if (phone !== undefined) await db.execute(sql`UPDATE suppliers SET phone = ${phone} WHERE id = ${id}`);
  if (notes !== undefined) await db.execute(sql`UPDATE suppliers SET notes = ${notes} WHERE id = ${id}`);
}

export async function deleteSupplier(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(suppliers).where(eq(suppliers.id, id));
}
