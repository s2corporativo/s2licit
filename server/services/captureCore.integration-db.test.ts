import mysql, {
  type Connection,
  type ResultSetHeader,
  type RowDataPacket,
} from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const DATABASE_URL = process.env.DATABASE_URL?.trim();
const describeDatabase = DATABASE_URL ? describe : describe.skip;

const TEST_CONFIG_ID = 2_000_000_001;
const TEST_SUPPLIER_ID = 2_000_000_001;

describeDatabase("Capture Core — invariantes MySQL", () => {
  let connection: Connection;

  beforeAll(async () => {
    connection = await mysql.createConnection(DATABASE_URL!);
    await connection.query("SET FOREIGN_KEY_CHECKS = 0");
    await connection.execute(
      "DELETE FROM `capture_jobs` WHERE `scraperConfigId` = ?",
      [TEST_CONFIG_ID],
    );
  });

  afterAll(async () => {
    if (!connection) return;

    try {
      await connection.execute(
        "DELETE FROM `capture_jobs` WHERE `scraperConfigId` = ?",
        [TEST_CONFIG_ID],
      );
      await connection.query("SET FOREIGN_KEY_CHECKS = 1");
    } finally {
      await connection.end();
    }
  });

  async function insertJob(status: string): Promise<number> {
    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO \`capture_jobs\`
        (\`scraperConfigId\`, \`supplierId\`, \`status\`)
       VALUES (?, ?, ?)`,
      [TEST_CONFIG_ID, TEST_SUPPLIER_ID, status],
    );
    return Number(result.insertId);
  }

  async function activeKey(jobId: number): Promise<string | null> {
    const [rows] = await connection.execute<RowDataPacket[]>(
      "SELECT `activeKey` FROM `capture_jobs` WHERE `id` = ? LIMIT 1",
      [jobId],
    );
    return rows.length > 0 ? (rows[0].activeKey as string | null) : null;
  }

  it("deriva activeKey para queued/running e bloqueia dois jobs ativos da mesma configuração", async () => {
    const firstId = await insertJob("queued");
    expect(await activeKey(firstId)).toBe(`scraper:${TEST_CONFIG_ID}`);

    let duplicateError: unknown = null;
    try {
      await insertJob("running");
    } catch (error) {
      duplicateError = error;
    }

    expect(duplicateError).toBeTruthy();
    expect(String((duplicateError as { code?: unknown }).code ?? "")).toBe(
      "ER_DUP_ENTRY",
    );
  });

  it("libera activeKey em estado terminal e permite um novo job ativo", async () => {
    const [rows] = await connection.execute<RowDataPacket[]>(
      "SELECT `id` FROM `capture_jobs` WHERE `scraperConfigId` = ? ORDER BY `id` ASC LIMIT 1",
      [TEST_CONFIG_ID],
    );
    const firstId = Number(rows[0]?.id);
    expect(firstId).toBeGreaterThan(0);

    await connection.execute(
      "UPDATE `capture_jobs` SET `status` = 'success' WHERE `id` = ?",
      [firstId],
    );
    expect(await activeKey(firstId)).toBeNull();

    const secondId = await insertJob("queued");
    expect(await activeKey(secondId)).toBe(`scraper:${TEST_CONFIG_ID}`);

    await connection.execute(
      "UPDATE `capture_jobs` SET `status` = 'running' WHERE `id` = ?",
      [secondId],
    );
    expect(await activeKey(secondId)).toBe(`scraper:${TEST_CONFIG_ID}`);

    await connection.execute(
      "UPDATE `capture_jobs` SET `status` = 'partial' WHERE `id` = ?",
      [secondId],
    );
    expect(await activeKey(secondId)).toBeNull();
  });
});
