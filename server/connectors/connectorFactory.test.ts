import { describe, it, expect } from "vitest";
import { construirRegistro, connectorIdFor, type ScraperConfigRow } from "./connectorFactory";
import type { ScrapedProduct } from "../services/scraperEngine";

const AGORA = 1_700_000_000_000;

const fakeFetch = () => async (): Promise<ScrapedProduct[]> => [{ name: "P", price: 1 }];

describe("connectorIdFor", () => {
  it("gera id estável por tipo+fornecedor", () => {
    expect(connectorIdFor("Tambasa", 7)).toBe("scraper:tambasa:7");
  });
});

describe("construirRegistro (§4/§23)", () => {
  const configs: ScraperConfigRow[] = [
    { id: 1, supplierId: 10, scraperType: "tambasa", enabled: "yes" },
    { id: 2, supplierId: 20, scraperType: "bartofil", enabled: "yes" },
    { id: 3, supplierId: 30, scraperType: "generico", enabled: "no" }, // desabilitado
  ];
  const nomes = new Map([[10, "Tambasa"], [20, "Bartofil"]]);

  it("cria conectores apenas para configs habilitadas", () => {
    const reg = construirRegistro(configs, nomes, fakeFetch);
    expect(reg.listar().map((c) => c.id).sort()).toEqual(["scraper:bartofil:20", "scraper:tambasa:10"]);
  });

  it("usa o nome do fornecedor e o método 'scraper'", () => {
    const reg = construirRegistro(configs, nomes, fakeFetch);
    const c = reg.get("scraper:tambasa:10")!;
    expect(c.nome).toBe("Tambasa");
    expect(c.metodoAcesso).toBe("scraper");
    expect(c.supplierId).toBe(10);
  });

  it("os conectores buscam via função injetada", async () => {
    const reg = construirRegistro(configs, nomes, fakeFetch);
    const r = await reg.get("scraper:bartofil:20")!.buscar({ termo: "P" }, { agora: AGORA });
    expect(r).toHaveLength(1);
    expect(r[0].nome).toBe("P");
    expect(r[0].fonte.metodo).toBe("scraper");
  });

  it("agrupa por fornecedor no registro", () => {
    const reg = construirRegistro(configs, nomes, fakeFetch);
    expect(reg.paraSupplier(20).map((c) => c.id)).toEqual(["scraper:bartofil:20"]);
    expect(reg.paraSupplier(30)).toEqual([]); // desabilitado não entra
  });
});
