import { describe, expect, it } from "vitest";
import { rankSupplierOffers } from "./supplierRankingService";

describe("rankSupplierOffers", () => {
  const now = new Date("2026-07-18T12:00:00Z");

  it("não coloca oferta indisponível em primeiro só por ser mais barata", () => {
    const ranked = rankSupplierOffers(
      [
        {
          offerId: 1,
          supplierId: 1,
          supplierName: "Barato sem estoque",
          regularPrice: 80,
          stock: 0,
          availability: "indisponível",
          updatedAt: "2026-07-18T10:00:00Z",
          scraperStatus: "success",
        },
        {
          offerId: 2,
          supplierId: 2,
          supplierName: "Disponível",
          regularPrice: 90,
          stock: 50,
          availability: "disponível",
          updatedAt: "2026-07-18T10:00:00Z",
          scraperStatus: "success",
        },
      ],
      now,
    );

    expect(ranked[0].supplierName).toBe("Disponível");
    expect(ranked[1].warnings).toContain("Oferta indisponível ou sem estoque.");
  });

  it("usa preço promocional válido como custo efetivo", () => {
    const [ranked] = rankSupplierOffers(
      [
        {
          offerId: 1,
          supplierId: 1,
          supplierName: "Fornecedor",
          regularPrice: 100,
          promoPrice: 82,
          stock: 10,
          availability: "disponível",
          updatedAt: now,
          scraperStatus: "success",
        },
      ],
      now,
    );

    expect(ranked.effectivePrice).toBe(82);
  });

  it("sinaliza preço desatualizado e captura falha", () => {
    const [ranked] = rankSupplierOffers(
      [
        {
          offerId: 1,
          supplierId: 1,
          supplierName: "Fornecedor",
          regularPrice: 100,
          stock: 10,
          availability: "disponível",
          updatedAt: "2026-05-01T00:00:00Z",
          scraperStatus: "failed",
        },
      ],
      now,
    );

    expect(ranked.warnings).toContain("Preço desatualizado; confirme antes de usar.");
    expect(ranked.warnings).toContain("Última captura falhou ou tem baixa confiabilidade.");
  });
});
