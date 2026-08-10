import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { invokeLLM, type Message, type Tool } from "../_core/llm";
import { compareByActiveIngredient, smartSearch } from "../db";
import {
  canonicalSummary,
  getCanonicalOpportunity,
  listCanonicalOpportunities,
  listUnifiedAgenda,
} from "../services/canonicalOpportunityService";
import { logger } from "../_core/logger";

const TOOLS: Tool[] = [
  {
    type: "function",
    function: {
      name: "listar_oportunidades",
      description: "Lista as oportunidades canônicas do S2 com macroetapa, prazo, risco e próxima ação.",
      parameters: {
        type: "object",
        properties: {
          macroEtapa: { type: "string", enum: ["entrada", "analise", "proposta", "execucao", "concluida"] },
          limite: { type: "number" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "detalhar_oportunidade",
      description: "Obtém contexto completo de uma oportunidade: origem, histórico, propostas, pedidos, entregas, faturamento e próxima ação.",
      parameters: {
        type: "object",
        properties: { id: { type: "number" } },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agenda_operacional",
      description: "Consulta todos os prazos operacionais relevantes: oportunidades, sessões, cotações, certidões, contratos, entregas, contas a receber e contas a pagar.",
      parameters: { type: "object", properties: { limite: { type: "number" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "resumo_operacional",
      description: "Retorna contagem de oportunidades por macroetapa e quantidade de itens críticos.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "buscar_produto_menor_preco",
      description: "Busca produtos no catálogo e retorna opções de preço/fornecedor para cotação e proposta.",
      parameters: {
        type: "object",
        properties: { termo: { type: "string" } },
        required: ["termo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "comparar_equivalentes",
      description: "Compara produtos pelo princípio ativo. A comparação econômica não substitui a validação de equivalência técnica do edital.",
      parameters: {
        type: "object",
        properties: { principioAtivo: { type: "string" } },
        required: ["principioAtivo"],
      },
    },
  },
];

async function executeTool(name: string, args: Record<string, unknown>): Promise<string> {
  try {
    switch (name) {
      case "listar_oportunidades": {
        const rows = await listCanonicalOpportunities();
        const macro = typeof args.macroEtapa === "string" ? args.macroEtapa : undefined;
        const limit = Math.max(1, Math.min(Number(args.limite ?? 30), 100));
        return JSON.stringify(
          rows
            .filter((row) => !macro || row.macroEtapa === macro)
            .slice(0, limit)
            .map((row) => ({
              id: row.id,
              titulo: row.titulo,
              orgao: row.orgao,
              processo: row.numeroProcesso,
              etapa: row.etapa,
              macroEtapa: row.macroEtapa,
              prazoEnvio: row.prazoEnvio,
              dataAbertura: row.dataAbertura,
              risco: row.risco,
              proximaAcao: row.proximaAcao,
            })),
          null,
          2,
        );
      }
      case "detalhar_oportunidade": {
        const id = Number(args.id);
        const result = Number.isInteger(id) && id > 0 ? await getCanonicalOpportunity(id) : null;
        return result ? JSON.stringify(result, null, 2) : "Oportunidade não encontrada.";
      }
      case "agenda_operacional": {
        const result = await listUnifiedAgenda();
        const limit = Math.max(1, Math.min(Number(args.limite ?? 40), 100));
        return JSON.stringify({ resumo: result.resumo, itens: result.itens.slice(0, limit) }, null, 2);
      }
      case "resumo_operacional":
        return JSON.stringify(await canonicalSummary(), null, 2);
      case "buscar_produto_menor_preco": {
        const termo = String(args.termo ?? "").trim();
        if (termo.length < 2) return "Informe pelo menos 2 caracteres.";
        const rows = await smartSearch(termo);
        return JSON.stringify(
          (rows ?? []).slice(0, 15).map((row: any) => ({
            id: row.id,
            nome: row.name,
            principioAtivo: row.activeIngredient,
            concentracao: row.concentration,
            apresentacao: row.presentation,
            fabricante: row.manufacturer,
            fornecedor: row.supplierName,
            preco: row.price,
            unidade: row.unit,
            mapa: row.mapa,
          })),
          null,
          2,
        );
      }
      case "comparar_equivalentes": {
        const termo = String(args.principioAtivo ?? "").trim();
        if (termo.length < 2) return "Informe o princípio ativo.";
        const rows = await compareByActiveIngredient(termo);
        return JSON.stringify(
          (rows ?? []).slice(0, 20).map((row: any) => ({
            id: row.id,
            nome: row.name,
            fabricante: row.manufacturer,
            concentracao: row.concentration,
            apresentacao: row.presentation,
            fornecedor: row.supplierName,
            preco: row.price,
            registro: row.mapa,
          })),
          null,
          2,
        );
      }
      default:
        return `Ferramenta desconhecida: ${name}`;
    }
  } catch (error) {
    logger.error(`[LicitacaoAgent] ${name}`, (error as Error).message);
    return `Falha ao consultar ${name}: ${(error as Error).message}`;
  }
}

const SYSTEM_PROMPT = `Você é a IA Operacional do S2 Licit, especializada em compras públicas, cotações, formação de propostas e execução pós-adjudicação.

Seu papel é transformar dados do sistema em decisões operacionais rastreáveis. Você não deve inventar fatos, requisitos de edital, preços, prazos, certidões, equivalências ou resultados. Sempre consulte as ferramentas quando a resposta depender de dados do S2.

MODELO OPERACIONAL CANÔNICO
1. ENTRADA: oportunidade recebida, deduplicação, prazo e origem.
2. ANÁLISE: GO/NO-GO, leitura do edital, exigências, matching, equivalência, custo, tributos, frete e margem.
3. PROPOSTA: montagem, revisão, envio, disputa e habilitação.
4. EXECUÇÃO: contrato/empenho, compra, entrega, faturamento e recebimento.
5. CONCLUÍDA: encerrada, perdida ou cancelada.

REGRAS DE RACIOCÍNIO
- Diferencie claramente: FATO DO SISTEMA, INFERÊNCIA e RECOMENDAÇÃO.
- Para equivalência técnica, compare atributos essenciais (princípio ativo/composição, concentração, apresentação, unidade, registro e exigências do item). Menor preço sozinho nunca prova equivalência.
- Para preço, considere custo vigente, fornecedor, quantidade, frete, tributos, margem e preço de referência quando disponível.
- Trate prazo como prioridade máxima. Se houver prazo vencido ou em até 3 dias, sinalize primeiro.
- Não considere uma proposta segura quando houver item sem custo, match de baixa confiança ou requisito documental não conferido.
- Não afirme conformidade jurídica/regulatória sem evidência documental.
- Não envie proposta, lance em portal, aceite contrato ou pratique ato externo. Você pode analisar, recomendar e preparar a próxima ação dentro do sistema.
- Quando houver dados insuficientes, diga exatamente o que falta.
- Responda em português do Brasil, de forma objetiva e operacional.

FORMATO PREFERIDO
Comece pela conclusão/ação recomendada. Depois apresente riscos e evidências relevantes. Evite textos longos quando uma decisão objetiva for possível.`;

export const licitacaoAgentRouter = router({
  chat: protectedProcedure
    .input(
      z.object({
        opportunityId: z.number().int().positive().optional(),
        messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(12_000) })).max(30),
      }),
    )
    .mutation(async ({ input }) => {
      let contextual = "";
      if (input.opportunityId) {
        const detail = await getCanonicalOpportunity(input.opportunityId);
        contextual = detail
          ? `\n\nCONTEXTO DA OPORTUNIDADE ATIVA #${input.opportunityId}:\n${JSON.stringify(detail)}`
          : `\n\nA oportunidade #${input.opportunityId} não foi encontrada.`;
      }

      const messages: Message[] = [
        { role: "system", content: SYSTEM_PROMPT + contextual },
        ...input.messages.map((message) => ({ role: message.role, content: message.content } as Message)),
      ];

      const used = new Set<string>();
      for (let iteration = 0; iteration < 8; iteration++) {
        const result = await invokeLLM({ messages, tools: TOOLS, toolChoice: "auto" });
        const choice = result.choices?.[0];
        if (!choice) throw new Error("A IA não retornou resposta.");
        const message = choice.message;
        messages.push({
          role: "assistant",
          content: message.content ?? "",
          ...(message.tool_calls?.length ? { tool_calls: message.tool_calls } : {}),
        } as Message);

        if (!message.tool_calls?.length) {
          return { content: message.content ?? "", ferramentasUsadas: Array.from(used) };
        }

        const outputs = await Promise.all(
          message.tool_calls.map(async (call: any) => {
            let args: Record<string, unknown> = {};
            try { args = JSON.parse(call.function.arguments ?? "{}"); } catch {}
            used.add(call.function.name);
            return {
              id: call.id,
              content: await executeTool(call.function.name, args),
            };
          }),
        );
        for (const output of outputs) {
          messages.push({ role: "tool" as any, tool_call_id: output.id, content: output.content } as Message);
        }
      }

      return {
        content: "Não consegui concluir a análise com segurança dentro do limite de consultas. Reduza o escopo da pergunta.",
        ferramentasUsadas: Array.from(used),
      };
    }),

  tools: protectedProcedure.query(() => TOOLS.map((tool) => ({ nome: tool.function.name, descricao: tool.function.description }))),
});
