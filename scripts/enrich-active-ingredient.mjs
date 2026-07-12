/**
 * enrich-active-ingredient.mjs
 * Preenche automaticamente o campo activeIngredient dos produtos que estão sem essa informação,
 * usando a API LLM interna do projeto (BUILT_IN_FORGE_API_KEY).
 *
 * Uso: node scripts/enrich-active-ingredient.mjs
 */

import mysql from "mysql2/promise";
import dotenv from "dotenv";

// Carregar variáveis de ambiente
dotenv.config({ path: ".env" });

const DATABASE_URL = process.env.DATABASE_URL;
const LLM_API_URL = process.env.BUILT_IN_FORGE_API_URL;
const LLM_API_KEY = process.env.BUILT_IN_FORGE_API_KEY;

if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL não encontrado no .env");
  process.exit(1);
}
if (!LLM_API_URL || !LLM_API_KEY) {
  console.error("❌ BUILT_IN_FORGE_API_URL ou BUILT_IN_FORGE_API_KEY não encontrado");
  process.exit(1);
}

const BATCH_SIZE = 50;
const LLM_ENDPOINT = `${LLM_API_URL}/v1/chat/completions`;

async function callLLM(products) {
  const payload = {
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "Você é um especialista em farmacologia veterinária e humana. " +
          "Para cada produto listado (identificado por id), informe APENAS o princípio ativo principal (DCI/INN). " +
          "Use a nomenclatura científica padronizada. " +
          "Se o produto for um composto (ex: vitaminas, suplementos), liste os principais (máx 3, separados por vírgula). " +
          "Se for material/equipamento sem princípio ativo farmacológico, responda com string vazia. " +
          "Responda SOMENTE em JSON no formato especificado.",
      },
      {
        role: "user",
        content: JSON.stringify(
          products.map((p) => ({
            id: p.id,
            name: p.name,
            concentration: p.concentration || "",
            presentation: p.presentation || "",
            category: p.categoryName || "",
          }))
        ),
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "enrichment_result",
        strict: true,
        schema: {
          type: "object",
          properties: {
            results: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "integer" },
                  activeIngredient: { type: "string" },
                },
                required: ["id", "activeIngredient"],
                additionalProperties: false,
              },
            },
          },
          required: ["results"],
          additionalProperties: false,
        },
      },
    },
  };

  const resp = await fetch(LLM_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LLM_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`LLM error ${resp.status}: ${text}`);
  }

  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("LLM retornou resposta vazia");

  const parsed = JSON.parse(content);
  return parsed.results;
}

async function main() {
  console.log("🔌 Conectando ao banco de dados...");
  const conn = await mysql.createConnection(DATABASE_URL);

  // Buscar produtos sem princípio ativo com nome da categoria
  const [rows] = await conn.query(`
    SELECT p.id, p.name, p.concentration, p.presentation, c.name as categoryName
    FROM products p
    LEFT JOIN categories c ON p.categoryId = c.id
    WHERE p.isActive = 'yes'
      AND (p.activeIngredient IS NULL OR p.activeIngredient = '')
    ORDER BY p.id
  `);

  const total = rows.length;
  console.log(`📦 ${total} produtos sem princípio ativo encontrados`);

  if (total === 0) {
    console.log("✅ Nenhum produto precisa de enriquecimento!");
    await conn.end();
    return;
  }

  let updated = 0;
  let skipped = 0;
  let errors = 0;
  const batches = Math.ceil(total / BATCH_SIZE);

  for (let i = 0; i < batches; i++) {
    const batch = rows.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);
    const batchNum = i + 1;
    console.log(`\n🤖 Lote ${batchNum}/${batches} — ${batch.length} produtos...`);

    try {
      const results = await callLLM(batch);

      // Aplicar resultados ao banco
      for (const result of results) {
        if (!result.activeIngredient || result.activeIngredient.trim() === "") {
          skipped++;
          continue;
        }

        await conn.query(
          "UPDATE products SET activeIngredient = ? WHERE id = ?",
          [result.activeIngredient.trim(), result.id]
        );
        updated++;
      }

      console.log(
        `   ✅ ${results.filter((r) => r.activeIngredient?.trim()).length} preenchidos, ` +
          `${results.filter((r) => !r.activeIngredient?.trim()).length} sem princípio ativo conhecido`
      );
    } catch (err) {
      console.error(`   ❌ Erro no lote ${batchNum}: ${err.message}`);
      errors += batch.length;
    }

    // Pequena pausa entre lotes para não sobrecarregar a API
    if (i < batches - 1) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  await conn.end();

  console.log("\n" + "=".repeat(50));
  console.log("📊 RESULTADO FINAL");
  console.log("=".repeat(50));
  console.log(`Total processados : ${total}`);
  console.log(`✅ Preenchidos     : ${updated}`);
  console.log(`⚪ Sem PA conhecido: ${skipped}`);
  console.log(`❌ Erros           : ${errors}`);
  console.log("=".repeat(50));
}

main().catch((err) => {
  console.error("Erro fatal:", err);
  process.exit(1);
});
