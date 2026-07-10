import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import {
  contractBalanceMovements,
  contractReajustes,
  postAwardContracts,
} from "../../drizzle/schema";
import { getDb } from "../db";

type ContractFilters = {
  status?: "draft" | "active" | "suspended" | "expired" | "closed";
  orgId?: number;
  proposalId?: number;
};

type CreateContractInput = {
  proposalId?: number | null;
  orgId?: number | null;
  contractNumber: string;
  processNumber?: string | null;
  editalNumber?: string | null;
  objectDescription?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  baseDate?: string | null;
  valueGlobal?: string | number | null;
  saldoInicial?: string | number | null;
  saldoAtual?: string | number | null;
  reajusteIndex?: string | null;
  gestor?: string | null;
  fiscal?: string | null;
  status?: "draft" | "active" | "suspended" | "expired" | "closed";
  notes?: string | null;
};

type CreateMovementInput = {
  contractId: number;
  movementType: "empenho" | "faturamento" | "consumo" | "reforco" | "glosa" | "outro";
  amount: string | number;
  movementDate: string;
  description?: string | null;
  referenceNumber?: string | null;
  createdByUserId?: number | null;
};

type CreateReajusteInput = {
  contractId: number;
  reajusteDate: string;
  indexName?: string | null;
  indexPercent?: string | number | null;
  previousValue?: string | number | null;
  updatedValue?: string | number | null;
  notes?: string | null;
};

const dec = (value: string | number | null | undefined, fallback = "0.00") => {
  if (value === null || value === undefined || value === "") return fallback;
  return typeof value === "number" ? value.toFixed(2) : String(value);
};

const asDate = (value: string | null | undefined) => {
  if (!value) return null;
  return new Date(`${value}T00:00:00`);
};

export async function listPostAwardContracts(filters: ContractFilters = {}) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  const clauses = [] as Array<ReturnType<typeof eq>>;
  if (filters.status) clauses.push(eq(postAwardContracts.status, filters.status));
  if (filters.orgId) clauses.push(eq(postAwardContracts.orgId, filters.orgId));
  if (filters.proposalId) clauses.push(eq(postAwardContracts.proposalId, filters.proposalId));

  return db
    .select()
    .from(postAwardContracts)
    .where(clauses.length ? and(...clauses) : undefined)
    .orderBy(desc(postAwardContracts.updatedAt), asc(postAwardContracts.contractNumber));
}

export async function getPostAwardContract(contractId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  const [contract] = await db.select().from(postAwardContracts).where(eq(postAwardContracts.id, contractId)).limit(1);
  const movements = await db.select().from(contractBalanceMovements).where(eq(contractBalanceMovements.contractId, contractId)).orderBy(desc(contractBalanceMovements.movementDate), desc(contractBalanceMovements.id));
  const reajustes = await db.select().from(contractReajustes).where(eq(contractReajustes.contractId, contractId)).orderBy(desc(contractReajustes.reajusteDate), desc(contractReajustes.id));

  return { contract: contract ?? null, movements, reajustes };
}

export async function createPostAwardContract(input: CreateContractInput) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  const values = {
    proposalId: input.proposalId ?? null,
    orgId: input.orgId ?? null,
    contractNumber: input.contractNumber,
    processNumber: input.processNumber ?? null,
    editalNumber: input.editalNumber ?? null,
    objectDescription: input.objectDescription ?? null,
    startDate: asDate(input.startDate ?? null),
    endDate: asDate(input.endDate ?? null),
    baseDate: asDate(input.baseDate ?? null),
    valueGlobal: dec(input.valueGlobal),
    saldoInicial: dec(input.saldoInicial ?? input.valueGlobal),
    saldoAtual: dec(input.saldoAtual ?? input.saldoInicial ?? input.valueGlobal),
    reajusteIndex: input.reajusteIndex ?? null,
    gestor: input.gestor ?? null,
    fiscal: input.fiscal ?? null,
    status: input.status ?? "draft",
    notes: input.notes ?? null,
  };

  const result = await db.insert(postAwardContracts).values(values);
  return Number(result[0].insertId);
}

export async function updatePostAwardContract(contractId: number, input: Partial<CreateContractInput>) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  await db.update(postAwardContracts).set({
    proposalId: input.proposalId,
    orgId: input.orgId,
    contractNumber: input.contractNumber,
    processNumber: input.processNumber,
    editalNumber: input.editalNumber,
    objectDescription: input.objectDescription,
    startDate: input.startDate !== undefined ? asDate(input.startDate ?? null) : undefined,
    endDate: input.endDate !== undefined ? asDate(input.endDate ?? null) : undefined,
    baseDate: input.baseDate !== undefined ? asDate(input.baseDate ?? null) : undefined,
    valueGlobal: input.valueGlobal !== undefined ? dec(input.valueGlobal) : undefined,
    saldoInicial: input.saldoInicial !== undefined ? dec(input.saldoInicial) : undefined,
    saldoAtual: input.saldoAtual !== undefined ? dec(input.saldoAtual) : undefined,
    reajusteIndex: input.reajusteIndex,
    gestor: input.gestor,
    fiscal: input.fiscal,
    status: input.status,
    notes: input.notes,
  }).where(eq(postAwardContracts.id, contractId));

  return getPostAwardContract(contractId);
}

export async function registerContractMovement(input: CreateMovementInput) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  const [contract] = await db.select().from(postAwardContracts).where(eq(postAwardContracts.id, input.contractId)).limit(1);
  if (!contract) throw new Error("Contrato não encontrado");

  const amount = Number(input.amount ?? 0);
  const result = await db.insert(contractBalanceMovements).values({
    contractId: input.contractId,
    movementType: input.movementType,
    amount: dec(input.amount),
    movementDate: asDate(input.movementDate) as Date,
    description: input.description ?? null,
    referenceNumber: input.referenceNumber ?? null,
    createdByUserId: input.createdByUserId ?? null,
  });

  const signal = input.movementType === "reforco" ? 1 : -1;
  const saldoAtual = Number(contract.saldoAtual ?? 0) + signal * amount;
  await db.update(postAwardContracts).set({ saldoAtual: dec(saldoAtual) }).where(eq(postAwardContracts.id, input.contractId));

  return Number(result[0].insertId);
}

export async function registerContractReajuste(input: CreateReajusteInput) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  const result = await db.insert(contractReajustes).values({
    contractId: input.contractId,
    reajusteDate: asDate(input.reajusteDate) as Date,
    indexName: input.indexName ?? null,
    indexPercent: input.indexPercent !== undefined && input.indexPercent !== null ? String(input.indexPercent) : null,
    previousValue: input.previousValue !== undefined && input.previousValue !== null ? dec(input.previousValue) : null,
    updatedValue: input.updatedValue !== undefined && input.updatedValue !== null ? dec(input.updatedValue) : null,
    notes: input.notes ?? null,
  } as any);

  if (input.updatedValue !== undefined && input.updatedValue !== null) {
    await db.update(postAwardContracts).set({ saldoAtual: dec(input.updatedValue) }).where(eq(postAwardContracts.id, input.contractId));
  }

  return Number(result[0].insertId);
}

export async function getContractsDashboard() {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  const [totals] = await db
    .select({
      totalContratos: sql<number>`count(*)`,
      ativos: sql<number>`sum(case when ${postAwardContracts.status} = 'active' then 1 else 0 end)`,
      saldoTotal: sql<string>`coalesce(sum(${postAwardContracts.saldoAtual}), 0)`,
      valorGlobal: sql<string>`coalesce(sum(${postAwardContracts.valueGlobal}), 0)`,
    })
    .from(postAwardContracts);

  const proximosVencimentos = await db
    .select()
    .from(postAwardContracts)
    .where(and(eq(postAwardContracts.status, "active"), gte(postAwardContracts.endDate, sql`curdate()`), lte(postAwardContracts.endDate, sql`date_add(curdate(), interval 60 day)`)))
    .orderBy(asc(postAwardContracts.endDate))
    .limit(10);

  return {
    totalContratos: Number(totals?.totalContratos ?? 0),
    contratosAtivos: Number(totals?.ativos ?? 0),
    saldoTotal: String(totals?.saldoTotal ?? "0"),
    valorGlobal: String(totals?.valorGlobal ?? "0"),
    proximosVencimentos,
  };
}
