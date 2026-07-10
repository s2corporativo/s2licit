/**
 * Segunda passagem: reclassifica produtos de "Outros Medicamentos Vet." (150025)
 * para as novas subcategorias criadas: Anestésicos (180001), Anti-inflamatórios (180002), Vacinas (180003)
 * e também melhora a cobertura de Antiparasitários com mais palavras-chave.
 */

import { createConnection } from 'mysql2/promise';
import { config } from 'dotenv';
config();

const conn = await createConnection(process.env.DATABASE_URL);

const EXTRA_RULES = [
  // Anestésicos e Sedativos
  {
    catId: 180001,
    keywords: [
      'acepromazina', 'xilazina', 'detomidina', 'medetomidina', 'dexmedetomidina',
      'cetamina', 'ketamina', 'propofol', 'tiopental', 'pentobarbital',
      'midazolam', 'diazepam', 'zolazepam', 'tiletamina', 'alfaxalona',
      'butorfanol', 'morfina', 'tramadol', 'fentanil', 'metadona',
      'buprenorfina', 'naloxona', 'atropina', 'glicopirrolato',
      'anestésico', 'anestesico', 'sedativo', 'tranquilizante',
      'neuroleptoanalgesia', 'bloqueio', 'lidocaína', 'lidocaina',
      'bupivacaína', 'bupivacaina', 'mepivacaína', 'mepivacaina',
    ],
  },
  // Anti-inflamatórios
  {
    catId: 180002,
    keywords: [
      'meloxicam', 'carprofeno', 'carprofen', 'cetoprofeno', 'ketoprofeno',
      'flunixin', 'flunixina', 'fenilbutazona', 'fenilbutazona',
      'dipirona', 'dipyrone', 'ácido acetilsalicílico', 'aspirina',
      'salicilato', 'ibuprofeno', 'naproxeno', 'indometacina',
      'diclofenaco', 'nimesulida', 'piroxicam', 'tenoxicam',
      'anti-inflamatório', 'anti-inflamatorio', 'antiinflamatório', 'antiinflamatorio',
      'aine ', 'nsaid', 'analgésico', 'analgesico',
      'robenacoxibe', 'mavacoxibe', 'grapiprant', 'deracoxibe',
      'firocoxibe', 'tepoxalina',
    ],
  },
  // Vacinas
  {
    catId: 180003,
    keywords: [
      'vacina', 'vaccine', 'imunizante', 'imunização', 'imunizacao',
      'bacterina', 'toxoide', 'antígeno', 'antigeno',
      'febre aftosa', 'aftosa', 'brucelose', 'raiva', 'leptospirose',
      'parvovirose', 'cinomose', 'adenovírus', 'adenovirus',
      'rinotraqueíte', 'rinotraqueite', 'herpesvírus', 'herpesvirus',
      'calicivírus', 'calicivirus', 'panleucopenia', 'leucemia felina',
      'peritonite infecciosa', 'clamidiose', 'bordetella',
      'parainfluenza', 'coronavírus', 'coronavirus',
      'clostridiose', 'clostridium', 'enterotoxemia',
      'pasteurellose', 'mannheimia', 'haemophilus',
      'mycoplasma', 'erysipela', 'erisipela', 'parvovirose suína',
      'circovírus', 'circovirus', 'influenza', 'newcastle',
      'marek', 'gumboro', 'bronquite infecciosa',
    ],
  },
  // Antiparasitários (segunda passagem com mais keywords)
  {
    catId: 150019,
    keywords: [
      'toltrazuril', 'diclazuril', 'amprolium', 'sulfa', 'coccidiose',
      'coccidiostático', 'coccidiostatico', 'monensina', 'lasalocida',
      'salinomicina', 'narasina', 'maduramicina', 'robenidina',
      'nicarbazina', 'decoquinato', 'halofuginona',
      'triclabendazol', 'netobimin', 'luxabendazol',
      'benzimidazol', 'lactonas macrocíclicas', 'lactonas macrociclicas',
      'organofosforado', 'piretroide', 'piretróide', 'neonicotinoide',
      'carrapaticida', 'mosca', 'berne', 'bicheira', 'miíase', 'miase',
      'pulga', 'carrapato', 'piolho', 'sarna', 'ácaros', 'acaros',
      'helminto', 'nematóide', 'nematoide', 'cestóide', 'cestoide',
      'trematóide', 'trematoide', 'verme', 'lombriga',
    ],
  },
  // Vitaminas e Suplementos (segunda passagem)
  {
    catId: 150024,
    keywords: [
      'aminoácido', 'aminoacido', 'lisina', 'metionina', 'treonina',
      'triptofano', 'leucina', 'isoleucina', 'valina', 'fenilalanina',
      'arginina', 'histidina', 'glicina', 'alanina', 'prolina',
      'carnitina', 'taurina', 'creatina', 'glicosaminoglicano',
      'condroitina', 'glucosamina', 'ômega', 'omega', 'dha', 'epa',
      'coenzima', 'antioxidante', 'flavonoide', 'polifenol',
      'extrato', 'fitoterapico', 'fitoterápico', 'homeopático', 'homeopatico',
      'suplementação', 'suplementacao', 'nutracêutico', 'nutraceutico',
      'repositor', 'reposição', 'reposicao', 'energizante',
      'palatabilizante', 'aditivo', 'premix', 'núcleo', 'nucleo',
    ],
  },
];

async function reclassifyOutros() {
  console.log('Buscando produtos em Outros Medicamentos Vet. (id=150025)...');
  const [rows] = await conn.execute(
    'SELECT id, name, activeIngredient FROM products WHERE categoryId = 150025'
  );
  console.log(`Total: ${rows.length} produtos`);

  const updates = {};
  for (const rule of EXTRA_RULES) {
    updates[rule.catId] = [];
  }
  let remaining = 0;

  for (const row of rows) {
    const text = `${row.name ?? ''} ${row.activeIngredient ?? ''}`;
    const lower = text.toLowerCase();
    let matched = false;
    for (const rule of EXTRA_RULES) {
      if (rule.keywords.some(kw => lower.includes(kw.toLowerCase()))) {
        updates[rule.catId].push(row.id);
        matched = true;
        break;
      }
    }
    if (!matched) remaining++;
  }

  console.log('\nDistribuição planejada:');
  for (const [catId, ids] of Object.entries(updates)) {
    console.log(`  Cat ${catId}: ${ids.length} produtos`);
  }
  console.log(`  Outros Medicamentos Vet. (mantidos): ${remaining} produtos`);

  for (const [catId, ids] of Object.entries(updates)) {
    if (ids.length === 0) continue;
    const chunks = [];
    for (let i = 0; i < ids.length; i += 500) chunks.push(ids.slice(i, i + 500));
    for (const chunk of chunks) {
      await conn.execute(
        `UPDATE products SET categoryId = ? WHERE id IN (${chunk.map(() => '?').join(',')})`,
        [parseInt(catId), ...chunk]
      );
    }
    console.log(`✓ ${ids.length} produtos → categoria ${catId}`);
  }
}

async function showFinalDistribution() {
  console.log('\n=== Distribuição Final ===');
  const [cats] = await conn.execute(`
    SELECT c.name, parent.name as parent_name, COUNT(p.id) as total
    FROM categories c
    LEFT JOIN products p ON p.categoryId = c.id
    LEFT JOIN categories parent ON c.parentId = parent.id
    GROUP BY c.id, c.name, parent.name
    HAVING total > 0
    ORDER BY parent.name, total DESC
  `);
  cats.forEach(c => console.log(`  ${c.parent_name ?? 'ROOT'} → ${c.name}: ${c.total}`));
}

try {
  await reclassifyOutros();
  await showFinalDistribution();
} finally {
  await conn.end();
}
