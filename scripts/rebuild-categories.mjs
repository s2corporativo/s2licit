/**
 * rebuild-categories.mjs
 * Recria a hierarquia completa de categorias, preservando produtos existentes.
 * Roda com: node scripts/rebuild-categories.mjs
 */
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);
console.log('🔌 Conectado ao banco');

// ─── Nova hierarquia completa ─────────────────────────────────────────────────
const HIERARCHY = [
  {
    name: 'Veterinário / Agroveterinária',
    color: '#16a34a',
    children: [
      { name: 'Medicamentos Veterinários', color: '#22c55e' },
      { name: 'Insumos Veterinários',      color: '#4ade80' },
      { name: 'Equipamentos Veterinários', color: '#86efac' },
    ],
  },
  {
    name: 'Rações',
    color: '#f59e0b',
    children: [
      { name: 'Rações para Cães',    color: '#fbbf24' },
      { name: 'Rações para Gatos',   color: '#fcd34d' },
      { name: 'Rações para Aves',    color: '#fde68a' },
      { name: 'Rações para Bovinos', color: '#fef3c7' },
      { name: 'Rações para Equinos', color: '#fffbeb' },
      { name: 'Rações para Suínos',  color: '#fef9c3' },
      { name: 'Rações Especiais',    color: '#fefce8' },
    ],
  },
  {
    name: 'Sementes',
    color: '#84cc16',
    children: [
      { name: 'Sementes Forrageiras',   color: '#a3e635' },
      { name: 'Sementes de Pastagem',   color: '#bef264' },
      { name: 'Sementes Hortícolas',    color: '#d9f99d' },
      { name: 'Sementes de Grãos',      color: '#ecfccb' },
      { name: 'Sementes Ornamentais',   color: '#f7fee7' },
    ],
  },
  {
    name: 'Domissanitários e Afins',
    color: '#06b6d4',
    children: [
      { name: 'Desinfetantes e Antissépticos', color: '#22d3ee' },
      { name: 'Inseticidas e Raticidas',       color: '#67e8f9' },
      { name: 'Produtos de Limpeza',           color: '#a5f3fc' },
      { name: 'Saneantes',                     color: '#cffafe' },
    ],
  },
  {
    name: 'Materiais de Construção',
    color: '#f97316',
    children: [
      { name: 'Ferragens',   color: '#fb923c' },
      { name: 'Elétrica',    color: '#fdba74' },
      { name: 'Hidráulica',  color: '#fed7aa' },
      { name: 'Acabamento',  color: '#ffedd5' },
    ],
  },
  {
    name: 'EPIs',
    color: '#ef4444',
    children: [
      { name: 'EPIs por Tipo',          color: '#f87171' },
      { name: 'Sinalização',            color: '#fca5a5' },
      { name: 'Proteções Específicas',  color: '#fecaca' },
    ],
  },
  {
    name: 'Ferramentas e Equipamentos',
    color: '#8b5cf6',
    children: [
      { name: 'Ferramentas Elétricas',     color: '#a78bfa' },
      { name: 'Ferramentas Manuais',       color: '#c4b5fd' },
      { name: 'Ferramentas Agrícolas',     color: '#ddd6fe' },
      { name: 'Pulverizadores / Manuseio', color: '#ede9fe' },
    ],
  },
  {
    name: 'Outros',
    color: '#6b7280',
    children: [],
  },
];

const toSlug = (s) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
   .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ─── Mapa: nome → id (para reclassificação) ──────────────────────────────────
const catIdMap = new Map(); // name → id

console.log('\n📋 Criando/atualizando categorias...');
for (const parent of HIERARCHY) {
  // Upsert pai
  await conn.execute(
    'INSERT IGNORE INTO categories (name, slug, color, parentId) VALUES (?, ?, ?, NULL)',
    [parent.name, toSlug(parent.name), parent.color]
  );
  const [[parentRow]] = await conn.query('SELECT id FROM categories WHERE name = ?', [parent.name]);
  const parentId = parentRow.id;
  // Garantir parentId=NULL para categorias raiz
  await conn.execute('UPDATE categories SET parentId=NULL WHERE id=?', [parentId]);
  catIdMap.set(parent.name, parentId);
  console.log(`  ✅ [${parentId}] ${parent.name}`);

  for (const child of parent.children) {
    await conn.execute(
      'INSERT IGNORE INTO categories (name, slug, color, parentId) VALUES (?, ?, ?, ?)',
      [child.name, toSlug(child.name), child.color, parentId]
    );
    const [[childRow]] = await conn.query('SELECT id FROM categories WHERE name = ?', [child.name]);
    // Garantir parentId correto
    await conn.execute('UPDATE categories SET parentId=? WHERE id=?', [parentId, childRow.id]);
    catIdMap.set(child.name, childRow.id);
    console.log(`       ↳ [${childRow.id}] ${child.name}`);
  }
}

// ─── Remover categorias órfãs (sem produtos e sem filhos) ────────────────────
console.log('\n🗑️  Limpando categorias obsoletas...');
const knownIds = [...catIdMap.values()];
const placeholders = knownIds.map(() => '?').join(',');
const [orphans] = await conn.query(
  `SELECT c.id, c.name FROM categories c
   LEFT JOIN products p ON p.categoryId = c.id AND p.isActive='yes'
   WHERE c.id NOT IN (${placeholders})
     AND p.id IS NULL
     AND c.id NOT IN (SELECT DISTINCT parentId FROM categories WHERE parentId IS NOT NULL)`,
  knownIds
);
for (const o of orphans) {
  await conn.execute('DELETE FROM categories WHERE id=?', [o.id]);
  console.log(`  🗑️  Removida: [${o.id}] ${o.name}`);
}

// ─── Reclassificar produtos sem categoria válida → Medicamentos Veterinários ─
const medVetId = catIdMap.get('Medicamentos Veterinários');
const outrosId  = catIdMap.get('Outros');

// Produtos cujo categoryId não existe mais
const [orphanProducts] = await conn.query(
  `SELECT COUNT(*) as cnt FROM products p
   LEFT JOIN categories c ON c.id = p.categoryId
   WHERE p.isActive='yes' AND c.id IS NULL`
);
const orphanCount = orphanProducts[0].cnt;
if (orphanCount > 0) {
  await conn.execute(
    `UPDATE products p
     LEFT JOIN categories c ON c.id = p.categoryId
     SET p.categoryId = ?
     WHERE p.isActive='yes' AND c.id IS NULL`,
    [outrosId]
  );
  console.log(`\n⚠️  ${orphanCount} produtos sem categoria → movidos para "Outros"`);
}

// ─── Resumo ──────────────────────────────────────────────────────────────────
const [[{ total }]] = await conn.query("SELECT COUNT(*) as total FROM categories");
const [[{ prods }]] = await conn.query("SELECT COUNT(*) as prods FROM products WHERE isActive='yes'");
console.log(`\n✅ Hierarquia completa!`);
console.log(`   Total de categorias: ${total}`);
console.log(`   Total de produtos ativos: ${prods}`);

await conn.end();
