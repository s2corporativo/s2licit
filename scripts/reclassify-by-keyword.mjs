/**
 * Reclassifica produtos da categoria genérica "Medicamentos" (id=150017)
 * para as subcategorias corretas usando palavras-chave no activeIngredient e name.
 * 
 * Subcategorias existentes em Veterinário → Medicamentos:
 *   150018 = Antibióticos
 *   150019 = Antiparasitários
 *   150020 = Dermatológicos
 *   150021 = Otológicos
 *   150022 = Reprodutivos
 *   150023 = Mastite
 *   150024 = Vitaminas e Suplementos
 *   150025 = Outros Medicamentos Vet.
 * 
 * Também reclassifica Construção → Ferragens (id=150004) para subcategorias corretas.
 */

import { createConnection } from 'mysql2/promise';
import { config } from 'dotenv';
config();

const conn = await createConnection(process.env.DATABASE_URL);

// ─── Regras de classificação para Medicamentos Veterinários ──────────────────
const MED_RULES = [
  // Antibióticos
  {
    catId: 150018,
    keywords: [
      'amoxicilina', 'ampicilina', 'cefalexina', 'ceftiofur', 'cefovecin',
      'doxiciclina', 'enrofloxacino', 'enrofloxacina', 'florfenicol',
      'gentamicina', 'lincomicina', 'marbofloxacino', 'metronidazol',
      'neomicina', 'norfloxacino', 'oxitetraciclina', 'penicilina',
      'sulfadiazina', 'sulfametoxazol', 'tetraciclina', 'tilosina',
      'tilmicosina', 'trimetoprim', 'tulathromicina', 'tulatromicina',
      'cloranfenicol', 'eritromicina', 'espiramicina', 'tobramicina',
      'cefazolina', 'cefpodoxima', 'pradofloxacino', 'orbifloxacino',
      'difloxacino', 'ibafloxacino', 'rifampicina', 'clindamicina',
      'linezolida', 'vancomicina', 'polimixina', 'bacitracina',
      'estreptomicina', 'kanamicina', 'spectinomicina', 'colistina',
      'fosfomicina', 'nitrofurantoina', 'sulfadoxina', 'sulfametazina',
    ],
  },
  // Antiparasitários
  {
    catId: 150019,
    keywords: [
      'abamectina', 'albendazol', 'amitraz', 'clorpirifos', 'closantel',
      'cipermetrina', 'deltametrina', 'doramectina', 'eprinomectina',
      'febantel', 'fenbendazol', 'fipronil', 'fluazuron', 'flumethrina',
      'imidacloprida', 'indoxacarbe', 'ivermectina', 'levamisol',
      'moxidectina', 'milbemicina', 'nitroscanato', 'oxfendazol',
      'pamoato de pirantel', 'permetrina', 'piperazina', 'praziquantel',
      'rafoxanida', 'selamectina', 'spinosad', 'triclorfon',
      'carrapaticida', 'endectocida', 'antiparasitário', 'antiparasitario',
      'vermifugo', 'vermífugo', 'ectoparasiticida', 'endoparasiticida',
      'butoxido de piperonila', 'piperonila', 'diazinon', 'crotoxifos',
      'diclorvos', 'propoxur', 'carbaril', 'malation', 'lindano',
      'milbemox', 'nexgard', 'bravecto', 'simparica', 'credelio',
      'afoxolaner', 'fluralaner', 'sarolaner', 'lotilaner',
    ],
  },
  // Dermatológicos
  {
    catId: 150020,
    keywords: [
      'cetoconazol', 'clotrimazol', 'miconazol', 'fluconazol',
      'itraconazol', 'terbinafina', 'griseofulvina', 'anfotericina',
      'clorexidina', 'betametasona', 'dexametasona', 'hidrocortisona',
      'prednisolona', 'prednisona', 'triamcinolona', 'fluocinolona',
      'shampoo', 'condicionador', 'loção', 'pomada', 'creme dermat',
      'antifúngico', 'antifungico', 'dermatológico', 'dermatologico',
      'cicatrizante', 'antisséptico cutâneo', 'spray dermat',
    ],
  },
  // Otológicos
  {
    catId: 150021,
    keywords: [
      'otológico', 'otologico', 'auricular', 'ouvido', 'otite',
      'otomax', 'surolan', 'easotic', 'posatex', 'mometamax',
    ],
  },
  // Reprodutivos
  {
    catId: 150022,
    keywords: [
      'progesterona', 'estradiol', 'estrogênio', 'estrogenio',
      'ocitocina', 'oxitocina', 'prostaglandina', 'gnrh', 'fsh', 'lh',
      'gonadotrofina', 'hcg', 'sincronização', 'sincronizacao',
      'reprodução', 'reproducao', 'inseminação', 'inseminacao',
      'sêmen', 'semen', 'cipionato de estradiol', 'benzoato de estradiol',
      'acetato de medroxiprogesterona', 'norgestomet', 'cloprostenol',
      'dinoprost', 'luprostiol', 'fertirelin', 'buserelina',
    ],
  },
  // Mastite
  {
    catId: 150023,
    keywords: [
      'mastite', 'intramamário', 'intramamario', 'ubere', 'úbere',
      'teat', 'tetina', 'cloxacilina', 'cefapirina', 'pirlimicina',
    ],
  },
  // Vitaminas e Suplementos
  {
    catId: 150024,
    keywords: [
      'vitamina', 'vitaminas', 'suplemento', 'mineral', 'minerais',
      'complexo b', 'complexo vitamínico', 'ade ', 'a.d.e',
      'biotina', 'colina', 'niacina', 'riboflavina', 'tiamina',
      'cianocobalamina', 'ácido fólico', 'acido folico',
      'cálcio', 'calcio', 'fósforo', 'fosforo', 'magnésio', 'magnesio',
      'zinco', 'ferro', 'cobre', 'selênio', 'selenio', 'iodo',
      'aminoácido', 'aminoacido', 'proteína', 'proteina',
      'energético', 'energetico', 'glicose', 'dextrose', 'sacarose',
      'probiótico', 'probiotico', 'prebiótico', 'prebiotico',
      'eletrólito', 'eletrolito', 'reidratante',
    ],
  },
];

// ─── Regras para Construção → Ferragens ──────────────────────────────────────
const FERRAGENS_RULES = [
  { catId: 150002, keywords: ['fio ', 'cabo elétrico', 'disjuntor', 'tomada', 'interruptor', 'conduíte', 'eletroduto', 'lâmpada', 'lampada', 'led ', 'luminária', 'luminaria', 'reator', 'chave elétrica', 'quadro elétrico', 'eletrico', 'elétrico', 'voltagem', 'amperagem', 'kwh', 'bifásico', 'trifásico', 'monofásico', 'plug', 'tomada', 'extensão elétrica', 'fita isolante', 'isolante', 'eletricidade'] },
  { catId: 150003, keywords: ['cano', 'tubo pvc', 'joelho', 'cotovelo', 'registro', 'válvula', 'valvula', 'engate', 'mangueira', 'torneira', 'sifão', 'sifao', 'ralo', 'caixa d\'água', 'caixa dagua', 'reservatório', 'reservatorio', 'bomba d\'agua', 'bomba dagua', 'hidráulico', 'hidraulico', 'vedação', 'vedacao', 'teflon', 'flange', 'adaptador hidráulico', 'luva pvc', 'tê pvc', 'redução pvc'] },
  { catId: 150005, keywords: ['tinta', 'verniz', 'esmalte', 'primer', 'massa corrida', 'massa corrida', 'selador', 'impermeabilizante', 'pincel', 'rolo de pintura', 'solvente', 'aguarrás', 'aguarras', 'thinner', 'lixa', 'fita crepe', 'fita adesiva', 'spray tinta', 'textura', 'rejunte', 'rejunte'] },
  { catId: 150006, keywords: ['martelo', 'chave de fenda', 'chave philips', 'alicate', 'serrote', 'serra', 'furadeira', 'parafusadeira', 'esmerilhadeira', 'lixadeira', 'nível', 'nivel', 'trena', 'esquadro', 'prumo', 'talhadeira', 'ponteiro', 'formão', 'formao', 'enxada', 'pá ', 'pa ', 'picareta', 'cavadeira', 'alavanca', 'macaco', 'chave inglesa', 'chave combinada', 'torquês', 'torques', 'tesoura de corte', 'cortador'] },
  { catId: 150008, keywords: ['corda', 'cordão', 'cordao', 'lona', 'encerado', 'tela', 'rede', 'sombrite', 'rafia', 'sisal', 'barbante', 'fita de amarrar', 'fio de amarrar', 'cabo de aço', 'cabo de aco', 'corrente', 'catraca', 'talha', 'esticador'] },
];

function matchesKeywords(text, keywords) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return keywords.some(kw => lower.includes(kw.toLowerCase()));
}

async function reclassifyMedicamentos() {
  console.log('Buscando produtos em Medicamentos genérico (id=150017)...');
  const [rows] = await conn.execute(
    'SELECT id, name, activeIngredient FROM products WHERE categoryId = 150017'
  );
  console.log(`Total: ${rows.length} produtos`);

  const updates = { 150018: [], 150019: [], 150020: [], 150021: [], 150022: [], 150023: [], 150024: [] };
  let unclassified = 0;

  for (const row of rows) {
    const text = `${row.name ?? ''} ${row.activeIngredient ?? ''}`;
    let matched = false;
    for (const rule of MED_RULES) {
      if (matchesKeywords(text, rule.keywords)) {
        updates[rule.catId].push(row.id);
        matched = true;
        break;
      }
    }
    if (!matched) unclassified++;
  }

  console.log('\nDistribuição planejada:');
  for (const [catId, ids] of Object.entries(updates)) {
    console.log(`  Cat ${catId}: ${ids.length} produtos`);
  }
  console.log(`  Outros Medicamentos Vet. (150025): ${unclassified} produtos`);

  // Aplicar updates em lotes
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

  // Mover não classificados para Outros Medicamentos Vet.
  const [unclassRows] = await conn.execute(
    'SELECT id FROM products WHERE categoryId = 150017'
  );
  if (unclassRows.length > 0) {
    const ids = unclassRows.map(r => r.id);
    const chunks = [];
    for (let i = 0; i < ids.length; i += 500) chunks.push(ids.slice(i, i + 500));
    for (const chunk of chunks) {
      await conn.execute(
        `UPDATE products SET categoryId = 150025 WHERE id IN (${chunk.map(() => '?').join(',')})`,
        chunk
      );
    }
    console.log(`✓ ${ids.length} produtos → Outros Medicamentos Vet. (150025)`);
  }
}

async function reclassifyFerragens() {
  console.log('\nBuscando produtos em Ferragens (id=150004)...');
  const [rows] = await conn.execute(
    'SELECT id, name FROM products WHERE categoryId = 150004'
  );
  console.log(`Total: ${rows.length} produtos`);

  const updates = { 150002: [], 150003: [], 150005: [], 150006: [], 150008: [] };
  let unclassified = 0;

  for (const row of rows) {
    let matched = false;
    for (const rule of FERRAGENS_RULES) {
      if (matchesKeywords(row.name, rule.keywords)) {
        updates[rule.catId].push(row.id);
        matched = true;
        break;
      }
    }
    if (!matched) unclassified++;
  }

  console.log('\nDistribuição planejada:');
  for (const [catId, ids] of Object.entries(updates)) {
    console.log(`  Cat ${catId}: ${ids.length} produtos`);
  }
  console.log(`  Ferragens (150004 - mantidos): ${unclassified} produtos`);

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

async function addMissingSubcategories() {
  console.log('\nVerificando subcategorias ausentes...');
  
  // Adicionar subcategorias que podem estar faltando
  const missing = [
    // Medicamentos Veterinários
    { name: 'Anestésicos e Sedativos', parentId: 150016 },
    { name: 'Anti-inflamatórios', parentId: 150016 },
    { name: 'Vacinas', parentId: 150016 },
    { name: 'Homeopáticos', parentId: 150016 },
    // Construção
    { name: 'Cimento e Argamassa', parentId: 150001 },
    { name: 'Madeiras e Compensados', parentId: 150001 },
    // Agro
    { name: 'Defensivos Agrícolas', parentId: 150009 },
    { name: 'Adubos e Fertilizantes', parentId: 150009 },
  ];

  for (const cat of missing) {
    const [existing] = await conn.execute(
      'SELECT id FROM categories WHERE name = ? AND parentId = ?',
      [cat.name, cat.parentId]
    );
    if (existing.length === 0) {
      const slug = cat.name.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      await conn.execute(
        'INSERT INTO categories (name, slug, parentId) VALUES (?, ?, ?)',
        [cat.name, slug, cat.parentId]
      );
      console.log(`✓ Criada subcategoria: ${cat.name}`);
    } else {
      console.log(`  Já existe: ${cat.name}`);
    }
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
    ORDER BY parent.name, c.name
  `);
  cats.forEach(c => console.log(`  ${c.parent_name ?? 'ROOT'} → ${c.name}: ${c.total}`));
}

try {
  await addMissingSubcategories();
  await reclassifyMedicamentos();
  await reclassifyFerragens();
  await showFinalDistribution();
} finally {
  await conn.end();
}
