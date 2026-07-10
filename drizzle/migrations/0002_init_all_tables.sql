-- Categorias
CREATE TABLE IF NOT EXISTS categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(256) NOT NULL UNIQUE,
  slug VARCHAR(256),
  description TEXT,
  color VARCHAR(64),
  sortOrder INT DEFAULT 0,
  parentId INT,
  isActive ENUM('yes', 'no') DEFAULT 'yes' NOT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (parentId) REFERENCES categories(id) ON DELETE SET NULL,
  INDEX idx_categories_active (isActive),
  INDEX idx_categories_parent (parentId)
);

-- Fornecedores (simplificado)
CREATE TABLE IF NOT EXISTS suppliers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(256) NOT NULL UNIQUE,
  isActive ENUM('yes', 'no') DEFAULT 'yes' NOT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  INDEX idx_suppliers_active (isActive)
);

-- Importações de fornecedores via XML
CREATE TABLE IF NOT EXISTS supplier_imports (
  id INT AUTO_INCREMENT PRIMARY KEY,
  supplierId INT NOT NULL,
  fileName VARCHAR(256) NOT NULL,
  fileContent LONGTEXT,
  productsImported INT DEFAULT 0,
  productsMatched INT DEFAULT 0,
  status ENUM('pending', 'processing', 'completed', 'failed') DEFAULT 'pending',
  errorMessage LONGTEXT,
  importedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (supplierId) REFERENCES suppliers(id) ON DELETE CASCADE,
  INDEX idx_supplier_imports_supplier (supplierId),
  INDEX idx_supplier_imports_status (status)
);

-- Produtos
CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  supplierId INT NOT NULL,
  categoryId INT,
  code VARCHAR(128),
  name VARCHAR(512) NOT NULL,
  description TEXT,
  activeIngredient VARCHAR(512),
  manufacturer VARCHAR(256),
  unit VARCHAR(64),
  concentration VARCHAR(128),
  presentation VARCHAR(256),
  pharmaceuticalForm VARCHAR(128),
  price DECIMAL(12, 2),
  priceUnit VARCHAR(64),
  stock VARCHAR(64),
  barcode VARCHAR(128),
  gtin VARCHAR(64),
  codigoFornecedor VARCHAR(128),
  informacaoTecnica TEXT,
  mapa VARCHAR(128),
  subcategoria VARCHAR(256),
  fichaTecnica TEXT,
  ncm VARCHAR(16),
  laboratorio VARCHAR(256),
  especieAnimal VARCHAR(256),
  classeTerapeutica VARCHAR(256),
  nomeProduto VARCHAR(512),
  registroRegulatorio ENUM('MAPA', 'ANVISA', 'FORN'),
  nomeNormalizado VARCHAR(512),
  metadataExtractedAt TIMESTAMP,
  ean VARCHAR(64),
  freightValue DECIMAL(12, 2),
  taxValue DECIMAL(12, 2),
  imageUrl TEXT,
  productUrl TEXT,
  importBatchId INT,
  tipoCatalogo ENUM('medicamento_veterinario', 'medicamento_humano', 'produto_nao_medicamentoso', 'material_insumo_equipamento') DEFAULT 'produto_nao_medicamentoso' NOT NULL,
  statusConfiabilidade ENUM('completo_validado', 'completo_nao_validado', 'parcial', 'incompleto', 'enriquecido_ia', 'pendente_revisao') DEFAULT 'incompleto' NOT NULL,
  isActive ENUM('yes', 'no') DEFAULT 'yes' NOT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (supplierId) REFERENCES suppliers(id) ON DELETE CASCADE,
  FOREIGN KEY (categoryId) REFERENCES categories(id) ON DELETE RESTRICT,
  INDEX idx_products_supplier (supplierId),
  INDEX idx_products_category (categoryId),
  INDEX idx_products_active_ingredient (activeIngredient),
  INDEX idx_products_name (name),
  INDEX idx_products_ean (ean),
  INDEX idx_products_active (isActive)
);

-- Propostas
CREATE TABLE IF NOT EXISTS proposals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(512) NOT NULL,
  processNumber VARCHAR(128),
  orgName VARCHAR(512),
  status ENUM('draft', 'sent', 'delivered', 'rejected', 'approved') DEFAULT 'draft' NOT NULL,
  sentAt TIMESTAMP,
  validityDays INT DEFAULT 60,
  totalValue DECIMAL(15, 2),
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  INDEX idx_proposals_status (status)
);

-- Itens de proposta
CREATE TABLE IF NOT EXISTS proposal_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  proposalId INT NOT NULL,
  productId INT,
  quantity INT NOT NULL,
  unitPrice DECIMAL(12, 2),
  costPrice DECIMAL(12, 2),
  suggestedPrice DECIMAL(12, 2),
  totalPrice DECIMAL(15, 2),
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (proposalId) REFERENCES proposals(id) ON DELETE CASCADE,
  FOREIGN KEY (productId) REFERENCES products(id) ON DELETE SET NULL,
  INDEX idx_proposal_items_proposal (proposalId),
  INDEX idx_proposal_items_product (productId)
);
