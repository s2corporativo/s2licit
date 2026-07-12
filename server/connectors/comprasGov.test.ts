import { describe, expect, it } from "vitest";
import { normalizeComprasLicitacao } from "./comprasGovConnector";

describe("comprasGovConnector: normalização", () => {
  it("mapeia os campos do SIASG para o modelo unificado", () => {
    const lic = normalizeComprasLicitacao({
      identificador: "12345-52025",
      uasg: 120087,
      nome_uasg: "COMANDO LOGÍSTICO",
      nome_orgao: "MINISTÉRIO DA DEFESA",
      modalidade: 5,
      numero_aviso: 52025,
      objeto: "Aquisição de medicamentos veterinários",
      situacao_aviso: "Publicado",
      data_publicacao: "2025-07-01",
      data_abertura_proposta: "2025-07-15T09:00:00",
      uf: "mg",
      nome_municipio: "Belo Horizonte",
      valor_estimado: "12500,50",
      _links: { self: { href: "/licitacoes/id/12345" } },
    });

    expect(lic.source).toBe("comprasgov");
    expect(lic.sourceId).toBe("12345-52025");
    expect(lic.orgao).toBe("MINISTÉRIO DA DEFESA");
    expect(lic.modalidade).toBe("Pregão");
    expect(lic.uf).toBe("MG");
    expect(lic.municipio).toBe("Belo Horizonte");
    expect(lic.valorEstimado).toBeCloseTo(12500.5, 2);
    expect(lic.dataPublicacao?.getFullYear()).toBe(2025);
    expect(lic.links[0]).toContain("https://compras.dados.gov.br/licitacoes/id/12345");
  });

  it("gera link de fallback pela UASG quando não há _links", () => {
    const lic = normalizeComprasLicitacao({
      uasg: 987654,
      objeto: "Serviço",
      modalidade: 99,
    });
    expect(lic.links[0]).toContain("uasg=987654");
    expect(lic.modalidade).toBe("Modalidade 99");
    expect(lic.valorEstimado).toBe(0);
  });

  it("nunca lança com payload mínimo/vazio", () => {
    expect(() => normalizeComprasLicitacao({})).not.toThrow();
    const lic = normalizeComprasLicitacao({});
    expect(lic.source).toBe("comprasgov");
    expect(lic.sourceId.length).toBeGreaterThan(0);
  });
});
