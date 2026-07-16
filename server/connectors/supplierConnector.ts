/**
 * supplierConnector.ts
 *
 * Contrato modular de conectores por fornecedor (spec §4 e §23) e o conjunto
 * de dados a coletar por produto (§7), com proveniência.
 *
 * Objetivos:
 *  - Cada fornecedor tem seu próprio conector independente — uma falha ou
 *    mudança em um não afeta os demais (§23).
 *  - A resolução de acesso segue a ordem de preferência da §4:
 *    API oficial → integração/catálogo → arquivo (XML/JSON/CSV/Excel) →
 *    automação de navegador → consulta manual assistida.
 *  - Nunca inventar dado: campo ausente é marcado explicitamente como
 *    "não disponibilizado pelo fornecedor" (§7).
 *
 * Este módulo é o alicerce (contrato + registro + cascata). Os conectores
 * concretos de cada fornecedor implementam a interface.
 */

/** Frase padrão para informação ausente (§7). */
export const INFO_NAO_DISPONIVEL = "Informação não disponibilizada pelo fornecedor.";

/** Métodos de acesso, em ordem de PREFERÊNCIA (§4: menor índice = melhor). */
export const ORDEM_ACESSO = ["api", "catalogo", "arquivo", "scraper", "manual"] as const;
export type MetodoAcesso = (typeof ORDEM_ACESSO)[number];

export function prioridadeAcesso(metodo: MetodoAcesso): number {
  const i = ORDEM_ACESSO.indexOf(metodo);
  return i === -1 ? ORDEM_ACESSO.length : i;
}

export interface SupplierSearchQuery {
  termo?: string;
  codigo?: string;
  ean?: string;
  sku?: string;
  referenciaFabricante?: string;
  marca?: string;
  fabricante?: string;
  categoria?: string;
}

/**
 * Produto retornado por um conector (§7). Campos opcionais ausentes significam
 * "não disponibilizado" — nunca preencher por suposição. `fonte`/`consultadoEm`
 * registram a proveniência de cada coleta.
 */
export interface SupplierProductResult {
  nome: string;
  descricao?: string;
  marca?: string;
  fabricante?: string;
  referencia?: string;
  sku?: string;
  ean?: string;
  categoria?: string;
  imagemUrl?: string;
  urlProduto?: string;
  precoNormal?: number;
  precoPromocional?: number;
  precoPessoaJuridica?: number;
  precoPorQuantidade?: Array<{ quantidadeMinima: number; preco: number }>;
  quantidadeMinima?: number;
  unidadeVenda?: string;
  unidadesPorEmbalagem?: number;
  disponivel?: boolean;
  estoque?: number;
  prazoEnvio?: string;
  prazoEntrega?: string;
  politicaFrete?: string;
  condicoesPagamento?: string;
  validadePromocao?: string;
  /** Proveniência: método + identificador da origem (URL, endpoint, arquivo). */
  fonte: { metodo: MetodoAcesso; origem: string };
  /** Momento da consulta (epoch ms), para validade do preço (§13). */
  consultadoEm: number;
}

export interface ConnectorContext {
  /** Momento da execução (epoch ms) — injetado para ser testável/determinístico. */
  agora: number;
}

/** Conector independente de um fornecedor (§23). */
export interface SupplierConnector {
  readonly id: string;
  readonly nome: string;
  readonly supplierId?: number;
  readonly metodoAcesso: MetodoAcesso;
  /** O conector está apto a rodar? (ex.: credencial/endpoint configurados). */
  disponivel(): boolean;
  /** Pesquisa produtos para uma consulta. Deve registrar proveniência. */
  buscar(query: SupplierSearchQuery, ctx: ConnectorContext): Promise<SupplierProductResult[]>;
}

/** Registro central de conectores, agrupados por fornecedor. */
export class ConnectorRegistry {
  private readonly porSupplier = new Map<number, SupplierConnector[]>();
  private readonly porId = new Map<string, SupplierConnector>();

  register(connector: SupplierConnector): void {
    this.porId.set(connector.id, connector);
    if (connector.supplierId != null) {
      const lista = this.porSupplier.get(connector.supplierId) ?? [];
      lista.push(connector);
      this.porSupplier.set(connector.supplierId, lista);
    }
  }

  get(id: string): SupplierConnector | undefined {
    return this.porId.get(id);
  }

  /** Conectores de um fornecedor, ordenados pela preferência de acesso (§4). */
  paraSupplier(supplierId: number): SupplierConnector[] {
    return [...(this.porSupplier.get(supplierId) ?? [])].sort(
      (a, b) => prioridadeAcesso(a.metodoAcesso) - prioridadeAcesso(b.metodoAcesso),
    );
  }

  listar(): SupplierConnector[] {
    return [...this.porId.values()];
  }
}

export interface ResultadoCascata {
  resultados: SupplierProductResult[];
  conectorUsado: SupplierConnector | null;
  metodo: MetodoAcesso | null;
  /** Conectores tentados sem sucesso, com o motivo (vazio/indisponível/erro). */
  tentativas: Array<{ id: string; metodo: MetodoAcesso; motivo: string }>;
}

/**
 * Executa a busca seguindo a cascata da §4: tenta os conectores na ordem de
 * preferência e para no primeiro que retornar resultados. Conectores
 * indisponíveis são pulados; erros de um conector não interrompem a cascata
 * (isolamento por fornecedor, §23).
 */
export async function buscarComCascata(
  connectors: SupplierConnector[],
  query: SupplierSearchQuery,
  ctx: ConnectorContext,
): Promise<ResultadoCascata> {
  const ordenados = [...connectors].sort(
    (a, b) => prioridadeAcesso(a.metodoAcesso) - prioridadeAcesso(b.metodoAcesso),
  );
  const tentativas: ResultadoCascata["tentativas"] = [];

  for (const c of ordenados) {
    if (!c.disponivel()) {
      tentativas.push({ id: c.id, metodo: c.metodoAcesso, motivo: "indisponível" });
      continue;
    }
    try {
      const resultados = await c.buscar(query, ctx);
      if (resultados.length > 0) {
        return { resultados, conectorUsado: c, metodo: c.metodoAcesso, tentativas };
      }
      tentativas.push({ id: c.id, metodo: c.metodoAcesso, motivo: "sem resultados" });
    } catch (err) {
      tentativas.push({ id: c.id, metodo: c.metodoAcesso, motivo: `erro: ${(err as Error).message}` });
    }
  }

  return { resultados: [], conectorUsado: null, metodo: null, tentativas };
}
