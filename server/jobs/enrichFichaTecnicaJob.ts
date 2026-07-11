/**
 * enrichFichaTecnicaJob.ts
 * Job para enriquecimento em lote de fichas técnicas via IA
 * Processa 4.677 produtos sem ficha técnica em lotes de 50
 */

import { getDb, resetDb } from "../db";
import { products } from "../../drizzle/schema";
import { isNull, sql } from "drizzle-orm";
import { invokeLLM } from "../_core/llm";
import { notifyOwner } from "../_core/notification";

export interface EnrichmentProgress {
  totalProducts: number;
  processedProducts: number;
  successfulProducts: number;
  failedProducts: number;
  currentBatch: number;
  totalBatches: number;
  percentComplete: number;
  estimatedTimeRemaining: number;
  status: "idle" | "running" | "completed" | "error";
  startedAt?: Date;
  completedAt?: Date;
  lastError?: string;
}

let enrichmentProgress: EnrichmentProgress = {
  totalProducts: 0,
  processedProducts: 0,
  successfulProducts: 0,
  failedProducts: 0,
  currentBatch: 0,
  totalBatches: 0,
  percentComplete: 0,
  estimatedTimeRemaining: 0,
  status: "idle",
};

/**
 * Extrair ficha técnica estruturada via IA
 */
async function extractFichaTecnicaViaIA(product: any): Promise<any> {
  const systemPrompt = `Você é um especialista em análise técnica de produtos veterinários, humanos, industriais e agropecuários.
Sua tarefa é gerar uma ficha técnica estruturada em JSON baseada nas informações do produto.

REGRAS OBRIGATÓRIAS:
1. Extraia informações EXPLÍCITAS do nome, código, fabricante e apresentação do produto.
2. Infira apenas quando absolutamente necessário (ex: forma farmacêutica a partir da apresentação).
3. Normalize valores: use ponto decimal, unidades padronizadas (mg/mL, UI/mL, %, V, W, Hz, mm, etc.).
4. Retorne JSON com estrutura: { principioAtivo, concentracao, formaFarmaceutica, classeTerapeutica, especieAlvo, indicacoes }
5. Se um campo não puder ser determinado, deixe null.`;

  const userPrompt = `Produto: ${product.name}
Fabricante: ${product.manufacturer ?? "N/A"}
Apresentação: ${product.presentation ?? "N/A"}
Código: ${product.code ?? "N/A"}
Concentração: ${product.concentration ?? "N/A"}
Princípio Ativo: ${product.activeIngredient ?? "N/A"}

Gere uma ficha técnica estruturada em JSON com os campos:
- principioAtivo: string ou null
- concentracao: string ou null (ex: "10 mg/mL")
- formaFarmaceutica: string ou null (ex: "solução injetável", "comprimido", "pó")
- classeTerapeutica: string ou null (ex: "antibiótico", "anti-inflamatório")
- especieAlvo: string ou null (ex: "bovino", "canino", "suíno", "humano")
- indicacoes: string ou null (descrição breve das indicações)`;

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "ficha_tecnica",
          strict: true,
          schema: {
            type: "object",
            properties: {
              principioAtivo: { type: ["string", "null"] },
              concentracao: { type: ["string", "null"] },
              formaFarmaceutica: { type: ["string", "null"] },
              classeTerapeutica: { type: ["string", "null"] },
              especieAlvo: { type: ["string", "null"] },
              indicacoes: { type: ["string", "null"] },
            },
            required: [
              "principioAtivo",
              "concentracao",
              "formaFarmaceutica",
              "classeTerapeutica",
              "especieAlvo",
              "indicacoes",
            ],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices[0].message.content;
    const parsed = JSON.parse(typeof content === "string" ? content : JSON.stringify(content));
    return parsed;
  } catch (error: any) {
    console.error(`[EnrichFichaTecnica] Erro ao extrair ficha técnica para ${product.name}:`, error?.message);
    throw error;
  }
}

/**
 * Executar enriquecimento em lote
 */
export async function runEnrichFichaTecnicaBatch() {
  const db = await getDb();
  if (!db) {
    console.error("[EnrichFichaTecnica] Database não disponível");
    return enrichmentProgress;
  }

  enrichmentProgress = {
    totalProducts: 0,
    processedProducts: 0,
    successfulProducts: 0,
    failedProducts: 0,
    currentBatch: 0,
    totalBatches: 0,
    percentComplete: 0,
    estimatedTimeRemaining: 0,
    status: "running",
    startedAt: new Date(),
  };

  try {
    // Contar produtos sem ficha técnica
    const countResult = await db.select({ count: sql<number>`COUNT(*)` })
      .from(products)
      .where(isNull(products.fichaTecnica));

    const totalToEnrich = Number(countResult[0]?.count ?? 0);
    enrichmentProgress.totalProducts = totalToEnrich;
    enrichmentProgress.totalBatches = Math.ceil(totalToEnrich / 50);

    if (totalToEnrich === 0) {
      enrichmentProgress.status = "completed";
      enrichmentProgress.completedAt = new Date();
      await notifyOwner({
        title: "Enriquecimento de Fichas Técnicas",
        content: "Nenhum produto para enriquecer. Todos os produtos já possuem ficha técnica.",
      });
      return enrichmentProgress;
    }

    console.log(`[EnrichFichaTecnica] Iniciando enriquecimento de ${totalToEnrich} produtos em ${enrichmentProgress.totalBatches} lotes`);

    const BATCH_SIZE = 50;
    let offset = 0;
    const startTime = Date.now();

    while (offset < totalToEnrich) {
      enrichmentProgress.currentBatch++;
      const batchStartTime = Date.now();

      try {
        // Buscar lote de produtos
        const batch = await db.select()
          .from(products)
          .where(isNull(products.fichaTecnica))
          .limit(BATCH_SIZE)
          .offset(offset);

        if (batch.length === 0) break;

        // Processar cada produto do lote
        for (const product of batch) {
          try {
            const fichaTecnica = await extractFichaTecnicaViaIA(product);

            // Salvar ficha técnica
            await db.update(products)
              .set({ fichaTecnica: JSON.stringify(fichaTecnica) })
              .where(sql`id = ${product.id}`);

            enrichmentProgress.successfulProducts++;
          } catch (error: any) {
            console.error(`[EnrichFichaTecnica] Erro ao processar produto ${product.id}:`, error?.message);
            enrichmentProgress.failedProducts++;
          }

          enrichmentProgress.processedProducts++;
        }

        offset += BATCH_SIZE;

        // Calcular progresso
        enrichmentProgress.percentComplete = Math.round((enrichmentProgress.processedProducts / totalToEnrich) * 100);
        const elapsedTime = Date.now() - startTime;
        const avgTimePerProduct = elapsedTime / enrichmentProgress.processedProducts;
        const remainingProducts = totalToEnrich - enrichmentProgress.processedProducts;
        enrichmentProgress.estimatedTimeRemaining = Math.round((avgTimePerProduct * remainingProducts) / 1000); // em segundos

        console.log(
          `[EnrichFichaTecnica] Lote ${enrichmentProgress.currentBatch}/${enrichmentProgress.totalBatches} concluído: ` +
          `${enrichmentProgress.successfulProducts} sucesso, ${enrichmentProgress.failedProducts} erros. ` +
          `Progresso: ${enrichmentProgress.percentComplete}%`
        );

        // Rate limit: 1 produto a cada 2 segundos para não sobrecarregar IA
        await new Promise((r) => setTimeout(r, 2000));
      } catch (batchError: any) {
        console.error(`[EnrichFichaTecnica] Erro ao processar lote ${enrichmentProgress.currentBatch}:`, batchError?.message);
        enrichmentProgress.failedProducts += BATCH_SIZE;
        enrichmentProgress.processedProducts += BATCH_SIZE;

        // Reconectar ao banco em caso de erro
        resetDb();
        const newDb = await getDb();
        if (!newDb) {
          throw new Error("Database não disponível após erro de conexão");
        }
      }
    }

    enrichmentProgress.status = "completed";
    enrichmentProgress.completedAt = new Date();

    // Notificar proprietário
    const duration = Math.round((Date.now() - (enrichmentProgress.startedAt?.getTime() ?? 0)) / 1000);
    await notifyOwner({
      title: "Enriquecimento de Fichas Técnicas Concluído",
      content: `Processados: ${enrichmentProgress.processedProducts}/${totalToEnrich} produtos\n` +
        `Sucesso: ${enrichmentProgress.successfulProducts}\n` +
        `Erros: ${enrichmentProgress.failedProducts}\n` +
        `Duração: ${Math.round(duration / 60)} minutos`,
    });

    console.log(`[EnrichFichaTecnica] Enriquecimento concluído em ${duration}s`);
  } catch (error: any) {
    enrichmentProgress.status = "error";
    enrichmentProgress.lastError = error?.message;
    enrichmentProgress.completedAt = new Date();

    console.error("[EnrichFichaTecnica] Erro fatal:", error?.message);
    await notifyOwner({
      title: "Erro no Enriquecimento de Fichas Técnicas",
      content: `Erro: ${error?.message}\n` +
        `Produtos processados: ${enrichmentProgress.processedProducts}/${enrichmentProgress.totalProducts}`,
    });
  }

  return enrichmentProgress;
}

/**
 * Obter progresso atual do enriquecimento
 */
export function getEnrichmentProgress(): EnrichmentProgress {
  return { ...enrichmentProgress };
}
