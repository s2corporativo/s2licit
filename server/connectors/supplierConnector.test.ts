import { describe, it, expect } from "vitest";
import {
  ConnectorRegistry,
  buscarComCascata,
  prioridadeAcesso,
  ORDEM_ACESSO,
  INFO_NAO_DISPONIVEL,
  type SupplierConnector,
  type SupplierProductResult,
} from "./supplierConnector";

const AGORA = 1_700_000_000_000;

function fakeConnector(
  id: string,
  metodo: SupplierConnector["metodoAcesso"],
  opts: { disponivel?: boolean; resultados?: number; erro?: boolean; supplierId?: number } = {},
): SupplierConnector {
  return {
    id,
    nome: id,
    supplierId: opts.supplierId,
    metodoAcesso: metodo,
    disponivel: () => opts.disponivel ?? true,
    async buscar() {
      if (opts.erro) throw new Error("falha simulada");
      const n = opts.resultados ?? 0;
      return Array.from({ length: n }, (_, i): SupplierProductResult => ({
        nome: `${id}-produto-${i}`,
        fonte: { metodo, origem: `${id}://origem` },
        consultadoEm: AGORA,
      }));
    },
  };
}

describe("prioridadeAcesso (§4)", () => {
  it("ordena API < catálogo < arquivo < scraper < manual", () => {
    expect(prioridadeAcesso("api")).toBeLessThan(prioridadeAcesso("catalogo"));
    expect(prioridadeAcesso("catalogo")).toBeLessThan(prioridadeAcesso("scraper"));
    expect(prioridadeAcesso("scraper")).toBeLessThan(prioridadeAcesso("manual"));
    expect(ORDEM_ACESSO[0]).toBe("api");
  });
});

describe("ConnectorRegistry", () => {
  it("agrupa por fornecedor e ordena pela preferência de acesso", () => {
    const reg = new ConnectorRegistry();
    reg.register(fakeConnector("scr", "scraper", { supplierId: 1 }));
    reg.register(fakeConnector("api", "api", { supplierId: 1 }));
    reg.register(fakeConnector("outro", "api", { supplierId: 2 }));

    const doForn1 = reg.paraSupplier(1);
    expect(doForn1.map((c) => c.id)).toEqual(["api", "scr"]);
    expect(reg.paraSupplier(2).map((c) => c.id)).toEqual(["outro"]);
    expect(reg.get("api")?.metodoAcesso).toBe("api");
  });
});

describe("buscarComCascata (§4)", () => {
  const ctx = { agora: AGORA };

  it("usa o conector de maior preferência que retorna resultados", async () => {
    const r = await buscarComCascata(
      [fakeConnector("scr", "scraper", { resultados: 5 }), fakeConnector("api", "api", { resultados: 3 })],
      { termo: "x" },
      ctx,
    );
    expect(r.metodo).toBe("api");
    expect(r.resultados).toHaveLength(3);
  });

  it("cai para o próximo quando o preferido está indisponível ou vazio", async () => {
    const r = await buscarComCascata(
      [
        fakeConnector("api", "api", { disponivel: false }),
        fakeConnector("cat", "catalogo", { resultados: 0 }),
        fakeConnector("scr", "scraper", { resultados: 2 }),
      ],
      { termo: "x" },
      ctx,
    );
    expect(r.metodo).toBe("scraper");
    expect(r.resultados).toHaveLength(2);
    expect(r.tentativas.map((t) => t.motivo)).toEqual(["indisponível", "sem resultados"]);
  });

  it("um erro de conector não interrompe a cascata", async () => {
    const r = await buscarComCascata(
      [fakeConnector("api", "api", { erro: true }), fakeConnector("scr", "scraper", { resultados: 1 })],
      { termo: "x" },
      ctx,
    );
    expect(r.metodo).toBe("scraper");
    expect(r.tentativas[0].motivo).toContain("erro");
  });

  it("sem nenhum resultado retorna cascata vazia com o histórico de tentativas", async () => {
    const r = await buscarComCascata([fakeConnector("api", "api", { resultados: 0 })], { termo: "x" }, ctx);
    expect(r.conectorUsado).toBeNull();
    expect(r.resultados).toHaveLength(0);
    expect(r.tentativas).toHaveLength(1);
  });

  it("expõe a frase padrão de informação indisponível (§7)", () => {
    expect(INFO_NAO_DISPONIVEL).toContain("não disponibilizada");
  });
});
