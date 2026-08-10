import { describe, expect, it } from "vitest";
import { isNonPublicIpAddress } from "../utils/urlGuard";
import { buildSearchUrl } from "./scraperContracts";
import { FORNECEDOR_CONFIGS } from "./scraperPresets";
import {
  chooseCaptureMode,
  getConnectorCapabilities,
} from "./captureConnectorCapabilities";
import {
  advanceCaptureNextRun,
  computeInitialCaptureNextRun,
} from "./captureScheduleService";
import {
  resolveAutomaticMatch,
  type CatalogProduct,
} from "./intelligentCaptureService";
import {
  buildCaptureDraftFromStructuredSource,
  extractProductsFromDelimitedText,
} from "./intelligentCaptureIngestionService";

const catalog: CatalogProduct[] = [
  {
    id: 1,
    name: "Seringa descartável 20 ml",
    manufacturer: "Acme",
    barcode: "7891234567890",
    ean: "7891234567890",
    gtin: null,
    concentration: null,
    presentation: "20 ml",
    activeIngredient: null,
    description: "Seringa estéril 20 ml",
  },
  {
    id: 2,
    name: "Seringa descartável 10 ml",
    manufacturer: "Acme",
    barcode: "7891234567891",
    ean: "7891234567891",
    gtin: null,
    concentration: null,
    presentation: "10 ml",
    activeIngredient: null,
    description: "Seringa estéril 10 ml",
  },
];

describe("Scraper architecture — SSRF", () => {
  it("bloqueia redes privadas e loopback IPv4", () => {
    expect(isNonPublicIpAddress("127.0.0.1")).toBe(true);
    expect(isNonPublicIpAddress("10.20.30.40")).toBe(true);
    expect(isNonPublicIpAddress("172.16.0.1")).toBe(true);
    expect(isNonPublicIpAddress("192.168.1.2")).toBe(true);
    expect(isNonPublicIpAddress("169.254.169.254")).toBe(true);
  });

  it("bloqueia loopback/ULA/link-local IPv6 e aceita IP público", () => {
    expect(isNonPublicIpAddress("::1")).toBe(true);
    expect(isNonPublicIpAddress("fd00::1")).toBe(true);
    expect(isNonPublicIpAddress("fe80::1")).toBe(true);
    expect(isNonPublicIpAddress("8.8.8.8")).toBe(false);
    expect(isNonPublicIpAddress("2606:4700:4700::1111")).toBe(false);
  });
});

describe("Scraper architecture — connector contracts", () => {
  it("codifica termo de busca sem permitir injeção de query", () => {
    expect(buildSearchUrl("https://example.com/busca?q={q}", "A&B / C"))
      .toBe("https://example.com/busca?q=A%26B%20%2F%20C");
  });

  it("Bartofil e Basso permanecem search-only", () => {
    for (const type of ["bartofil", "bassopancotte"]) {
      const capabilities = getConnectorCapabilities(type, FORNECEDOR_CONFIGS[type]);
      expect(capabilities.fullCatalog).toBe(false);
      expect(capabilities.search).toBe(true);
      expect(capabilities.method).toBe("hybrid");
      expect(() => chooseCaptureMode("full", capabilities)).toThrow(/não suporta varredura integral/i);
    }
  });
});

describe("Scraper architecture — persistent schedule", () => {
  it("calcula 02:00 de São Paulo em UTC corretamente", () => {
    const next = computeInitialCaptureNextRun({
      scraperType: "bartofil",
      scheduleTime: "02:00",
      now: new Date("2026-08-10T04:00:00.000Z"), // 01:00 BRT
    });
    expect(next.toISOString()).toBe("2026-08-10T05:00:00.000Z");
  });

  it("Tambasa avança por semana civil sem criar backlog", () => {
    const next = advanceCaptureNextRun({
      scraperType: "tambasa",
      scheduleTime: "02:00",
      currentNextRunAt: new Date("2026-08-03T05:00:00.000Z"),
      now: new Date("2026-08-10T06:00:00.000Z"),
    });
    expect(next.toISOString()).toBe("2026-08-17T05:00:00.000Z");
  });
});

describe("Scraper architecture — intelligent matching", () => {
  it("EAN exato é determinístico na fase de sugestão", () => {
    const match = resolveAutomaticMatch(
      {
        name: "Seringa 20 ml",
        barcode: "7891234567890",
      },
      catalog,
    );
    expect(match.matchedProductId).toBe(1);
    expect(match.duplicateSignal).toBe("confirmed");
    expect(match.matchType).toBe("barcode");
  });

  it("não confunde apresentações quantitativamente diferentes", () => {
    const match = resolveAutomaticMatch(
      {
        name: "Seringa descartável 50 ml",
        presentation: "50 ml",
      },
      catalog,
    );
    expect(match.matchedProductId).toBeNull();
    expect(match.actionSuggestion).toBe("create");
  });
});

describe("Scraper architecture — ingestion", () => {
  it("preserva ponto decimal e interpreta preço brasileiro", () => {
    const products = extractProductsFromDelimitedText(
      [
        "Nome;Preco;EAN",
        "Produto A;123.45;7891234567890",
        "Produto B;1.234,56;7891234567891",
      ].join("\n"),
    );

    expect(products).toHaveLength(2);
    expect(products[0].price).toBe(123.45);
    expect(products[1].price).toBe(1234.56);
  });

  it("respeita delimitadores dentro de campos CSV entre aspas", () => {
    const products = extractProductsFromDelimitedText(
      [
        "Nome;Descricao;Preco",
        'Produto A;"Caixa; com 10 unidades";12,50',
      ].join("\n"),
    );

    expect(products).toHaveLength(1);
    expect(products[0].description).toBe("Caixa; com 10 unidades");
    expect(products[0].price).toBe(12.5);
  });

  it("extrai XML genérico com valores escalares do xml2js", async () => {
    const draft = await buildCaptureDraftFromStructuredSource({
      sourceType: "xml",
      content: [
        "<catalogo>",
        "  <produto>",
        "    <nome>Produto XML</nome>",
        "    <preco>49,90</preco>",
        "    <ean>7891234567890</ean>",
        "  </produto>",
        "</catalogo>",
      ].join("\n"),
    });

    expect(draft.products).toHaveLength(1);
    expect(draft.products[0].name).toBe("Produto XML");
    expect(draft.products[0].price).toBe(49.9);
    expect(draft.products[0].barcode).toBe("7891234567890");
  });
});
