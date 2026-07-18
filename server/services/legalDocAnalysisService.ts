/**
 * legalDocAnalysisService: reconhece o TIPO de documento e o analisa como um
 * advogado especialista em licitações e contratos públicos (Lei 14.133/2021,
 * 8.666/93, 10.520/02 e correlatas).
 *
 * Duas etapas:
 *   1. classifyDocument — identifica o tipo (edital, contrato, ata, notificação…)
 *   2. analyzeAsLawyer — leitura jurídica estruturada conforme o tipo
 *
 * Ambas usam invokeLLM (com failover entre provedores) + parseLlmJson.
 */
import { invokeLLM, parseLlmJson } from "../_core/llm";

// Limite de contexto enviado ao modelo (~100 páginas). Acima disso, corta.
const MAX_CHARS = 120_000;

export const TIPOS_DOCUMENTO = [
  "edital_licitacao",
  "termo_referencia",
  "ata_registro_precos",
  "contrato_administrativo",
  "termo_aditivo",
  "dispensa_inexigibilidade",
  "notificacao_extrajudicial",
  "impugnacao_edital",
  "recurso_administrativo",
  "proposta_comercial",
  "procuracao",
  "outro",
] as const;
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];

export const TIPO_LABELS: Record<TipoDocumento, string> = {
  edital_licitacao: "Edital de licitação",
  termo_referencia: "Termo de referência",
  ata_registro_precos: "Ata de registro de preços",
  contrato_administrativo: "Contrato administrativo",
  termo_aditivo: "Termo aditivo",
  dispensa_inexigibilidade: "Dispensa / inexigibilidade",
  notificacao_extrajudicial: "Notificação extrajudicial",
  impugnacao_edital: "Impugnação a edital",
  recurso_administrativo: "Recurso administrativo",
  proposta_comercial: "Proposta comercial",
  procuracao: "Procuração",
  outro: "Outro documento",
};

export type DocumentClassification = {
  tipo: TipoDocumento;
  confianca: number;
  justificativa: string;
};

export async function classifyDocument(text: string): Promise<DocumentClassification> {
  const trecho = text.slice(0, 16_000); // classificação não precisa do doc inteiro
  const result = await invokeLLM({
    messages: [
      {
        role: "system",
        content:
          "Você é um advogado especialista em direito administrativo e licitações públicas no Brasil. " +
          "Classifique o documento no tipo mais adequado da lista. Responda APENAS com JSON válido.",
      },
      {
        role: "user",
        content:
          `Tipos possíveis: ${TIPOS_DOCUMENTO.join(", ")}.\n\n` +
          `Trecho inicial do documento:\n\n${trecho}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "document_classification",
        strict: true,
        schema: {
          type: "object",
          properties: {
            tipo: { type: "string", enum: TIPOS_DOCUMENTO as unknown as string[] },
            confianca: { type: "number", description: "0 a 1" },
            justificativa: { type: "string", description: "Por que este tipo (1 frase)" },
          },
          required: ["tipo", "confianca", "justificativa"],
          additionalProperties: false,
        },
      },
    },
  });
  const content = result.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error("A IA não retornou a classificação do documento.");
  }
  const parsed = parseLlmJson<DocumentClassification>(content);
  if (!TIPOS_DOCUMENTO.includes(parsed.tipo)) parsed.tipo = "outro";
  return parsed;
}

export type LegalAnalysis = {
  resumoExecutivo: string;
  objeto: string | null;
  partes: Array<{ papel: string; nome: string }>;
  requisitosHabilitacao: {
    juridica: string[];
    fiscalTrabalhista: string[];
    tecnica: string[];
    economicoFinanceira: string[];
  };
  prazosCriticos: Array<{ descricao: string; prazo: string }>;
  penalidadesEGarantias: string[];
  riscosJuridicos: Array<{ risco: string; gravidade: "alta" | "media" | "baixa"; fundamento: string }>;
  clausulasAtencao: Array<{ trecho: string; motivo: string }>;
  impugnabilidade: { cabivel: boolean; prazo: string | null; fundamentos: string[] };
  recomendacoes: string[];
};

/**
 * Prompt do "advogado especialista": muda o foco conforme o tipo, mas mantém
 * a mesma estrutura de saída para a UI. Para tipos sem habilitação (ex.:
 * notificação), esses campos vêm vazios e o foco recai sobre riscos e prazos.
 */
function systemPromptFor(tipo: TipoDocumento): string {
  const base =
    "Você é um advogado sênior especializado em direito administrativo, licitações e contratos " +
    "públicos no Brasil (Lei 14.133/2021, Lei 8.666/93, Lei 10.520/02, LC 123/2006 e jurisprudência " +
    "do TCU). Leia o documento como um parecerista experiente: identifique o que importa para a " +
    "decisão de participar/assinar, os requisitos de habilitação, prazos fatais, penalidades, riscos " +
    "jurídicos e cláusulas de atenção (inclusive exigências potencialmente restritivas ou ilegais que " +
    "possam embasar impugnação). Seja concreto e cite trechos quando útil. NÃO invente dados que não " +
    "estejam no documento — se algo não constar, deixe a lista vazia. Responda APENAS com JSON válido.";
  const foco: Partial<Record<TipoDocumento, string>> = {
    edital_licitacao:
      " Foco: condições de participação, habilitação (jurídica, fiscal/trabalhista, técnica e econômico-financeira), " +
      "critério de julgamento, prazos (impugnação, propostas, recursos), garantias, penalidades e cláusulas restritivas.",
    contrato_administrativo:
      " Foco: obrigações das partes, vigência e prorrogação, reajuste/repactuação, penalidades, garantias, hipóteses de rescisão e cláusulas exorbitantes.",
    ata_registro_precos:
      " Foco: itens e preços registrados, prazo de validade da ata, condições de adesão/carona, obrigações do fornecedor e penalidades.",
    notificacao_extrajudicial:
      " Foco: remetente e destinatário, fato imputado, exigência/prazo, consequências anunciadas, riscos jurídicos e resposta recomendada.",
    termo_aditivo:
      " Foco: o que está sendo alterado no contrato original, limites legais de aditamento, impacto financeiro e de prazo.",
  };
  return base + (foco[tipo] ?? " Foco: obrigações, prazos, riscos jurídicos e pontos de atenção do documento.");
}

export async function analyzeAsLawyer(text: string, tipo: TipoDocumento): Promise<LegalAnalysis> {
  const trecho = text.slice(0, MAX_CHARS);
  const result = await invokeLLM({
    messages: [
      { role: "system", content: systemPromptFor(tipo) },
      {
        role: "user",
        content: `Tipo do documento: ${TIPO_LABELS[tipo]}.\n\nDocumento:\n\n${trecho}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "legal_analysis",
        strict: true,
        schema: {
          type: "object",
          properties: {
            resumoExecutivo: { type: "string", description: "3-6 frases com o essencial para decidir" },
            objeto: { type: ["string", "null"], description: "Objeto/assunto central" },
            partes: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  papel: { type: "string", description: "Ex: Órgão contratante, Licitante, Notificante" },
                  nome: { type: "string" },
                },
                required: ["papel", "nome"],
                additionalProperties: false,
              },
            },
            requisitosHabilitacao: {
              type: "object",
              properties: {
                juridica: { type: "array", items: { type: "string" } },
                fiscalTrabalhista: { type: "array", items: { type: "string" } },
                tecnica: { type: "array", items: { type: "string" } },
                economicoFinanceira: { type: "array", items: { type: "string" } },
              },
              required: ["juridica", "fiscalTrabalhista", "tecnica", "economicoFinanceira"],
              additionalProperties: false,
            },
            prazosCriticos: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  descricao: { type: "string" },
                  prazo: { type: "string", description: "Data ou prazo (ex: '5 dias úteis', '15/08/2026')" },
                },
                required: ["descricao", "prazo"],
                additionalProperties: false,
              },
            },
            penalidadesEGarantias: { type: "array", items: { type: "string" } },
            riscosJuridicos: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  risco: { type: "string" },
                  gravidade: { type: "string", enum: ["alta", "media", "baixa"] },
                  fundamento: { type: "string", description: "Por que é um risco (norma/jurisprudência/trecho)" },
                },
                required: ["risco", "gravidade", "fundamento"],
                additionalProperties: false,
              },
            },
            clausulasAtencao: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  trecho: { type: "string", description: "Cláusula/exigência que merece atenção" },
                  motivo: { type: "string", description: "Por que atentar (restritiva, ambígua, ilegal…)" },
                },
                required: ["trecho", "motivo"],
                additionalProperties: false,
              },
            },
            impugnabilidade: {
              type: "object",
              properties: {
                cabivel: { type: "boolean", description: "Há fundamento para impugnar/questionar?" },
                prazo: { type: ["string", "null"], description: "Prazo para impugnação, se aplicável" },
                fundamentos: { type: "array", items: { type: "string" } },
              },
              required: ["cabivel", "prazo", "fundamentos"],
              additionalProperties: false,
            },
            recomendacoes: { type: "array", items: { type: "string" }, description: "Próximos passos objetivos" },
          },
          required: [
            "resumoExecutivo",
            "objeto",
            "partes",
            "requisitosHabilitacao",
            "prazosCriticos",
            "penalidadesEGarantias",
            "riscosJuridicos",
            "clausulasAtencao",
            "impugnabilidade",
            "recomendacoes",
          ],
          additionalProperties: false,
        },
      },
    },
  });
  const content = result.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error("A IA não retornou a análise jurídica.");
  }
  return parseLlmJson<LegalAnalysis>(content);
}
