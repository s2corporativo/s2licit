-- Análise de vitória/derrota: registra o desfecho de cada cotação disputada.
ALTER TABLE `email_quotations` ADD COLUMN `resultado` enum('pendente','ganhou','perdeu','cancelada') NOT NULL DEFAULT 'pendente';
ALTER TABLE `email_quotations` ADD COLUMN `valorProposto` decimal(15,2) NULL;
ALTER TABLE `email_quotations` ADD COLUMN `valorVencedor` decimal(15,2) NULL;
ALTER TABLE `email_quotations` ADD COLUMN `categoria` varchar(128) NULL;
ALTER TABLE `email_quotations` ADD COLUMN `resultadoObs` text NULL;
ALTER TABLE `email_quotations` ADD COLUMN `resultadoEm` timestamp NULL;
CREATE INDEX `idx_email_quotations_resultado` ON `email_quotations` (`resultado`);
