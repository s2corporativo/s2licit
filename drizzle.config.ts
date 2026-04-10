import { defineConfig } from "drizzle-kit";
import path from "path";
import fs from "fs";

const dbDir = path.join(process.cwd(), "data");
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
const dbFile = path.join(dbDir, "sistema-s2.db");

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "turso",
  dbCredentials: {
    url: `file:${dbFile}`,
  },
});
