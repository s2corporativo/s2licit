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
export const supplierImports = mysqlTable(
  "supplier_imports",
  {
    id: int("id").autoincrement().primaryKey(),
    supplierId: int("supplierId")
      .notNull()
      .references(() => suppliers.id, { onDelete: "cascade" }),
    fileName: varchar("fileName", { length: 256 }).notNull(),
    fileContent: text("fileContent"),
    productsImported: int("productsImported").default(0),
    productsMatched: int("productsMatched").default(0),
    status: mysqlEnum("status", ["pending", "processing", "completed", "failed"]).default("pending"),
    errorMessage: text("errorMessage"),
    importedAt: timestamp("importedAt").defaultNow().notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    index("idx_supplier_imports_supplier").on(table.supplierId),
    index("idx_supplier_imports_status").on(table.status),
  ]
);

export type SupplierImport = typeof supplierImports.$inferSelect;
export type InsertSupplierImport = typeof supplierImports.$inferInsert;

// Produtos
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
    // Cobertura: catalogHealth, actionQueue, extendedStats (isActive + fichaTecnica)
    index("idx_products_active_ficha").on(table.isActive, table.fichaTecnica),
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
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

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
export const quotations = mysqlTable("quotations", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 256 }).notNull(),
  clientName: varchar("clientName", { length: 256 }),
  clientContact: varchar("clientContact", { length: 256 }),
  notes: text("notes"),
  status: mysqlEnum("status", ["draft", "finalized"]).default("draft").notNull(),
  validUntil: timestamp("validUntil"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Quotation = typeof quotations.$inferSelect;
export type InsertQuotation = typeof quotations.$inferInsert;

// Itens do orçamento
export const quotationItems = mysqlTable(
  "quotation_items",
  {
    id: int("id").autoincrement().primaryKey(),
    quotationId: int("quotationId")
      .notNull()
      .references(() => quotations.id, { onDelete: "cascade" }),
    productId: int("productId").references(() => products.id, { onDelete: "set null" }),
    productName: varchar("productName", { length: 512 }).notNull(),
    supplierName: varchar("supplierName", { length: 256 }),
    activeIngredient: varchar("activeIngredient", { length: 512 }),
    manufacturer: varchar("manufacturer", { length: 256 }),
    concentration: varchar("concentration", { length: 128 }),
    presentation: varchar("presentation", { length: 256 }),
    unit: varchar("unit", { length: 64 }),
    price: decimal("price", { precision: 12, scale: 2 }),
    priceUnit: varchar("priceUnit", { length: 64 }),
    quantity: int("quantity").default(1).notNull(),
    sortOrder: int("sortOrder").default(0),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    index("idx_qitems_quotation").on(table.quotationId),
  ]
);

export type QuotationItem = typeof quotationItems.$inferSelect;
export type InsertQuotationItem = typeof quotationItems.$inferInsert;

// Configurações da empresa (singleton)
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
  regrasTributariasId: int("regrasTributariasId"),
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
export const productImages = mysqlTable(
  "product_images",
  {
    id: int("id").autoincrement().primaryKey(),
    productId: int("productId").notNull().references(() => products.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    fileHash: varchar("fileHash", { length: 64 }),
    source: mysqlEnum("source", ["import_url", "manual_upload"]).default("manual_upload").notNull(),
    isPrimary: mysqlEnum("isPrimary", ["yes", "no"]).default("no").notNull(),
    status: mysqlEnum("status", ["pending", "success", "failed"]).default("success").notNull(),
    importBatchId: int("importBatchId"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("idx_pimg_product").on(t.productId), index("idx_pimg_hash").on(t.fileHash)]
);
export type ProductImage = typeof productImages.$inferSelect;
export type InsertProductImage = typeof productImages.$inferInsert;

// ─── Templates de Declarações Fixas ──────────────────────────────────────────
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
export const licitacaoResultados = mysqlTable(
  "licitacao_resultados",
  {
    id: int("id").autoincrement().primaryKey(),
    proposalId: int("proposalId").notNull().references(() => proposals.id, { onDelete: "cascade" }),
    statusFinal: mysqlEnum("statusFinal", ["ganhou", "perdeu", "desclassificado"]).notNull(),
    suaColocacao: int("suaColocacao"),
    vencedorNome: varchar("vencedorNome", { length: 256 }),
    vencedorTotal: decimal("vencedorTotal", { precision: 14, scale: 2 }),
    diferencaPercent: decimal("diferencaPercent", { precision: 8, scale: 2 }),
    encerradaEm: timestamp("encerradaEm"),
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("idx_licit_proposal").on(t.proposalId)]
);
export type LicitacaoResultado = typeof licitacaoResultados.$inferSelect;
export type InsertLicitacaoResultado = typeof licitacaoResultados.$inferInsert;

// ─── Estoque ──────────────────────────────────────────────────────────────────
export const estoque = mysqlTable(
  "estoque",
  {
    id: int("id").autoincrement().primaryKey(),
    productId: int("productId").notNull().references(() => products.id, { onDelete: "cascade" }).unique(),
    quantidade: decimal("quantidade", { precision: 12, scale: 3 }).default("0").notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [index("idx_estoque_product").on(t.productId)]
);
export type Estoque = typeof estoque.$inferSelect;

export const estoqueReservas = mysqlTable(
  "estoque_reservas",
  {
    id: int("id").autoincrement().primaryKey(),
    proposalId: int("proposalId").notNull().references(() => proposals.id, { onDelete: "cascade" }),
    productId: int("productId").notNull().references(() => products.id, { onDelete: "cascade" }),
    quantidade: decimal("quantidade", { precision: 12, scale: 3 }).notNull(),
    status: mysqlEnum("status", ["reservado", "liberado", "consumido"]).default("reservado").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("idx_ereserva_proposal").on(t.proposalId), index("idx_ereserva_product").on(t.productId)]
);
export type EstoqueReserva = typeof estoqueReservas.$inferSelect;

// ─── Regras Tributárias ───────────────────────────────────────────────────────
export const regrasTributarias = mysqlTable("regras_tributarias", {
  id: int("id").autoincrement().primaryKey(),
  tipoCliente: varchar("tipoCliente", { length: 128 }).notNull(),
  icmsPercent: decimal("icmsPercent", { precision: 6, scale: 2 }).default("0"),
  stPercent: decimal("stPercent", { precision: 6, scale: 2 }).default("0"),
  retencoes: int("retencoes").default(0),
  isActive: mysqlEnum("isActive", ["yes", "no"]).default("yes").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type RegraTributaria = typeof regrasTributarias.$inferSelect;
export type InsertRegraTributaria = typeof regrasTributarias.$inferInsert;

// ─── Contratos e Reajustes ────────────────────────────────────────────────────
export const contratos = mysqlTable(
  "contratos",
  {
    id: int("id").autoincrement().primaryKey(),
    proposalId: int("proposalId").references(() => proposals.id, { onDelete: "set null" }),
    indice: varchar("indice", { length: 64 }).notNull().default("IPCA"),
    periodicidadeMeses: int("periodicidadeMeses").default(12),
    dataBase: timestamp("dataBase"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("idx_contrato_proposal").on(t.proposalId)]
);
export type Contrato = typeof contratos.$inferSelect;
export type InsertContrato = typeof contratos.$inferInsert;

export const contratoReajustes = mysqlTable(
  "contrato_reajustes",
  {
    id: int("id").autoincrement().primaryKey(),
    contratoId: int("contratoId").notNull().references(() => contratos.id, { onDelete: "cascade" }),
    fator: decimal("fator", { precision: 8, scale: 6 }).notNull(),
    dataBase: timestamp("dataBase").notNull(),
    aplicadoEm: timestamp("aplicadoEm").defaultNow().notNull(),
    notes: text("notes"),
  },
  (t) => [index("idx_creajuste_contrato").on(t.contratoId)]
);
export type ContratoReajuste = typeof contratoReajustes.$inferSelect;

// ─── Sinônimos para Matching ──────────────────────────────────────────────────
// Cada registro mapeia um termo (abreviação, variação, nome popular) para o
// termo canônico (princípio ativo ou nome padrão do catálogo).
// Ex: "IVERMEC" → "ivermectina", "AMOX" → "amoxicilina"
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

// ─── Licitações Compras.gov.br ────────────────────────────────────────────────
// Armazena licitações buscadas automaticamente da API de Dados Abertos do
// Compras.gov.br. A janela de busca é sempre os últimos 15 dias.
// rawJson preserva o payload original para auditoria.
export const govLicitations = mysqlTable(
  "gov_licitations",
  {
    id: int("id").autoincrement().primaryKey(),
    source: varchar("source", { length: 64 }).default("comprasgov").notNull(),
    // Identificador único da licitação no Compras.gov.br
    externalId: varchar("externalId", { length: 256 }).notNull().unique(),
    uasg: varchar("uasg", { length: 64 }),
    numeroAviso: varchar("numeroAviso", { length: 128 }),
    objeto: text("objeto").notNull(),
    ufSigla: varchar("ufSigla", { length: 4 }),
    razaoSocial: varchar("razaoSocial", { length: 512 }),
    dataPublicacao: timestamp("dataPublicacao"),
    dataAbertura: timestamp("dataAbertura"),
    rawJson: json("rawJson"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_govlic_extid").on(t.externalId),
    index("idx_govlic_datapub").on(t.dataPublicacao),
    index("idx_govlic_uasg").on(t.uasg),
  ]
);
export type GovLicitation = typeof govLicitations.$inferSelect;
export type InsertGovLicitation = typeof govLicitations.$inferInsert;

// Itens de cada licitação, filtrados para veterinários.
// matchedProductId aponta para o produto do catálogo mais próximo.
export const govLicitationItems = mysqlTable(
  "gov_licitation_items",
  {
    id: int("id").autoincrement().primaryKey(),
    govLicitationId: int("govLicitationId").notNull().references(() => govLicitations.id, { onDelete: "cascade" }),
    descricaoItem: text("descricaoItem").notNull(),
    quantidade: decimal("quantidade", { precision: 12, scale: 3 }).default("1"),
    unidade: varchar("unidade", { length: 64 }),
    valorEstimado: decimal("valorEstimado", { precision: 14, scale: 4 }),
    // Campos extraídos via regex/dicionário do descricaoItem
    activeIngredient: varchar("activeIngredient", { length: 256 }),
    concentration: varchar("concentration", { length: 128 }),
    presentation: varchar("presentation", { length: 128 }),
    // Cruzamento com catálogo
    matchedProductId: int("matchedProductId").references(() => products.id, { onDelete: "set null" }),
    matchScore: int("matchScore").default(0),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_govitem_licid").on(t.govLicitationId),
    index("idx_govitem_product").on(t.matchedProductId),
  ]
);
export type GovLicitationItem = typeof govLicitationItems.$inferSelect;
export type InsertGovLicitationItem = typeof govLicitationItems.$inferInsert;

// Histórico de participação em licitações: registra se a empresa participou e o resultado.
export const govParticipationHistory = mysqlTable(
  "gov_participation_history",
  {
    id: int("id").autoincrement().primaryKey(),
    govLicitationId: int("govLicitationId").notNull().references(() => govLicitations.id, { onDelete: "cascade" }),
    // Status: "participou" | "nao_participou" | "ganhou" | "perdeu" | "desclassificado"
    status: varchar("status", { length: 32 }).notNull().default("participou"),
    // Resultado final após abertura: "ganhou" | "perdeu" | "desclassificado" | "pendente"
    result: varchar("result", { length: 32 }).default("pendente"),
    proposalId: int("proposalId").references(() => proposals.id, { onDelete: "set null" }),
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_govpart_licid").on(t.govLicitationId),
    index("idx_govpart_status").on(t.status),
  ]
);
export type GovParticipationHistory = typeof govParticipationHistory.$inferSelect;
export type InsertGovParticipationHistory = typeof govParticipationHistory.$inferInsert;

// ── Monitoramento Integral de CNPJ ──────────────────────────────────────────
// Configuração de monitoramento: suporta múltiplos CNPJs, múltiplas fontes
// e intervalo de verificação configurável.
export const cnpjMonitorConfig = mysqlTable("cnpj_monitor_config", {
  id: int("id").autoincrement().primaryKey(),
  cnpj: varchar("cnpj", { length: 18 }).notNull(),
  razaoSocial: varchar("razaoSocial", { length: 256 }).notNull().default(""),
  label: varchar("label", { length: 128 }).notNull().default("Minha Empresa"),
  active: boolean("active").notNull().default(true),
  // Intervalo em minutos: 1, 5, 15, 30, 60, 360, 1440
  intervalMinutes: int("intervalMinutes").notNull().default(60),
  // Fontes habilitadas (JSON array): "pncp_contratos", "comprasnet_itens", "sicaf"
  fontes: varchar("fontes", { length: 512 }).notNull().default('["pncp_contratos","comprasnet_itens","sicaf"]'),
  // Palavras-chave adicionais para monitorar (JSON array)
  keywords: varchar("keywords", { length: 1024 }).notNull().default('[]'),
  // Última varredura bem-sucedida
  lastCheckedAt: timestamp("lastCheckedAt"),
  // Última data de publicação verificada (para evitar re-alertar)
  lastPublicationDate: varchar("lastPublicationDate", { length: 10 }),
  // Situação no SICAF (cache)
  sicafStatus: varchar("sicafStatus", { length: 64 }),
  sicafCheckedAt: timestamp("sicafCheckedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type CnpjMonitorConfig = typeof cnpjMonitorConfig.$inferSelect;
export type InsertCnpjMonitorConfig = typeof cnpjMonitorConfig.$inferInsert;

// Eventos detectados: cada linha representa um evento relacionado ao CNPJ monitorado.
// Tipos de evento cobertos:
//   pncp_contrato       - Contrato assinado no PNCP
//   comprasnet_item     - Item de licitação vencido no Comprasnet
//   sicaf_mudanca       - Alteração na situação cadastral (SICAF)
//   keyword_match       - Palavra-chave encontrada em objeto de compra
export const cnpjMonitorEvents = mysqlTable(
  "cnpj_monitor_events",
  {
    id: int("id").autoincrement().primaryKey(),
    configId: int("configId").notNull().references(() => cnpjMonitorConfig.id, { onDelete: "cascade" }),
    // Fonte do evento
    fonte: varchar("fonte", { length: 32 }).notNull(), // "pncp_contratos" | "comprasnet_itens" | "sicaf" | "keyword"
    // Tipo detalhado do evento
    tipoEvento: varchar("tipoEvento", { length: 64 }).notNull(),
    // Hash para deduplicacao (antiflood)
    eventHash: varchar("eventHash", { length: 64 }).notNull(),
    // Identificador externo (numero do contrato, numero do pregao, etc.)
    externalId: varchar("externalId", { length: 256 }),
    // Numero do pregao / processo
    numeroPregao: varchar("numeroPregao", { length: 128 }),
    // Orgao
    cnpjOrgao: varchar("cnpjOrgao", { length: 18 }),
    nomeOrgao: varchar("nomeOrgao", { length: 256 }),
    ufOrgao: varchar("ufOrgao", { length: 2 }),
    // Objeto / descricao do evento
    objeto: text("objeto"),
    // Valor
    valor: decimal("valor", { precision: 14, scale: 2 }),
    // Datas
    dataEvento: varchar("dataEvento", { length: 10 }),
    dataPublicacao: varchar("dataPublicacao", { length: 10 }),
    // Link para o portal
    urlPortal: varchar("urlPortal", { length: 512 }),
    // Dados extras em JSON (campos especificos de cada fonte)
    dadosExtras: text("dadosExtras"),
    // Controle de leitura
    readAt: timestamp("readAt"),
    // Notificacao enviada
    notifiedAt: timestamp("notifiedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("idx_cnpjevent_config").on(t.configId),
    index("idx_cnpjevent_hash").on(t.eventHash),
    index("idx_cnpjevent_fonte").on(t.fonte),
    index("idx_cnpjevent_read").on(t.readAt),
    index("idx_cnpjevent_created").on(t.createdAt),
  ]
);
export type CnpjMonitorEvent = typeof cnpjMonitorEvents.$inferSelect;
export type InsertCnpjMonitorEvent = typeof cnpjMonitorEvents.$inferInsert;

// Compatibilidade retroativa com codigo existente
export const cnpjAlertConfig = cnpjMonitorConfig;
export const cnpjAlerts = cnpjMonitorEvents;
export type CnpjAlertConfig = CnpjMonitorConfig;
export type InsertCnpjAlertConfig = InsertCnpjMonitorConfig;
export type CnpjAlert = CnpjMonitorEvent;
export type InsertCnpjAlert = InsertCnpjMonitorEvent;

// ─── Monitoramento por Palavras-Chave no PNCP ────────────────────────────────
export const keywordMonitorConfig = mysqlTable(
  "keyword_monitor_config",
  {
    id: int("id").primaryKey().autoincrement(),
    // Palavra-chave ou frase a monitorar
    keyword: varchar("keyword", { length: 256 }).notNull(),
    // Descricao amigavel (ex: "Equipamentos Veterinários")
    descricao: varchar("descricao", { length: 256 }),
    // Ativo ou pausado
    ativo: boolean("ativo").notNull().default(true),
    // Filtro opcional por UF (ex: "SP", "RJ")
    uf: varchar("uf", { length: 2 }),
    // Filtro opcional por modalidade (ex: 8 = pregão eletrônico)
    modalidade: int("modalidade"),
    // Ultima varredura
    lastScanAt: timestamp("lastScanAt"),
    // Total de oportunidades encontradas
    totalFound: int("totalFound").notNull().default(0),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_kwconfig_ativo").on(t.ativo),
    index("idx_kwconfig_keyword").on(t.keyword),
  ]
);
export type KeywordMonitorConfig = typeof keywordMonitorConfig.$inferSelect;
export type InsertKeywordMonitorConfig = typeof keywordMonitorConfig.$inferInsert;

export const keywordMonitorEvents = mysqlTable(
  "keyword_monitor_events",
  {
    id: int("id").primaryKey().autoincrement(),
    configId: int("configId").notNull().references(() => keywordMonitorConfig.id, { onDelete: "cascade" }),
    // Palavra-chave que gerou este evento (desnormalizado para facilitar queries)
    keyword: varchar("keyword", { length: 256 }).notNull(),
    // Hash para deduplicacao (antiflood) — SHA1 do numeroControlePNCP
    eventHash: varchar("eventHash", { length: 64 }).notNull().unique(),
    // Identificador PNCP
    numeroControlePncp: varchar("numeroControlePncp", { length: 128 }),
    numeroPregao: varchar("numeroPregao", { length: 64 }),
    anoCompra: int("anoCompra"),
    sequencialCompra: int("sequencialCompra"),
    // Orgao
    cnpjOrgao: varchar("cnpjOrgao", { length: 18 }),
    nomeOrgao: varchar("nomeOrgao", { length: 256 }),
    ufOrgao: varchar("ufOrgao", { length: 2 }),
    municipioOrgao: varchar("municipioOrgao", { length: 128 }),
    // Objeto da licitacao
    objeto: text("objeto"),
    // Modalidade
    modalidadeNome: varchar("modalidadeNome", { length: 128 }),
    modalidadeId: int("modalidadeId"),
    // Valores
    valorEstimado: decimal("valorEstimado", { precision: 14, scale: 2 }),
    // Datas
    dataAbertura: varchar("dataAbertura", { length: 32 }),
    dataEncerramento: varchar("dataEncerramento", { length: 32 }),
    dataPublicacao: varchar("dataPublicacao", { length: 32 }),
    // SRP (Sistema de Registro de Precos)
    srp: boolean("srp").default(false),
    // Link direto para o portal
    urlPortal: varchar("urlPortal", { length: 512 }),
    // Controle de leitura
    readAt: timestamp("readAt"),
    // Notificacao enviada
    notifiedAt: timestamp("notifiedAt"),
    // Status da oportunidade (nova, visualizada, descartada, participando)
    status: varchar("status", { length: 32 }).notNull().default("nova"),
    // Notas do usuario
    notas: text("notas"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("idx_kwevent_config").on(t.configId),
    index("idx_kwevent_keyword").on(t.keyword),
    index("idx_kwevent_status").on(t.status),
    index("idx_kwevent_encerramento").on(t.dataEncerramento),
    index("idx_kwevent_created").on(t.createdAt),
  ]
);
export type KeywordMonitorEvent = typeof keywordMonitorEvents.$inferSelect;
export type InsertKeywordMonitorEvent = typeof keywordMonitorEvents.$inferInsert;

// ============================================================
// MÓDULO 1: Licitações Descobertas (Captura de Oportunidades)
// ============================================================
export const licitacoesDescobertas = mysqlTable(
  "licitacoes_descobertas",
  {
    id: int("id").autoincrement().primaryKey(),
    // Identificação única no PNCP
    pncpId: varchar("pncpId", { length: 128 }),
    sequencial: int("sequencial"),
    ano: int("ano"),
    // Órgão
    cnpjOrgao: varchar("cnpjOrgao", { length: 18 }),
    nomeOrgao: varchar("nomeOrgao", { length: 256 }),
    ufOrgao: varchar("ufOrgao", { length: 2 }),
    municipioOrgao: varchar("municipioOrgao", { length: 128 }),
    // Objeto
    objeto: text("objeto"),
    // Modalidade
    modalidadeNome: varchar("modalidadeNome", { length: 128 }),
    modalidadeId: int("modalidadeId"),
    // Valores
    valorEstimado: decimal("valorEstimado", { precision: 14, scale: 2 }),
    // Datas
    dataAbertura: varchar("dataAbertura", { length: 32 }),
    dataEncerramento: varchar("dataEncerramento", { length: 32 }),
    dataPublicacao: varchar("dataPublicacao", { length: 32 }),
    // SRP
    srp: boolean("srp").default(false),
    // Links
    urlPortal: varchar("urlPortal", { length: 512 }),
    urlEdital: varchar("urlEdital", { length: 512 }),
    // Controle
    status: varchar("status", { length: 32 }).notNull().default("nova"),
    notas: text("notas"),
    // Vínculo com proposta criada
    proposalId: int("proposalId"),
    // Palavra-chave que originou a descoberta
    origemKeyword: varchar("origemKeyword", { length: 128 }),
    // Antiflood
    hashId: varchar("hashId", { length: 64 }).unique(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (t) => [
    index("idx_licit_status").on(t.status),
    index("idx_licit_encerramento").on(t.dataEncerramento),
    index("idx_licit_orgao").on(t.cnpjOrgao),
    index("idx_licit_created").on(t.createdAt),
  ]
);
export type LicitacaoDescoberta = typeof licitacoesDescobertas.$inferSelect;
export type InsertLicitacaoDescoberta = typeof licitacoesDescobertas.$inferInsert;

// ============================================================
// MÓDULO 3: Documentos de Habilitação
// ============================================================
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
export const editalAnalyses = mysqlTable(
  "edital_analyses",
  {
    id: int("id").autoincrement().primaryKey(),
    // Arquivo original
    fileName: varchar("fileName", { length: 256 }).notNull(),
    fileUrl: varchar("fileUrl", { length: 512 }),
    fileKey: varchar("fileKey", { length: 256 }),
    // Resultado da extração LLM
    itensExtraidos: json("itensExtraidos"),       // [{nome, quantidade, unidade, matchProductId?, matchScore?}]
    prazosEntrega: text("prazosEntrega"),
    condicoesPagamento: text("condicoesPagamento"),
    documentosExigidos: json("documentosExigidos"), // string[]
    orgaoComprador: varchar("orgaoComprador", { length: 256 }),
    numeroEdital: varchar("numeroEdital", { length: 128 }),
    // Status do processamento
    status: varchar("status", { length: 32 }).notNull().default("pendente"),
    errorMessage: text("errorMessage"),
    // Vínculo com proposta criada
    proposalId: int("proposalId"),
    // Vínculo com licitação descoberta
    licitacaoId: int("licitacaoId"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    processedAt: timestamp("processedAt"),
  },
  (t) => [
    index("idx_edital_status").on(t.status),
    index("idx_edital_created").on(t.createdAt),
  ]
);
export type EditalAnalysis = typeof editalAnalyses.$inferSelect;
export type InsertEditalAnalysis = typeof editalAnalyses.$inferInsert;

// ============================================================
// MATCHING DE PRODUTOS — Logs e Feedback Expandido
// ============================================================

/**
 * matchLogs: Registra cada execução de matching para auditoria.
 * Armazena o item do edital, produto sugerido, score, critérios e tempo.
 */
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
export const matchFeedbackV2 = mysqlTable(
  "match_feedback_v2",
  {
    id: int("id").autoincrement().primaryKey(),
    // Item do edital (texto original e normalizado)
    editalItem: varchar("editalItem", { length: 512 }).notNull(),
    editalItemNormalizado: varchar("editalItemNormalizado", { length: 512 }),
    // Produto sugerido originalmente pelo algoritmo
    produtoSugeridoId: int("produtoSugeridoId"),
    produtoSugeridoNome: varchar("produtoSugeridoNome", { length: 512 }),
    scoreOriginal: decimal("scoreOriginal", { precision: 5, scale: 4 }),
    // Produto escolhido pelo usuário (pode ser diferente do sugerido)
    produtoEscolhidoId: int("produtoEscolhidoId"),
    produtoEscolhidoNome: varchar("produtoEscolhidoNome", { length: 512 }),
    // Ação do usuário: aceitar | trocar | criar | ignorar
    acao: varchar("acao", { length: 32 }).notNull(),
    // Se o usuário confirmou a sugestão original
    usuarioConfirmou: boolean("usuarioConfirmou").default(false).notNull(),
    // Contexto
    editalAnalysisId: int("editalAnalysisId"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("idx_mfbv2_edital").on(t.editalItem),
    index("idx_mfbv2_produto").on(t.produtoEscolhidoId),
    index("idx_mfbv2_acao").on(t.acao),
    index("idx_mfbv2_created").on(t.createdAt),
  ]
);
export type MatchFeedbackV2 = typeof matchFeedbackV2.$inferSelect;
export type InsertMatchFeedbackV2 = typeof matchFeedbackV2.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════════════
// MÓDULO DE RASPAGEM WEB (Prompt 3)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * scrapeProfiles: Perfis de raspagem por fornecedor.
 * Cada perfil define domínios permitidos, seletores CSS e regras de limpeza.
 */
export const scrapeProfiles = mysqlTable(
  "scrape_profiles",
  {
    id: int("id").autoincrement().primaryKey(),
    // Fornecedor vinculado (opcional — pode ser genérico)
    supplierId: int("supplierId"),
    supplierName: varchar("supplierName", { length: 256 }).notNull(),
    // Domínios permitidos (JSON array de strings)
    allowedDomains: json("allowedDomains").notNull().$type<string[]>(),
    // Seletores CSS para extração de campos (JSON)
    selectors: json("selectors").notNull().$type<{
      nome?: string;
      ean?: string;
      fabricante?: string;
      apresentacao?: string;
      fichaTecnica?: string;
      preco?: string;
      imagem?: string;
      link?: string;
      paginaProxima?: string;
      listaItens?: string;
    }>(),
    // Regras de limpeza (regex / normalização) por campo (JSON)
    cleanRules: json("cleanRules").$type<Record<string, string>>(),
    // Cookie/token de sessão para sites que exigem login (armazenado com cuidado)
    sessionCookie: text("sessionCookie"),
    // User-agent personalizado
    userAgent: varchar("userAgent", { length: 512 }),
    // Rate limit em ms entre requisições
    rateLimitMs: int("rateLimitMs").default(2000),
    // Máximo de páginas na listagem
    maxPages: int("maxPages").default(10),
    // Ativo/inativo
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_sprof_supplier").on(t.supplierId),
    index("idx_sprof_active").on(t.isActive),
  ]
);
export type ScrapeProfile = typeof scrapeProfiles.$inferSelect;
export type InsertScrapeProfile = typeof scrapeProfiles.$inferInsert;

/**
 * scrapeJobs: Registro de cada execução de raspagem.
 * tipo: "listagem" | "individual"
 * status: "pendente" | "executando" | "concluido" | "erro" | "cancelado"
 */
export const scrapeJobs = mysqlTable(
  "scrape_jobs",
  {
    id: int("id").autoincrement().primaryKey(),
    profileId: int("profileId").references(() => scrapeProfiles.id, { onDelete: "set null" }),
    supplierId: int("supplierId"),
    supplierName: varchar("supplierName", { length: 256 }),
    tipo: varchar("tipo", { length: 32 }).notNull(), // listagem | individual
    url: varchar("url", { length: 2048 }).notNull(),
    status: varchar("status", { length: 32 }).default("pendente").notNull(),
    // Estatísticas
    totalCapturado: int("totalCapturado").default(0),
    totalComEan: int("totalComEan").default(0),
    totalSemFabricante: int("totalSemFabricante").default(0),
    totalSemFicha: int("totalSemFicha").default(0),
    totalConflitos: int("totalConflitos").default(0),
    totalErros: int("totalErros").default(0),
    // Resultado bruto (JSON com lista de produtos capturados)
    resultadoBruto: json("resultadoBruto"),
    // Mensagem de erro geral
    errorMessage: text("errorMessage"),
    iniciadoEm: timestamp("iniciadoEm"),
    concluidoEm: timestamp("concluidoEm"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("idx_sjob_profile").on(t.profileId),
    index("idx_sjob_supplier").on(t.supplierId),
    index("idx_sjob_status").on(t.status),
    index("idx_sjob_tipo").on(t.tipo),
    index("idx_sjob_created").on(t.createdAt),
  ]
);
export type ScrapeJob = typeof scrapeJobs.$inferSelect;
export type InsertScrapeJob = typeof scrapeJobs.$inferInsert;

/**
 * scrapeResults: Resultado individual de cada produto capturado em um job.
 * origem: "site" | "web_enrichment" | "ia"
 */
export const scrapeResults = mysqlTable(
  "scrape_results",
  {
    id: int("id").autoincrement().primaryKey(),
    jobId: int("jobId").references(() => scrapeJobs.id, { onDelete: "cascade" }).notNull(),
    // Produto vinculado (null se ainda não aplicado)
    productId: int("productId"),
    // Dados capturados (JSON com todos os campos)
    dadosCapturados: json("dadosCapturados").notNull(),
    // Campos que foram preenchidos neste resultado
    camposCapturados: json("camposCapturados").$type<string[]>(),
    // Origem da captura
    origem: varchar("origem", { length: 32 }).default("site"),
    // Confiança (0–1)
    confianca: decimal("confianca", { precision: 3, scale: 2 }),
    // Status: pendente | aplicado | ignorado | conflito
    status: varchar("status", { length: 32 }).default("pendente").notNull(),
    // Notas do usuário durante revisão
    notasRevisao: text("notasRevisao"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("idx_sres_job").on(t.jobId),
    index("idx_sres_product").on(t.productId),
    index("idx_sres_status").on(t.status),
    index("idx_sres_origem").on(t.origem),
  ]
);
export type ScrapeResult = typeof scrapeResults.$inferSelect;
export type InsertScrapeResult = typeof scrapeResults.$inferInsert;

/**
 * scrapeErrors: Log de erros por URL durante a raspagem.
 */
export const scrapeErrors = mysqlTable(
  "scrape_errors",
  {
    id: int("id").autoincrement().primaryKey(),
    jobId: int("jobId").references(() => scrapeJobs.id, { onDelete: "cascade" }).notNull(),
    url: varchar("url", { length: 2048 }),
    erro: text("erro"),
    statusCode: int("statusCode"),
    stack: text("stack"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("idx_serr_job").on(t.jobId),
    index("idx_serr_created").on(t.createdAt),
  ]
);
export type ScrapeError = typeof scrapeErrors.$inferSelect;
export type InsertScrapeError = typeof scrapeErrors.$inferInsert;

/**
 * scrapeEnrichmentLog: Log de enriquecimento web por produto.
 * Armazena fonte, texto extraído e data da captura.
 */
export const scrapeEnrichmentLog = mysqlTable(
  "scrape_enrichment_log",
  {
    id: int("id").autoincrement().primaryKey(),
    productId: int("productId"),
    jobId: int("jobId"),
    campo: varchar("campo", { length: 64 }).notNull(), // fichaTecnica | fabricante | imagem | etc.
    valorAnterior: text("valorAnterior"),
    valorNovo: text("valorNovo"),
    fonte: varchar("fonte", { length: 2048 }),
    dataCaptura: timestamp("dataCaptura").defaultNow().notNull(),
    // Conflito: quando há múltiplas fontes com valores diferentes
    temConflito: boolean("temConflito").default(false).notNull(),
    conflitosJson: json("conflitosJson"),
    revisadoPor: varchar("revisadoPor", { length: 256 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("idx_senr_product").on(t.productId),
    index("idx_senr_job").on(t.jobId),
    index("idx_senr_campo").on(t.campo),
  ]
);
export type ScrapeEnrichmentLog = typeof scrapeEnrichmentLog.$inferSelect;
export type InsertScrapeEnrichmentLog = typeof scrapeEnrichmentLog.$inferInsert;

// ─── Preços por Fornecedor ────────────────────────────────────────────────────
// Tabela normalizada: um produto pode ter preço diferente em cada fornecedor.
// Substitui o campo price da tabela products (que passa a ser o preço de referência).
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

export const licitacaoItens = mysqlTable("licitacaoItens", {
  id: int("id").primaryKey().autoincrement(),
  licitacaoId: int("licitacaoId").notNull().references(() => licitacoes.id, { onDelete: "cascade" }),
  numeroItem: int("numeroItem"),
  descricao: text("descricao"),
  quantidade: decimal("quantidade", { precision: 15, scale: 4 }),
  unidade: varchar("unidade", { length: 64 }),
  valorEstimado: decimal("valorEstimado", { precision: 15, scale: 2 }),
  valorUnitario: decimal("valorUnitario", { precision: 15, scale: 4 }),
  categoria: varchar("categoria", { length: 256 }),
  codigoCatalogo: varchar("codigoCatalogo", { length: 64 }),
  produtoMatchId: int("produtoMatchId"), // produto sugerido pelo matching
  scoreMatch: decimal("scoreMatch", { precision: 5, scale: 4 }), // 0.0000 a 1.0000
  matchConfirmado: int("matchConfirmado").default(0),
  createdAt: timestamp("createdAt").defaultNow(),
});

export const licitacaoMatch = mysqlTable("licitacaoMatch", {
  id: int("id").primaryKey().autoincrement(),
  licitacaoItemId: int("licitacaoItemId").notNull().references(() => licitacaoItens.id, { onDelete: "cascade" }),
  produtoId: int("produtoId").notNull(),
  score: decimal("score", { precision: 5, scale: 4 }).notNull(),
  matchConfirmado: int("matchConfirmado").default(0),
  confirmadoPor: varchar("confirmadoPor", { length: 128 }),
  data: timestamp("data").defaultNow(),
});

export const oportunidadesLicitacao = mysqlTable("oportunidadesLicitacao", {
  id: int("id").primaryKey().autoincrement(),
  licitacaoId: int("licitacaoId").notNull().references(() => licitacoes.id, { onDelete: "cascade" }),
  licitacaoItemId: int("licitacaoItemId").references(() => licitacaoItens.id, { onDelete: "cascade" }),
  produtoId: int("produtoId"),
  score: decimal("score", { precision: 5, scale: 4 }),
  valorEstimado: decimal("valorEstimado", { precision: 15, scale: 2 }),
  status: varchar("status", { length: 32 }).default("nova"), // nova | em_analise | proposta_gerada | descartada
  alertaEnviado: int("alertaEnviado").default(0),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow(),
});

export const licitacaoSyncLogs = mysqlTable("licitacaoSyncLogs", {
  id: int("id").primaryKey().autoincrement(),
  fonte: varchar("fonte", { length: 32 }).notNull(), // "pncp" | "compras_gov" | "atas" | "contratos"
  dataExecucao: timestamp("dataExecucao").defaultNow(),
  totalLicitacoes: int("totalLicitacoes").default(0),
  totalItens: int("totalItens").default(0),
  totalOportunidades: int("totalOportunidades").default(0),
  erros: int("erros").default(0),
  tempoExecucaoMs: int("tempoExecucaoMs").default(0),
  detalhes: text("detalhes"),
  status: varchar("status", { length: 32 }).default("ok"), // ok | erro | parcial
});

// ─── Motor de Inteligência: Metadados do Produto ─────────────────────────────
export const productMetadata = mysqlTable("productMetadata", {
  id: int("id").primaryKey().autoincrement(),
  produtoId: int("produtoId").notNull().references(() => products.id, { onDelete: "cascade" }),
  key: varchar("key", { length: 128 }).notNull(),       // ex: principio_ativo, concentracao, forma_farmaceutica, voltagem, etc.
  value: text("value").notNull(),
  confidence: decimal("confidence", { precision: 4, scale: 3 }).default("0.000"), // 0.000 a 1.000
  source: varchar("source", { length: 64 }).default("extracted_from_ficha"), // extracted_from_ficha | manual
  needsReview: int("needsReview").default(0),            // 1 = confiança < 0.70
  lockedManual: int("lockedManual").default(0),          // 1 = travado como manual (não sobrescrever)
  generatedBy: varchar("generatedBy", { length: 128 }),  // userId ou "ai"
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow(),
  createdAt: timestamp("createdAt").defaultNow(),
});


// ─── Motor Universal de Equivalência por Ficha Técnica ───────────────────────

// Perfis de equivalência por categoria (define atributos críticos, tolerâncias e score)
export const equivalenceProfiles = mysqlTable("equivalenceProfiles", {
  id: int("id").primaryKey().autoincrement(),
  // Identificação do perfil
  name: varchar("name", { length: 256 }).notNull(),          // ex: "Medicamentos Veterinários Injetáveis"
  categorySlug: varchar("categorySlug", { length: 128 }),    // vinculado à categoria do catálogo
  description: text("description"),
  isActive: mysqlEnum("isActive", ["yes", "no"]).default("yes").notNull(),
  // Configuração em JSON (atributos_criticos, tolerancias, atributos_importantes, sinonimos)
  criticalAttributes: json("criticalAttributes").notNull(),  // string[] — ex: ["principio_ativo","concentracao","forma_farmaceutica"]
  tolerances: json("tolerances").notNull(),                  // Record<string, {op: ">="|"<="|"="|"range", value: number|[number,number], unit?: string}>
  importantAttributes: json("importantAttributes").notNull(),// string[] — contribuem para score mas não são críticos
  synonyms: json("synonyms"),                                // Record<string, string[]> — ex: {"ivermectina": ["ivermectin"]}
  minScore: int("minScore").default(80),                     // Score mínimo para APROVADO (0-100)
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type EquivalenceProfile = typeof equivalenceProfiles.$inferSelect;
export type InsertEquivalenceProfile = typeof equivalenceProfiles.$inferInsert;

// Atributos extraídos de fichas técnicas com evidência e rastreabilidade
export const extractedAttributes = mysqlTable(
  "extractedAttributes",
  {
    id: int("id").primaryKey().autoincrement(),
    productId: int("productId").notNull().references(() => products.id, { onDelete: "cascade" }),
    // Atributo extraído
    attribute: varchar("attribute", { length: 128 }).notNull(),  // ex: principio_ativo, concentracao, voltagem
    value: text("value").notNull(),                              // valor bruto extraído
    valueNormalized: text("valueNormalized"),                    // valor normalizado (ex: "12.5 mg/mL")
    unit: varchar("unit", { length: 64 }),                       // unidade normalizada (ex: "mg/mL")
    valueNumeric: decimal("valueNumeric", { precision: 18, scale: 6 }), // valor numérico para comparação
    // Evidência e rastreabilidade (OBRIGATÓRIO — não inventar)
    sourceType: mysqlEnum("sourceType", ["pdf", "url", "text", "manual"]).notNull(),
    sourceRef: text("sourceRef"),                                // URL ou caminho do PDF/página
    sourceHash: varchar("sourceHash", { length: 64 }),          // SHA-256 do documento fonte
    sourcePage: int("sourcePage"),                               // Página do PDF onde foi encontrado
    sourceExcerpt: text("sourceExcerpt"),                        // Trecho exato onde o atributo foi encontrado
    confidence: decimal("confidence", { precision: 4, scale: 3 }).default("0.000"), // 0.000 a 1.000
    needsReview: int("needsReview").default(0),                  // 1 = confiança < 0.70 ou ambíguo
    extractedBy: varchar("extractedBy", { length: 64 }).default("ai"), // "ai" ou userId
    extractedAt: timestamp("extractedAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("idx_ext_attr_product").on(table.productId),
    index("idx_ext_attr_attribute").on(table.attribute),
    index("idx_ext_attr_product_attr").on(table.productId, table.attribute),
  ]
);

export type ExtractedAttribute = typeof extractedAttributes.$inferSelect;
export type InsertExtractedAttribute = typeof extractedAttributes.$inferInsert;

// Sessões de comparação de equivalência técnica
export const equivalenceSessions = mysqlTable("equivalenceSessions", {
  id: int("id").primaryKey().autoincrement(),
  profileId: int("profileId").references(() => equivalenceProfiles.id, { onDelete: "set null" }),
  referenceProductId: int("referenceProductId").references(() => products.id, { onDelete: "set null" }),
  referenceDescription: text("referenceDescription"),   // Descrição do item de referência (edital/licitação)
  title: varchar("title", { length: 512 }),              // Título da sessão (ex: "Pregão 001/2025 - Item 3")
  processNumber: varchar("processNumber", { length: 256 }), // Número do processo licitatório
  createdBy: varchar("createdBy", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type EquivalenceSession = typeof equivalenceSessions.$inferSelect;
export type InsertEquivalenceSession = typeof equivalenceSessions.$inferInsert;

// Resultados de equivalência técnica por candidato
export const equivalenceResults = mysqlTable(
  "equivalenceResults",
  {
    id: int("id").primaryKey().autoincrement(),
    sessionId: int("sessionId").notNull().references(() => equivalenceSessions.id, { onDelete: "cascade" }),
    candidateProductId: int("candidateProductId").references(() => products.id, { onDelete: "set null" }),
    candidateDescription: text("candidateDescription"),  // Descrição do candidato (se não for produto do catálogo)
    // Resultado da comparação
    status: mysqlEnum("status", ["APROVADO", "REPROVADO", "REVISAO"]).notNull(),
    score: int("score").default(0),                       // 0-100
    // Detalhamento (JSON)
    criticalDivergences: json("criticalDivergences"),     // Array de {attribute, referenceValue, candidateValue, reason}
    importantDivergences: json("importantDivergences"),   // Array de {attribute, referenceValue, candidateValue, scoreImpact}
    attributeComparisons: json("attributeComparisons"),   // Array completo de comparações para o relatório
    justification: text("justification"),                 // Justificativa curta (1-2 frases)
    reviewNotes: text("reviewNotes"),                     // Notas para revisão manual
    // Rastreabilidade
    generatedBy: varchar("generatedBy", { length: 64 }).default("ai"),
    reviewedBy: varchar("reviewedBy", { length: 128 }),
    reviewedAt: timestamp("reviewedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("idx_eq_result_session").on(table.sessionId),
    index("idx_eq_result_candidate").on(table.candidateProductId),
    index("idx_eq_result_status").on(table.status),
  ]
);

export type EquivalenceResult = typeof equivalenceResults.$inferSelect;
export type InsertEquivalenceResult = typeof equivalenceResults.$inferInsert;

// ─── Framework de Fornecedores (Conectores API/CSV/XML/Manual) ───────────────

export const supplierConnectors = mysqlTable(
  "supplierConnectors",
  {
    id: int("id").primaryKey().autoincrement(),
    supplierId: int("supplierId").references(() => suppliers.id, { onDelete: "set null" }),
    name: varchar("name", { length: 256 }).notNull(),
    connectorType: mysqlEnum("connectorType", ["api_rest", "csv_excel", "xml", "manual"]).notNull().default("csv_excel"),
    isActive: mysqlEnum("isActive", ["yes", "no"]).notNull().default("yes"),
    baseUrl: text("baseUrl"),
    authType: mysqlEnum("authType", ["none", "api_key", "bearer", "basic"]).default("none"),
    authConfig: json("authConfig"),
    endpoints: json("endpoints"),
    paginationConfig: json("paginationConfig"),
    rateLimit: int("rateLimit").default(60),
    fieldMapping: json("fieldMapping"),
    downloadUrl: text("downloadUrl"),
    xmlRootPath: varchar("xmlRootPath", { length: 256 }),
    lastSyncAt: timestamp("lastSyncAt"),
    lastSyncStatus: mysqlEnum("lastSyncStatus", ["ok", "error", "partial", "pending"]).default("pending"),
    lastSyncMessage: text("lastSyncMessage"),
    syncIntervalHours: int("syncIntervalHours").default(24),
    notes: text("notes"),
    createdBy: varchar("createdBy", { length: 128 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("idx_sc_supplier").on(table.supplierId),
    index("idx_sc_active").on(table.isActive),
  ]
);

export type SupplierConnector = typeof supplierConnectors.$inferSelect;
export type InsertSupplierConnector = typeof supplierConnectors.$inferInsert;

// ─── Log de Auditoria Unificado ──────────────────────────────────────────────

export const auditLog = mysqlTable(
  "auditLog",
  {
    id: int("id").primaryKey().autoincrement(),
    source: varchar("source", { length: 64 }).notNull(),
    action: varchar("action", { length: 64 }).notNull(),
    entityType: varchar("entityType", { length: 64 }),
    entityId: varchar("entityId", { length: 128 }),
    endpoint: text("endpoint"),
    params: json("params"),
    status: mysqlEnum("status", ["ok", "error", "partial", "skipped"]).notNull().default("ok"),
    recordsAffected: int("recordsAffected").default(0),
    payloadHash: varchar("payloadHash", { length: 64 }),
    evidenceUrl: text("evidenceUrl"),
    errorMessage: text("errorMessage"),
    durationMs: int("durationMs"),
    userId: varchar("userId", { length: 128 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    index("idx_audit_source").on(table.source),
    index("idx_audit_action").on(table.action),
    index("idx_audit_status").on(table.status),
    index("idx_audit_created").on(table.createdAt),
  ]
);

export type AuditLog = typeof auditLog.$inferSelect;
export type InsertAuditLog = typeof auditLog.$inferInsert;

// ─── Histórico de Preços Públicos (PNCP/ComprasGov) ─────────────────────────

export const publicPriceHistory = mysqlTable(
  "publicPriceHistory",
  {
    id: int("id").primaryKey().autoincrement(),
    productId: int("productId").references(() => products.id, { onDelete: "set null" }),
    itemDescription: text("itemDescription").notNull(),
    catmatCode: varchar("catmatCode", { length: 32 }),
    unitPrice: decimal("unitPrice", { precision: 15, scale: 4 }),
    estimatedUnitPrice: decimal("estimatedUnitPrice", { precision: 15, scale: 4 }),
    quantity: decimal("quantity", { precision: 15, scale: 4 }),
    unit: varchar("unit", { length: 64 }),
    totalValue: decimal("totalValue", { precision: 18, scale: 4 }),
    source: varchar("source", { length: 32 }).notNull().default("PNCP"),
    processNumber: varchar("processNumber", { length: 256 }),
    pncpId: varchar("pncpId", { length: 256 }),
    orgaoCnpj: varchar("orgaoCnpj", { length: 18 }),
    orgaoName: varchar("orgaoName", { length: 512 }),
    uf: varchar("uf", { length: 2 }),
    modalidade: varchar("modalidade", { length: 64 }),
    publicationDate: date("publicationDate"),
    homologationDate: date("homologationDate"),
    evidenceUrl: text("evidenceUrl"),
    rawJson: json("rawJson"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    index("idx_pph_product").on(table.productId),
    index("idx_pph_catmat").on(table.catmatCode),
    index("idx_pph_uf").on(table.uf),
    index("idx_pph_date").on(table.publicationDate),
    index("idx_pph_source").on(table.source),
  ]
);

export type PublicPriceHistory = typeof publicPriceHistory.$inferSelect;
export type InsertPublicPriceHistory = typeof publicPriceHistory.$inferInsert;

// ─── Radar Nacional de Licitações ─────────────────────────────────────────────

// Palavras-chave por área com score e exclusões
export const radarKeywords = mysqlTable(
  "radarKeywords",
  {
    id: int("id").autoincrement().primaryKey(),
    areaId: int("areaId").notNull(), // 1-4
    areaName: varchar("areaName", { length: 128 }).notNull(),
    keyword: varchar("keyword", { length: 256 }).notNull(),
    type: mysqlEnum("type", ["include", "exclude", "anchor"]).notNull().default("include"),
    scoreBonus: int("scoreBonus").default(0), // +30, +20, -40, +10
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    index("idx_rk_area").on(table.areaId),
    index("idx_rk_type").on(table.type),
  ]
);

export type RadarKeyword = typeof radarKeywords.$inferSelect;
export type InsertRadarKeyword = typeof radarKeywords.$inferInsert;

// Fontes monitoradas (FontesRadar)
export const radarSources = mysqlTable(
  "radarSources",
  {
    id: int("id").autoincrement().primaryKey(),
    tipoEntidade: varchar("tipoEntidade", { length: 64 }).notNull(), // UF, IF, HU, ESTATAL, OUTRO
    entidadeNome: varchar("entidadeNome", { length: 256 }).notNull(),
    uf: varchar("uf", { length: 2 }),
    municipio: varchar("municipio", { length: 128 }),
    dominioOficial: varchar("dominioOficial", { length: 256 }),
    canalPrimario: varchar("canalPrimario", { length: 64 }), // PNCP, LICITACOES_E, COMPRAS_GOV, PROPRIO, OUTRO
    urlCanal: text("urlCanal"),
    metodoColeta: varchar("metodoColeta", { length: 64 }).default("PNCP"), // PNCP, SCRAPING, API, MANUAL
    observacoesValidacao: text("observacoesValidacao"),
    prioridade: mysqlEnum("prioridade", ["alta", "media", "baixa"]).default("media").notNull(),
    ativo: boolean("ativo").default(true).notNull(),
    ultimaSincronizacao: timestamp("ultimaSincronizacao"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("idx_rs_uf").on(table.uf),
    index("idx_rs_tipo").on(table.tipoEntidade),
    index("idx_rs_prioridade").on(table.prioridade),
    index("idx_rs_canal").on(table.canalPrimario),
  ]
);

export type RadarSource = typeof radarSources.$inferSelect;
export type InsertRadarSource = typeof radarSources.$inferInsert;

// Oportunidades capturadas (OportunidadesRadar)
export const radarOpportunities = mysqlTable(
  "radarOpportunities",
  {
    id: int("id").autoincrement().primaryKey(),
    sourceId: int("sourceId"), // FK radarSources (nullable para PNCP direto)
    areaId: int("areaId").notNull(), // 1-4
    dataCaptura: timestamp("dataCaptura").defaultNow().notNull(),
    fonte: varchar("fonte", { length: 64 }).notNull(), // PNCP, COMPRAS_MG, LICITACOES_E, PROPRIO
    entidadeNome: varchar("entidadeNome", { length: 256 }),
    cnpjOrgao: varchar("cnpjOrgao", { length: 18 }),
    uf: varchar("uf", { length: 2 }),
    municipio: varchar("municipio", { length: 128 }),
    canal: varchar("canal", { length: 128 }),
    objetoTexto: text("objetoTexto"),
    modalidade: varchar("modalidade", { length: 128 }),
    dataPublicacao: date("dataPublicacao"),
    dataAbertura: date("dataAbertura"),
    situacao: varchar("situacao", { length: 64 }),
    linkEdital: text("linkEdital"),
    anexosLinks: json("anexosLinks"), // string[]
    scoreRelevancia: int("scoreRelevancia").default(0),
    keywordsDetectadas: json("keywordsDetectadas"), // string[]
    evidencias: json("evidencias"), // { url, hash, capturedAt }[]
    numeroProcesso: varchar("numeroProcesso", { length: 128 }),
    pncpId: varchar("pncpId", { length: 256 }),
    contentHash: varchar("contentHash", { length: 64 }), // SHA-256 para detectar alterações
    isNew: boolean("isNew").default(true).notNull(),
    isAlerted: boolean("isAlerted").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("idx_ro_area").on(table.areaId),
    index("idx_ro_fonte").on(table.fonte),
    index("idx_ro_uf").on(table.uf),
    index("idx_ro_score").on(table.scoreRelevancia),
    index("idx_ro_data").on(table.dataPublicacao),
    index("idx_ro_pncp").on(table.pncpId),
    index("idx_ro_hash").on(table.contentHash),
    index("idx_ro_new").on(table.isNew),
  ]
);

export type RadarOpportunity = typeof radarOpportunities.$inferSelect;
export type InsertRadarOpportunity = typeof radarOpportunities.$inferInsert;

// ============================================================
// GOVERNANÇA OPERACIONAL — Auditoria, Diligências e Histórico
// ============================================================
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

export const orgHistoryEvents = mysqlTable(
  "org_history_events",
  {
    id: int("id").autoincrement().primaryKey(),
    orgId: int("orgId").notNull().references(() => requestingOrgs.id, { onDelete: "cascade" }),
    proposalId: int("proposalId").references(() => proposals.id, { onDelete: "set null" }),
    eventType: varchar("eventType", { length: 64 }).notNull(),
    title: varchar("title", { length: 256 }).notNull(),
    details: text("details"),
    score: int("score").default(0),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("idx_org_history_org").on(t.orgId),
    index("idx_org_history_type").on(t.eventType),
    index("idx_org_history_created").on(t.createdAt),
  ]
);
export type OrgHistoryEvent = typeof orgHistoryEvents.$inferSelect;
export type InsertOrgHistoryEvent = typeof orgHistoryEvents.$inferInsert;

// Logs de execução do Radar
export const radarSyncLogs = mysqlTable(
  "radarSyncLogs",
  {
    id: int("id").autoincrement().primaryKey(),
    startedAt: timestamp("startedAt").defaultNow().notNull(),
    finishedAt: timestamp("finishedAt"),
    status: mysqlEnum("status", ["running", "success", "error", "partial"]).default("running").notNull(),
    totalFontes: int("totalFontes").default(0),
    totalOportunidades: int("totalOportunidades").default(0),
    novas: int("novas").default(0),
    alteradas: int("alteradas").default(0),
    erros: int("erros").default(0),
    detalhes: json("detalhes"), // { fonte, status, count, error }[]
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    index("idx_rsl_status").on(table.status),
    index("idx_rsl_started").on(table.startedAt),
  ]
);

export type RadarSyncLog = typeof radarSyncLogs.$inferSelect;
export type InsertRadarSyncLog = typeof radarSyncLogs.$inferInsert;

// ─── Logs de chamadas a APIs externas (rastreabilidade) ───────────────────────
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
export const imageAutoLinkHistory = mysqlTable(
  "image_auto_link_history",
  {
    id: int("id").autoincrement().primaryKey(),
    productId: int("productId")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    imageUrl: text("imageUrl").notNull(),
    productName: varchar("productName", { length: 512 }).notNull(),
    matchScore: decimal("matchScore", { precision: 3, scale: 2 }).notNull(), // 0-1 (Jaro-Winkler score)
    status: mysqlEnum("status", ["linked", "rejected", "pending_review"]).default("linked").notNull(),
    importBatchId: int("importBatchId"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    index("idx_ialh_productId").on(table.productId),
    index("idx_ialh_matchScore").on(table.matchScore),
    index("idx_ialh_status").on(table.status),
    index("idx_ialh_importBatchId").on(table.importBatchId),
  ]
);

export type ImageAutoLinkHistory = typeof imageAutoLinkHistory.$inferSelect;
export type InsertImageAutoLinkHistory = typeof imageAutoLinkHistory.$inferInsert;


// ─── Web Scraper Configuration ───────────────────────────────────────────────

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
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ScraperLog = typeof scraperLogs.$inferSelect;
export type InsertScraperLog = typeof scraperLogs.$inferInsert;

// ─── Configuração de Precificação ─────────────────────────────────────────
export const pricingConfigs = mysqlTable("pricing_configs", {
  id: int("id").autoincrement().primaryKey(),
  supplierId: int("supplierId")
    .notNull()
    .references(() => suppliers.id, { onDelete: "cascade" }),
  region: varchar("region", { length: 128 }).notNull(), // "Nacional", "SP", "RJ", etc. ou deixar vazio para padrão
  
  // Impostos (em percentual)
  icmsPercentage: decimal("icmsPercentage", { precision: 5, scale: 2 }).default("0"), // ICMS %
  ipPercentage: decimal("ipPercentage", { precision: 5, scale: 2 }).default("0"), // IP %
  pisPercentage: decimal("pisPercentage", { precision: 5, scale: 2 }).default("0"), // PIS %
  cofinsPercentage: decimal("cofinsPercentage", { precision: 5, scale: 2 }).default("0"), // COFINS %
  
  // Fretes (valor fixo ou percentual)
  freightType: mysqlEnum("freightType", ["fixed", "percentage"]).default("fixed"), // Tipo de frete
  freightValue: decimal("freightValue", { precision: 12, scale: 2 }).default("0"), // Valor ou percentual
  
  // Margem de lucro
  marginPercentage: decimal("marginPercentage", { precision: 5, scale: 2 }).notNull(), // Margem de lucro %
  
  // Configurações adicionais
  minPrice: decimal("minPrice", { precision: 12, scale: 2 }), // Preço mínimo permitido
  maxPrice: decimal("maxPrice", { precision: 12, scale: 2 }), // Preço máximo permitido
  roundingMethod: mysqlEnum("roundingMethod", ["round", "ceil", "floor"]).default("round"), // Método de arredondamento
  
  // Status
  isActive: mysqlEnum("isActive", ["yes", "no"]).default("yes").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PricingConfig = typeof pricingConfigs.$inferSelect;
export type InsertPricingConfig = typeof pricingConfigs.$inferInsert;

// ─── Histórico de Precificação ────────────────────────────────────────────
export const pricingHistory = mysqlTable("pricing_history", {
  id: int("id").autoincrement().primaryKey(),
  productId: int("productId")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  pricingConfigId: int("pricingConfigId")
    .notNull()
    .references(() => pricingConfigs.id, { onDelete: "cascade" }),
  
  // Preços
  basePriceBeforeTax: decimal("basePriceBeforeTax", { precision: 12, scale: 2 }).notNull(), // Preço base
  taxAmount: decimal("taxAmount", { precision: 12, scale: 2 }).notNull(), // Valor de impostos
  freightAmount: decimal("freightAmount", { precision: 12, scale: 2 }).notNull(), // Valor de frete
  priceBeforeMargin: decimal("priceBeforeMargin", { precision: 12, scale: 2 }).notNull(), // Preço antes da margem
  marginAmount: decimal("marginAmount", { precision: 12, scale: 2 }).notNull(), // Valor da margem
  finalPrice: decimal("finalPrice", { precision: 12, scale: 2 }).notNull(), // Preço final
  
  // Detalhes
  icmsAmount: decimal("icmsAmount", { precision: 12, scale: 2 }).default("0"),
  ipAmount: decimal("ipAmount", { precision: 12, scale: 2 }).default("0"),
  pisAmount: decimal("pisAmount", { precision: 12, scale: 2 }).default("0"),
  cofinsAmount: decimal("cofinsAmount", { precision: 12, scale: 2 }).default("0"),
  
  // Rastreamento
  appliedAt: timestamp("appliedAt"),
  appliedBy: int("appliedBy").references(() => users.id, { onDelete: "set null" }),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PricingHistory = typeof pricingHistory.$inferSelect;
export type InsertPricingHistory = typeof pricingHistory.$inferInsert;

// ─── Regras de Precificação por Categoria ──────────────────────────────────
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
export const supplierCaptureConfigs = mysqlTable("supplier_capture_configs", {
  id: int("id").autoincrement().primaryKey(),
  supplierId: int("supplierId")
    .notNull()
    .references(() => suppliers.id, { onDelete: "cascade" }),
  
  // URLs
  baseUrl: varchar("baseUrl", { length: 512 }).notNull(),
  loginUrl: varchar("loginUrl", { length: 512 }),
  catalogUrl: varchar("catalogUrl", { length: 512 }),
  
  // Tipo de acesso
  accessType: mysqlEnum("accessType", ["public", "username_password", "session_cookie", "api_key"]).default("public"),
  
  // Método de captura
  captureMethod: mysqlEnum("captureMethod", ["html", "sitemap", "api", "pagination", "search"]).default("html"),
  
  // Seletores CSS/XPath
  productListSelector: text("productListSelector"),
  productNameSelector: text("productNameSelector"),
  productPriceSelector: text("productPriceSelector"),
  productDescriptionSelector: text("productDescriptionSelector"),
  productImageSelector: text("productImageSelector"),
  productSkuSelector: text("productSkuSelector"),
  productManufacturerSelector: text("productManufacturerSelector"),
  productStockSelector: text("productStockSelector"),
  paginationSelector: text("paginationSelector"),
  productLinkSelector: text("productLinkSelector"),
  
  // Regras de limpeza
  cleanupRegex: text("cleanupRegex"),
  prefixesToRemove: text("prefixesToRemove"),
  suffixesToRemove: text("suffixesToRemove"),
  
  // Configurações
  updateFrequencyHours: int("updateFrequencyHours").default(24),
  inactivationPolicy: mysqlEnum("inactivationPolicy", ["never", "after_2_misses", "after_3_misses"]).default("after_3_misses"),
  customHeaders: json("customHeaders"),
  retryAttempts: int("retryAttempts").default(3),
  timeoutSeconds: int("timeoutSeconds").default(30),
  
  // Status
  isActive: boolean("isActive").default(true),
  lastCaptureAt: timestamp("lastCaptureAt"),
  lastSuccessAt: timestamp("lastSuccessAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SupplierCaptureConfig = typeof supplierCaptureConfigs.$inferSelect;
export type InsertSupplierCaptureConfig = typeof supplierCaptureConfigs.$inferInsert;

// ─── Credenciais de Fornecedor (Criptografadas) ────────────────────────────
export const supplierCredentials = mysqlTable("supplier_credentials", {
  id: int("id").autoincrement().primaryKey(),
  supplierId: int("supplierId")
    .notNull()
    .references(() => suppliers.id, { onDelete: "cascade" }),
  
  // Tipo de autenticação
  authType: mysqlEnum("authType", ["username_password", "api_key", "oauth", "session_token"]).default("username_password"),
  
  // Credenciais (criptografadas)
  username: text("username"),
  passwordEncrypted: text("passwordEncrypted"),
  apiKey: text("apiKey"),
  sessionToken: text("sessionToken"),
  
  // Metadados
  notes: text("notes"),
  lastUsedAt: timestamp("lastUsedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SupplierCredential = typeof supplierCredentials.$inferSelect;
export type InsertSupplierCredential = typeof supplierCredentials.$inferInsert;

// ─── Sessões de Fornecedor ────────────────────────────────────────────────
export const supplierSessions = mysqlTable("supplier_sessions", {
  id: int("id").autoincrement().primaryKey(),
  supplierId: int("supplierId")
    .notNull()
    .references(() => suppliers.id, { onDelete: "cascade" }),
  
  // Dados de sessão
  cookies: text("cookies"), // JSON stringificado
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
export const captureLogs = mysqlTable("capture_logs", {
  id: int("id").autoincrement().primaryKey(),
  supplierId: int("supplierId")
    .notNull()
    .references(() => suppliers.id, { onDelete: "cascade" }),
  
  // Timing
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
  durationSeconds: int("durationSeconds"),
  
  // Estatísticas
  totalPages: int("totalPages").default(0),
  totalProductsFound: int("totalProductsFound").default(0),
  newProductsCreated: int("newProductsCreated").default(0),
  productsUpdated: int("productsUpdated").default(0),
  productsWithErrors: int("productsWithErrors").default(0),
  productsIgnored: int("productsIgnored").default(0),
  
  // Status
  status: mysqlEnum("status", ["running", "completed", "failed", "partial"]).default("running"),
  errorMessage: text("errorMessage"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type CaptureLog = typeof captureLogs.$inferSelect;
export type InsertCaptureLog = typeof captureLogs.$inferInsert;

// ─── Histórico de Captura de Produtos ─────────────────────────────────────
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
export const captureErrors = mysqlTable("capture_errors", {
  id: int("id").autoincrement().primaryKey(),
  captureLogId: int("captureLogId")
    .notNull()
    .references(() => captureLogs.id, { onDelete: "cascade" }),
  supplierId: int("supplierId")
    .notNull()
    .references(() => suppliers.id, { onDelete: "cascade" }),
  
  // Contexto do erro
  pageUrl: varchar("pageUrl", { length: 512 }),
  pageNumber: int("pageNumber"),
  productName: varchar("productName", { length: 256 }),
  
  // Erro
  errorType: varchar("errorType", { length: 128 }).notNull(),
  errorMessage: text("errorMessage").notNull(),
  failureStage: varchar("failureStage", { length: 128 }),
  
  // Snapshot para debug
  htmlSnapshot: text("htmlSnapshot"),
  stackTrace: text("stackTrace"),
  
  // Reprocessamento
  canReprocess: boolean("canReprocess").default(true),
  reprocessedAt: timestamp("reprocessedAt"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type CaptureError = typeof captureErrors.$inferSelect;
export type InsertCaptureError = typeof captureErrors.$inferInsert;



// Tabelas de Notificações
export const notificationWebhooks = mysqlTable("notification_webhooks", {
  id: int("id").autoincrement().primaryKey(),
  supplierId: int("supplierId")
    .notNull()
    .references(() => suppliers.id, { onDelete: "cascade" }),
  type: mysqlEnum("type", ["slack", "email"]).notNull(),
  webhookUrl: varchar("webhookUrl", { length: 512 }).notNull(),
  name: varchar("name", { length: 255 }),
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow(),
});

export const notificationHistory = mysqlTable("notification_history", {
  id: int("id").autoincrement().primaryKey(),
  supplierId: int("supplierId")
    .notNull()
    .references(() => suppliers.id, { onDelete: "cascade" }),
  webhookId: int("webhookId")
    .notNull()
    .references(() => notificationWebhooks.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 50 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message"),
  status: mysqlEnum("status", ["sent", "failed"]).default("sent"),
  errorMessage: text("errorMessage"),
  sentAt: timestamp("sentAt").defaultNow(),
});


export type NotificationHistory = typeof notificationHistory.$inferSelect;
export type InsertNotificationHistory = typeof notificationHistory.$inferInsert;

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


export const duplicateDetectionRuns = mysqlTable(
  "duplicate_detection_runs",
  {
    id: int("id").autoincrement().primaryKey(),
    triggeredByUserId: int("triggeredByUserId").references(() => users.id, { onDelete: "set null" }),
    status: mysqlEnum("status", ["running", "completed", "failed"]).default("running").notNull(),
    scope: json("scope"),
    totalCandidates: int("totalCandidates").default(0).notNull(),
    confirmedCount: int("confirmedCount").default(0).notNull(),
    probableCount: int("probableCount").default(0).notNull(),
    reviewCount: int("reviewCount").default(0).notNull(),
    ignoredCount: int("ignoredCount").default(0).notNull(),
    notes: text("notes"),
    finishedAt: timestamp("finishedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("idx_duplicate_runs_status").on(table.status),
    index("idx_duplicate_runs_user").on(table.triggeredByUserId),
    index("idx_duplicate_runs_created").on(table.createdAt),
  ]
);
export type DuplicateDetectionRun = typeof duplicateDetectionRuns.$inferSelect;
export type InsertDuplicateDetectionRun = typeof duplicateDetectionRuns.$inferInsert;

export const duplicateDetectionResults = mysqlTable(
  "duplicate_detection_results",
  {
    id: int("id").autoincrement().primaryKey(),
    runId: int("runId").notNull().references(() => duplicateDetectionRuns.id, { onDelete: "cascade" }),
    primaryProductId: int("primaryProductId").notNull().references(() => products.id, { onDelete: "cascade" }),
    secondaryProductId: int("secondaryProductId").notNull().references(() => products.id, { onDelete: "cascade" }),
    score: decimal("score", { precision: 5, scale: 2 }).default("0.00").notNull(),
    classification: mysqlEnum("classification", ["confirmed", "probable", "review", "distinct", "ignored", "merged"]).default("review").notNull(),
    rationale: text("rationale"),
    matchedFields: json("matchedFields"),
    reviewedByUserId: int("reviewedByUserId").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("idx_duplicate_results_run").on(table.runId),
    index("idx_duplicate_results_primary").on(table.primaryProductId),
    index("idx_duplicate_results_secondary").on(table.secondaryProductId),
    index("idx_duplicate_results_classification").on(table.classification),
    index("idx_duplicate_results_score").on(table.score),
  ]
);
export type DuplicateDetectionResult = typeof duplicateDetectionResults.$inferSelect;
export type InsertDuplicateDetectionResult = typeof duplicateDetectionResults.$inferInsert;

export const duplicateMergeHistory = mysqlTable(
  "duplicate_merge_history",
  {
    id: int("id").autoincrement().primaryKey(),
    resultId: int("resultId").references(() => duplicateDetectionResults.id, { onDelete: "set null" }),
    primaryProductId: int("primaryProductId").notNull().references(() => products.id, { onDelete: "cascade" }),
    secondaryProductId: int("secondaryProductId").notNull().references(() => products.id, { onDelete: "cascade" }),
    action: mysqlEnum("action", ["merge", "replace", "ignore", "mark_distinct"]).notNull(),
    performedByUserId: int("performedByUserId").references(() => users.id, { onDelete: "set null" }),
    notes: text("notes"),
    snapshot: json("snapshot"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    index("idx_duplicate_history_result").on(table.resultId),
    index("idx_duplicate_history_primary").on(table.primaryProductId),
    index("idx_duplicate_history_secondary").on(table.secondaryProductId),
    index("idx_duplicate_history_action").on(table.action),
  ]
);
export type DuplicateMergeHistory = typeof duplicateMergeHistory.$inferSelect;
export type InsertDuplicateMergeHistory = typeof duplicateMergeHistory.$inferInsert;

export const executiveDecisions = mysqlTable(
  "executive_decisions",
  {
    id: int("id").autoincrement().primaryKey(),
    proposalId: int("proposalId").references(() => proposals.id, { onDelete: "set null" }),
    orgId: int("orgId").references(() => requestingOrgs.id, { onDelete: "set null" }),
    recommendation: mysqlEnum("recommendation", ["vale_entrar", "entrar_com_cautela", "nao_vale_entrar"]).notNull(),
    totalScore: int("totalScore").default(0).notNull(),
    adherenceScore: int("adherenceScore").default(0).notNull(),
    marginScore: int("marginScore").default(0).notNull(),
    documentalRiskScore: int("documentalRiskScore").default(0).notNull(),
    technicalRiskScore: int("technicalRiskScore").default(0).notNull(),
    operationalRiskScore: int("operationalRiskScore").default(0).notNull(),
    historyScore: int("historyScore").default(0).notNull(),
    marginEstimate: decimal("marginEstimate", { precision: 10, scale: 2 }).default("0.00"),
    justification: text("justification"),
    nextStep: text("nextStep"),
    riskSummary: text("riskSummary"),
    createdByUserId: int("createdByUserId").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("idx_exec_decisions_proposal").on(table.proposalId),
    index("idx_exec_decisions_org").on(table.orgId),
    index("idx_exec_decisions_recommendation").on(table.recommendation),
    index("idx_exec_decisions_score").on(table.totalScore),
  ]
);
export type ExecutiveDecision = typeof executiveDecisions.$inferSelect;
export type InsertExecutiveDecision = typeof executiveDecisions.$inferInsert;

export const executiveDecisionFactors = mysqlTable(
  "executive_decision_factors",
  {
    id: int("id").autoincrement().primaryKey(),
    decisionId: int("decisionId").notNull().references(() => executiveDecisions.id, { onDelete: "cascade" }),
    factorKey: varchar("factorKey", { length: 64 }).notNull(),
    factorLabel: varchar("factorLabel", { length: 128 }).notNull(),
    score: int("score").default(0).notNull(),
    weight: int("weight").default(0).notNull(),
    impact: mysqlEnum("impact", ["positive", "neutral", "negative"]).default("neutral").notNull(),
    details: text("details"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    index("idx_exec_factors_decision").on(table.decisionId),
    index("idx_exec_factors_key").on(table.factorKey),
    index("idx_exec_factors_impact").on(table.impact),
  ]
);
export type ExecutiveDecisionFactor = typeof executiveDecisionFactors.$inferSelect;
export type InsertExecutiveDecisionFactor = typeof executiveDecisionFactors.$inferInsert;

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

export const contractBalanceMovements = mysqlTable(
  "contract_balance_movements",
  {
    id: int("id").autoincrement().primaryKey(),
    contractId: int("contractId").notNull().references(() => postAwardContracts.id, { onDelete: "cascade" }),
    movementType: mysqlEnum("movementType", ["empenho", "faturamento", "consumo", "reforco", "glosa", "outro"]).notNull(),
    amount: decimal("amount", { precision: 14, scale: 2 }).default("0.00").notNull(),
    movementDate: date("movementDate").notNull(),
    description: text("description"),
    referenceNumber: varchar("referenceNumber", { length: 128 }),
    createdByUserId: int("createdByUserId").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    index("idx_contract_balance_contract").on(table.contractId),
    index("idx_contract_balance_type").on(table.movementType),
    index("idx_contract_balance_date").on(table.movementDate),
  ]
);
export type ContractBalanceMovement = typeof contractBalanceMovements.$inferSelect;
export type InsertContractBalanceMovement = typeof contractBalanceMovements.$inferInsert;

export const contractReajustes = mysqlTable(
  "contract_reajustes",
  {
    id: int("id").autoincrement().primaryKey(),
    contractId: int("contractId").notNull().references(() => postAwardContracts.id, { onDelete: "cascade" }),
    reajusteDate: date("reajusteDate").notNull(),
    indexName: varchar("indexName", { length: 64 }),
    indexPercent: decimal("indexPercent", { precision: 8, scale: 4 }).default("0.0000"),
    previousValue: decimal("previousValue", { precision: 14, scale: 2 }).default("0.00"),
    updatedValue: decimal("updatedValue", { precision: 14, scale: 2 }).default("0.00"),
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    index("idx_contract_reajuste_contract").on(table.contractId),
    index("idx_contract_reajuste_date").on(table.reajusteDate),
  ]
);
export type ContractReajuste = typeof contractReajustes.$inferSelect;
export type InsertContractReajuste = typeof contractReajustes.$inferInsert;

export const contractExtensions = mysqlTable(
  "contract_extensions",
  {
    id: int("id").autoincrement().primaryKey(),
    contractId: int("contractId").notNull().references(() => postAwardContracts.id, { onDelete: "cascade" }),
    extensionType: mysqlEnum("extensionType", ["prazo", "quantitativo", "ambos"]).default("prazo").notNull(),
    previousEndDate: date("previousEndDate"),
    newEndDate: date("newEndDate"),
    addedDays: int("addedDays").default(0).notNull(),
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    index("idx_contract_extensions_contract").on(table.contractId),
    index("idx_contract_extensions_new_end").on(table.newEndDate),
  ]
);
export type ContractExtension = typeof contractExtensions.$inferSelect;
export type InsertContractExtension = typeof contractExtensions.$inferInsert;

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

export const capturedProductBatches = mysqlTable(
  "captured_product_batches",
  {
    id: int("id").autoincrement().primaryKey(),
    sourceType: mysqlEnum("sourceType", ["url", "html", "pdf", "spreadsheet", "xml", "docx", "text"]).notNull(),
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
    sourceType: mysqlEnum("sourceType", ["url", "html", "pdf", "spreadsheet", "xml", "docx", "text"]).notNull(),
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
    sourceType: mysqlEnum("sourceType", ["spreadsheet", "pdf", "docx", "body", "manual"]).default("body").notNull(),
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
    tipo: mysqlEnum("tipo", ["simples_efetiva", "icms", "difal", "st", "fcp", "iss", "outro"]).notNull(),
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
  (t) => [index("idx_po_status").on(t.status), index("idx_po_funil").on(t.funilId)]
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
