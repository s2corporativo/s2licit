import { int, mysqlTable, timestamp, varchar } from "drizzle-orm/mysql-core";
import { proposals } from "../../drizzle/schema";

/**
 * Chave de idempotência exclusiva do fluxo Edital → Proposta.
 *
 * Fica fora da tabela `proposals` para não impor unicidade retroativa sobre
 * registros históricos. A reserva e a criação da proposta ocorrem na mesma
 * transação, portanto uma segunda requisição concorrente reutiliza o resultado.
 */
export const editalProposalKeys = mysqlTable("edital_proposal_keys", {
  dedupeKey: varchar("dedupeKey", { length: 64 }).primaryKey(),
  proposalId: int("proposalId").references(() => proposals.id, { onDelete: "set null" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
});
