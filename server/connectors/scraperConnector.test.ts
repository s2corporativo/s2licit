import { describe, it, expect } from "vitest";
import { scrapedProductToResult, filtrarPorConsulta, ScraperConnector } from "./scraperConnector";
import type { ScrapedProduct } from "../services/scraperEngine";
import type { SupplierProductResult } from "./supplierConnector";

const AGORA = 1_700_000_000_000;

describe("scrapedProductToResult (§7)", () => {
  it("mapeia campos e proveniência, preservando ausências", () => {
    const sp: ScrapedProduct = {
      name: "Dipirona 500mg",
      code: "ABC123",
      ean: "7891234567890",
      price: 10,
      priceNormal: 12,
      pricePromo: 10,
      stock: 5,
      availability: "disponivel",
      productUrl: "https://forn.com/p/abc",
      imageUrl: "https://forn.com/i/abc.jpg",
      unit: "CX",
      consultadoEm: AGORA,
      fonteUrl: "https://forn.com/cat",
    };
    const r = scrapedProductToResult(sp, "Fornecedor X", AGORA);
    expect(r.nome).toBe("Dipirona 500mg");
    expect(r.ean).toBe("7891234567890");
    expect(r.precoNormal).toBe(12);
    expect(r.precoPromocional).toBe(10);
    expect(r.estoque).toBe(5);
    expect(r.disponivel).toBe(true);
    expect(r.fonte).toEqual({ metodo: "scraper", origem: "Fornecedor X" });
    expect(r.consultadoEm).toBe(AGORA);
    // Campos não fornecidos ficam ausentes (não inventados).
    expect(r.precoPessoaJuridica).toBeUndefined();
    expect(r.fabricante).toBeUndefined();
  });

  it("deriva disponibilidade do estoque quando availability ausente", () => {
    const base: ScrapedProduct = { name: "X", price: 1 };
    expect(scrapedProductToResult({ ...base, stock: 0 }, "F", AGORA).disponivel).toBe(false);
    expect(scrapedProductToResult({ ...base, stock: 3 }, "F", AGORA).disponivel).toBe(true);
    expect(scrapedProductToResult(base, "F", AGORA).disponivel).toBeUndefined();
  });
});

function res(nome: string, extra: Partial<SupplierProductResult> = {}): SupplierProductResult {
  return { nome, fonte: { metodo: "scraper", origem: "F" }, consultadoEm: AGORA, ...extra };
}

describe("filtrarPorConsulta", () => {
  const produtos = [
    res("Dipirona 500mg", { referencia: "ABC123", ean: "7891234567890" }),
    res("Amoxicilina 250mg", { referencia: "XYZ999", ean: "7899999999999" }),
    res("Soro Fisiológico", { referencia: "SF100" }),
  ];

  it("sem filtros retorna tudo", () => {
    expect(filtrarPorConsulta(produtos, {})).toHaveLength(3);
  });

  it("filtra por termo ignorando acento e caixa", () => {
    const r = filtrarPorConsulta(produtos, { termo: "amoxicilina" });
    expect(r.map((p) => p.nome)).toEqual(["Amoxicilina 250mg"]);
    expect(filtrarPorConsulta(produtos, { termo: "fisiologico" }).map((p) => p.nome)).toEqual(["Soro Fisiológico"]);
  });

  it("filtra por EAN e por código", () => {
    expect(filtrarPorConsulta(produtos, { ean: "789-123-456-7890" })[0].nome).toBe("Dipirona 500mg");
    expect(filtrarPorConsulta(produtos, { codigo: "xyz999" })[0].nome).toBe("Amoxicilina 250mg");
  });
});

describe("ScraperConnector", () => {
  const ctx = { agora: AGORA };

  it("mapeia e filtra os produtos do fetcher injetado", async () => {
    const conn = new ScraperConnector(
      "forn-x-scraper", "Fornecedor X", 1,
      async () => [
        { name: "Dipirona 500mg", price: 10, code: "ABC" },
        { name: "Amoxicilina", price: 5, code: "XYZ" },
      ],
    );
    expect(conn.metodoAcesso).toBe("scraper");
    expect(conn.disponivel()).toBe(true);
    const r = await conn.buscar({ termo: "dipirona" }, ctx);
    expect(r).toHaveLength(1);
    expect(r[0].nome).toBe("Dipirona 500mg");
    expect(r[0].fonte.metodo).toBe("scraper");
  });

  it("respeita a checagem de disponibilidade", () => {
    const conn = new ScraperConnector("x", "X", 1, async () => [], () => false);
    expect(conn.disponivel()).toBe(false);
  });
});
