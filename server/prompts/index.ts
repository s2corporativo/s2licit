/**
 * prompts/index.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Repositório central de prompts de IA do S2licit.
 *
 * Antes da auditoria, cada módulo escrevia seu próprio prompt inline
 * (edital.ts, serviços de NFe, enriquecimento...), o que gerava divergência
 * silenciosa entre módulos equivalentes e dificultava revisão e ajuste fino.
 *
 * Regras:
 *   1. Todo prompt de IA do sistema vive neste módulo (ou em arquivo irmão
 *      explícito deste diretório). Imports inline em routers são proibidos
 *      para prompts de produção.
 *   2. Nenhuma variação de comportamento deve existir entre quem consome o
 *      mesmo prompt — parâmetros são passados como função, não duplicados.
 *   3. Alterações de prompt são tratadas como alteração de lógica de negócio:
 *      exigem atualização dos testes que validam a extração (quando houver).
 */


export interface EditalExtractionSystemPromptOptions {
  /** Se false, acrescenta a instrução de trecho intermediário/final do edital. */
  isFirstChunk: boolean;
}

/**
 * Prompt de sistema para extração estruturada de itens de editais de
 * licitação pública brasileira (Lei 14.133/21 e correlatas).
 *
 * Extrai: metadados do processo + itens com número, descrição, unidade,
 * quantidade, preços de referência e, quando identificáveis, lote,
 * descrição original, código CATMAT/CATSER, regime de marca e marca de
 * referência.
 */
export function editalExtractionSystemPrompt({ isFirstChunk }: EditalExtractionSystemPromptOptions): string {
  return (
    "Você é um especialista em licitações públicas brasileiras. Analise o texto de um edital (ou um trecho dele) e extraia: " +
    "(1) metadados do processo (número do processo, modalidade, órgão, objeto) — se o trecho não contiver essa informação, use string vazia; " +
    "(2) lista completa de itens/produtos solicitados NESTE TRECHO com: número do item (conforme numerado no próprio edital, não reenumere), descrição completa, unidade de medida, quantidade, " +
    "preço unitário de referência (se informado no edital — pode aparecer como 'valor unitário', 'preço máximo', 'preço referência', 'valor estimado unitário') e " +
    "preço total estimado do item (quantidade × preço unitário). " +
    "Se o edital não informar preços, retorne null nesses campos. " +
    "Além disso, quando o texto permitir identificar: (a) o lote do item no edital, use 'lote'; " +
    "(b) a descrição exatamente como escrita no edital, use 'descricaoOriginal'; " +
    "(c) um código CATMAT/CATSER, use 'catmatCode'; " +
    "(d) o regime de marca — livre (aceita qualquer fabricante), referencia (equivalente aceito com marca de referência citada) ou restrita (só a marca citada) — use 'tipoMarca' (ou 'naoSei' se indeterminável); " +
    "(e) a marca/fabricante de referência citada, use 'referenciaBrand'. Campos não identificáveis devem ser null. " +
    (isFirstChunk
      ? ""
      : "Este é um trecho intermediário/final de um edital maior — extraia apenas os itens presentes neste trecho, sem inventar nem repetir itens de outras partes. ") +
    "Responda APENAS com JSON válido conforme o schema solicitado."
  );
}

/**
 * Prompt de usuário para extração de edital — recebe o trecho do texto.
 */
export function editalExtractionUserPrompt(chunkText: string): string {
  return `Analise o seguinte texto de edital e extraia os dados solicitados:\n\n${chunkText}`;
}

/**
 * Valores aceitos para o regime de marca de um item de edital.
 * Manter em sincronia com TipoMarca (routers/edital.ts) e com o enum do
 * schema de resposta (EDITAL_EXTRACTION_SCHEMA, routers/edital.ts).
 */
export const TIPOS_MARCA = ["livre", "referencia", "restrita", "naoSei"] as const;
export type TipoMarcaValue = (typeof TIPOS_MARCA)[number];
