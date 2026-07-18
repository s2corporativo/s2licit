/**
 * agente.ts — Router do Agente de IA S2
 *
 * Agente conversacional com acesso real ao banco de dados do sistema.
 * Suporta ferramentas (tools) para consultar produtos, propostas,
 * fornecedores, financeiro e executar ações como busca e análise.
 */

import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { invokeLLM } from "../_core/llm";
import type { Message, Tool } from "../_core/llm";
import {
  getDashboardStats,
  listProducts,
  listSuppliers,
  listProposals,
  getFinancialSummary,
  getExpiringProposals,
  listFinancialEntries,
  smartSearch,
  compareByActiveIngredient,
  listImportLogs,
  getProductsPerCategory,
  getProposalFinancialStats,
} from "../db";

// ─── Ferramentas disponíveis para o Agente ────────────────────────────────────

const AGENT_TOOLS: Tool[] = [
  {
    type: "function",
    function: {
      name: "buscar_produtos",
      description:
        "Busca produtos no catálogo por nome, princípio ativo, fabricante ou código. Retorna preços, fornecedores e disponibilidade.",
      parameters: {
        type: "object",
        properties: {
          search: { type: "string", description: "Termo de busca (nome, princípio ativo, fabricante, código)" },
          categoryId: { type: "number", description: "Filtrar por ID de categoria (opcional)" },
          supplierId: { type: "number", description: "Filtrar por ID de fornecedor (opcional)" },
          limit: { type: "number", description: "Número máximo de resultados (padrão 10)" },
        },
        required: ["search"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "comparar_por_principio_ativo",
      description:
        "Compara preços de todos os fornecedores para um princípio ativo específico. Útil para encontrar a opção mais barata.",
      parameters: {
        type: "object",
        properties: {
          principioAtivo: { type: "string", description: "Princípio ativo (ex: Ivermectina, Amoxicilina)" },
        },
        required: ["principioAtivo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "listar_fornecedores",
      description: "Lista todos os fornecedores cadastrados no sistema.",
      parameters: {
        type: "object",
        properties: {
          apenasAtivos: { type: "boolean", description: "Se true, retorna apenas fornecedores ativos" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "estatisticas_dashboard",
      description:
        "Retorna estatísticas gerais do sistema: total de produtos, fornecedores, categorias, propostas e importações.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "resumo_financeiro",
      description:
        "Retorna resumo financeiro: receitas, despesas, saldo, valores pagos e pendentes. Pode filtrar por período.",
      parameters: {
        type: "object",
        properties: {
          dataInicio: { type: "string", description: "Data inicial no formato YYYY-MM-DD (opcional)" },
          dataFim: { type: "string", description: "Data final no formato YYYY-MM-DD (opcional)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propostas_vencendo",
      description: "Lista propostas comerciais que estão próximas do vencimento.",
      parameters: {
        type: "object",
        properties: {
          diasAdiante: { type: "number", description: "Número de dias para verificar (padrão 7)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "listar_propostas",
      description: "Lista propostas comerciais com filtros opcionais por status.",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["draft", "sent", "order", "in_transit", "delivered", "cancelled"],
            description: "Filtrar por status (opcional)",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "produtos_por_categoria",
      description: "Retorna a contagem de produtos por cada categoria do catálogo.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "historico_importacoes",
      description: "Lista o histórico de importações de planilhas de fornecedores.",
      parameters: {
        type: "object",
        properties: {
          limite: { type: "number", description: "Quantas importações retornar (padrão 10)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "stats_propostas",
      description: "Estatísticas de propostas: total por status, valores, ticket médio.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "busca_rapida_produto",
      description:
        "Busca inteligente de produto retornando o menor preço disponível entre todos os fornecedores. Ideal para montar cotações.",
      parameters: {
        type: "object",
        properties: {
          nome: { type: "string", description: "Nome ou parte do nome do produto" },
        },
        required: ["nome"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "lancamentos_financeiros",
      description: "Lista lançamentos financeiros (receitas e despesas) com filtros opcionais.",
      parameters: {
        type: "object",
        properties: {
          tipo: { type: "string", enum: ["receita", "despesa"], description: "Filtrar por tipo (opcional)" },
          status: { type: "string", enum: ["paid", "pending"], description: "Filtrar por situação (opcional)" },
          limite: { type: "number", description: "Máximo de registros (padrão 20)" },
        },
      },
    },
  },
];

// ─── Executor de ferramentas ──────────────────────────────────────────────────

async function executarFerramenta(nome: string, args: Record<string, any>): Promise<string> {
  try {
    switch (nome) {
      case "buscar_produtos": {
        const result = await listProducts({
          search: args.search,
          categoryId: args.categoryId,
          supplierId: args.supplierId,
          limit: Math.min(args.limit ?? 10, 20),
          isActive: "yes",
        });
        if (result.items.length === 0) return "Nenhum produto encontrado com esse critério.";
        return JSON.stringify(
          result.items.map((p) => ({
            id: p.id,
            nome: p.name,
            principioAtivo: p.activeIngredient,
            fabricante: p.manufacturer,
            concentracao: p.concentration,
            apresentacao: p.presentation,
            unidade: p.unit,
            preco: p.price ? `R$ ${parseFloat(String(p.price)).toFixed(2)}` : "Sem preço",
            fornecedor: p.supplierName,
            categoria: p.categoryName,
            mapa: p.mapa,
          })),
          null,
          2
        );
      }

      case "comparar_por_principio_ativo": {
        const result = await compareByActiveIngredient(args.principioAtivo);
        if (!result || result.length === 0)
          return `Nenhum produto encontrado com princípio ativo "${args.principioAtivo}".`;
        const sorted = [...result].sort((a: any, b: any) => {
          const pa = a.price ? parseFloat(String(a.price)) : Infinity;
          const pb = b.price ? parseFloat(String(b.price)) : Infinity;
          return pa - pb;
        });
        return JSON.stringify(
          sorted.map((p: any) => ({
            nome: p.name,
            preco: p.price ? `R$ ${parseFloat(String(p.price)).toFixed(2)}` : "Sem preço",
            fornecedor: p.supplierName,
            fabricante: p.manufacturer,
            concentracao: p.concentration,
            apresentacao: p.presentation,
          })),
          null,
          2
        );
      }

      case "listar_fornecedores": {
        const result = await listSuppliers(args.apenasAtivos ?? true);
        return JSON.stringify(
          result.map((s) => ({ id: s.id, nome: s.name, ativo: s.isActive, criado: s.createdAt })),
          null,
          2
        );
      }

      case "estatisticas_dashboard": {
        const stats = await getDashboardStats();
        return JSON.stringify(stats, null, 2);
      }

      case "resumo_financeiro": {
        const dataInicio = args.dataInicio ? new Date(args.dataInicio) : undefined;
        const dataFim = args.dataFim ? new Date(args.dataFim) : undefined;
        const result = await getFinancialSummary(dataInicio, dataFim);
        return JSON.stringify(result, null, 2);
      }

      case "propostas_vencendo": {
        const result = await getExpiringProposals(args.diasAdiante ?? 7);
        if (!result || result.length === 0) return "Nenhuma proposta próxima do vencimento.";
        return JSON.stringify(result, null, 2);
      }

      case "listar_propostas": {
        const propostas = await listProposals();
        const filtradas = args.status
          ? propostas.filter((p) => p.status === args.status)
          : propostas;
        return JSON.stringify(
          filtradas.map((p) => ({
            id: p.id,
            titulo: p.title,
            processo: p.processNumber,
            orgao: p.orgName,
            status: p.status,
            criado: p.createdAt,
          })),
          null,
          2
        );
      }

      case "produtos_por_categoria": {
        const result = await getProductsPerCategory();
        return JSON.stringify(result, null, 2);
      }

      case "historico_importacoes": {
        const result = await listImportLogs(args.limite ?? 10);
        return JSON.stringify(result, null, 2);
      }

      case "stats_propostas": {
        const result = await getProposalFinancialStats();
        return JSON.stringify(result, null, 2);
      }

      case "busca_rapida_produto": {
        const result = await smartSearch(args.nome);
        if (!result || result.length === 0) return `Nenhum produto encontrado para "${args.nome}".`;
        return JSON.stringify(
          result.slice(0, 10).map((p: any) => ({
            nome: p.name,
            menorPreco: p.price ? `R$ ${parseFloat(String(p.price)).toFixed(2)}` : "Sem preço",
            fornecedor: p.supplierName,
            principioAtivo: p.activeIngredient,
            concentracao: p.concentration,
          })),
          null,
          2
        );
      }

      case "lancamentos_financeiros": {
        const allEntries = await listFinancialEntries({
          type: args.tipo as "income" | "expense" | undefined,
          isPaid: args.status === "paid" ? "yes" : args.status === "pending" ? "no" : undefined,
        });
        const result = allEntries.slice(0, args.limite ?? 20);
        return JSON.stringify(result, null, 2);
      }

      default:
        return `Ferramenta desconhecida: ${nome}`;
    }
  } catch (err: any) {
    console.error(`[Agente] Erro ao executar ferramenta ${nome}:`, err?.message);
    return `Erro ao executar ferramenta ${nome}: ${err?.message ?? "Erro desconhecido"}`;
  }
}

// ─── Prompt do Sistema ────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Você é o Assistente S2, um agente especializado no sistema de orçamentos e licitações da S2 Estratégia e Gestão.

Você tem acesso DIRETO ao banco de dados do sistema e pode consultar informações em tempo real usando as ferramentas disponíveis.

## Suas capacidades:
- **Buscar produtos** no catálogo com preços e fornecedores
- **Comparar preços** entre fornecedores para um mesmo princípio ativo
- **Analisar propostas** comerciais e seus status
- **Resumo financeiro** de receitas, despesas e saldo
- **Alertas de vencimento** de propostas
- **Estatísticas** gerais do sistema
- **Histórico de importações** de planilhas

## Diretrizes:
- Sempre use as ferramentas disponíveis para buscar dados reais antes de responder
- Apresente preços em formato brasileiro: R$ 1.234,56
- Ao comparar produtos, ordene do menor para o maior preço
- Para perguntas sobre licitações, foque em prazo, preço de referência e melhor fornecedor
- Seja direto e objetivo — o usuário está tomando decisões comerciais rápidas
- Quando encontrar alertas importantes (propostas vencendo, margem baixa), destaque em negrito
- Se não souber algo, diga claramente e sugira a ferramenta correta para buscar

## Contexto do negócio:
A empresa participa de licitações e cotações públicas de produtos diversos — medicamentos
veterinários e humanos, materiais de construção, insumos e equipamentos.
O sistema controla o catálogo de fornecedores, gera propostas comerciais e acompanha o pipeline financeiro.`;

// ─── Router ───────────────────────────────────────────────────────────────────

export const agenteRouter = router({
  /**
   * Endpoint principal: envia mensagem ao agente e recebe resposta.
   * Suporta múltiplas rodadas de tool-use automaticamente.
   */
  chat: protectedProcedure
    .input(
      z.object({
        messages: z.array(
          z.object({
            role: z.enum(["user", "assistant", "system"]),
            content: z.string(),
          })
        ),
      })
    )
    .mutation(async ({ input }) => {
      const messages: Message[] = [
        { role: "system", content: SYSTEM_PROMPT },
        ...input.messages.map((m) => ({ role: m.role as any, content: m.content })),
      ];

      // Agentic loop — o LLM pode chamar ferramentas múltiplas vezes
      const MAX_ITERATIONS = 8;
      let iteration = 0;

      while (iteration < MAX_ITERATIONS) {
        iteration++;

        const result = await invokeLLM({
          messages,
          tools: AGENT_TOOLS,
          toolChoice: "auto",
        });

        const choice = result.choices?.[0];
        if (!choice) throw new Error("Sem resposta do LLM");

        const { finish_reason, message } = choice;

        // Adicionar resposta do assistente ao histórico (preservando tool_calls
        // para que as mensagens role:"tool" seguintes não fiquem com tool_call_id órfão)
        messages.push({
          role: "assistant",
          content: message.content ?? "",
          ...(message.tool_calls && message.tool_calls.length > 0
            ? { tool_calls: message.tool_calls }
            : {}),
        });

        // Se não há tool_calls, a resposta é final
        if (finish_reason === "stop" || !message.tool_calls || message.tool_calls.length === 0) {
          return {
            content: message.content ?? "",
            ferramentasUsadas: iteration > 1 ? iteration - 1 : 0,
          };
        }

        // Executar todas as ferramentas chamadas em paralelo
        const toolResults = await Promise.all(
          message.tool_calls.map(async (tc: any) => {
            const nome = tc.function.name;
            let args: Record<string, any> = {};
            try { args = JSON.parse(tc.function.arguments ?? "{}"); } catch {}
            const resultado = await executarFerramenta(nome, args);
            return { tool_call_id: tc.id, nome, resultado };
          })
        );

        // Adicionar resultados das ferramentas ao histórico
        for (const tr of toolResults) {
          messages.push({
            role: "tool" as any,
            content: tr.resultado,
            tool_call_id: tr.tool_call_id,
          } as any);
        }
      }

      return {
        content: "Atingi o limite de iterações. Por favor, reformule a pergunta.",
        ferramentasUsadas: MAX_ITERATIONS,
      };
    }),

  /**
   * Retorna as ferramentas disponíveis para exibição na UI.
   */
  ferramentas: protectedProcedure.query(() => {
    return AGENT_TOOLS.map((t) => ({
      nome: t.function.name,
      descricao: t.function.description,
    }));
  }),
});
