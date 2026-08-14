import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  decimal,
  index,
  unique,
  uniqueIndex,
  json,
  boolean,
  date,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  // Hash scrypt da senha para login local (null para usuários OAuth)
  passwordHash: varchar("passwordHash", { length: 255 }),
  role: mysqlEnum("role", ["user", "admin", "editor", "viewer"]).default("user").notNull(),
  // Segurança: bloqueio de conta após tentativas inválidas de login.
  failedLoginAttempts: int("failedLoginAttempts").default(0).notNull(),
  lockedUntil: timestamp("lockedUntil"),
  // MFA (TOTP): segredo criptografado e flag de ativação (§16).
  mfaEnabled: boolean("mfaEnabled").default(false).notNull(),
  mfaSecret: text("mfaSecret"),
  // Conta desativada/revogada: bloqueia o acesso mesmo para usuários OAuth, cuja
  // linha seria recriada por uma sessão válida se apenas deletada.
  disabled: boolean("disabled").default(false).notNull(),
  // Versão de sessão: o JWT carrega o valor vigente no login; o logout
  // incrementa e invalida TODOS os tokens antigos do usuário — antes o token
  // capturado seguia válido por 7 dias mesmo após logout.
  sessionVersion: int("sessionVersion").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Categorias de produtos
export const categories = mysqlTable("categories", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull().unique(),
  slug: varchar("slug", { length: 128 }).notNull().unique(),
  description: text("description"),
  color: varchar("color", { length: 32 }).default("#DC2626"),
  sortOrder: int("sortOrder").default(0),
  parentId: int("parentId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Category = typeof categories.$inferSelect;
export type InsertCategory = typeof categories.$inferInsert;

// Fornecedores
export const suppliers = mysqlTable("suppliers", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 256 }).notNull().unique(),
  isActive: mysqlEnum("isActive", ["yes", "no"]).default("yes").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Supplier = typeof suppliers.$inferSelect;
export type InsertSupplier = typeof suppliers.$inferInsert;

// Importações de fornecedores via XML
export const products = mysqlTable(
  "products",
  {
    id: int("id").autoincrement().primaryKey(),
    supplierId: int("supplierId")
      .notNull()
      .references(() => suppliers.id, { onDelete: "cascade" }),
    categoryId: int("categoryId")
      .references(() => categories.id, { onDelete: "restrict" }),
    code: varchar("code", { length: 128 }),
    name: varchar("name", { length: 512 }).notNull(),
    description: text("description"),
    activeIngredient: varchar("activeIngredient", { length: 512 }),
    manufacturer: varchar("manufacturer", { length: 256 }),
    unit: varchar("unit", { length: 64 }),
    concentration: varchar("concentration", { length: 128 }),
    presentation: varchar("presentation", { length: 256 }),
    pharmaceuticalForm: varchar("pharmaceuticalForm", { length: 128 }), // Forma farmacêutica (comprimido, cápsula, solução, etc.)
    price: decimal("price", { precision: 12, scale: 2 }),
    priceUnit: varchar("priceUnit", { length: 64 }),
    stock: varchar("stock", { length: 64 }),
    barcode: varchar("barcode", { length: 128 }),
    gtin: varchar("gtin", { length: 64 }),          // Código GTIN/EAN
    codigoFornecedor: varchar("codigoFornecedor", { length: 128 }), // Código interno do fornecedor
    informacaoTecnica: text("informacaoTecnica"),   // Informação técnica / bula resumida
    mapa: varchar("mapa", { length: 128 }), // Número de registro MAPA/ANVISA (ex: PA 0012345/2019)
    subcategoria: varchar("subcategoria", { length: 256 }),  // Subcategoria do produto (ex: Antiparasitários, Antibióticos)
    fichaTecnica: text("fichaTecnica"),                      // Ficha técnica / bula resumida
    ncm: varchar("ncm", { length: 16 }),                    // Código NCM (Nomenclatura Comum do Mercosul)
    laboratorio: varchar("laboratorio", { length: 256 }),   // Laboratório fabricante
    especieAnimal: varchar("especieAnimal", { length: 256 }), // Espécie animal (cão, gato, bovino, etc.)
    viaAdministracao: varchar("viaAdministracao", { length: 128 }), // Via (oral, IM, IV, tópica, pour-on...)
    validadeMeses: int("validadeMeses"),                    // Prazo de validade (shelf-life) em meses
    classeTerapeutica: varchar("classeTerapeutica", { length: 256 }), // Classe terapêutica (Anestésico, Antibiótico, etc.)
    // ─── Campos Padronizados V2 ───────────────────────────────────────────────
    nomeProduto: varchar("nomeProduto", { length: 512 }),           // Nome padronizado (alias de name)
    registroRegulatorio: mysqlEnum("registroRegulatorio", ["MAPA", "ANVISA", "FORN"]), // Tipo de registro
  nomeNormalizado: varchar("nomeNormalizado", { length: 512 }),
  metadataExtractedAt: timestamp("metadataExtractedAt"),
    ean: varchar("ean", { length: 64 }),                             // EAN/GTIN padronizado (alias de gtin)
    // Códigos de catálogo governamental — permitem matching determinístico
    // por código nas cotações do Compras MG (CATMAS) e federais (CATMAT).
    catmasCode: varchar("catmasCode", { length: 32 }),               // Catálogo de Materiais e Serviços de MG
    catmatCode: varchar("catmatCode", { length: 32 }),               // Catálogo de Materiais federal (Compras.gov.br)
    freightValue: decimal("freightValue", { precision: 12, scale: 2 }),
    taxValue: decimal("taxValue", { precision: 12, scale: 2 }),
    imageUrl: text("imageUrl"),
    productUrl: text("productUrl"),
    importBatchId: int("importBatchId"),
    tipoCatalogo: mysqlEnum("tipoCatalogo", ["medicamento_veterinario", "medicamento_humano", "produto_nao_medicamentoso", "material_insumo_equipamento"]).default("produto_nao_medicamentoso").notNull(),
    statusConfiabilidade: mysqlEnum("statusConfiabilidade", ["completo_validado", "completo_nao_validado", "parcial", "incompleto", "enriquecido_ia", "pendente_revisao"]).default("incompleto").notNull(),
    isActive: mysqlEnum("isActive", ["yes", "no"]).default("yes").notNull(),
    // Soft-delete com carimbo: quando e por quê o produto saiu do catálogo.
    // deletedAt marca exclusão/desativação; mergedIntoId aponta o produto
    // vencedor quando a desativação veio de um merge de duplicatas.
    deletedAt: timestamp("deletedAt"),
    mergedIntoId: int("mergedIntoId"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    // Índices simples
    index("idx_products_supplier").on(table.supplierId),
    index("idx_products_category").on(table.categoryId),
    index("idx_products_active_ingredient").on(table.activeIngredient),
    index("idx_products_name").on(table.name),
    index("idx_products_is_active").on(table.isActive),
    index("idx_products_manufacturer").on(table.manufacturer),
    index("idx_products_ean").on(table.ean),
    index("idx_products_catmas").on(table.catmasCode),
    index("idx_products_catmat").on(table.catmatCode),
    index("idx_products_gtin").on(table.gtin),
    index("idx_products_barcode").on(table.barcode),
    index("idx_products_mapa").on(table.mapa),
    index("idx_products_created_at").on(table.createdAt),
    index("idx_products_code").on(table.code),
    // Índices compostos críticos para queries de 30k produtos
    // Cobertura: listProducts(isActive + categoryId), listProducts(isActive + manufacturer)
    index("idx_products_active_cat").on(table.isActive, table.categoryId),
    index("idx_products_active_mfr").on(table.isActive, table.manufacturer),
    // Cobertura: catalogHealth, actionQueue, extendedStats (fichaTecnica é TEXT,
    // não indexável sem prefixo no MySQL — o filtro IS NULL varre só por isActive)
    index("idx_products_active_ficha").on(table.isActive),
    // Cobertura: listProducts ordenado por nome (filtro mais comum)
    index("idx_products_active_name").on(table.isActive, table.name),
    // Cobertura: importação - detecção de duplicatas por fornecedor+nome
    index("idx_products_supplier_name").on(table.supplierId, table.name),
    index("idx_products_tipoCatalogo").on(table.tipoCatalogo),
    index("idx_products_statusConfiabilidade").on(table.statusConfiabilidade),
  ]
);

export type Product = typeof products.$inferSelect;
export type InsertProduct = typeof products.$inferInsert;

// Grupos de equivalência (produtos com mesmo princípio ativo)
export const equivalenceGroups = mysqlTable("equivalence_groups", {
  id: int("id").autoincrement().primaryKey(),
  activeIngredient: varchar("activeIngredient", { length: 512 }).notNull(),
  categoryId: int("categoryId").references(() => categories.id, {
    onDelete: "set null",
  }),
  notes: text("notes"),
  // Metadados de relação (ontologia canônica — spec §3):
  // relationType = EQUIVALENT | COMPATIBLE | SUBSTITUTE | SIMILAR;
  // confidence  = score 0–1 da evidência que sustentou o grupo;
  // confirmedBy/confirmedAt = auditoria de quem validou e quando.
  relationType: varchar("relationType", { length: 64 }).default("EQUIVALENT").notNull(),
  reason: text("reason"),
  confidence: decimal("confidence", { precision: 5, scale: 4 }),
  confirmedBy: int("confirmedBy").references(() => users.id, { onDelete: "set null" }),
  confirmedAt: timestamp("confirmedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ── Relações entre produtos (§3 — RelationType) ─────────────────────────────
// Registro auditável de qualquer relação decidida entre dois produtos:
// duplicidade detectada, equivalência manual, substituto aceito...
// O par é armazenado com productIdA < productIdB para unicidade simples.
export const productRelations = mysqlTable(
  "product_relations",
  {
    id: int("id").autoincrement().primaryKey(),
    productIdA: int("productIdA")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    productIdB: int("productIdB")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    // EXACT_DUPLICATE | SAME_PRODUCT_DIFFERENT_SOURCE | EQUIVALENT |
    // COMPATIBLE | SUBSTITUTE | SIMILAR | NOT_EQUIVALENT
    relationType: varchar("relationType", { length: 64 }).notNull(),
    // pending | confirmed | rejected
    status: varchar("status", { length: 32 }).default("pending").notNull(),
    // Score do motor que sugeriu a relação (0–1), null quando decisão manual.
    score: decimal("score", { precision: 5, scale: 4 }),
    // Evidência canônica: { reason, matchingFields, conflictingFields }
    evidence: json("evidence"),
    decidedBy: varchar("decidedBy", { length: 32 }).default("system").notNull(), // system | user
    createdBy: int("createdBy").references(() => users.id, { onDelete: "set null" }),
    confirmedBy: int("confirmedBy").references(() => users.id, { onDelete: "set null" }),
    confirmedAt: timestamp("confirmedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    unique("uq_relation_pair").on(table.productIdA, table.productIdB),
    index("idx_relations_product_a").on(table.productIdA),
    index("idx_relations_product_b").on(table.productIdB),
    index("idx_relations_type").on(table.relationType),
    index("idx_relations_status").on(table.status),
  ]
);
export type ProductRelation = typeof productRelations.$inferSelect;
export type InsertProductRelation = typeof productRelations.$inferInsert;

export type EquivalenceGroup = typeof equivalenceGroups.$inferSelect;
export type InsertEquivalenceGroup = typeof equivalenceGroups.$inferInsert;

// Membros de grupos de equivalência
export const equivalenceMembers = mysqlTable(
  "equivalence_members",
  {
    id: int("id").autoincrement().primaryKey(),
    groupId: int("groupId")
      .notNull()
      .references(() => equivalenceGroups.id, { onDelete: "cascade" }),
    productId: int("productId")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    unique("uq_equiv_member").on(table.groupId, table.productId),
    index("idx_equiv_product").on(table.productId),
  ]
);

export type EquivalenceMember = typeof equivalenceMembers.$inferSelect;
export type InsertEquivalenceMember = typeof equivalenceMembers.$inferInsert;

// Log de importações
export const importLogs = mysqlTable("import_logs", {
  id: int("id").autoincrement().primaryKey(),
  supplierId: int("supplierId").references(() => suppliers.id, {
    onDelete: "set null",
  }),
  categoryId: int("categoryId").references(() => categories.id, {
    onDelete: "set null",
  }),
  fileName: varchar("fileName", { length: 512 }).notNull(),
  fileUrl: text("fileUrl"),
  totalRows: int("totalRows").default(0),
  importedRows: int("importedRows").default(0),
  errorRows: int("errorRows").default(0),
  status: mysqlEnum("status", ["pending", "processing", "done", "error"])
    .default("pending")
    .notNull(),
  errorMessage: text("errorMessage"),
  columnMapping: text("columnMapping"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ImportLog = typeof importLogs.$inferSelect;
export type InsertImportLog = typeof importLogs.$inferInsert;

// Orçamentos
export const companySettings = mysqlTable("company_settings", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 256 }).notNull().default(""),
  cnpj: varchar("cnpj", { length: 18 }),
  address: text("address"),
  city: varchar("city", { length: 128 }),
  state: varchar("state", { length: 2 }),
  zipCode: varchar("zipCode", { length: 10 }),
  phone: varchar("phone", { length: 32 }),
  email: varchar("email", { length: 320 }),
  website: varchar("website", { length: 256 }),
  logoUrl: text("logoUrl"),
  bankInfo: text("bankInfo"),
  notes: text("notes"),
  minMarginPercent: decimal("minMarginPercent", { precision: 6, scale: 2 }).default("15"), // Margem mínima global (%)
  // §13 — validade máxima da consulta de preço antes de exigir revalidação.
  priceValidityPreset: varchar("priceValidityPreset", { length: 16 }).default("24h"),
  priceValidityCustomHours: int("priceValidityCustomHours"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CompanySettings = typeof companySettings.$inferSelect;
export type InsertCompanySettings = typeof companySettings.$inferInsert;

// Órgãos requisitantes
export const requestingOrgs = mysqlTable("requesting_orgs", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 256 }).notNull(),
  cnpj: varchar("cnpj", { length: 18 }),
  address: text("address"),
  city: varchar("city", { length: 128 }),
  state: varchar("state", { length: 2 }),
  phone: varchar("phone", { length: 32 }),
  email: varchar("email", { length: 320 }),
  contactPerson: varchar("contactPerson", { length: 256 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type RequestingOrg = typeof requestingOrgs.$inferSelect;
export type InsertRequestingOrg = typeof requestingOrgs.$inferInsert;

// Propostas comerciais
export const proposals = mysqlTable("proposals", {
  id: int("id").autoincrement().primaryKey(),
  processNumber: varchar("processNumber", { length: 128 }),
  orgId: int("orgId").references(() => requestingOrgs.id, { onDelete: "set null" }),
  orgName: varchar("orgName", { length: 256 }),
  title: varchar("title", { length: 256 }).notNull(),
  // Status pipeline: rascunho → enviada → pedido → em_transito → entregue → cancelada
  status: mysqlEnum("status", ["draft", "sent", "order", "in_transit", "delivered", "cancelled"]).default("draft").notNull(),
  validityDays: int("validityDays").default(30),
  paymentTerms: varchar("paymentTerms", { length: 256 }),
  deliveryTerms: varchar("deliveryTerms", { length: 256 }),
  notes: text("notes"),
  notesHtml: text("notesHtml"),
  // Frete
  freightValue: decimal("freightValue", { precision: 12, scale: 2 }),
  freightCarrier: varchar("freightCarrier", { length: 256 }),
  freightTrackingCode: varchar("freightTrackingCode", { length: 128 }),
  freightPaidAt: timestamp("freightPaidAt"),
  // Datas do pipeline
  sentAt: timestamp("sentAt"),
  orderedAt: timestamp("orderedAt"),
  shippedAt: timestamp("shippedAt"),
  deliveredAt: timestamp("deliveredAt"),
  cancelledAt: timestamp("cancelledAt"),
  // Valor total (cache)
  totalValue: decimal("totalValue", { precision: 14, scale: 2 }),
  // Prazo de pagamento em dias (para cálculo de risco financeiro)
  prazoPagamentoDias: int("prazoPagamentoDias").default(30),
  // Risco financeiro calculado: baixo | medio | alto
  riscoFinanceiro: varchar("riscoFinanceiro", { length: 16 }),
  // Origem da proposta: manual | radar | import | rapida
  origem: varchar("origem", { length: 32 }).default("manual"),
  // ID da oportunidade do Radar que originou esta proposta (nullable)
  radarOpportunityId: int("radarOpportunityId"),
  // Cotação de e-mail/portal que originou esta proposta — permite localizar
  // (ou reaproveitar, de forma idempotente) a proposta ao "preencher no
  // portal" a partir da fila de cotações.
  emailQuotationId: int("emailQuotationId").references(() => emailQuotations.id, { onDelete: "set null" }).unique(),
  // Registrados ao marcar status "cancelled" por perda para concorrente
  // (distinto de cancelamento interno, que deixa os dois campos vazios) —
  // alimenta o win rate consolidado em routers/desempenho.ts junto com
  // email_quotations.
  competitorValue: decimal("competitorValue", { precision: 15, scale: 2 }),
  lossReason: text("lossReason"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Proposal = typeof proposals.$inferSelect;
export type InsertProposal = typeof proposals.$inferInsert;

// Histórico de status das propostas
export const proposalStatusHistory = mysqlTable(
  "proposal_status_history",
  {
    id: int("id").autoincrement().primaryKey(),
    proposalId: int("proposalId")
      .notNull()
      .references(() => proposals.id, { onDelete: "cascade" }),
    fromStatus: varchar("fromStatus", { length: 32 }),
    toStatus: varchar("toStatus", { length: 32 }).notNull(),
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    index("idx_psh_proposal").on(table.proposalId),
  ]
);

export type ProposalStatusHistory = typeof proposalStatusHistory.$inferSelect;
export type InsertProposalStatusHistory = typeof proposalStatusHistory.$inferInsert;

// Lançamentos financeiros
export const financialEntries = mysqlTable(
  "financial_entries",
  {
    id: int("id").autoincrement().primaryKey(),
    type: mysqlEnum("type", ["income", "expense"]).notNull(),
    category: varchar("category", { length: 128 }),
    description: varchar("description", { length: 512 }).notNull(),
    amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
    dueDate: timestamp("dueDate"),
    paidAt: timestamp("paidAt"),
    isPaid: mysqlEnum("isPaid", ["yes", "no"]).default("no").notNull(),
    proposalId: int("proposalId").references(() => proposals.id, { onDelete: "set null" }),
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("idx_fentries_type").on(table.type),
    index("idx_fentries_proposal").on(table.proposalId),
    index("idx_fentries_paid").on(table.isPaid),
  ]
);

export type FinancialEntry = typeof financialEntries.$inferSelect;
export type InsertFinancialEntry = typeof financialEntries.$inferInsert;

// Itens da proposta
export const proposalItems = mysqlTable(
  "proposal_items",
  {
    id: int("id").autoincrement().primaryKey(),
    proposalId: int("proposalId")
      .notNull()
      .references(() => proposals.id, { onDelete: "cascade" }),
    productId: int("productId").references(() => products.id, { onDelete: "set null" }),
    itemNumber: int("itemNumber").default(0),
    productName: varchar("productName", { length: 512 }).notNull(),
    activeIngredient: varchar("activeIngredient", { length: 512 }),
    manufacturer: varchar("manufacturer", { length: 256 }),
    concentration: varchar("concentration", { length: 128 }),
    presentation: varchar("presentation", { length: 256 }),
    unit: varchar("unit", { length: 64 }),
    supplierName: varchar("supplierName", { length: 256 }),
    unitPrice: decimal("unitPrice", { precision: 12, scale: 2 }),   // Preço de custo (do sistema)
    costPrice: decimal("costPrice", { precision: 12, scale: 2 }),     // Preço de custo explícito
    editalRefPrice: decimal("editalRefPrice", { precision: 12, scale: 2 }), // Preço de referência do edital
    suggestedPrice: decimal("suggestedPrice", { precision: 12, scale: 2 }), // Preço sugerido (editável)
    quantity: int("quantity").default(1).notNull(),
    totalPrice: decimal("totalPrice", { precision: 14, scale: 2 }),
    notes: text("notes"),
    imageUrl: text("imageUrl"),
    productUrl: text("productUrl"),
    registroMapa: varchar("registroMapa", { length: 128 }), // Número de registro MAPA/ANVISA
    sortOrder: int("sortOrder").default(0),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    index("idx_pitems_proposal").on(table.proposalId),
  ]
);

export type ProposalItem = typeof proposalItems.$inferSelect;
export type InsertProposalItem = typeof proposalItems.$inferInsert;

// ─── Base Mestre de Produtos ────────────────────────────────────────────────
// Tabela canônica carregada a partir do BASE_PRODUTOS_SISTEMA.csv.
// Serve como referência para o reconhecimento inteligente durante importações.
export const masterProducts = mysqlTable(
  "master_products",
  {
    id: int("id").autoincrement().primaryKey(),
    // Identificadores canônicos
    ean: varchar("ean", { length: 64 }),           // Código EAN/barcode
    codigoMapa: varchar("codigoMapa", { length: 64 }), // Código MAPA (registro)
    // Dados técnicos
    name: varchar("name", { length: 512 }).notNull(),
    activeIngredient: varchar("activeIngredient", { length: 512 }),
    manufacturer: varchar("manufacturer", { length: 256 }),
    concentration: varchar("concentration", { length: 128 }),
    presentation: varchar("presentation", { length: 512 }),
    unit: varchar("unit", { length: 64 }),
    description: text("description"),
    // Classificação padrão
    categoryName: varchar("categoryName", { length: 256 }),
    categoryId: int("categoryId").references(() => categories.id, { onDelete: "set null" }),
    // Metadados
    imageUrl: text("imageUrl"),
    productUrl: text("productUrl"),
    isActive: mysqlEnum("isActive", ["yes", "no"]).default("yes").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("idx_master_name").on(table.name),
    index("idx_master_ean").on(table.ean),
    index("idx_master_mapa").on(table.codigoMapa),
    index("idx_master_ingredient").on(table.activeIngredient),
  ]
);
export type MasterProduct = typeof masterProducts.$inferSelect;
export type InsertMasterProduct = typeof masterProducts.$inferInsert;

// ─── Histórico de Preços ──────────────────────────────────────────────────────
export const priceHistory = mysqlTable(
  "price_history",
  {
    id: int("id").autoincrement().primaryKey(),
    productId: int("productId").notNull().references(() => products.id, { onDelete: "cascade" }),
    supplierId: int("supplierId").notNull().references(() => suppliers.id, { onDelete: "cascade" }),
    price: decimal("price", { precision: 12, scale: 2 }),
    freightValue: decimal("freightValue", { precision: 12, scale: 2 }),
    taxValue: decimal("taxValue", { precision: 12, scale: 2 }),
    landedCost: decimal("landedCost", { precision: 12, scale: 2 }),
    // Alerta: preço subiu mais de 5% em relação ao registro anterior
    priceAlert: mysqlEnum("priceAlert", ["yes", "no"]).default("no").notNull(),
    alertPercent: decimal("alertPercent", { precision: 6, scale: 2 }),
    importBatchId: int("importBatchId"),
    precoAnterior: decimal("precoAnterior", { precision: 12, scale: 2 }), // Preço anterior
    precoNovo: decimal("precoNovo", { precision: 12, scale: 2 }),          // Novo preço
    origem: varchar("origem", { length: 64 }),                             // import | scraping | manual
    data: timestamp("data").defaultNow(),                                  // Data da alteração
    recordedAt: timestamp("recordedAt").defaultNow().notNull(),
  },
  (table) => [
    index("idx_ph_product").on(table.productId),
    index("idx_ph_supplier").on(table.supplierId),
    index("idx_ph_recorded").on(table.recordedAt),
  ]
);
export type PriceHistory = typeof priceHistory.$inferSelect;
export type InsertPriceHistory = typeof priceHistory.$inferInsert;

// ─── Imagens de Produtos ──────────────────────────────────────────────────────
export const declarationTemplates = mysqlTable("declaration_templates", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 256 }).notNull(),
  content: text("content").notNull(),
  isActive: mysqlEnum("isActive", ["yes", "no"]).default("yes").notNull(),
  sortOrder: int("sortOrder").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type DeclarationTemplate = typeof declarationTemplates.$inferSelect;
export type InsertDeclarationTemplate = typeof declarationTemplates.$inferInsert;

// ─── Declarações Gravadas por Proposta (snapshot) ─────────────────────────────
export const proposalDeclarations = mysqlTable(
  "proposal_declarations",
  {
    id: int("id").autoincrement().primaryKey(),
    proposalId: int("proposalId").notNull().references(() => proposals.id, { onDelete: "cascade" }),
    templateId: int("templateId"),
    title: varchar("title", { length: 256 }).notNull(),
    content: text("content").notNull(),
    sortOrder: int("sortOrder").default(0),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("idx_pdecl_proposal").on(t.proposalId)]
);
export type ProposalDeclaration = typeof proposalDeclarations.$inferSelect;
export type InsertProposalDeclaration = typeof proposalDeclarations.$inferInsert;

// ─── Resultados de Licitações ─────────────────────────────────────────────────
export const synonyms = mysqlTable(
  "synonyms",
  {
    id: int("id").autoincrement().primaryKey(),
    term: varchar("term", { length: 256 }).notNull(),       // abreviação / variação
    canonical: varchar("canonical", { length: 256 }).notNull(), // termo canônico
    category: varchar("category", { length: 64 }).default("geral"), // vet, humano, construcao, geral
    isActive: mysqlEnum("isActive", ["yes", "no"]).default("yes").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_synonym_term").on(t.term),
    index("idx_synonym_canonical").on(t.canonical),
  ]
);
export type Synonym = typeof synonyms.$inferSelect;
export type InsertSynonym = typeof synonyms.$inferInsert;

// ─── Templates de Proposta ────────────────────────────────────────────────────
// Configurações reutilizáveis de impostos, frete e declarações por tipo de órgão.
// Ao criar uma proposta, o usuário seleciona um template e os campos são
// preenchidos automaticamente (ICMS, ST, outros impostos, frete, declarações).
export const proposalTemplates = mysqlTable(
  "proposal_templates",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 128 }).notNull(),          // ex: "Prefeitura Municipal"
    orgType: mysqlEnum("orgType", ["prefeitura", "estado", "federal", "privado", "outro"]).default("outro").notNull(),
    // Impostos (percentuais)
    icmsPercent: decimal("icmsPercent", { precision: 5, scale: 2 }).default("0"),
    stPercent: decimal("stPercent", { precision: 5, scale: 2 }).default("0"),
    ipiPercent: decimal("ipiPercent", { precision: 5, scale: 2 }).default("0"),
    otherTaxPercent: decimal("otherTaxPercent", { precision: 5, scale: 2 }).default("0"),
    // Frete
    freightType: mysqlEnum("freightType", ["cif", "fob", "none"]).default("cif"),
    freightPercent: decimal("freightPercent", { precision: 5, scale: 2 }).default("0"),
    // Validade padrão (dias)
    validityDays: int("validityDays").default(30),
    // Declarações / observações padrão
    declarations: text("declarations"),
    paymentTerms: varchar("paymentTerms", { length: 256 }),    // ex: "30 dias após entrega"
    deliveryDays: int("deliveryDays").default(15),
    notes: text("notes"),
    isDefault: mysqlEnum("isDefault", ["yes", "no"]).default("no").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_ptpl_orgtype").on(t.orgType),
    index("idx_ptpl_default").on(t.isDefault),
  ]
);
export type ProposalTemplate = typeof proposalTemplates.$inferSelect;
export type InsertProposalTemplate = typeof proposalTemplates.$inferInsert;

// ─── Feedback de Aprendizado no Matching ─────────────────────────────────────
// Registra pares confirmados: termo do edital → produto escolhido.
// Ao importar um edital, se o usuário confirma um item (ou ele já vem com
// confidence medium/high), o par é salvo aqui. Nas próximas importações,
// o matchCatalog consulta esta tabela e aplica um boost de score (+0.60)
// para pares já aprendidos, melhorando progressivamente a precisão.
export const matchFeedback = mysqlTable(
  "match_feedback",
  {
    id: int("id").autoincrement().primaryKey(),
    // Termo normalizado do edital (lowercase, sem acentos, sem pontuação)
    editalTerm: varchar("editalTerm", { length: 512 }).notNull(),
    // Produto confirmado
    productId: int("productId").notNull().references(() => products.id, { onDelete: "cascade" }),
    productName: varchar("productName", { length: 512 }).notNull(),
    // Estatísticas de uso
    useCount: int("useCount").default(1).notNull(),
    confirmedAt: timestamp("confirmedAt").defaultNow().notNull(),
    lastUsedAt: timestamp("lastUsedAt").defaultNow().notNull(),
  },
  (t) => [
    index("idx_mfb_term").on(t.editalTerm),
    index("idx_mfb_product").on(t.productId),
  ]
);
export type MatchFeedback = typeof matchFeedback.$inferSelect;
export type InsertMatchFeedback = typeof matchFeedback.$inferInsert;

// ─── Monitoramento por Palavras-Chave no PNCP ────────────────────────────────
export const documentosHabilitacao = mysqlTable(
  "documentos_habilitacao",
  {
    id: int("id").autoincrement().primaryKey(),
    // Tipo do documento
    tipo: varchar("tipo", { length: 64 }).notNull(),
    nome: varchar("nome", { length: 256 }).notNull(),
    // Arquivo no S3
    fileUrl: varchar("fileUrl", { length: 512 }),
    fileKey: varchar("fileKey", { length: 256 }),
    // Validade
    dataEmissao: varchar("dataEmissao", { length: 16 }),
    dataVencimento: varchar("dataVencimento", { length: 16 }),
    // Status calculado: valido, expirando, vencido, sem_data
    statusValidade: varchar("statusValidade", { length: 32 }).notNull().default("sem_data"),
    // Notas
    notas: text("notas"),
    // Órgão emissor
    orgaoEmissor: varchar("orgaoEmissor", { length: 128 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (t) => [
    index("idx_doc_tipo").on(t.tipo),
    index("idx_doc_vencimento").on(t.dataVencimento),
    index("idx_doc_status").on(t.statusValidade),
  ]
);
export type DocumentoHabilitacao = typeof documentosHabilitacao.$inferSelect;
export type InsertDocumentoHabilitacao = typeof documentosHabilitacao.$inferInsert;

// ============================================================
// MÓDULO 2: Análises de Edital (IA)
// ============================================================
export const matchLogs = mysqlTable(
  "match_logs",
  {
    id: int("id").autoincrement().primaryKey(),
    // Item do edital que foi comparado
    editalItem: varchar("editalItem", { length: 512 }).notNull(),
    editalItemNormalizado: varchar("editalItemNormalizado", { length: 512 }),
    // Produto sugerido (pode ser null se score < 0.60)
    produtoSugeridoId: int("produtoSugeridoId"),
    produtoSugeridoNome: varchar("produtoSugeridoNome", { length: 512 }),
    // Score de similaridade (0–1)
    score: decimal("score", { precision: 5, scale: 4 }),
    // Critérios utilizados no cálculo (JSON com scores por campo)
    criteriosUtilizados: json("criteriosUtilizados"),
    // Decisão: auto_match | needs_review | no_match
    decisao: varchar("decisao", { length: 32 }),
    // Tempo de execução em milissegundos
    tempoExecucaoMs: int("tempoExecucaoMs"),
    // Contexto: qual análise de edital gerou este log
    editalAnalysisId: int("editalAnalysisId"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("idx_mlog_edital").on(t.editalItem),
    index("idx_mlog_produto").on(t.produtoSugeridoId),
    index("idx_mlog_score").on(t.score),
    index("idx_mlog_decisao").on(t.decisao),
    index("idx_mlog_created").on(t.createdAt),
  ]
);
export type MatchLog = typeof matchLogs.$inferSelect;
export type InsertMatchLog = typeof matchLogs.$inferInsert;

/**
 * matchFeedbackV2: Feedback detalhado do usuário sobre matches.
 * Armazena o item do edital, produto escolhido, score original, ação e data.
 * Usado para aprendizado contínuo do sistema.
 */
export const productSupplierPrices = mysqlTable(
  "product_supplier_prices",
  {
    id: int("id").autoincrement().primaryKey(),
    productId: int("productId").notNull().references(() => products.id, { onDelete: "cascade" }),
    supplierId: int("supplierId").notNull().references(() => suppliers.id, { onDelete: "cascade" }),
    price: decimal("price", { precision: 12, scale: 2 }),
    codigoFornecedor: varchar("codigoFornecedor", { length: 128 }),  // Código do produto no fornecedor
    linkProduto: text("linkProduto"),                                 // URL do produto no site do fornecedor
    dataAtualizacao: timestamp("dataAtualizacao").defaultNow().onUpdateNow(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("idx_psp_product").on(table.productId),
    index("idx_psp_supplier").on(table.supplierId),
    unique("uq_psp_product_supplier").on(table.productId, table.supplierId),
  ]
);
export type ProductSupplierPrice = typeof productSupplierPrices.$inferSelect;
export type InsertProductSupplierPrice = typeof productSupplierPrices.$inferInsert;

// ============================================================
// MÓDULO DE LICITAÇÕES PÚBLICAS (PNCP + Compras.gov)
// ============================================================

export const licitacoes = mysqlTable("licitacoes", {
  id: int("id").primaryKey().autoincrement(),
  fonte: varchar("fonte", { length: 32 }).notNull(), // "pncp" | "compras_gov"
  externalId: varchar("externalId", { length: 256 }).notNull(), // ID único na fonte
  numero: varchar("numero", { length: 128 }),
  orgao: varchar("orgao", { length: 512 }),
  cnpjOrgao: varchar("cnpjOrgao", { length: 20 }),
  uf: varchar("uf", { length: 2 }),
  municipio: varchar("municipio", { length: 128 }),
  modalidade: varchar("modalidade", { length: 128 }),
  objeto: text("objeto"),
  dataPublicacao: varchar("dataPublicacao", { length: 32 }),
  dataAbertura: varchar("dataAbertura", { length: 32 }),
  dataEncerramento: varchar("dataEncerramento", { length: 32 }),
  valorEstimado: decimal("valorEstimado", { precision: 15, scale: 2 }),
  status: varchar("status", { length: 64 }).default("ativa"), // ativa | encerrada | cancelada | suspensa
  link: text("link"),
  rawData: json("rawData"), // dados brutos da API
  dataSync: timestamp("dataSync").defaultNow(),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow(),
});

export const auditLogs = mysqlTable(
  "audit_logs",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").references(() => users.id, { onDelete: "set null" }),
    action: varchar("action", { length: 128 }).notNull(),
    entity: varchar("entity", { length: 128 }).notNull(),
    entityId: int("entityId"),
    origin: varchar("origin", { length: 128 }).default("manual").notNull(),
    summary: text("summary"),
    changes: json("changes"),
    // Rastreabilidade de acesso (§18): origem da requisição.
    ipAddress: varchar("ipAddress", { length: 64 }),
    userAgent: varchar("userAgent", { length: 512 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("idx_audit_entity").on(t.entity),
    index("idx_audit_entity_id").on(t.entityId),
    index("idx_audit_created").on(t.createdAt),
  ]
);

export const diligenciaWorkflows = mysqlTable(
  "diligencia_workflows",
  {
    id: int("id").autoincrement().primaryKey(),
    proposalId: int("proposalId").references(() => proposals.id, { onDelete: "set null" }),
    orgId: int("orgId").references(() => requestingOrgs.id, { onDelete: "set null" }),
    tipo: varchar("tipo", { length: 64 }).notNull(),
    titulo: varchar("titulo", { length: 256 }).notNull(),
    status: varchar("status", { length: 32 }).default("aberta").notNull(),
    prioridade: varchar("prioridade", { length: 16 }).default("media").notNull(),
    prazoResposta: date("prazoResposta"),
    responsavel: varchar("responsavel", { length: 256 }),
    detalhes: text("detalhes"),
    resposta: text("resposta"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_dilig_status").on(t.status),
    index("idx_dilig_proposal").on(t.proposalId),
    index("idx_dilig_org").on(t.orgId),
    index("idx_dilig_prazo").on(t.prazoResposta),
  ]
);
export type DiligenciaWorkflow = typeof diligenciaWorkflows.$inferSelect;
export type InsertDiligenciaWorkflow = typeof diligenciaWorkflows.$inferInsert;

export const apiLogs = mysqlTable(
  "apiLogs",
  {
    id: int("id").autoincrement().primaryKey(),
    source: varchar("source", { length: 64 }).notNull(), // "pncp" | "comprasmg" | "portalcompras"
    endpoint: varchar("endpoint", { length: 512 }).notNull(),
    requestUrl: text("requestUrl"),
    statusCode: int("statusCode"),
    contentType: varchar("contentType", { length: 128 }),
    errorMessage: text("errorMessage"),
    rawSample: text("rawSample"), // primeiros 2000 chars da resposta
    durationMs: int("durationMs"),
    success: boolean("success").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    index("idx_al_source").on(table.source),
    index("idx_al_success").on(table.success),
    index("idx_al_created").on(table.createdAt),
  ]
);
export type ApiLog = typeof apiLogs.$inferSelect;
export type InsertApiLog = typeof apiLogs.$inferInsert;

// ─── Execuções de sincronização por fonte ─────────────────────────────────────
export const syncRuns = mysqlTable(
  "syncRuns",
  {
    id: int("id").autoincrement().primaryKey(),
    source: varchar("source", { length: 64 }).notNull(), // "pncp" | "comprasmg"
    startedAt: timestamp("startedAt").defaultNow().notNull(),
    endedAt: timestamp("endedAt"),
    insertedCount: int("insertedCount").default(0),
    updatedCount: int("updatedCount").default(0),
    skippedCount: int("skippedCount").default(0),
    errorCount: int("errorCount").default(0),
    windowSync: varchar("windowSync", { length: 128 }), // ex: "2026-02-01/2026-03-05"
    lastSuccessfulSyncAt: timestamp("lastSuccessfulSyncAt"),
    status: mysqlEnum("status", ["running", "success", "error", "partial"]).default("running").notNull(),
    errorDetails: text("errorDetails"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    index("idx_sr_source").on(table.source),
    index("idx_sr_status").on(table.status),
    index("idx_sr_started").on(table.startedAt),
  ]
);
export type SyncRun = typeof syncRuns.$inferSelect;
export type InsertSyncRun = typeof syncRuns.$inferInsert;


// ─── Ofertas de Produtos por Fornecedor ──────────────────────────────────────
export const productSupplierOffers = mysqlTable(
  "product_supplier_offers",
  {
    id: int("id").autoincrement().primaryKey(),
    productId: int("productId")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    supplierId: int("supplierId")
      .notNull()
      .references(() => suppliers.id, { onDelete: "cascade" }),
    supplierCode: varchar("supplierCode", { length: 255 }),
    supplierName: varchar("supplierName", { length: 255 }),
    brand: varchar("brand", { length: 255 }),
    manufacturer: varchar("manufacturer", { length: 255 }),
    price: decimal("price", { precision: 12, scale: 2 }),
    promoPrice: decimal("promoPrice", { precision: 12, scale: 2 }), // §7 preço promocional
    stock: int("stock"), // §7 estoque informado pelo fornecedor
    priceHistory: json("priceHistory"), // JSON array de histórico de preços
    link: text("link"),
    image: text("image"),
    availability: varchar("availability", { length: 50 }),
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("idx_pso_productId").on(table.productId),
    index("idx_pso_supplierId").on(table.supplierId),
    index("idx_pso_price").on(table.price),
    unique("unique_product_supplier").on(table.productId, table.supplierId),
  ]
);

export type ProductSupplierOffer = typeof productSupplierOffers.$inferSelect;
export type InsertProductSupplierOffer = typeof productSupplierOffers.$inferInsert;



// ─── Histórico de Auto-vinculação de Imagens ─────────────────────────────────────
export const scraperConfigs = mysqlTable("scraper_configs", {
  id: int("id").autoincrement().primaryKey(),
  supplierId: int("supplierId")
    .notNull()
    .references(() => suppliers.id, { onDelete: "cascade" }),
  scraperType: varchar("scraperType", { length: 64 }).notNull(), // "tambasa", "cristalia", "ourofino", "custom", etc
  enabled: mysqlEnum("enabled", ["yes", "no"]).default("yes").notNull(),
  email: text("email").notNull(), // Encrypted
  passwordHash: text("passwordHash").notNull(), // Encrypted
  scheduleTime: varchar("scheduleTime", { length: 8 }).default("02:00"), // HH:mm format
  // Seletores CSS/URLs definidos pelo usuário para fornecedores sem config
  // embutida em FORNECEDOR_CONFIGS (scraperEngine.ts). Quando presente, o motor
  // usa este objeto no lugar da config fixa por tipo — permite cadastrar
  // qualquer fornecedor pela UI sem alterar código.
  customSelectors: json("customSelectors").$type<{
    loginUrl?: string;
    loginTrigger?: string;
    loginEmail: string;
    loginPassword: string;
    loginSubmit: string;
    loginSuccessUrl?: string;
    loginSuccessText?: string;
    loginSuccessSelector?: string;
    categoryUrls: string[];
    searchUrlTemplate?: string;
    productItem: string;
    productName: string;
    productPrice: string;
    productCode?: string;
    productEan?: string;
    productImage?: string;
    productLink?: string;
    nextPage?: string;
    waitForSelector?: string;
    navigationWait?: number;
  }>(),
  // Governança: a captura só roda depois que um humano confirmou que os
  // termos de uso do site do fornecedor foram revisados e a coleta autorizada.
  tosAprovado: boolean("tosAprovado").default(false).notNull(),
  lastRunAt: timestamp("lastRunAt"),
  nextRunAt: timestamp("nextRunAt"),
  lastRunStatus: mysqlEnum("lastRunStatus", ["success", "failed", "pending"]).default("pending"),
  lastRunErrorMessage: text("lastRunErrorMessage"),
  productsScrapedCount: int("productsScrapedCount").default(0),
  productsMatchedCount: int("productsMatchedCount").default(0),
  productsUpdatedCount: int("productsUpdatedCount").default(0),
  productsCreatedCount: int("productsCreatedCount").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ScraperConfig = typeof scraperConfigs.$inferSelect;
export type InsertScraperConfig = typeof scraperConfigs.$inferInsert;

// Logs de execução do scraper
export const scraperLogs = mysqlTable("scraper_logs", {
  id: int("id").autoincrement().primaryKey(),
  scraperConfigId: int("scraperConfigId")
    .notNull()
    .references(() => scraperConfigs.id, { onDelete: "cascade" }),
  status: mysqlEnum("status", ["success", "failed", "running"]).notNull(),
  startedAt: timestamp("startedAt").notNull(),
  completedAt: timestamp("completedAt"),
  durationMs: int("durationMs"),
  productsScraped: int("productsScraped").default(0),
  productsMatched: int("productsMatched").default(0),
  productsUpdated: int("productsUpdated").default(0),
  productsCreated: int("productsCreated").default(0),
  errorMessage: text("errorMessage"),
  errorStack: text("errorStack"),
  evidenceUrl: varchar("evidenceUrl", { length: 512 }), // print da tela no erro (§9)
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ScraperLog = typeof scraperLogs.$inferSelect;
export type InsertScraperLog = typeof scraperLogs.$inferInsert;

// ─── Configuração de Precificação ─────────────────────────────────────────
export const categoryPricingRules = mysqlTable("category_pricing_rules", {
  id: int("id").autoincrement().primaryKey(),
  categoryId: int("categoryId")
    .notNull()
    .references(() => categories.id, { onDelete: "cascade" }),
  
  // Impostos (em percentual)
  icmsPercentage: decimal("icmsPercentage", { precision: 5, scale: 2 }).default("0"),
  ipPercentage: decimal("ipPercentage", { precision: 5, scale: 2 }).default("0"),
  pisPercentage: decimal("pisPercentage", { precision: 5, scale: 2 }).default("0"),
  cofinsPercentage: decimal("cofinsPercentage", { precision: 5, scale: 2 }).default("0"),
  
  // Fretes
  freightType: mysqlEnum("freightType", ["fixed", "percentage"]).default("fixed"),
  freightValue: decimal("freightValue", { precision: 12, scale: 2 }).default("0"),
  
  // Margem de lucro
  marginPercentage: decimal("marginPercentage", { precision: 5, scale: 2 }).notNull(),
  
  // Limites
  minPrice: decimal("minPrice", { precision: 12, scale: 2 }),
  maxPrice: decimal("maxPrice", { precision: 12, scale: 2 }),
  roundingMethod: mysqlEnum("roundingMethod", ["round", "ceil", "floor"]).default("round"),
  
  // Status
  isActive: mysqlEnum("isActive", ["yes", "no"]).default("yes").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CategoryPricingRule = typeof categoryPricingRules.$inferSelect;
export type InsertCategoryPricingRule = typeof categoryPricingRules.$inferInsert;

// ─── Aplicações em Massa de Precificação ──────────────────────────────────
export const bulkPricingApplications = mysqlTable("bulk_pricing_applications", {
  id: int("id").autoincrement().primaryKey(),
  
  // Informações da aplicação
  categoryId: int("categoryId").references(() => categories.id, { onDelete: "set null" }),
  totalProducts: int("totalProducts").notNull(),
  updatedCount: int("updatedCount").notNull(),
  skippedCount: int("skippedCount").default(0),
  errorCount: int("errorCount").default(0),
  
  // Configuração aplicada
  marginPercentage: decimal("marginPercentage", { precision: 5, scale: 2 }).notNull(),
  icmsPercentage: decimal("icmsPercentage", { precision: 5, scale: 2 }).default("0"),
  ipPercentage: decimal("ipPercentage", { precision: 5, scale: 2 }).default("0"),
  pisPercentage: decimal("pisPercentage", { precision: 5, scale: 2 }).default("0"),
  cofinsPercentage: decimal("cofinsPercentage", { precision: 5, scale: 2 }).default("0"),
  freightType: mysqlEnum("freightType", ["fixed", "percentage"]).default("fixed"),
  freightValue: decimal("freightValue", { precision: 12, scale: 2 }).default("0"),
  
  // Estatísticas
  averagePriceIncrease: decimal("averagePriceIncrease", { precision: 12, scale: 2 }).default("0"),
  minNewPrice: decimal("minNewPrice", { precision: 12, scale: 2 }).default("0"),
  maxNewPrice: decimal("maxNewPrice", { precision: 12, scale: 2 }).default("0"),
  
  // Rastreamento
  appliedBy: int("appliedBy").references(() => users.id, { onDelete: "set null" }),
  appliedAt: timestamp("appliedAt").defaultNow().notNull(),
  
  // Status
  status: mysqlEnum("status", ["pending", "completed", "failed", "reverted"]).default("completed"),
  errorMessage: text("errorMessage"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type BulkPricingApplication = typeof bulkPricingApplications.$inferSelect;
export type InsertBulkPricingApplication = typeof bulkPricingApplications.$inferInsert;

// ─── Detalhes de Aplicação em Massa ────────────────────────────────────────
export const bulkPricingApplicationDetails = mysqlTable("bulk_pricing_application_details", {
  id: int("id").autoincrement().primaryKey(),
  applicationId: int("applicationId")
    .notNull()
    .references(() => bulkPricingApplications.id, { onDelete: "cascade" }),
  productId: int("productId")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  
  // Preços
  oldPrice: decimal("oldPrice", { precision: 12, scale: 2 }).notNull(),
  newPrice: decimal("newPrice", { precision: 12, scale: 2 }).notNull(),
  priceIncrease: decimal("priceIncrease", { precision: 12, scale: 2 }).notNull(),
  
  // Status
  status: mysqlEnum("status", ["success", "skipped", "error"]).default("success"),
  errorMessage: text("errorMessage"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type BulkPricingApplicationDetail = typeof bulkPricingApplicationDetails.$inferSelect;
export type InsertBulkPricingApplicationDetail = typeof bulkPricingApplicationDetails.$inferInsert;

// ─── NFe Imports ───────────────────────────────────────────────────────────
export const nfeImports = mysqlTable(
  "nfe_imports",
  {
    id: int("id").autoincrement().primaryKey(),
    // Número da NF é único apenas POR EMITENTE — a unicidade é composta
    // (nfeNumber + supplierCnpj), definida no índice abaixo.
    nfeNumber: varchar("nfeNumber", { length: 256 }).notNull(),
    supplierName: varchar("supplierName", { length: 256 }).notNull(),
    supplierCnpj: varchar("supplierCnpj", { length: 20 }).notNull(),
    supplierId: int("supplierId")
      .references(() => suppliers.id, { onDelete: "set null" }),
    totalProducts: int("totalProducts").default(0),
    importedProducts: int("importedProducts").default(0),
    status: mysqlEnum("status", ["pending", "processing", "completed", "failed"]).default("pending"),
    xmlContent: text("xmlContent"),
    importDate: timestamp("importDate").defaultNow(),
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    uniqueIndex("uq_nfe_imports_numero_cnpj").on(table.nfeNumber, table.supplierCnpj),
  ]
);

export type NfeImport = typeof nfeImports.$inferSelect;
export type InsertNfeImport = typeof nfeImports.$inferInsert;

// ─── Captura de Catálogo de Fornecedor ─────────────────────────────────────
export const supplierSessions = mysqlTable("supplier_sessions", {
  id: int("id").autoincrement().primaryKey(),
  supplierId: int("supplierId")
    .notNull()
    .references(() => suppliers.id, { onDelete: "cascade" }),
  
  // Dados de sessão
  cookies: text("cookies"), // JSON stringificado
  localStorage: text("localStorage"), // JSON stringificado (token de SPAs) — criptografado
  sessionToken: text("sessionToken"),
  authHeader: text("authHeader"),
  
  // Status
  status: mysqlEnum("status", ["active", "expired", "invalid", "pending"]).default("pending"),
  lastAuthAt: timestamp("lastAuthAt"),
  expiresAt: timestamp("expiresAt"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SupplierSession = typeof supplierSessions.$inferSelect;
export type InsertSupplierSession = typeof supplierSessions.$inferInsert;

// ─── Logs de Captura ──────────────────────────────────────────────────────
export const productCaptureHistory = mysqlTable("product_capture_history", {
  id: int("id").autoincrement().primaryKey(),
  productId: int("productId")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  supplierId: int("supplierId")
    .notNull()
    .references(() => suppliers.id, { onDelete: "cascade" }),
  
  // Mudança
  fieldChanged: varchar("fieldChanged", { length: 128 }).notNull(),
  valueBefore: text("valueBefore"),
  valueAfter: text("valueAfter"),
  
  // Origem
  changeSource: mysqlEnum("changeSource", ["manual", "validated", "captured", "system"]).default("captured"),
  
  // Status
  status: mysqlEnum("status", ["detected", "approved", "applied", "rejected"]).default("detected"),
  approvedBy: int("approvedBy").references(() => users.id, { onDelete: "set null" }),
  approvedAt: timestamp("approvedAt"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ProductCaptureHistory = typeof productCaptureHistory.$inferSelect;
export type InsertProductCaptureHistory = typeof productCaptureHistory.$inferInsert;

// ─── Erros de Captura ─────────────────────────────────────────────────────
export const enrichmentHistory = mysqlTable(
  "enrichment_history",
  {
    id: int("id").autoincrement().primaryKey(),
    executionId: varchar("executionId", { length: 64 }).notNull().unique(),
    source: mysqlEnum("source", ["nfe_import", "manual", "batch_job", "api"]).notNull(),
    status: mysqlEnum("status", ["pending", "running", "completed", "failed"]).default("pending"),
    totalProducts: int("totalProducts").default(0),
    successCount: int("successCount").default(0),
    failureCount: int("failureCount").default(0),
    skippedCount: int("skippedCount").default(0),
    averageConfidenceScore: decimal("averageConfidenceScore", { precision: 5, scale: 2 }).default("0.00"),
    startedAt: timestamp("startedAt").defaultNow(),
    completedAt: timestamp("completedAt"),
    errorMessage: text("errorMessage"),
    metadata: json("metadata"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("idx_enrichment_history_source").on(table.source),
    index("idx_enrichment_history_status").on(table.status),
    index("idx_enrichment_history_created").on(table.createdAt),
  ]
);

export type EnrichmentHistory = typeof enrichmentHistory.$inferSelect;
export type InsertEnrichmentHistory = typeof enrichmentHistory.$inferInsert;

export const enrichmentResults = mysqlTable(
  "enrichment_results",
  {
    id: int("id").autoincrement().primaryKey(),
    executionId: varchar("executionId", { length: 64 })
      .notNull()
      .references(() => enrichmentHistory.executionId, { onDelete: "cascade" }),
    productId: int("productId")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    fieldName: varchar("fieldName", { length: 128 }).notNull(),
    originalValue: text("originalValue"),
    suggestedValue: text("suggestedValue"),
    appliedValue: text("appliedValue"),
    confidenceScore: decimal("confidenceScore", { precision: 5, scale: 2 }).default("0.00"),
    status: mysqlEnum("status", ["pending", "approved", "rejected", "applied"]).default("pending"),
    reviewNotes: text("reviewNotes"),
    reviewedAt: timestamp("reviewedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("idx_enrichment_results_execution").on(table.executionId),
    index("idx_enrichment_results_product").on(table.productId),
    index("idx_enrichment_results_status").on(table.status),
  ]
);

export type EnrichmentResult = typeof enrichmentResults.$inferSelect;
export type InsertEnrichmentResult = typeof enrichmentResults.$inferInsert;


export const duplicateExceptions = mysqlTable(
  "duplicate_exceptions",
  {
    id: int("id").autoincrement().primaryKey(),
    productId1: int("productId1").notNull().references(() => products.id, { onDelete: "cascade" }),
    productId2: int("productId2").notNull().references(() => products.id, { onDelete: "cascade" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    index("idx_duplicate_exceptions_pair").on(table.productId1, table.productId2),
  ]
);
export type DuplicateException = typeof duplicateExceptions.$inferSelect;
export type InsertDuplicateException = typeof duplicateExceptions.$inferInsert;

export const postAwardContracts = mysqlTable(
  "post_award_contracts",
  {
    id: int("id").autoincrement().primaryKey(),
    proposalId: int("proposalId").references(() => proposals.id, { onDelete: "set null" }),
    orgId: int("orgId").references(() => requestingOrgs.id, { onDelete: "set null" }),
    contractNumber: varchar("contractNumber", { length: 128 }).notNull(),
    processNumber: varchar("processNumber", { length: 128 }),
    editalNumber: varchar("editalNumber", { length: 128 }),
    objectDescription: text("objectDescription"),
    startDate: date("startDate"),
    endDate: date("endDate"),
    baseDate: date("baseDate"),
    valueGlobal: decimal("valueGlobal", { precision: 14, scale: 2 }).default("0.00").notNull(),
    saldoInicial: decimal("saldoInicial", { precision: 14, scale: 2 }).default("0.00").notNull(),
    saldoAtual: decimal("saldoAtual", { precision: 14, scale: 2 }).default("0.00").notNull(),
    reajusteIndex: varchar("reajusteIndex", { length: 64 }),
    gestor: varchar("gestor", { length: 256 }),
    fiscal: varchar("fiscal", { length: 256 }),
    status: mysqlEnum("status", ["draft", "active", "suspended", "expired", "closed"]).default("draft").notNull(),
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    unique("uq_post_award_contract_number").on(table.contractNumber),
    index("idx_post_award_contract_proposal").on(table.proposalId),
    index("idx_post_award_contract_org").on(table.orgId),
    index("idx_post_award_contract_status").on(table.status),
    index("idx_post_award_contract_end_date").on(table.endDate),
  ]
);
export type PostAwardContract = typeof postAwardContracts.$inferSelect;
export type InsertPostAwardContract = typeof postAwardContracts.$inferInsert;

export const contractAlerts = mysqlTable(
  "contract_alerts",
  {
    id: int("id").autoincrement().primaryKey(),
    contractId: int("contractId").notNull().references(() => postAwardContracts.id, { onDelete: "cascade" }),
    alertType: mysqlEnum("alertType", ["vencimento", "reajuste", "saldo", "pendencia", "prorrogacao"]).notNull(),
    severity: mysqlEnum("severity", ["info", "warning", "critical"]).default("warning").notNull(),
    title: varchar("title", { length: 256 }).notNull(),
    description: text("description"),
    dueDate: date("dueDate"),
    status: mysqlEnum("status", ["open", "resolved"]).default("open").notNull(),
    resolvedByUserId: int("resolvedByUserId").references(() => users.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolvedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    index("idx_contract_alerts_contract").on(table.contractId),
    index("idx_contract_alerts_type").on(table.alertType),
    index("idx_contract_alerts_status").on(table.status),
    index("idx_contract_alerts_due").on(table.dueDate),
  ]
);
export type ContractAlert = typeof contractAlerts.$inferSelect;
export type InsertContractAlert = typeof contractAlerts.$inferInsert;

export const operationalCertifications = mysqlTable(
  "operational_certifications",
  {
    id: int("id").autoincrement().primaryKey(),
    entityType: mysqlEnum("entityType", ["supplier", "portal"]).notNull(),
    entityId: int("entityId"),
    entityName: varchar("entityName", { length: 256 }).notNull(),
    status: mysqlEnum("status", ["pending", "approved", "failed", "expired"]).default("pending").notNull(),
    checklist: json("checklist").notNull(),
    evidenceUrl: varchar("evidenceUrl", { length: 512 }),
    notes: text("notes"),
    validUntil: date("validUntil"),
    lastTestedAt: timestamp("lastTestedAt"),
    testedBy: varchar("testedBy", { length: 320 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    unique("uq_operational_certification_entity").on(table.entityType, table.entityName),
    index("idx_operational_certification_status").on(table.status),
    index("idx_operational_certification_type").on(table.entityType),
  ]
);
export type OperationalCertification = typeof operationalCertifications.$inferSelect;
export type InsertOperationalCertification = typeof operationalCertifications.$inferInsert;

export const contractLifecycle = mysqlTable(
  "contract_lifecycle",
  {
    id: int("id").autoincrement().primaryKey(),
    funilId: int("funilId"),
    proposalId: int("proposalId"),
    orgao: varchar("orgao", { length: 256 }).notNull(),
    numeroContrato: varchar("numeroContrato", { length: 128 }).notNull(),
    objeto: text("objeto"),
    valorContratado: decimal("valorContratado", { precision: 15, scale: 2 }).default("0.00").notNull(),
    saldoContratual: decimal("saldoContratual", { precision: 15, scale: 2 }).default("0.00").notNull(),
    inicioVigencia: date("inicioVigencia"),
    fimVigencia: date("fimVigencia"),
    dataBaseReajuste: date("dataBaseReajuste"),
    indiceReajuste: varchar("indiceReajuste", { length: 64 }),
    garantiaVencimento: date("garantiaVencimento"),
    status: mysqlEnum("status", ["draft", "active", "suspended", "expired", "closed", "cancelled"])
      .default("draft")
      .notNull(),
    alerts: json("alerts"),
    notes: text("notes"),
    createdBy: varchar("createdBy", { length: 320 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    unique("uq_contract_number").on(table.numeroContrato),
    index("idx_contract_status").on(table.status),
    index("idx_contract_end_date").on(table.fimVigencia),
    index("idx_contract_funil").on(table.funilId),
  ]
);
export type ContractLifecycle = typeof contractLifecycle.$inferSelect;
export type InsertContractLifecycle = typeof contractLifecycle.$inferInsert;

export const contractItemBalances = mysqlTable(
  "contract_item_balances",
  {
    id: int("id").autoincrement().primaryKey(),
    contractId: int("contractId")
      .notNull()
      .references(() => contractLifecycle.id, { onDelete: "cascade" }),
    description: varchar("description", { length: 512 }).notNull(),
    quantityContracted: decimal("quantityContracted", { precision: 15, scale: 4 }).default("0.0000").notNull(),
    quantityOrdered: decimal("quantityOrdered", { precision: 15, scale: 4 }).default("0.0000").notNull(),
    quantityDelivered: decimal("quantityDelivered", { precision: 15, scale: 4 }).default("0.0000").notNull(),
    quantityInvoiced: decimal("quantityInvoiced", { precision: 15, scale: 4 }).default("0.0000").notNull(),
    unitPrice: decimal("unitPrice", { precision: 15, scale: 4 }).default("0.0000").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [index("idx_contract_item_contract").on(table.contractId)]
);
export type ContractItemBalance = typeof contractItemBalances.$inferSelect;
export type InsertContractItemBalance = typeof contractItemBalances.$inferInsert;

export const executiveAssessments = mysqlTable(
  "executive_assessments",
  {
    id: int("id").autoincrement().primaryKey(),
    opportunityId: int("opportunityId").notNull(),
    score: decimal("score", { precision: 5, scale: 2 }).notNull(),
    recommendation: mysqlEnum("recommendation", ["go", "caution", "no_go"]).notNull(),
    metrics: json("metrics").notNull(),
    blockers: json("blockers").notNull(),
    reasons: json("reasons").notNull(),
    createdBy: varchar("createdBy", { length: 320 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    index("idx_executive_assessment_opportunity").on(table.opportunityId),
    index("idx_executive_assessment_recommendation").on(table.recommendation),
  ]
);
export type ExecutiveAssessment = typeof executiveAssessments.$inferSelect;
export type InsertExecutiveAssessment = typeof executiveAssessments.$inferInsert;

export const capturedProductBatches = mysqlTable(
  "captured_product_batches",
  {
    id: int("id").autoincrement().primaryKey(),
    sourceType: mysqlEnum("sourceType", ["url", "html", "pdf", "spreadsheet", "xml", "docx", "text", "image"]).notNull(),
    sourceLabel: varchar("sourceLabel", { length: 256 }),
    sourceReference: varchar("sourceReference", { length: 512 }),
    status: mysqlEnum("status", ["processing", "review", "approved", "rejected", "applied", "failed"]).default("processing").notNull(),
    totalCaptured: int("totalCaptured").default(0).notNull(),
    totalApproved: int("totalApproved").default(0).notNull(),
    totalRejected: int("totalRejected").default(0).notNull(),
    createdByUserId: int("createdByUserId").references(() => users.id, { onDelete: "set null" }),
    meta: json("meta"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("idx_captured_batches_source_type").on(table.sourceType),
    index("idx_captured_batches_status").on(table.status),
    index("idx_captured_batches_created").on(table.createdAt),
  ]
);
export type CapturedProductBatch = typeof capturedProductBatches.$inferSelect;
export type InsertCapturedProductBatch = typeof capturedProductBatches.$inferInsert;

export const capturedProducts = mysqlTable(
  "captured_products",
  {
    id: int("id").autoincrement().primaryKey(),
    batchId: int("batchId").notNull().references(() => capturedProductBatches.id, { onDelete: "cascade" }),
    matchedProductId: int("matchedProductId").references(() => products.id, { onDelete: "set null" }),
    actionSuggestion: mysqlEnum("actionSuggestion", ["create", "update", "review", "ignore"]).default("review").notNull(),
    duplicateSignal: mysqlEnum("duplicateSignal", ["none", "possible", "probable", "confirmed"]).default("none").notNull(),
    name: varchar("name", { length: 256 }).notNull(),
    brand: varchar("brand", { length: 128 }),
    manufacturer: varchar("manufacturer", { length: 128 }),
    description: text("description"),
    presentation: varchar("presentation", { length: 128 }),
    barcode: varchar("barcode", { length: 64 }),
    sku: varchar("sku", { length: 128 }),
    price: decimal("price", { precision: 12, scale: 2 }),
    unit: varchar("unit", { length: 64 }),
    category: varchar("category", { length: 128 }),
    imageUrl: text("imageUrl"),
    productUrl: text("productUrl"),
    regulatoryData: json("regulatoryData"),
    rawPayload: json("rawPayload"),
    status: mysqlEnum("status", ["pending", "approved", "rejected", "applied"]).default("pending").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("idx_captured_products_batch").on(table.batchId),
    index("idx_captured_products_match").on(table.matchedProductId),
    index("idx_captured_products_status").on(table.status),
    index("idx_captured_products_action").on(table.actionSuggestion),
    index("idx_captured_products_duplicate").on(table.duplicateSignal),
  ]
);
export type CapturedProduct = typeof capturedProducts.$inferSelect;
export type InsertCapturedProduct = typeof capturedProducts.$inferInsert;

export const capturedProductFieldConfidence = mysqlTable(
  "captured_product_field_confidence",
  {
    id: int("id").autoincrement().primaryKey(),
    capturedProductId: int("capturedProductId").notNull().references(() => capturedProducts.id, { onDelete: "cascade" }),
    fieldName: varchar("fieldName", { length: 128 }).notNull(),
    confidenceScore: decimal("confidenceScore", { precision: 5, scale: 2 }).default("0.00").notNull(),
    extractionMethod: varchar("extractionMethod", { length: 64 }),
    sourceSnippet: text("sourceSnippet"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    index("idx_captured_confidence_product").on(table.capturedProductId),
    index("idx_captured_confidence_field").on(table.fieldName),
  ]
);
export type CapturedProductFieldConfidence = typeof capturedProductFieldConfidence.$inferSelect;
export type InsertCapturedProductFieldConfidence = typeof capturedProductFieldConfidence.$inferInsert;

export const capturedProductSourceLogs = mysqlTable(
  "captured_product_source_logs",
  {
    id: int("id").autoincrement().primaryKey(),
    batchId: int("batchId").notNull().references(() => capturedProductBatches.id, { onDelete: "cascade" }),
    capturedProductId: int("capturedProductId").references(() => capturedProducts.id, { onDelete: "set null" }),
    sourceType: mysqlEnum("sourceType", ["url", "html", "pdf", "spreadsheet", "xml", "docx", "text", "image"]).notNull(),
    sourceReference: varchar("sourceReference", { length: 512 }),
    logLevel: mysqlEnum("logLevel", ["info", "warning", "error"]).default("info").notNull(),
    message: text("message").notNull(),
    payload: json("payload"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    index("idx_captured_logs_batch").on(table.batchId),
    index("idx_captured_logs_product").on(table.capturedProductId),
    index("idx_captured_logs_level").on(table.logLevel),
  ]
);
export type CapturedProductSourceLog = typeof capturedProductSourceLogs.$inferSelect;
export type InsertCapturedProductSourceLog = typeof capturedProductSourceLogs.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// Cotações recebidas por e-mail (Compras MG/COTEP, FUNARB, COPASA, Cemig, etc.)
// Um e-mail de pedido de cotação vira um registro com N itens; cada item é
// cruzado com o catálogo de produtos (matching por código CATMAS/CATMAT ou nome).
// ─────────────────────────────────────────────────────────────────────────────
export const emailQuotations = mysqlTable(
  "email_quotations",
  {
    id: int("id").autoincrement().primaryKey(),
    // Identificador único da mensagem (Message-ID) para deduplicação
    messageId: varchar("messageId", { length: 512 }).notNull().unique(),
    fromAddress: varchar("fromAddress", { length: 320 }),
    fromName: varchar("fromName", { length: 256 }),
    subject: varchar("subject", { length: 512 }),
    orgao: varchar("orgao", { length: 256 }),          // órgão identificado (heurística)
    bodyText: text("bodyText"),
    receivedAt: timestamp("receivedAt"),
    // Prazo para responder a cotação (para alertas de prazo)
    prazoResposta: date("prazoResposta"),
    // Origem da extração dos itens
    sourceType: mysqlEnum("sourceType", ["spreadsheet", "pdf", "docx", "image", "body", "manual"]).default("body").notNull(),
    sourceFilename: varchar("sourceFilename", { length: 512 }),
    status: mysqlEnum("status", ["nova", "processando", "revisao", "respondida", "descartada", "erro"])
      .default("nova")
      .notNull(),
    totalItems: int("totalItems").notNull().default(0),
    matchedItems: int("matchedItems").notNull().default(0),
    errorMessage: text("errorMessage"),
    // Resultado da disputa (análise de vitória/derrota)
    resultado: mysqlEnum("resultado", ["pendente", "ganhou", "perdeu", "cancelada"])
      .default("pendente")
      .notNull(),
    // Valor total que propusemos (para comparar com o vencedor)
    valorProposto: decimal("valorProposto", { precision: 15, scale: 2 }),
    // Valor do concorrente vencedor (quando perdemos)
    valorVencedor: decimal("valorVencedor", { precision: 15, scale: 2 }),
    categoria: varchar("categoria", { length: 128 }),   // categoria dominante (para segmentar win rate)
    resultadoObs: text("resultadoObs"),
    resultadoEm: timestamp("resultadoEm"),
    // Proposta gerada automaticamente pelo pipeline (PDF pronto para revisão/envio)
    propostaPdfUrl: text("propostaPdfUrl"),
    propostaGeradaEm: timestamp("propostaGeradaEm"),
    propostaMargemPercent: decimal("propostaMargemPercent", { precision: 5, scale: 2 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("idx_email_quotations_status").on(table.status),
    index("idx_email_quotations_received").on(table.receivedAt),
    index("idx_email_quotations_from").on(table.fromAddress),
    index("idx_email_quotations_prazo").on(table.prazoResposta),
    index("idx_email_quotations_resultado").on(table.resultado),
  ]
);
export type EmailQuotation = typeof emailQuotations.$inferSelect;
export type InsertEmailQuotation = typeof emailQuotations.$inferInsert;

export const emailQuotationItems = mysqlTable(
  "email_quotation_items",
  {
    id: int("id").autoincrement().primaryKey(),
    quotationId: int("quotationId").notNull().references(() => emailQuotations.id, { onDelete: "cascade" }),
    numeroItem: int("numeroItem"),
    descricao: text("descricao").notNull(),
    quantidade: decimal("quantidade", { precision: 15, scale: 4 }),
    unidade: varchar("unidade", { length: 64 }),
    codigoCatalogo: varchar("codigoCatalogo", { length: 64 }),   // CATMAS/CATMAT informado no pedido
    // Resultado do matching contra o catálogo
    produtoMatchId: int("produtoMatchId"),
    matchScore: decimal("matchScore", { precision: 5, scale: 4 }), // 0.0000 a 1.0000
    matchMethod: mysqlEnum("matchMethod", ["catmas", "catmat", "nome", "manual", "nenhum"]).default("nenhum").notNull(),
    matchConfirmado: boolean("matchConfirmado").notNull().default(false),
    // Trilha de auditoria: a confirmação foi feita pelo pipeline automático?
    matchAuto: boolean("matchAuto").notNull().default(false),
    precoSugerido: decimal("precoSugerido", { precision: 15, scale: 4 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("idx_email_quotation_items_quotation").on(table.quotationId),
    index("idx_email_quotation_items_produto").on(table.produtoMatchId),
    index("idx_email_quotation_items_catalogo").on(table.codigoCatalogo),
  ]
);
export type EmailQuotationItem = typeof emailQuotationItems.$inferSelect;
export type InsertEmailQuotationItem = typeof emailQuotationItems.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// Certidões e documentos de habilitação da empresa (com controle de validade).
// Perder habilitação por certidão vencida é o erro mais caro em licitação.
// ─────────────────────────────────────────────────────────────────────────────
export const certidoes = mysqlTable(
  "certidoes",
  {
    id: int("id").autoincrement().primaryKey(),
    tipo: varchar("tipo", { length: 128 }).notNull(),        // ex: CND Federal, FGTS, Trabalhista
    orgaoEmissor: varchar("orgaoEmissor", { length: 256 }),
    numero: varchar("numero", { length: 128 }),
    dataEmissao: date("dataEmissao"),
    dataValidade: date("dataValidade").notNull(),
    arquivoUrl: text("arquivoUrl"),
    observacoes: text("observacoes"),
    ativa: boolean("ativa").notNull().default(true),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("idx_certidoes_validade").on(table.dataValidade),
    index("idx_certidoes_tipo").on(table.tipo),
    index("idx_certidoes_ativa").on(table.ativa),
  ]
);
export type Certidao = typeof certidoes.$inferSelect;
export type InsertCertidao = typeof certidoes.$inferInsert;

// Progresso de jobs de importação (persistido para sobreviver a restart).
export const importProgress = mysqlTable("import_progress", {
  queueId: varchar("queueId", { length: 64 }).primaryKey(),
  status: varchar("status", { length: 32 }),
  progressJson: text("progressJson").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ImportProgressRow = typeof importProgress.$inferSelect;

// Credenciais dos portais de licitação (senha criptografada). Uso interno.
export const portalCredentials = mysqlTable(
  "portal_credentials",
  {
    id: int("id").autoincrement().primaryKey(),
    portal: varchar("portal", { length: 32 }).notNull(), // comprasnet|comprasmg|fundep|funarbe|copasa|agrega|generico
    apelido: varchar("apelido", { length: 128 }),          // nome amigável
    loginUrl: text("loginUrl"),                            // sobrescreve a URL padrão do portal
    usuario: varchar("usuario", { length: 256 }).notNull(),// login/CNPJ/CPF
    senhaCriptografada: text("senhaCriptografada").notNull(),
    cnpj: varchar("cnpj", { length: 18 }),
    ativo: boolean("ativo").notNull().default(true),
    // Reuso de sessão autenticada (cookies do Puppeteer, criptografados) —
    // evita logar de novo a cada execução do radar (menos exposição a CAPTCHA
    // e a bloqueio de conta por tentativas repetidas de login).
    sessaoCookies: text("sessaoCookies"),
    sessaoExpiraEm: timestamp("sessaoExpiraEm"),
    // Falhas de login consecutivas — protege contra bloqueio de conta por
    // tentativas repetidas quando a senha está errada ou o seletor quebrou.
    // Zera a cada login bem-sucedido; ao atingir o limite, a descoberta
    // autenticada para de tentar até o operador corrigir/recadastrar.
    loginFailCount: int("loginFailCount").notNull().default(0),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("idx_portal_credentials_portal").on(table.portal),
    index("idx_portal_credentials_ativo").on(table.ativo),
  ]
);
export type PortalCredentialRow = typeof portalCredentials.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────────
// Funil de Oportunidades: pipeline unificado (kanban) de todas as disputas,
// da triagem ao recebimento, com histórico auditável de movimentação.
// ─────────────────────────────────────────────────────────────────────────────
export const ETAPAS_FUNIL = [
  "nova",
  "triagem",
  "analise",
  "cotacao",
  "precificacao",
  "proposta",
  "enviada",
  "disputa",
  "habilitacao",
  "vencida",
  "perdida",
  "cancelada",
  "contrato",
  "entrega",
  "faturamento",
  "recebimento",
  "encerrada",
] as const;
export type EtapaFunil = (typeof ETAPAS_FUNIL)[number];

export const funilOportunidades = mysqlTable(
  "funil_oportunidades",
  {
    id: int("id").autoincrement().primaryKey(),
    titulo: varchar("titulo", { length: 512 }).notNull(),
    orgao: varchar("orgao", { length: 256 }),
    modalidade: varchar("modalidade", { length: 128 }),
    numeroProcesso: varchar("numeroProcesso", { length: 128 }),
    objeto: text("objeto"),
    // De onde a oportunidade veio (para rastreabilidade e navegação)
    origemTipo: mysqlEnum("origemTipo", ["manual", "pncp", "email", "edital"]).default("manual").notNull(),
    origemId: int("origemId"),
    etapa: mysqlEnum("etapa", ETAPAS_FUNIL).default("nova").notNull(),
    valorEstimado: decimal("valorEstimado", { precision: 15, scale: 2 }),
    dataAbertura: timestamp("dataAbertura"),
    prazoEnvio: date("prazoEnvio"),
    risco: mysqlEnum("risco", ["baixo", "medio", "alto"]).default("medio").notNull(),
    responsavel: varchar("responsavel", { length: 128 }),
    observacoes: text("observacoes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("idx_funil_etapa").on(table.etapa),
    index("idx_funil_prazo").on(table.prazoEnvio),
    index("idx_funil_orgao").on(table.orgao),
    index("idx_funil_origem").on(table.origemTipo, table.origemId),
  ]
);
export type FunilOportunidade = typeof funilOportunidades.$inferSelect;

export const funilEventos = mysqlTable(
  "funil_eventos",
  {
    id: int("id").autoincrement().primaryKey(),
    oportunidadeId: int("oportunidadeId")
      .notNull()
      .references(() => funilOportunidades.id, { onDelete: "cascade" }),
    deEtapa: varchar("deEtapa", { length: 32 }),
    paraEtapa: varchar("paraEtapa", { length: 32 }).notNull(),
    justificativa: text("justificativa"),
    usuario: varchar("usuario", { length: 128 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [index("idx_funil_eventos_oportunidade").on(table.oportunidadeId)]
);
export type FunilEvento = typeof funilEventos.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────────
// Motor Tributário (Tax Engine): regras versionadas com vigência, por UF.
// O sistema NÃO afirma enquadramento — calcula estimativas a partir das
// regras cadastradas (validação contábil é responsabilidade do operador).
// ─────────────────────────────────────────────────────────────────────────────
export const taxRules = mysqlTable(
  "tax_rules",
  {
    id: int("id").autoincrement().primaryKey(),
    descricao: varchar("descricao", { length: 256 }).notNull(),
    tipo: mysqlEnum("tipo", ["simples_efetiva", "icms", "difal", "st", "fcp", "iss", "ipi", "pis", "cofins", "outro"]).notNull(),
    // null = vale para qualquer UF
    ufOrigem: varchar("ufOrigem", { length: 2 }),
    ufDestino: varchar("ufDestino", { length: 2 }),
    percentual: decimal("percentual", { precision: 6, scale: 3 }).notNull(),
    vigenciaInicio: date("vigenciaInicio").notNull(),
    vigenciaFim: date("vigenciaFim"),
    ativo: boolean("ativo").notNull().default(true),
    observacoes: text("observacoes"),
    criadoPor: varchar("criadoPor", { length: 128 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("idx_tax_rules_tipo").on(table.tipo),
    index("idx_tax_rules_uf").on(table.ufDestino),
    index("idx_tax_rules_ativo").on(table.ativo),
  ]
);
export type TaxRule = typeof taxRules.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────────
// Motor de Fretes (Freight Engine): cotações de frete registradas (manuais ou
// de tabelas negociadas), separando frete de ENTRADA (fornecedor → empresa)
// e de SAÍDA (empresa/fornecedor → órgão). Integrações com APIs de
// transportadoras ficam como interface pendente (spec §39).
// ─────────────────────────────────────────────────────────────────────────────
export const freightQuotes = mysqlTable(
  "freight_quotes",
  {
    id: int("id").autoincrement().primaryKey(),
    descricao: varchar("descricao", { length: 256 }).notNull(),
    tipo: mysqlEnum("tipo", ["entrada", "saida"]).notNull(),
    transportadora: varchar("transportadora", { length: 128 }),
    origemCep: varchar("origemCep", { length: 9 }),
    destinoCep: varchar("destinoCep", { length: 9 }),
    ufDestino: varchar("ufDestino", { length: 2 }),
    pesoKg: decimal("pesoKg", { precision: 10, scale: 3 }),
    valorFrete: decimal("valorFrete", { precision: 12, scale: 2 }).notNull(),
    prazoDias: int("prazoDias"),
    validade: date("validade"),
    // Vínculos opcionais para rastreabilidade
    funilId: int("funilId"),
    supplierId: int("supplierId"),
    observacoes: text("observacoes"),
    criadoPor: varchar("criadoPor", { length: 128 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("idx_freight_tipo").on(table.tipo),
    index("idx_freight_uf").on(table.ufDestino),
    index("idx_freight_funil").on(table.funilId),
  ]
);
export type FreightQuote = typeof freightQuotes.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────────
// Pós-venda (spec §20-23): venda confirmada → pedido de compra ao fornecedor
// → entrega → nota fiscal → recebimento; contas a pagar e fluxo de caixa.
// ─────────────────────────────────────────────────────────────────────────────
export const purchaseOrders = mysqlTable(
  "purchase_orders",
  {
    id: int("id").autoincrement().primaryKey(),
    funilId: int("funilId"),
    // Proposta comercial vencedora que originou este pedido — fecha o ciclo
    // proposta → pedido (antes o pedido era digitado do zero, sem herdar
    // nada da proposta). Ver posVenda.criarPedidoDeProposta.
    proposalId: int("proposalId").references(() => proposals.id, { onDelete: "set null" }),
    supplierId: int("supplierId"),
    fornecedorNome: varchar("fornecedorNome", { length: 256 }).notNull(),
    descricao: varchar("descricao", { length: 512 }).notNull(),
    valorTotal: decimal("valorTotal", { precision: 15, scale: 2 }).notNull(),
    prazoEntrega: date("prazoEntrega"),
    vinculo: varchar("vinculo", { length: 256 }), // contrato/empenho/AF de referência
    status: mysqlEnum("status", [
      "solicitado", "confirmado", "faturado", "enviado", "recebido", "divergente", "cancelado",
    ]).default("solicitado").notNull(),
    observacoes: text("observacoes"),
    criadoPor: varchar("criadoPor", { length: 128 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_po_status").on(t.status),
    index("idx_po_funil").on(t.funilId),
    index("idx_po_proposal").on(t.proposalId),
  ]
);
export type PurchaseOrder = typeof purchaseOrders.$inferSelect;

export const purchaseOrderItems = mysqlTable(
  "purchase_order_items",
  {
    id: int("id").autoincrement().primaryKey(),
    orderId: int("orderId").notNull().references(() => purchaseOrders.id, { onDelete: "cascade" }),
    descricao: varchar("descricao", { length: 512 }).notNull(),
    quantidade: decimal("quantidade", { precision: 15, scale: 4 }).notNull(),
    precoUnit: decimal("precoUnit", { precision: 15, scale: 4 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("idx_poi_order").on(t.orderId)]
);

export const deliveries = mysqlTable(
  "deliveries",
  {
    id: int("id").autoincrement().primaryKey(),
    orderId: int("orderId"),
    funilId: int("funilId"),
    descricao: varchar("descricao", { length: 512 }).notNull(),
    transportadora: varchar("transportadora", { length: 128 }),
    rastreio: varchar("rastreio", { length: 128 }),
    previsao: date("previsao"),
    entregueEm: date("entregueEm"),
    recebedor: varchar("recebedor", { length: 128 }),
    status: mysqlEnum("status", ["preparando", "transito", "entregue", "atrasada", "devolvida"])
      .default("preparando").notNull(),
    observacoes: text("observacoes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [index("idx_del_status").on(t.status), index("idx_del_previsao").on(t.previsao)]
);
export type Delivery = typeof deliveries.$inferSelect;

// Notas fiscais de venda (contas a RECEBER)
export const salesInvoices = mysqlTable(
  "sales_invoices",
  {
    id: int("id").autoincrement().primaryKey(),
    funilId: int("funilId"),
    numero: varchar("numero", { length: 64 }).notNull(),
    orgao: varchar("orgao", { length: 256 }).notNull(),
    valorBruto: decimal("valorBruto", { precision: 15, scale: 2 }).notNull(),
    retencoes: decimal("retencoes", { precision: 15, scale: 2 }).default("0.00").notNull(),
    dataEmissao: date("dataEmissao").notNull(),
    vencimento: date("vencimento"),
    recebidoEm: date("recebidoEm"),
    status: mysqlEnum("status", ["emitida", "atestada", "liquidada", "paga", "cancelada"])
      .default("emitida").notNull(),
    observacoes: text("observacoes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_si_status").on(t.status),
    index("idx_si_vencimento").on(t.vencimento),
    index("idx_si_funil").on(t.funilId),
  ]
);
export type SalesInvoice = typeof salesInvoices.$inferSelect;

// Contas a PAGAR
export const payables = mysqlTable(
  "payables",
  {
    id: int("id").autoincrement().primaryKey(),
    descricao: varchar("descricao", { length: 512 }).notNull(),
    credor: varchar("credor", { length: 256 }),
    categoria: mysqlEnum("categoria", ["fornecedor", "frete", "imposto", "taxa", "despesa"])
      .default("fornecedor").notNull(),
    valor: decimal("valor", { precision: 15, scale: 2 }).notNull(),
    vencimento: date("vencimento").notNull(),
    pagoEm: date("pagoEm"),
    orderId: int("orderId"),
    observacoes: text("observacoes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [index("idx_pay_vencimento").on(t.vencimento), index("idx_pay_pago").on(t.pagoEm)]
);
export type Payable = typeof payables.$inferSelect;

/**
 * ai_usage_daily: consumo de IA agregado por dia/provedor/modelo.
 * Persistido a cada chamada (upsert) — o consumo não some no restart e a
 * Central de IA mostra custo estimado acumulado, não só desde o boot.
 */
export const aiUsageDaily = mysqlTable(
  "ai_usage_daily",
  {
    id: int("id").autoincrement().primaryKey(),
    // Dia em UTC no formato YYYY-MM-DD
    dia: varchar("dia", { length: 10 }).notNull(),
    provider: varchar("provider", { length: 32 }).notNull(),
    model: varchar("model", { length: 128 }).notNull(),
    chamadas: int("chamadas").default(0).notNull(),
    promptTokens: int("promptTokens").default(0).notNull(),
    completionTokens: int("completionTokens").default(0).notNull(),
    // Custo estimado em USD pela tabela de preços do provedor (0 quando o
    // modelo não está na tabela — ex.: tier gratuito).
    custoUsd: decimal("custoUsd", { precision: 12, scale: 6 }).default("0").notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [uniqueIndex("uq_ai_usage_dia_prov_model").on(t.dia, t.provider, t.model)]
);
export type AiUsageDaily = typeof aiUsageDaily.$inferSelect;

/**
 * ai_jobs: execuções em segundo plano de operações de IA em massa
 * (enriquecimento de ficha técnica, reclassificação). A mutation tRPC apenas
 * cria o job e retorna o id; o processamento roda em background e o cliente
 * acompanha por polling — nada de request de minutos segurando conexão.
 * status: "executando" | "concluido" | "erro" | "cancelado"
 */
export const aiJobs = mysqlTable(
  "ai_jobs",
  {
    id: int("id").autoincrement().primaryKey(),
    tipo: varchar("tipo", { length: 64 }).notNull(), // ficha_tecnica | reclassificacao
    status: varchar("status", { length: 32 }).default("executando").notNull(),
    payload: json("payload"),
    // { processed, total, updated, skipped, errors }
    progresso: json("progresso").$type<{
      processed: number;
      total: number;
      updated: number;
      skipped: number;
      errors: number;
    }>(),
    errorMessages: json("errorMessages").$type<string[]>(),
    requestedBy: int("requestedBy"),
    iniciadoEm: timestamp("iniciadoEm").defaultNow().notNull(),
    concluidoEm: timestamp("concluidoEm"),
  },
  (t) => [index("idx_ai_jobs_status").on(t.status), index("idx_ai_jobs_tipo").on(t.tipo)]
);
export type AiJob = typeof aiJobs.$inferSelect;

/**
 * email_settings: configuração de IMAP/SMTP pela interface (linha única).
 * Senhas criptografadas com o cofre (AES-256-GCM). Quando presente, tem
 * precedência sobre as variáveis de ambiente — que seguem como fallback
 * para instalações configuradas por .env.
 */
export const emailSettings = mysqlTable("email_settings", {
  id: int("id").autoincrement().primaryKey(),
  imapHost: varchar("imapHost", { length: 256 }),
  imapPort: int("imapPort"),
  imapUser: varchar("imapUser", { length: 320 }),
  imapPasswordEnc: text("imapPasswordEnc"),
  imapTls: boolean("imapTls").default(true).notNull(),
  imapMailbox: varchar("imapMailbox", { length: 128 }),
  smtpHost: varchar("smtpHost", { length: 256 }),
  smtpPort: int("smtpPort"),
  smtpUser: varchar("smtpUser", { length: 320 }),
  smtpPasswordEnc: text("smtpPasswordEnc"),
  smtpSecure: boolean("smtpSecure").default(false).notNull(),
  smtpFrom: varchar("smtpFrom", { length: 320 }),
  // Filtro de seleção de e-mails: remetentes e palavras-chave de assunto
  // aceitos como pedidos de cotação (o restante é ignorado pela sincronização).
  senderFilter: text("senderFilter"),
  subjectKeywordFilter: text("subjectKeywordFilter"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type EmailSettings = typeof emailSettings.$inferSelect;

/**
 * ai_settings: chaves e preferências de IA configuráveis pela interface
 * (linha única). Chaves criptografadas no cofre (AES-256-GCM). Quando
 * presentes, têm precedência sobre as variáveis de ambiente — que seguem
 * como fallback para instalações configuradas por .env.
 */
export const aiSettings = mysqlTable("ai_settings", {
  id: int("id").autoincrement().primaryKey(),
  // "auto" | "anthropic" | "groq"
  aiProvider: varchar("aiProvider", { length: 16 }),
  anthropicApiKeyEnc: text("anthropicApiKeyEnc"),
  anthropicModel: varchar("anthropicModel", { length: 128 }),
  groqApiKeyEnc: text("groqApiKeyEnc"),
  groqModel: varchar("groqModel", { length: 128 }),
  forgeApiUrl: varchar("forgeApiUrl", { length: 512 }),
  forgeApiKeyEnc: text("forgeApiKeyEnc"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type AiSettings = typeof aiSettings.$inferSelect;

/**
 * integration_settings: credenciais e parâmetros de integrações configurados
 * pela interface (chave→valor, valores criptografados no cofre AES-256-GCM).
 * Complementa ai_settings e email_settings cobrindo WhatsApp e demais
 * integrações; aplicado em process.env no boot e a cada salvamento — a
 * configuração vale para o sistema inteiro sem reiniciar.
 */
export const integrationSettings = mysqlTable(
  "integration_settings",
  {
    id: int("id").autoincrement().primaryKey(),
    chave: varchar("chave", { length: 64 }).notNull(),
    valorEnc: text("valorEnc"),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [uniqueIndex("uq_integration_chave").on(t.chave)]
);
export type IntegrationSetting = typeof integrationSettings.$inferSelect;

// ─── RAG: Motor de Equivalências por Vetores (migration 0020) ───────────────
// product_embeddings armazena o vetor (JSON, 768 dim — nomic-embed-text)
// gerado a partir do digest canônico do produto. A busca por similaridade de
// cosseno é feita em memória sobre os candidatos pré-filtrados; sem dependência
// de extensão vetorial do MySQL 8.0.
export const productEmbeddings = mysqlTable(
  "product_embeddings",
  {
    id: int("id").autoincrement().primaryKey(),
    productId: int("productId").notNull(),
    provider: varchar("provider", { length: 32 }).notNull().default("nomic-embed-text"),
    model: varchar("model", { length: 64 }).notNull().default("nomic-embed-text"),
    dimensions: int("dimensions").notNull().default(768),
    embedding: json("embedding").notNull().$type<number[]>(),
    textDigest: text("textDigest").notNull(),
    version: int("version").notNull().default(1),
    indexedAt: timestamp("indexedAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [uniqueIndex("uq_product_embedding_version").on(t.productId, t.version)]
);
export type ProductEmbedding = typeof productEmbeddings.$inferSelect;
export type InsertProductEmbedding = typeof productEmbeddings.$inferInsert;

// rag_config: chaves de configuração lidas por `ragConfig.get()` (Fonte Única).
export const ragConfig = mysqlTable(
  "rag_config",
  {
    id: int("id").autoincrement().primaryKey(),
    key: varchar("key", { length: 64 }).notNull().unique(),
    value: varchar("value", { length: 512 }).notNull(),
    description: text("description"),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [uniqueIndex("uq_rag_config_key").on(t.key)]
);
export type RagConfigRow = typeof ragConfig.$inferSelect;
