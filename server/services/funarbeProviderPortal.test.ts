import { describe, expect, it } from "vitest";
import {
  combineAgregaListHtmls,
  FUNARBE_PROVIDER_LIST_URLS,
  parseAgregaCombinedHtml,
  parseAgregaListHtml,
} from "./funarbeProviderPortal";

const PRODUCTS_HTML = `
<html><body><table>
  <thead><tr>
    <th>Código</th><th>Projeto</th><th>Comprador</th><th>Situação</th>
    <th>Envio/Pedido</th><th>Previsão de entrega</th><th>Ações</th>
  </tr></thead>
  <tbody>
    <tr>
      <td><a href="/compra-produtos-diversos/view?id=10421">10421</a></td>
      <td>Projeto de Pesquisa XYZ</td><td>Ana Silva</td><td>Aguardando cotação</td>
      <td>01/09/2026</td><td>20/09/2026</td>
      <td><a href="/compra-produtos-diversos/view?id=10421">Ver</a></td>
    </tr>
  </tbody>
</table></body></html>`;

const WITH_DEADLINE_HTML = `
<html><body><table>
  <thead><tr><th>Código</th><th>Item</th><th>Quantidade</th><th>Prazo</th></tr></thead>
  <tbody><tr><td>9988</td><td>Eletrodo combinado de pH DME-CV1</td><td>2</td><td>20/08/2026 18:00</td></tr></tbody>
</table></body></html>`;

describe("Funarbe Provider Portal", () => {
  it("inclui rotas de descoberta (novas cotações abertas)", () => {
    expect(FUNARBE_PROVIDER_LIST_URLS).toContain(
      "https://fornecedor.funarbe.org.br/compra-produtos-diversos",
    );
    expect(FUNARBE_PROVIDER_LIST_URLS).toContain(
      "https://fornecedor.funarbe.org.br/pedidos-compra",
    );
    // cotacao-aguardando-confirmacao é apenas rastreio de status, não descoberta
    expect(FUNARBE_PROVIDER_LIST_URLS).toHaveLength(2);
  });

  it("extrai pedido e link sem inventar prazo a partir de previsão de entrega", () => {
    const [op] = parseAgregaListHtml(
      PRODUCTS_HTML,
      "https://fornecedor.funarbe.org.br/compra-produtos-diversos",
    );
    expect(op.externalId).toBe("10421");
    expect(op.portalUrl).toContain("view?id=10421");
    expect(op.items[0].descricao).toContain("Projeto de Pesquisa XYZ");
    expect(op.bodyText).toContain("Previsão de entrega: 20/09/2026");
    expect(op.prazoResposta).toBeNull();
  });

  it("usa prazo somente quando a coluna declara explicitamente prazo/limite", () => {
    const [op] = parseAgregaListHtml(
      WITH_DEADLINE_HTML,
      "https://fornecedor.funarbe.org.br/pedidos-compra",
    );
    expect(op.items[0].quantidade).toBe(2);
    expect(op.prazoResposta).not.toBeNull();
    expect(op.prazoResposta?.getFullYear()).toBe(2026);
    expect(op.prazoResposta?.getMonth()).toBe(7);
    expect(op.prazoResposta?.getDate()).toBe(20);
    // Preserva a hora: "20/08/2026 18:00" → 18:00, não 23:59:59
    expect(op.prazoResposta?.getHours()).toBe(18);
    expect(op.prazoResposta?.getMinutes()).toBe(0);
  });

  it("deduplica o mesmo pedido quando aparece em mais de uma listagem", () => {
    const combined = combineAgregaListHtmls([
      { url: "https://fornecedor.funarbe.org.br/compra-produtos-diversos", html: PRODUCTS_HTML },
      { url: "https://fornecedor.funarbe.org.br/pedidos-compra", html: PRODUCTS_HTML },
    ]);
    const opportunities = parseAgregaCombinedHtml(combined);
    expect(opportunities).toHaveLength(1);
    expect(opportunities[0].externalId).toBe("10421");
  });

  it("tolera HTML vazio ou sem GridView válida", () => {
    expect(parseAgregaCombinedHtml("<html><body>sem tabela</body></html>")).toEqual([]);
    expect(combineAgregaListHtmls([{ url: "https://x.example", html: "   " }])).toBe("");
  });
});
