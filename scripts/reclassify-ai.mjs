/**
 * Reclassifica via IA os produtos restantes em "Outros Medicamentos Vet." (id=150025)
 * Processa em lotes de 80 produtos por chamada à API LLM.
 */

import { createConnection } from 'mysql2/promise';
import { config } from 'dotenv';
config();

const FORGE_URL = process.env.BUILT_IN_FORGE_API_URL;
const FORGE_KEY = process.env.BUILT_IN_FORGE_API_KEY;

// Mapeamento de subcategorias disponíveis
const SUBCATEGORIES = {
  150018: 'Antibióticos',
  150019: 'Antiparasitários',
  150020: 'Dermatológicos',
  150021: 'Otológicos',
  150022: 'Reprodutivos',
  150023: 'Mastite',
  150024: 'Vitaminas e Suplementos',
  150025: 'Outros Medicamentos Vet.',
  180001: 'Anestésicos e Sedativos',
  180002: 'Anti-inflamatórios',
  180003: 'Vacinas',
  180004: 'Homeopáticos',
  150026: 'Insumos Veterinários',
  150027: 'Equipamentos Veterinários',
};

const SYSTEM_PROMPT = `Você é um especialista em farmacologia veterinária e classificação de produtos.
Classifique cada produto veterinário na categoria mais adequada com base no nome e princípio ativo.

Categorias disponíveis (use EXATAMENTE o ID numérico):
${Object.entries(SUBCATEGORIES).map(([id, name]) => `${id}: ${name}`).join('\n')}

Regras:
- Antibióticos: antimicrobianos, bacteriostáticos, bactericidas
- Antiparasitários: antiparasitários internos/externos, carrapaticidas, vermífugos, coccidiostáticos
- Dermatológicos: produtos para pele, antifúngicos tópicos, shampoos medicinais
- Otológicos: produtos para ouvido, tratamento de otite
- Reprodutivos: hormônios reprodutivos, sincronizadores, sêmen
- Mastite: produtos intramamários, tratamento de mastite
- Vitaminas e Suplementos: vitaminas, minerais, aminoácidos, suplementos nutricionais
- Anestésicos e Sedativos: anestésicos, sedativos, tranquilizantes, analgésicos opioides
- Anti-inflamatórios: AINEs, corticosteroides, analgésicos não opioides
- Vacinas: vacinas, imunizantes, bacterinas
- Homeopáticos: produtos homeopáticos
- Insumos Veterinários: seringas, agulhas, materiais descartáveis, equipamentos de aplicação
- Equipamentos Veterinários: equipamentos médico-veterinários, instrumentos cirúrgicos
- Outros Medicamentos Vet.: produtos que não se encaixam nas categorias acima

Responda APENAS com JSON no formato:
{"classifications": [{"id": <product_id>, "categoryId": <category_id>}]}`;

async function callLLM(products) {
  const userMessage = products.map(p =>
    `ID:${p.id} | Nome: ${p.name} | Princípio Ativo: ${p.activeIngredient || 'N/A'}`
  ).join('\n');

  const response = await fetch(`${FORGE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${FORGE_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Classifique os seguintes ${products.length} produtos:\n\n${userMessage}` },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'classifications',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              classifications: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'integer' },
                    categoryId: { type: 'integer' },
                  },
                  required: ['id', 'categoryId'],
                  additionalProperties: false,
                },
              },
            },
            required: ['classifications'],
            additionalProperties: false,
          },
        },
      },
      temperature: 0,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`LLM error ${response.status}: ${err.slice(0, 200)}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('LLM returned empty content');
  return JSON.parse(content);
}

async function main() {
  const conn = await createConnection(process.env.DATABASE_URL);

  try {
    // Buscar todos os produtos em Outros Medicamentos Vet.
    const [rows] = await conn.execute(
      'SELECT id, name, activeIngredient FROM products WHERE categoryId = 150025 ORDER BY id'
    );
    console.log(`Total de produtos para classificar: ${rows.length}`);

    const BATCH_SIZE = 80;
    const batches = [];
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      batches.push(rows.slice(i, i + BATCH_SIZE));
    }
    console.log(`Processando ${batches.length} lotes de ${BATCH_SIZE} produtos...`);

    let totalClassified = 0;
    let totalErrors = 0;
    const distribution = {};

    for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
      const batch = batches[batchIdx];
      const start = batchIdx * BATCH_SIZE + 1;
      const end = Math.min((batchIdx + 1) * BATCH_SIZE, rows.length);
      process.stdout.write(`\rLote ${batchIdx + 1}/${batches.length} (produtos ${start}-${end})... `);

      try {
        const result = await callLLM(batch);
        const classifications = result.classifications ?? [];

        // Aplicar classificações em batch
        const validIds = new Set(batch.map(p => p.id));
        const validCatIds = new Set(Object.keys(SUBCATEGORIES).map(Number));

        for (const c of classifications) {
          if (!validIds.has(c.id)) continue;
          if (!validCatIds.has(c.categoryId)) continue;
          if (c.categoryId === 150025) continue; // Manter em Outros apenas se realmente necessário

          await conn.execute(
            'UPDATE products SET categoryId = ? WHERE id = ?',
            [c.categoryId, c.id]
          );
          distribution[c.categoryId] = (distribution[c.categoryId] || 0) + 1;
          totalClassified++;
        }

        // Contar os que ficaram em 150025
        const classifiedIds = new Set(classifications.filter(c => c.categoryId !== 150025).map(c => c.id));
        const remaining = batch.filter(p => !classifiedIds.has(p.id)).length;
        if (remaining > 0) {
          distribution[150025] = (distribution[150025] || 0) + remaining;
        }

        process.stdout.write(`✓ (${classifications.length} classificados)\n`);

        // Pausa entre lotes para não sobrecarregar a API
        if (batchIdx < batches.length - 1) {
          await new Promise(r => setTimeout(r, 500));
        }
      } catch (e) {
        process.stdout.write(`✗ ERRO: ${e.message.slice(0, 80)}\n`);
        totalErrors++;
        // Continuar com próximo lote
      }
    }

    console.log('\n=== Resultado da Classificação via IA ===');
    console.log(`Total reclassificados: ${totalClassified}`);
    console.log(`Lotes com erro: ${totalErrors}`);
    console.log('\nDistribuição:');
    for (const [catId, count] of Object.entries(distribution).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${SUBCATEGORIES[catId] || catId}: ${count}`);
    }

    // Distribuição final completa
    console.log('\n=== Distribuição Final em Medicamentos ===');
    const [finalDist] = await conn.execute(`
      SELECT c.name, COUNT(p.id) as total
      FROM categories c
      LEFT JOIN products p ON p.categoryId = c.id
      WHERE c.parentId = 150017
      GROUP BY c.id, c.name
      ORDER BY total DESC
    `);
    finalDist.forEach(r => console.log(`  ${r.name}: ${r.total}`));

  } finally {
    await conn.end();
  }
}

main().catch(console.error);
