import { defineConfig } from "drizzle-kit";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to run drizzle commands");
}

export default defineConfig({
  // O schema canônico continua em drizzle/schema.ts. Tabelas auxiliares novas
  // ficam em módulos próprios, mas precisam participar de generate/push/studio
  // para não existir drift entre o ORM e as migrações SQL de produção.
  schema: [
    "./drizzle/schema.ts",
    "./server/db/editalProposalKeys.ts",
    "./server/db/proposalEmailDispatches.ts",
  ],
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: {
    url: connectionString,
  },
});
