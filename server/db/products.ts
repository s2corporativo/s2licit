/**
 * Barrel de acesso a dados - Domínio: Produtos.
 * Reexporta as funções de produto/categoria/fornecedor do server/db.ts.
 *
 * FASE 3.2 do Prompt Mestre — Acesso a dados por domínio.
 * Preservação: server/db.ts continua como fonte única das queries.
 */
export {
  listProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  bulkInsertProducts,
  bulkUpdateProducts,
  deactivateProductsByBatch,
  smartSearch,
  autocompleteSearch,
  compareByActiveIngredient,
  listCategories,
  listCategoriesHierarchy,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
  listSuppliers,
  getSupplierById,
  createSupplier,
  updateSupplier,
  deleteSupplier,
} from "../db";
