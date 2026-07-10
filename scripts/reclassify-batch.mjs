/**
 * Script de reclassificação em lote de produtos via IA.
 * Reclassifica produtos que estão em categorias genéricas (Medicamentos, Ferragens)
 * para subcategorias mais específicas.
 *
 * Uso: node scripts/reclassify-batch.mjs [--dry-run] [--category 150017] [--limit 500]
 */

import { createConnection } from "mysql2/promise";
import https from "https";

const DATABASE_URL = process.env.DATABASE_URL;
const LLM_API_URL = process.env.BUILT_IN_FORGE_API_URL;
const LLM_API_KEY = process.env.BUILT_IN_FORGE_API_KEY;

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const BATCH_SIZE = 50;
const TARGET_CATEGORY_ID = (() => {
  const idx = args.indexOf("--category");
  return idx >= 0 ? parseInt(args[idx + 1]) : null;
})();
const LIMIT = (() => {
  const idx = args.indexOf("--limit");
  return idx >= 0 ? parseInt(args[idx + 1]) : 99999;
})();

async function invokeLLM(messages, responseFormat) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: "gpt-4o-mini",
      messages,
      response_format: responseFormat,
      temperature: 0.1,
    });

    const url = new URL(`${LLM_API_URL}/v1/chat/completions`);
    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LLM_API_KEY}`,
        "Content-Length": Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`JSON parse error: ${data.slice(0, 200)}`));
        }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  if (!DATABASE_URL) throw new Error("DATABASE_URL não definida");
  if (!LLM_API_URL || !LLM_API_KEY) throw new Error("LLM env vars não definidas");

  const conn = await createConnection(DATABASE_URL);
  console.log(`\n🚀 Iniciando reclassificação em lote${DRY_RUN ? " (DRY RUN)" : ""}`);

  // Buscar todas as categorias
  const [allCats] = await conn.execute(
    "SELECT id, name, parentId FROM categories ORDER BY parentId, id"
  );
  
  // Montar lista de categorias com hierarquia
  const catMap = new Map(allCats.map((c) => [c.id, c]));
  const catList = allCats
    .map((c) => {
      const parent = catMap.get(c.parentId);
      return parent ? `${c.id}: ${parent.name} > ${c.name}` : `${c.id}: ${c.name}`;
    })
    .join("\n");

  console.log(`📋 ${allCats.length} categorias carregadas`);

  // Determinar quais produtos reclassificar
  let whereClause = "isActive = 'yes'";
  if (TARGET_CATEGORY_ID) {
    whereClause += ` AND categoryId = ${TARGET_CATEGORY_ID}`;
    console.log(`🎯 Focando na categoria ID ${TARGET_CATEGORY_ID}`);
  } else {
    // Por padrão: reclassificar produtos em categorias genéricas (Medicamentos=150017, Ferragens=150004)
    whereClause += ` AND categoryId IN (150017, 150004)`;
    console.log(`🎯 Reclassificando produtos em categorias genéricas (Medicamentos + Ferragens)`);
  }

  const [countResult] = await conn.execute(
    `SELECT COUNT(*) as total FROM products WHERE ${whereClause}`
  );
  const totalProducts = Math.min(countResult[0].total, LIMIT);
  console.log(`📦 ${totalProducts} produtos para reclassificar (limite: ${LIMIT})`);

  let offset = 0;
  let totalUpdated = 0;
  let totalBatches = 0;
  let totalErrors = 0;
  const startTime = Date.now();

  while (offset < totalProducts) {
    const [prods] = await conn.execute(
      `SELECT id, name, activeIngredient, manufacturer, concentration, presentation, pharmaceuticalForm 
       FROM products WHERE ${whereClause} LIMIT ${BATCH_SIZE} OFFSET ${offset}`
    );

    if (prods.length === 0) break;

    const batchNum = Math.floor(offset / BATCH_SIZE) + 1;
    const totalBatchCount = Math.ceil(totalProducts / BATCH_SIZE);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    const eta = offset > 0
      ? Math.round(((Date.now() - startTime) / offset) * (totalProducts - offset) / 1000)
      : "?";

    process.stdout.write(
      `\r  Lote ${batchNum}/${totalBatchCount} | ${totalUpdated} atualizados | ${elapsed}s decorridos | ETA: ${eta}s   `
    );

    const prodList = prods
      .map((p) => {
        const parts = [p.name];
        if (p.activeIngredient) parts.push(`PA: ${p.activeIngredient}`);
        if (p.concentration) parts.push(`Conc: ${p.concentration}`);
        if (p.pharmaceuticalForm) parts.push(`Forma: ${p.pharmaceuticalForm}`);
        if (p.manufacturer) parts.push(`Fab: ${p.manufacturer}`);
        return `${p.id}: ${parts.join(" | ")}`;
      })
      .join("\n");

    try {
      const result = await invokeLLM(
        [
          {
            role: "system",
            content:
              "Você é um especialista em classificação de produtos agropecuários, veterinários e de construção. " +
              "Analise cada produto e atribua a subcategoria mais específica e adequada da lista fornecida. " +
              "Responda APENAS com JSON válido conforme o schema solicitado.",
          },
          {
            role: "user",
            content: `CATEGORIAS DISPONÍVEIS (use o ID numérico):\n${catList}\n\nPRODUTOS PARA CLASSIFICAR:\n${prodList}\n\nRetorne a classificação de TODOS os produtos listados.`,
          },
        ],
        {
          type: "json_schema",
          json_schema: {
            name: "auto_classify",
            strict: true,
            schema: {
              type: "object",
              properties: {
                classifications: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      productId: { type: "number" },
                      categoryId: { type: "number" },
                    },
                    required: ["productId", "categoryId"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["classifications"],
              additionalProperties: false,
            },
          },
        }
      );

      const content = result.choices?.[0]?.message?.content;
      if (content && typeof content === "string") {
        const parsed = JSON.parse(content);
        const classifications = parsed.classifications ?? [];
        let batchUpdated = 0;

        for (const item of classifications) {
          const validCat = catMap.get(item.categoryId);
          if (!validCat) continue;
          if (!DRY_RUN) {
            await conn.execute(
              "UPDATE products SET categoryId = ?, updatedAt = NOW() WHERE id = ?",
              [item.categoryId, item.productId]
            );
          }
          batchUpdated++;
        }
        totalUpdated += batchUpdated;
      } else {
        console.error(`\n  ⚠️  Lote ${batchNum}: resposta vazia da IA`);
        totalErrors++;
      }
      totalBatches++;
    } catch (err) {
      console.error(`\n  ❌ Lote ${batchNum} erro: ${err.message}`);
      totalErrors++;
    }

    offset += BATCH_SIZE;

    // Pequena pausa para não sobrecarregar a API
    await new Promise((r) => setTimeout(r, 200));
  }

  await conn.end();

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n\n✅ Concluído em ${totalTime}s`);
  console.log(`   Lotes processados: ${totalBatches}`);
  console.log(`   Produtos atualizados: ${totalUpdated}`);
  console.log(`   Erros: ${totalErrors}`);
  if (DRY_RUN) console.log(`   ⚠️  DRY RUN — nenhuma alteração foi salva no banco`);
}

main().catch((err) => {
  console.error("Erro fatal:", err);
  process.exit(1);
});
