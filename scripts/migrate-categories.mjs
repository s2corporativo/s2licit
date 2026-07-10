/**
 * migrate-categories.mjs
 * Reorganiza a hierarquia de categorias conforme solicitado:
 * - Remove categorias antigas (mantém produtos reclassificados)
 * - Cria nova hierarquia com 1 raiz + subcategorias
 * - Reclassifica produtos existentes via mapeamento de nomes
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// ─── Nova hierarquia ────────────────────────────────────────────────────────
// Estrutura: { name, color, children: [{ name, color }] }
const NEW_HIERARCHY = [
  {
    name: 'Materiais de Construção',
    color: '#8B4513',
    children: [
      { name: 'Ferragens', color: '#A0522D' },
      { name: 'Elétrica', color: '#DAA520' },
      { name: 'Hidráulica', color: '#4169E1' },
      { name: 'Acabamento', color: '#D2691E' },
    ],
  },
  {
    name: 'EPIs',
    color: '#FF6600',
    children: [
      { name: 'EPIs por Tipo', color: '#FF8C00' },
      { name: 'Sinalização', color: '#FFD700' },
      { name: 'Proteções Específicas', color: '#FFA500' },
    ],
  },
  {
    name: 'Ferramentas e Equipamentos',
    color: '#708090',
    children: [
      { name: 'Ferramentas Elétricas', color: '#778899' },
      { name: 'Ferramentas Manuais', color: '#696969' },
      { name: 'Ferramentas Agrícolas', color: '#556B2F' },
      { name: 'Pulverizadores / Manuseio', color: '#6B8E23' },
    ],
  },
  {
    name: 'Veterinário / Agroveterinária',
    color: '#2E8B57',
    children: [
      { name: 'Medicamentos Veterinários', color: '#3CB371' },
      { name: 'Insumos Veterinários', color: '#20B2AA' },
      { name: 'Equipamentos Veterinários', color: '#008B8B' },
    ],
  },
  {
    name: 'Domissanitários e Afins',
    color: '#9370DB',
    children: [
      { name: 'Desinfetantes e Antissépticos', color: '#8A2BE2' },
      { name: 'Inseticidas e Raticidas', color: '#9400D3' },
      { name: 'Produtos de Limpeza', color: '#BA55D3' },
      { name: 'Saneantes', color: '#DA70D6' },
    ],
  },
  {
    name: 'Outros',
    color: '#999999',
    children: [],
  },
];

// ─── Mapeamento de categorias antigas → nova subcategoria ───────────────────
// Chave: parte do nome antigo (lowercase), Valor: nome da nova subcategoria
const OLD_TO_NEW = {
  // Veterinário
  'medicamentos veterinários': 'Medicamentos Veterinários',
  'antiparasitários vet': 'Medicamentos Veterinários',
  'antibióticos vet': 'Medicamentos Veterinários',
  'vacinas vet': 'Medicamentos Veterinários',
  'anti-inflamatórios vet': 'Medicamentos Veterinários',
  'hormônios e reprodução vet': 'Medicamentos Veterinários',
  'vitaminas e suplementos vet': 'Medicamentos Veterinários',
  'anestésicos e sedativos vet': 'Medicamentos Veterinários',
  'dermatológicos vet': 'Medicamentos Veterinários',
  'carrapaticida': 'Medicamentos Veterinários',
  'anabolizantes': 'Medicamentos Veterinários',
  'analgesico': 'Medicamentos Veterinários',
  'anestesico': 'Medicamentos Veterinários',
  'anti-histamínicos': 'Medicamentos Veterinários',
  'anti-inflamatório esteroidal': 'Medicamentos Veterinários',
  'anti-inflamatórios não esteroidais': 'Medicamentos Veterinários',
  'anticoccidiano': 'Medicamentos Veterinários',
  'anticolinergico': 'Medicamentos Veterinários',
  'anticonvulsivante': 'Medicamentos Veterinários',
  'antiemeticos': 'Medicamentos Veterinários',
  'antiespasmodico': 'Medicamentos Veterinários',
  'antifiseticos': 'Medicamentos Veterinários',
  'antihipertensivo': 'Medicamentos Veterinários',
  'antimicrobianos': 'Medicamentos Veterinários',
  'antineoplásicos': 'Medicamentos Veterinários',
  'antiparasitários': 'Medicamentos Veterinários',
  'antipiretico': 'Medicamentos Veterinários',
  'antiviral': 'Medicamentos Veterinários',
  'broncodilatador': 'Medicamentos Veterinários',
  'colinergico': 'Medicamentos Veterinários',
  'embelezamento': 'Medicamentos Veterinários',
  'espasmolitico': 'Medicamentos Veterinários',
  'fitoterapico': 'Medicamentos Veterinários',
  'hidratação e medicação': 'Medicamentos Veterinários',
  'hormônios': 'Medicamentos Veterinários',
  'imunomodulador': 'Medicamentos Veterinários',
  'lubrificante': 'Medicamentos Veterinários',
  'mucolitico': 'Medicamentos Veterinários',
  'neurolitico': 'Medicamentos Veterinários',
  'pesticida': 'Medicamentos Veterinários',
  'protetor de mucosa': 'Medicamentos Veterinários',
  'relaxante muscular': 'Medicamentos Veterinários',
  'vitaminas e minerais': 'Medicamentos Veterinários',
  // Humanos → Medicamentos Veterinários (equivalência)
  'medicamentos humanos': 'Medicamentos Veterinários',
  'antiparasitários humanos': 'Medicamentos Veterinários',
  'antibióticos humanos': 'Medicamentos Veterinários',
  'anti-inflamatórios humanos': 'Medicamentos Veterinários',
  'vitaminas e suplementos humanos': 'Medicamentos Veterinários',
  // Insumos
  'insumos': 'Insumos Veterinários',
  'materiais de aplicação': 'Insumos Veterinários',
  'epi e proteção': 'EPIs por Tipo',
  'diagnóstico': 'Equipamentos Veterinários',
  // Agro
  'produtos agro': 'Ferramentas Agrícolas',
  'herbicidas': 'Ferramentas Agrícolas',
  'fungicidas': 'Ferramentas Agrícolas',
  'inseticidas agro': 'Ferramentas Agrícolas',
  'fertilizantes': 'Ferramentas Agrícolas',
  // Construção
  'material de construção': 'Ferragens',
  // Desinfetantes
  'desinfetante': 'Desinfetantes e Antissépticos',
  'antisseptico': 'Desinfetantes e Antissépticos',
  // Outros
  'outros': 'Outros',
  'materiais diversos': 'Outros',
  'equipamentos de laboratório': 'Equipamentos Veterinários',
  'equipamentos de floricultura': 'Ferramentas Agrícolas',
};

console.log('🔌 Conectando ao banco...');

// 1. Buscar todas as categorias antigas
const [oldCats] = await conn.query('SELECT id, name FROM categories');
console.log(`📋 ${oldCats.length} categorias antigas encontradas`);

// 2. Inserir nova hierarquia
console.log('\n📦 Criando nova hierarquia de categorias...');
const newCatMap = new Map(); // name → id

const toSlug = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');

for (const parent of NEW_HIERARCHY) {
  // Usar INSERT IGNORE para evitar duplicatas; depois buscar o ID real
  await conn.execute(
    'INSERT IGNORE INTO categories (name, slug, color, parentId) VALUES (?, ?, ?, NULL)',
    [parent.name, toSlug(parent.name), parent.color]
  );
  const [[parentRow]] = await conn.query('SELECT id FROM categories WHERE name = ?', [parent.name]);
  const parentId = parentRow.id;
  newCatMap.set(parent.name, parentId);
  console.log(`  ✅ [${parentId}] ${parent.name}`);

  for (const child of parent.children) {
    await conn.execute(
      'INSERT IGNORE INTO categories (name, slug, color, parentId) VALUES (?, ?, ?, ?)',
      [child.name, toSlug(child.name), child.color, parentId]
    );
    const [[childRow]] = await conn.query('SELECT id FROM categories WHERE name = ?', [child.name]);
    newCatMap.set(child.name, childRow.id);
    console.log(`       ↳ [${childRow.id}] ${child.name}`);
  }
}

// 3. Reclassificar produtos das categorias antigas para as novas
console.log('\n🔄 Reclassificando produtos...');
let totalMoved = 0;
let totalOrphans = 0;
const othersId = newCatMap.get('Outros');

for (const oldCat of oldCats) {
  const key = oldCat.name.toLowerCase().trim();
  // Encontrar nova categoria pelo mapeamento
  let newName = null;
  for (const [pattern, target] of Object.entries(OLD_TO_NEW)) {
    if (key.includes(pattern)) {
      newName = target;
      break;
    }
  }
  const newId = newName ? newCatMap.get(newName) : othersId;
  if (!newId) continue;

  const [upd] = await conn.execute(
    'UPDATE products SET categoryId = ? WHERE categoryId = ?',
    [newId, oldCat.id]
  );
  if (upd.affectedRows > 0) {
    console.log(`  📦 ${upd.affectedRows} produtos: "${oldCat.name}" → "${newName || 'Outros'}"`);
    totalMoved += upd.affectedRows;
  }
}

// 4. Produtos sem categoria → Outros
const [orphans] = await conn.execute(
  'UPDATE products SET categoryId = ? WHERE categoryId IS NULL OR categoryId NOT IN (SELECT id FROM categories)',
  [othersId]
);
totalOrphans = orphans.affectedRows;

// 5. Remover categorias antigas (sem filhos e sem produtos)
console.log('\n🗑️  Removendo categorias antigas...');
const oldIds = oldCats.map(c => c.id);
let removed = 0;
for (const id of oldIds) {
  try {
    await conn.execute('DELETE FROM categories WHERE id = ?', [id]);
    removed++;
  } catch {
    // Tem FK constraint (produtos ainda apontando) — ignorar
  }
}
console.log(`  🗑️  ${removed} categorias antigas removidas`);

// 6. Relatório final
const [countNew] = await conn.query('SELECT COUNT(*) as total FROM categories');
const [countProds] = await conn.query('SELECT COUNT(*) as total FROM products WHERE isActive = "yes"');
const [countSemCat] = await conn.query('SELECT COUNT(*) as total FROM products WHERE categoryId IS NULL');

console.log('\n✅ Migração concluída!');
console.log(`   Novas categorias: ${countNew[0].total}`);
console.log(`   Produtos reclassificados: ${totalMoved}`);
console.log(`   Produtos sem categoria movidos para "Outros": ${totalOrphans}`);
console.log(`   Total de produtos ativos: ${countProds[0].total}`);
console.log(`   Produtos ainda sem categoria: ${countSemCat[0].total}`);

await conn.end();
