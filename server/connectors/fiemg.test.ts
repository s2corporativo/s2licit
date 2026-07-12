import { describe, expect, it } from "vitest";
import { extrairEditaisFiemg, normalizeFiemgEdital } from "./fiemgConnector";

const HTML_EXEMPLO = `
<html><body>
  <ul class="lista-licitacoes">
    <li><a href="/licitacoes/edital-123.pdf">Edital de Pregão 05/2025 — Medicamentos 01/07/2025</a></li>
    <li><a href="https://www7.fiemg.com.br/editais/456">Licitação SENAI Concorrência 12/2025 15/07/2025</a></li>
    <li><a href="/institucional/quem-somos">Quem somos</a></li>
    <li><a href="/contato">Fale conosco</a></li>
  </ul>
</body></html>`;

describe("fiemgConnector: extração de editais", () => {
  it("extrai apenas âncoras que parecem edital/licitação", () => {
    const editais = extrairEditaisFiemg(HTML_EXEMPLO);
    expect(editais.length).toBe(2);
    expect(editais[0].titulo).toContain("Pregão 05/2025");
    expect(editais[0].dataTexto).toBe("2025-07-01");
    expect(editais[1].href).toContain("fiemg.com.br/editais/456");
  });

  it("ignora HTML sem editais sem lançar", () => {
    expect(extrairEditaisFiemg("<html><body><p>Sem nada</p></body></html>")).toEqual([]);
    expect(extrairEditaisFiemg("")).toEqual([]);
  });

  it("normaliza edital resolvendo URL relativa contra a base", () => {
    const editais = extrairEditaisFiemg(HTML_EXEMPLO);
    const lic = normalizeFiemgEdital(editais[0], "https://www7.fiemg.com.br/licitacoes");
    expect(lic.source).toBe("fiemg");
    expect(lic.uf).toBe("MG");
    expect(lic.orgao).toBe("Sistema FIEMG");
    expect(lic.links[0]).toBe("https://www7.fiemg.com.br/licitacoes/edital-123.pdf");
    expect(lic.dataPublicacao?.getFullYear()).toBe(2025);
  });
});
