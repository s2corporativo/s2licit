/**
 * Utilitário centralizado para tratamento de erros em endpoints de importação
 * Garante que exceções sejam capturadas e retornadas como JSON estruturado
 *
 * CORREÇÃO SEGURANÇA: stack trace NUNCA é incluído na resposta ao cliente.
 * Sempre logado no servidor via console.error para diagnóstico interno.
 */

export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, any>;
  };
}

export interface SuccessResponse<T> {
  success: true;
  data: T;
}

export type ApiResponse<T> = SuccessResponse<T> | ErrorResponse;

export enum ErrorCode {
  VALIDATION_ERROR = "VALIDATION_ERROR",
  DATABASE_ERROR = "DATABASE_ERROR",
  FILE_PROCESSING_ERROR = "FILE_PROCESSING_ERROR",
  IMPORT_ERROR = "IMPORT_ERROR",
  DUPLICATE_DETECTION_ERROR = "DUPLICATE_DETECTION_ERROR",
  FUZZY_MATCHING_ERROR = "FUZZY_MATCHING_ERROR",
  CATEGORY_REVIEW_ERROR = "CATEGORY_REVIEW_ERROR",
  UNKNOWN_ERROR = "UNKNOWN_ERROR",
}

export async function withErrorHandling<T>(
  fn: () => Promise<T>,
  errorCode: ErrorCode = ErrorCode.UNKNOWN_ERROR,
  context?: Record<string, any>
): Promise<ApiResponse<T>> {
  try {
    const data = await fn();
    return { success: true, data };
  } catch (error: any) {
    // Stack trace APENAS no servidor — nunca exposto ao cliente
    console.error(`[${errorCode}]`, error?.message || error, context);
    if (error?.stack) console.error(`[${errorCode}] Stack:`, error.stack);

    const message = error?.message || "Erro desconhecido durante processamento";

    return {
      success: false,
      error: {
        code: errorCode,
        message,
        details: {
          timestamp: new Date().toISOString(),
          ...(context && { context }),
        },
      },
    };
  }
}

export function validateImportInput(input: any, requiredFields: string[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!input) { errors.push("Entrada inválida: dados não fornecidos"); return { valid: false, errors }; }
  for (const field of requiredFields) {
    if (!(field in input)) errors.push(`Campo obrigatório ausente: ${field}`);
  }
  if (input.rows && !Array.isArray(input.rows)) errors.push("Campo 'rows' deve ser um array");
  if (input.rows && Array.isArray(input.rows) && input.rows.length === 0) errors.push("Array 'rows' não pode estar vazio");
  if (input.rows && Array.isArray(input.rows) && input.rows.length > 3000) errors.push("Máximo de 3000 linhas por requisição");
  return { valid: errors.length === 0, errors };
}

export function formatErrorLog(errorCode: ErrorCode, message: string, context?: Record<string, any>): string {
  return JSON.stringify({ timestamp: new Date().toISOString(), errorCode, message, context });
}

export function handleDatabaseError(error: any): ErrorResponse {
  console.error("[DATABASE_ERROR]", error?.message);
  if (error?.stack) console.error("[DATABASE_ERROR] Stack:", error.stack);
  const message = error?.message?.includes("FOREIGN KEY")
    ? "Erro de integridade referencial: produto não pode ser deletado pois está vinculado a outras entidades"
    : error?.message?.includes("UNIQUE")
    ? "Erro de duplicação: registro com esses dados já existe"
    : "Erro ao acessar banco de dados";
  return { success: false, error: { code: ErrorCode.DATABASE_ERROR, message, details: { timestamp: new Date().toISOString() } } };
}

export function handleValidationError(errors: string[]): ErrorResponse {
  return { success: false, error: { code: ErrorCode.VALIDATION_ERROR, message: "Validação de entrada falhou", details: { timestamp: new Date().toISOString(), errors } } };
}
