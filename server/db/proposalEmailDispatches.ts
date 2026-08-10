import { int, mysqlTable, text, timestamp, uniqueIndex, varchar, index } from "drizzle-orm/mysql-core";
import { proposals } from "../../drizzle/schema";

export const proposalEmailDispatches = mysqlTable(
  "proposal_email_dispatches",
  {
    proposalId: int("proposalId")
      .primaryKey()
      .references(() => proposals.id, { onDelete: "cascade" }),
    dispatchToken: varchar("dispatchToken", { length: 64 }).notNull(),
    recipient: varchar("recipient", { length: 320 }).notNull(),
    subject: varchar("subject", { length: 256 }).notNull(),
    state: varchar("state", { length: 32 }).notNull(),
    messageId: varchar("messageId", { length: 512 }),
    lastError: text("lastError"),
    requestedBy: varchar("requestedBy", { length: 128 }),
    sendingAt: timestamp("sendingAt").defaultNow().notNull(),
    smtpAcceptedAt: timestamp("smtpAcceptedAt"),
    completedAt: timestamp("completedAt"),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    uniqueIndex("uq_proposal_email_dispatch_token").on(table.dispatchToken),
    index("idx_proposal_email_dispatch_state").on(table.state, table.updatedAt),
  ],
);

export type ProposalEmailDispatchState =
  | "sending"
  | "sent_pending_state"
  | "sent"
  | "ambiguous";
