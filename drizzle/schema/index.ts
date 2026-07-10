/**
 * Barrel de schema por domínio (FASE 3.3 do Prompt Mestre).
 * Reexporta o schema central, permitindo migração incremental para
 * importações por domínio sem quebrar compatibilidade.
 *
 * Preservação: o arquivo original drizzle/schema.ts continua sendo
 * a fonte única de verdade das tabelas e tipos.
 */
export * from "../schema";
