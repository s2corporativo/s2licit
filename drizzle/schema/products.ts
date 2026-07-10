/**
 * Schema de domínio: Produtos e Categorias.
 * Reexporta as tabelas e tipos do schema central.
 * Uso: import { products, categories } from "@/drizzle/schema/products";
 */
export {
  products,
  categories,
  masterProducts,
  productImages,
  suppliers,
  synonyms,
} from "../schema";

export type {
  Product,
  InsertProduct,
  Category,
  InsertCategory,
  MasterProduct,
  InsertMasterProduct,
  ProductImage,
  InsertProductImage,
  Supplier,
  InsertSupplier,
  Synonym,
} from "../schema";
