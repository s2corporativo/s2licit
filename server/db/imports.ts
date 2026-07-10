/**
 * Barrel de acesso a dados - Domínio: Importação.
 * Reexporta queries de ImportLog e fluxos de importação do server/db.ts.
 */
export {
  createImportLog,
  updateImportLog,
  listImportLogs,
} from "../db";
