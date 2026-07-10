-- Simplificar tabela suppliers
ALTER TABLE suppliers DROP COLUMN IF EXISTS code;
ALTER TABLE suppliers DROP COLUMN IF EXISTS contact;
ALTER TABLE suppliers DROP COLUMN IF EXISTS email;
ALTER TABLE suppliers DROP COLUMN IF EXISTS phone;
ALTER TABLE suppliers DROP COLUMN IF EXISTS notes;

-- Criar tabela de importações de fornecedores
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
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (supplierId) REFERENCES suppliers(id) ON DELETE CASCADE,
  INDEX idx_supplier_imports_supplier (supplierId),
  INDEX idx_supplier_imports_status (status)
);
