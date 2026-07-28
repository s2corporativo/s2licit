import { describe, expect, it } from "vitest";
import {
  parseFundepGroupHtml,
  parseFunarbeHtml,
} from "./portalOpportunitySyncService";

describe("parseFundepGroupHtml", () => {
  it("extrai lote, itens, quantidade, unidade e prazo relativo", () => {
    const now = new Date("2026-07-27T10:00:00-03:00");
    const html = `
      <html><body>
        <h1>Grupo: PRODUTOS AGROPECUÁRIOS</h1>
        <p>Informações importantes</p>
        <section>
          <div>Lote: 12345</div>
          <div>Natureza: Aquisição</div>
          <div>Processo: 987/2026</div>
          <div>Finaliza em: 2:30 horas</div>
          <table>
            <tbody>
              <tr><th>Item</th><th>Descrição</th><th>Quantidade</th><th>Unidade</th></tr>
              <tr><td>12345*1</td><td>Ração para cães adultos 15 kg</td><td>2,00</td><td>UN</td></tr>
              <tr><td>12345*2</td><td>Shampoo veterinário 500 ml</td><td>10</td><td>FR</td></tr>
            </tbody>
          </table>
        </section>
      </body></html>
    `;

    const result = parseFundepGroupHtml(
      html,
      "https://portaldecompras.fundep.ufmg.br/Publico/ConsultarLotesPorGrupo.aspx?CodigoGrupoProduto=1",
      now,
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      source: "fundep",
      externalId: "12345",
      orgao: "FUNDEP",
    });
    expect(result[0].subject).toContain("PRODUTOS AGROPECUÁRIOS");
    expect(result[0].items).toEqual([
      {
        numeroItem: 1,
        descricao: "Ração para cães adultos 15 kg",
        quantidade: 2,
        unidade: "UN",
        codigoExterno: "12345*1",
      },
      {
        numeroItem: 2,
        descricao: "Shampoo veterinário 500 ml",
        quantidade: 10,
        unidade: "FR",
        codigoExterno: "12345*2",
      },
    ]);
    expect(result[0].prazoResposta?.getTime()).toBe(
      now.getTime() + 150 * 60_000,
    );
  });
});

describe("parseFunarbeHtml", () => {
  it("extrai processo aberto, objeto e prazo absoluto", () => {
    const html = `
      <html><body>
        <table><tbody>
          <tr>
            <td>Processo: 2026/123</td>
            <td>Aberto para cotação</td>
            <td>Aquisição de materiais veterinários para atendimento clínico</td>
            <td>Prazo: 30/07/2026 17:00</td>
            <td><a href="/processos/detalhe?id=2026-123">Ver processo</a></td>
          </tr>
        </tbody></table>
      </body></html>
    `;

    const result = parseFunarbeHtml(html, "https://compras.funarbe.org.br/");

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      source: "funarbe",
      externalId: "2026/123",
      orgao: "FUNARBE",
      portalUrl: "https://compras.funarbe.org.br/processos/detalhe?id=2026-123",
    });
    expect(result[0].items).toHaveLength(1);
    expect(result[0].items[0].descricao).toContain("materiais veterinários");
    expect(result[0].prazoResposta).not.toBeNull();
    expect(result[0].prazoResposta?.getFullYear()).toBe(2026);
    expect(result[0].prazoResposta?.getMonth()).toBe(6);
    expect(result[0].prazoResposta?.getDate()).toBe(30);
    expect(result[0].prazoResposta?.getHours()).toBe(17);
  });
});
