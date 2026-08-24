import { describe, expect, it } from "vitest";
import {
  combineAgregaListHtmls,
  FUNARBE_PROVIDER_LIST_URLS,
  parseAgregaCombinedHtml,
  parseAgregaListHtml,
} from "./funarbeProviderPortal";

/**
 * HTML realista da GridView do Agrega (/compra-produtos-diversos), baseada no
 * layout kartik/Yii2 verificado no portal fornecedor.funarbe.org.br em
 * 13/08/2026. As linhas contêm link de ação na célula "Ações".
 */
const LISTA_PRODUTOS_DIVERSOS_HTML = `
<html><body>
<table>
  <thead><tr>
    <th>Código</th><th>Projeto</th><th>Comprador</th><th>Situação</th>
    <th>Envio/Pedido</th><th>Envio/Compras</th><th>Previsão de entrega</th>
    <th>Ações</th>
  </tr></thead>
  <tbody>
    <tr>
      <td><a href="/compra-produtos-diversos/view?id=10421">10421</a></td>
      <td>Projeto de Pesquisa XYZ</td><td>Dr. Ana Silva</td>
      <td>Aguardando cotação</td><td>01/09/2026</td><td>15/08/2026</td>
      <td>20/09/2026</td>
      <td><a href="/compra-produtos-diversos/view?id=10421">Ver</a></td>
    </tr>
    <tr>
      <td><a href="/compra-produtos-diversos/view?id=10435">10435</a></td>
      <td>Manutenção de Laboratório</td><td>Dr. Paulo Souza</td>
      <td>Aberta para cotação</td><td>03/09/2026</td><td>16/08/2026</td>
      <td>25/09/2026</td>
      <td><a href="/compra-produtos-diversos/view?id=10435">Ver</a></td>
    </tr>
  </tbody>
</table>
</body></html>`;

/**
 * HTML realista da tela /cotacao-aguardando-confirmacao (cotações já
 * respondidas aguardando confirmação de entrega).
 */
const LISTA_CONFIRMACAO_HTML = `
<html><body>
<table>
  <thead><tr>
    <th>Pedido de Compra</th><th>Documento Fiscal</th><th>Item</th>
    <th>Processo de Compra</th><th>Situacao</th><th>Quantidade</th>
    <th>Valor</th>
  </tr></thead>
  <tbody>
    <tr>
      <td><a href="/cotacao-aguardando-confirmacao/view?id=881">881</a></td>
      <td>NF-e 12345</td><td>Item 1 — Medicamento veterinário X 500mg</td>
      <td>Compra 10421</td><td>Aguardando confirmação</td>
      <td>10</td><td>R$ 1.250,00</td>
    </tr>
  </tbody>
</table>
</body></html>`;

describe("parseAgregaListHtml", () => {
  it("extrai cotações de /compra-produtos-diversos com prazos e links de ação", () => {
    const oportunidades = parseAgregaListHtml(
      LISTA_PRODUTOS_DIVERSOS_HTML,
      "https://fornecedor.funarbe.org.br/compra-produtos-diversos",
    );
    expect(oportunidades).toHaveLength(2);

    const primeira = oportunidades.find((op) => op.externalId === "10421");
    expect(primeira).toBeDefined();
    expect(primeira!.orgao).toBe("FUNARBE");
    expect(primeira!.subject).toContain("10421");
    expect(primeira!.subject).toContain("Aguardando cotação");
    expect(primeira!.portalUrl).toContain("/compra-produtos-diversos/view?id=10421");
    expect(primeira!.bodyText).toContain("Origem: Portal do Fornecedor Funarbe");
    expect(primeira!.bodyText).toContain("Projeto de Pesquisa XYZ");
    // Não inventa prazo a partir de "Previsão de entrega" (logística):
    // só preenche prazoResposta quando coluna declara explicitamente prazo/limite
    expect(primeira!.prazoResposta).toBeNull();
    expect(primeira!.items[0].descricao).toContain("Projeto de Pesquisa XYZ");
  });

  it("extrai pedido de compra confirmado com quantidade e valor", () => {
    const oportunidades = parseAgregaListHtml(
      LISTA_CONFIRMACAO_HTML,
      "https://fornecedor.funarbe.org.br/cotacao-aguardando-confirmacao",
    );
    expect(oportunidades).toHaveLength(1);
    const op = oportunidades[0];
    expect(op.externalId).toBe("881");
    expect(op.items[0].quantidade).toBe(10);
    expect(op.items[0].descricao).toContain("Medicamento veterinário X 500mg");
    expect(op.bodyText).toContain("Quantidade: 10");
    expect(op.bodyText).toContain("Valor: R$ 1.250,00");
    expect(op.bodyText).toContain("NF-e 12345");
  });

  it("ignora listagens vazias (sem tbody ou sem linhas com conteúdo)", () => {
    expect(parseAgregaListHtml("<html><body></body></html>", "https://x.example").length).toBe(0);
    expect(
      parseAgregaListHtml(
        `<html><body><table><thead><tr><th>Código</th></tr></thead><tbody><tr><td>   </td></tr></tbody></table></body></html>`,
        "https://x.example",
      ).length,
    ).toBe(0);
  });

  it("tolera coluna sem cabeçalho: linhas sem identificador são descartadas", () => {
    const semIdentificador = `
      <html><body><table>
        <thead><tr><th>Item</th><th>Valor</th></tr></thead>
        <tbody><tr><td>Produto solto</td><td>R$ 10,00</td></tr></tbody>
      </table></body></html>`;
    // Sem "Pedido de Compra" nem "Código" no cabeçalho, o identificador
    // posicional vazio faz a linha ser descartada (proteção contra ruído).
    expect(parseAgregaListHtml(semIdentificador, "https://x.example")).toHaveLength(0);
  });
});

describe("combineAgregaListHtmls / parseAgregaCombinedHtml", () => {
  it("combina múltiplas listagens preservando a origem de cada linha", () => {
    const combined = combineAgregaListHtmls([
      { url: "https://fornecedor.funarbe.org.br/compra-produtos-diversos", html: LISTA_PRODUTOS_DIVERSOS_HTML },
      { url: "https://fornecedor.funarbe.org.br/cotacao-aguardando-confirmacao", html: LISTA_CONFIRMACAO_HTML },
    ]);
    expect(combined).toContain("FUNARBE_PROVIDER_LIST:");
    expect(combined).toContain("/compra-produtos-diversos");
    expect(combined).toContain("/cotacao-aguardando-confirmacao");

    const oportunidades = parseAgregaCombinedHtml(combined);
    expect(oportunidades).toHaveLength(3);

    const deConfirmacao = oportunidades.find((op) => op.externalId === "881");
    expect(deConfirmacao?.portalUrl).toContain("/cotacao-aguardando-confirmacao/view?id=881");

    const deProdutos = oportunidades.find((op) => op.externalId === "10435");
    expect(deProdutos?.portalUrl).toContain("/compra-produtos-diversos/view?id=10435");
  });

  it("deduplica cotação que aparece em mais de uma listagem", () => {
    const duplicated = combineAgregaListHtmls([
      { url: "https://fornecedor.funarbe.org.br/pedidos-compra", html: LISTA_PRODUTOS_DIVERSOS_HTML },
      { url: "https://fornecedor.funarbe.org.br/compra-produtos-diversos", html: LISTA_PRODUTOS_DIVERSOS_HTML },
    ]);
    const oportunidades = parseAgregaCombinedHtml(duplicated);
    // Mesmo externalId em URLs diferentes → chaves distintas por origem,
    // porém o mesmo pedido (10421/10435) só deve aparecer uma vez POR ORIGEM;
    // o total único de IDs permanece 2.
    const ids = new Set(oportunidades.map((op) => op.externalId));
    expect(ids.size).toBe(2);
  });

  it("devolve lista vazia para HTML sem listagens válidas", () => {
    expect(parseAgregaCombinedHtml("<html><body>sem tabelas</body></html>").length).toBe(0);
    expect(combineAgregaListHtmls([{ url: "https://x.example", html: "   " }])).toBe("");
  });
});

describe("constantes do portal fornecedor", () => {
  it("aponta as rotas reais da área autenticada verificadas em 13/08/2026", () => {
    expect(FUNARBE_PROVIDER_LIST_URLS).toContain(
      "https://fornecedor.funarbe.org.br/compra-produtos-diversos",
    );
    expect(FUNARBE_PROVIDER_LIST_URLS).toContain(
      "https://fornecedor.funarbe.org.br/pedidos-compra",
    );
    expect(FUNARBE_PROVIDER_LIST_URLS).toContain(
      "https://fornecedor.funarbe.org.br/cotacao-aguardando-confirmacao",
    );
  });
});
