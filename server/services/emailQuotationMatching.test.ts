import { describe, it, expect } from "vitest";
import { bestNameMatch } from "./emailQuotationMatchingService";

const catalog = [
  { id: 1, name: "Amoxicilina 500mg comprimido", price: "12.50" },
  { id: 2, name: "Dipirona sódica 500mg", price: "8.00" },
  { id: 3, name: "Seringa descartável 10ml", price: "0.90" },
];

describe("bestNameMatch", () => {
  it("encontra o produto correto por similaridade de nome", () => {
    const hit = bestNameMatch("Amoxicilina 500 mg comprimido", catalog);
    expect(hit).not.toBeNull();
    expect(hit!.product.id).toBe(1);
    expect(hit!.score).toBeGreaterThan(0.8);
  });

  it("retorna null quando nada atinge o limiar", () => {
    const hit = bestNameMatch("Cadeira de rodas motorizada", catalog);
    expect(hit).toBeNull();
  });

  it("escolhe o de maior score entre candidatos", () => {
    const hit = bestNameMatch("seringa descartavel 10 ml", catalog);
    expect(hit!.product.id).toBe(3);
  });

  it("respeita um limiar customizado", () => {
    // Com limiar muito alto, uma correspondência parcial deve falhar.
    const hit = bestNameMatch("Dipirona 500", catalog, 0.95);
    expect(hit).toBeNull();
  });
});
