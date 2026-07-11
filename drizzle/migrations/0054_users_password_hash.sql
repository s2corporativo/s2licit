-- Login local: hash scrypt da senha (null para usuários OAuth).
-- Esta coluna também é garantida automaticamente no boot do servidor
-- (ver server/_core/localAuth.ts), pois o histórico de migrações do
-- projeto tem três esquemas paralelos e nem todo ambiente as executa.
ALTER TABLE `users` ADD COLUMN `passwordHash` VARCHAR(255) NULL;
