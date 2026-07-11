-- Prazo de resposta das cotações recebidas (para alertas de prazo).
ALTER TABLE `email_quotations` ADD COLUMN `prazoResposta` date NULL;
CREATE INDEX `idx_email_quotations_prazo` ON `email_quotations` (`prazoResposta`);
