import { describe, expect, it } from "vitest";
import { parseInstitutionalPortalHtml } from "./s2PortalOpportunitySyncService";

describe("parseInstitutionalPortalHtml", () => {
  it("extrai processo ativo do mural FIEMG/SESI/SENAI", () => {
    const html = `
      <html><body>
        <table><tbody>
          <tr>
            <td>Processo 123/2026</td>
            <td>Objeto: fornecimento de ferramentas e equipamentos</td>
            <td>Em andamento</td>
            <td>Encerramento: 31/12/2026 14:30</td>
            <td><a href="/portal/processo?id=123">Detalhes</a></td>
          </tr>
        </tbody></table>
      </body></html>
    `;

    const result = parseInstitutionalPortalHtml(
      "fiemg",
      html,
      "https://compras.fiemg.com.br/portal/Mural.aspx?nNmTela=E",
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      source: "fiemg",
      externalId: "123/2026",
      orgao: "Sistema FIEMG",
    });
    expect(result[0].items[0].descricao).toContain("ferramentas e equipamentos");
    expect(result[0].prazoResposta?.getFullYear()).toBe(2026);
    expect(result[0].prazoResposta?.getMonth()).toBe(11);
    expect(result[0].prazoResposta?.getDate()).toBe(31);
    expect(result[0].prazoResposta?.getHours()).toBe(14);
  });

  it("ignora processo encerrado", () => {
    const html = `
      <html><body>
        <article>
          <h2>Pregão 456/2026</h2>
          <p>Objeto: aquisição de materiais de limpeza</p>
          <p>Status: Encerrado</p>
          <a href="/detalhe?id=456">Consultar</a>
        </article>
      </body></html>
    `;

    const result = parseInstitutionalPortalHtml(
      "comprasmg",
      html,
      "https://www1.compras.mg.gov.br/",
    );

    expect(result).toHaveLength(0);
  });

  it("extrai licitação ativa da CEMIG em cartão renderizado", () => {
    const html = `
      <html><body>
        <div class="process-card">
          <h3>Licitação 530-G12345</h3>
          <p>Objeto: aquisição de materiais elétricos para manutenção</p>
          <p>Recebimento de propostas</p>
          <p>Prazo: 15/09/2026 09:00</p>
          <a href="/pesquisa/processo?id=530-G12345">Acessar processo</a>
        </div>
      </body></html>
    `;

    const result = parseInstitutionalPortalHtml(
      "cemig",
      html,
      "https://app2-compras.cemig.com.br/pesquisa",
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      source: "cemig",
      externalId: "530-G12345",
      orgao: "CEMIG",
    });
    expect(result[0].items[0].descricao).toContain("materiais elétricos");
  });
});
