-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0027 — RAG: Motor de Equivalências por Vetores (MySQL 8.0)
-- ─────────────────────────────────────────────────────────────────────────────
-- Armazena embeddings (768 dim — nomic-embed-text) em coluna JSON com índices
-- espaciais aproximados via busca linear com LIMITE (topK <= 100). A busca
-- linear em JSON é suficiente para catálogos de até ~100k produtos com
-- topK pequeno; o filtro por tipoCatalogo/activeIngredient reduz o escopo
-- antes do cálculo de distância. Sem dependência de extensão externa.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `product_embeddings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productId` int NOT NULL,
	`provider` varchar(32) NOT NULL DEFAULT 'nomic-embed-text',
	`model` varchar(64) NOT NULL DEFAULT 'nomic-embed-text',
	`dimensions` int NOT NULL DEFAULT 768,
	`embedding` json NOT NULL COMMENT 'Vetor de dimensões como array JSON de floats',
	`textDigest` text NOT NULL COMMENT 'Texto canônico usado para gerar o embedding (auditoria)',
	`version` int NOT NULL DEFAULT 1 COMMENT 'Versão do pipeline de digest; reindexa quando muda',
	`indexedAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `product_embeddings_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_product_embedding_version` UNIQUE(`productId`, `version`)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `rag_config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`key` varchar(64) NOT NULL,
	`value` varchar(512) NOT NULL,
	`description` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `rag_config_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_rag_config_key` UNIQUE(`key`)
);
--> statement-breakpoint

-- ─── Configuração padrão ────────────────────────────────────────────────────
INSERT IGNORE INTO `rag_config` (`key`, `value`, `description`) VALUES
	('rag.enabled', 'false', 'Habilita/desabilita o Motor de Equivalências RAG — liga só por ativação explícita no painel (ragConfig.ts DEFAULTS.enabled)'),
	('rag.embeddingProvider', 'local', 'local = Ollama na mesma VPS; remote = Ollama remoto (URL via RAG_OLLAMA_URL); groq = Groq'),
	('rag.ollamaUrl', 'http://localhost:11434', 'URL base do Ollama (http://host:11434)'),
	('rag.embeddingModel', 'nomic-embed-text', 'Modelo de embedding (768 dim)'),
	('rag.generationModel', 'llama3.1:8b', 'Modelo de geração da justificativa (quando RAG_GROQ_API_KEY ausente usa o gateway _core/llm)'),
	('rag.topK', '25', 'Quantidade de candidatos vetoriais pré-filtrados'),
	('rag.maxResults', '10', 'Quantidade máxima de equivalências retornadas'),
	('rag.minScore', '0.72', 'Score mínimo de similaridade para sugerir equivalente'),
	('rag.autoMatchScore', '0.88', 'Score mínimo para marcar como match automático'),
	('rag.reindexOnUpdate', 'true', 'Reindexa o embedding quando o produto é atualizado');
--> statement-breakpoint

-- ─── Gatilho de manutenção: desativa embedding órfão se o produto for excluído
-- (MySQL 8.0 não suporta ON DELETE SET NULL composto; a rotina de reindexação
-- trata a limpeza; o embedding órfão é inofensivo e filtrado por JOIN).
