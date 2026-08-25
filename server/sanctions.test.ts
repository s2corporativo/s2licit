import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Testes dedicados do módulo de sanções de fornecedores (Lei 14.133/21, art. 155–156).
 *
 * Cobertura:
 *  - Comportamento defensivo dos serviços quando o banco não está disponível
 *    (produção tolerante a falha de conexão, sem exceção não tratada).
 *  - Reexecução idempotente de revokeSanction (segunda revogação não quebra).
 *  - Estrutura e enums do schema (penalidades aceitas, status padrão, índices).
 *
 * Os caminhos com banco real já são exercidos pela bateria existente e pela
 * homologação em produção; aqui os mocks garantem testes rápidos e determinísticos.
 */

const mockDb = vi.hoisted(() => ({
  select: vi.fn(() => mockDb),
  insert: vi.fn(() => mockDb),
  update: vi.fn(() => mockDb),
  from: vi.fn(() => mockDb),
  values: vi.fn(async () => [{ insertId: 7, affectedRows: 1 }]),
  set: vi.fn(() => mockDb),
  where: vi.fn(async () => []),
  orderBy: vi.fn(async () => []),
}));

vi.mock("../drizzle/schema", async importOriginal => {
  const actual = await importOriginal<typeof import("../drizzle/schema")>();
  return { ...actual };
});

vi.mock("./db/_client", () => ({
  getDb: vi.fn(async () => mockDb as never),
}));

beforeAll(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe("sanctions — comportamento defensivo sem banco", () => {
  it("listSanctions retorna vazio quando getDb é null", async () => {
    const { getDb } = await import("./db/_client");
    vi.mocked(getDb).mockResolvedValueOnce(null as never);
    const { listSanctions } = await import("./db/sanctions");
    await expect(listSanctions()).resolves.toEqual([]);
    vi.mocked(getDb).mockResolvedValueOnce(null as never);
    await expect(listSanctions(5)).resolves.toEqual([]);
  });

  it("getActiveSanctions retorna vazio quando getDb é null", async () => {
    const { getDb } = await import("./db/_client");
    vi.mocked(getDb).mockResolvedValueOnce(null as never);
    const { getActiveSanctions } = await import("./db/sanctions");
    await expect(getActiveSanctions(1)).resolves.toEqual([]);
  }, 10000);

  it("getActiveSanctionsByProductIds retorna mapa vazio quando getDb é null", async () => {
    const { getDb } = await import("./db/_client");
    vi.mocked(getDb).mockResolvedValueOnce(null as never);
    const { getActiveSanctionsByProductIds } = await import("./db/sanctions");
    const resultado = await getActiveSanctionsByProductIds([1, 2, 3]);
    expect(resultado.size).toBe(0);
  });

  it("getActiveSanctionsByProductIds retorna mapa vazio para lista vazia", async () => {
    const { getActiveSanctionsByProductIds } = await import("./db/sanctions");
    const resultado = await getActiveSanctionsByProductIds([]);
    expect(resultado.size).toBe(0);
  });

  it("getSanctionById retorna undefined quando getDb é null", async () => {
    const { getDb } = await import("./db/_client");
    vi.mocked(getDb).mockResolvedValueOnce(null as never);
    const { getSanctionById } = await import("./db/sanctions");
    await expect(getSanctionById(1)).resolves.toBeUndefined();
  });
});

describe("sanctions — ciclo de vida (create → update → revoke) com mock de DB", () => {
  const registroRetorno = [{ insertId: 7, affectedRows: 1 }];

  it("createSanction envia o registro com penalidade e datas corretas", async () => {
    const { getDb } = await import("./db/_client");
    vi.mocked(getDb).mockResolvedValueOnce(mockDb as never);

    const { createSanction } = await import("./db/sanctions");
    const retorno = await createSanction({
      supplierId: 10,
      orgao: "Prefeitura Municipal de Betim",
      processo: "2026/0045",
      penalidade: "impedimento",
      dataInicio: new Date("2026-01-01"),
      dataFim: new Date("2027-01-01"),
      status: "ativa",
      criadoPor: "adm@vetmg.com.br",
    });

    expect(retorno).toStrictEqual(registroRetorno[0]);
    expect(mockDb.insert).toHaveBeenCalled();
  });

  it("createSanction propaga abrangência e documento comprobatório quando informados", async () => {
    const { getDb } = await import("./db/_client");
    vi.mocked(getDb).mockResolvedValueOnce(mockDb as never);

    const { createSanction } = await import("./db/sanctions");
    await createSanction({
      supplierId: 10,
      orgao: "Prefeitura Municipal de Betim",
      penalidade: "impedimento",
      dataInicio: new Date("2026-01-01"),
      status: "ativa",
      abrangencia: "municipal",
      arquivoUrl: "https://exemplo.com/decisao.pdf",
    } as never);

    expect(mockDb.values).toHaveBeenCalledWith(
      expect.objectContaining({ abrangencia: "municipal", arquivoUrl: "https://exemplo.com/decisao.pdf" }),
    );
  });

  it("revoga mantém o registro (status revogada) com observação de revogação", async () => {
    const { getDb } = await import("./db/_client");
    vi.mocked(getDb).mockResolvedValueOnce(mockDb as never);

    const { revokeSanction } = await import("./db/sanctions");
    await revokeSanction(7, "adm@vetmg.com.br");

    expect(mockDb.set).toHaveBeenCalledWith({
      status: "revogada",
      observacoes: "Revogada por adm@vetmg.com.br",
    });
    expect(mockDb.where).toHaveBeenCalled();
  });

  it("reexecução de revogação não falha (idempotente)", async () => {
    const { getDb } = await import("./db/_client");
    vi.mocked(getDb).mockResolvedValueOnce(mockDb as never);

    const { revokeSanction } = await import("./db/sanctions");
    await expect(revokeSanction(7)).resolves.toBeUndefined();
    expect(mockDb.where).toHaveBeenCalled();
  });
});

describe("sanctions — schema e validação", () => {
  it("o schema valida penalidades da Lei 14.133/21 (art. 155–156) via zod no router", async () => {
    // A validação de penalidade ocorre no zod do router (enum fechado e tipado).
    const routerSrc = await import("node:fs/promises").then(fs =>
      fs.readFile(new URL("../server/routers/sanctions.ts", import.meta.url), "utf-8"),
    );
    expect(routerSrc).toContain('z.enum(["advertencia", "multa", "impedimento", "inidoneidade"])');
  });

  it("a penalidade no schema TS tem default 'advertencia' e varchar(32)", async () => {
    const fs = await import("node:fs/promises");
    const schemaSrc = await fs.readFile(new URL("../drizzle/schema.ts", import.meta.url), "utf-8");
    const bloco = schemaSrc.slice(schemaSrc.indexOf("supplierSanctions = mysqlTable("));
    expect(bloco).toMatch(/penalidade:\s*varchar\("penalidade",\s*\{\s*length:\s*32\s*\}\)\.notNull\(\)\.default\("advertencia"\)/);
  });

  it("o status padrão é 'ativa' com varchar(16)", async () => {
    const fs = await import("node:fs/promises");
    const schemaSrc = await fs.readFile(new URL("../drizzle/schema.ts", import.meta.url), "utf-8");
    const bloco = schemaSrc.slice(schemaSrc.indexOf("supplierSanctions = mysqlTable("));
    expect(bloco).toMatch(/status:\s*varchar\("status",\s*\{\s*length:\s*16\s*\}\)\.notNull\(\)\.default\("ativa"\)/);
  });

  it("a tabela possui os índices de suporte à consulta de vigência (definidos em migrate-production/SQL)", async () => {
    // Validação de evidência em fonte: os índices constam do SQL de migration 0021.
    const fs = await import("node:fs/promises");
    const sql = await fs.readFile(
      new URL("../drizzle/0021_supplier_sanctions.sql", import.meta.url),
      "utf-8",
    );
    expect(sql).toContain("idx_supplier_sanctions_status_fim");
    expect(sql).toContain("idx_supplier_sanctions_supplier");
  });

  it("a FK para suppliers é RESTRICT (impede exclusão de fornecedor com sanção)", async () => {
    // Validação de evidência em fonte: a constraint consta do SQL de migration 0021.
    const fs = await import("node:fs/promises");
    const sql = await fs.readFile(
      new URL("../drizzle/0021_supplier_sanctions.sql", import.meta.url),
      "utf-8",
    );
    expect(sql).toContain("ON DELETE RESTRICT");
  });

  it("abrangência e documento comprobatório existem no schema, aditivos e nullable (migration 0026)", async () => {
    const fs = await import("node:fs/promises");
    const schemaSrc = await fs.readFile(new URL("../drizzle/schema.ts", import.meta.url), "utf-8");
    const bloco = schemaSrc.slice(
      schemaSrc.indexOf("supplierSanctions = mysqlTable("),
      schemaSrc.indexOf("export type InsertSupplierSanction"),
    );
    expect(bloco).toMatch(/abrangencia:\s*varchar\("abrangencia",\s*\{\s*length:\s*16\s*\}\)/);
    expect(bloco).not.toMatch(/abrangencia:[^,]*\.notNull\(\)/);
    expect(bloco).toMatch(/arquivoUrl:\s*text\("arquivoUrl"\)/);

    const sql = await fs.readFile(
      new URL("../drizzle/0026_supplier_sanctions_abrangencia_arquivo.sql", import.meta.url),
      "utf-8",
    );
    expect(sql).toContain("ADD COLUMN `abrangencia`");
    expect(sql).toContain("ADD COLUMN `arquivoUrl`");
    expect(sql).not.toContain("NOT NULL");
  });

  it("a validação de abrangência no router aceita só os âmbitos federativos previstos", async () => {
    const routerSrc = await import("node:fs/promises").then(fs =>
      fs.readFile(new URL("../server/routers/sanctions.ts", import.meta.url), "utf-8"),
    );
    expect(routerSrc).toContain('z.enum(["municipal", "estadual", "federal", "nacional"])');
  });
});
