import { describe, expect, it } from "vitest";
import { normalizeTambasaCatalogUrl } from "./tambasaCatalogService";

describe("normalizeTambasaCatalogUrl", () => {
  it("normaliza categorias da Tambasa e remove query/hash", () => {
    expect(
      normalizeTambasaCatalogUrl(
        "https://www.tambasa.com/categoria/pet-e-vet-e-agro/?pagina=2#produtos",
      ),
    ).toBe("https://tambasa.com/categoria/pet-e-vet-e-agro");
  });

  it("aceita links relativos de categoria", () => {
    expect(
      normalizeTambasaCatalogUrl(
        "/categoria/materiais-hidraulicos/tubos-e-conexoes/",
        "https://tambasa.com/produto/exemplo",
      ),
    ).toBe("https://tambasa.com/categoria/materiais-hidraulicos/tubos-e-conexoes");
  });

  it("aceita a página de ofertas como catálogo", () => {
    expect(normalizeTambasaCatalogUrl("https://tambasa.com/ofertas/?ordem=preco"))
      .toBe("https://tambasa.com/ofertas");
  });

  it("recusa páginas de produto e domínios externos", () => {
    expect(normalizeTambasaCatalogUrl("https://tambasa.com/produto/130484")).toBeNull();
    expect(normalizeTambasaCatalogUrl("https://exemplo.com/categoria/produtos")).toBeNull();
  });
});
