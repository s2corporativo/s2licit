# Segurança dos scrapers

Antes de atualizar custo automaticamente, o scraper deve validar: fornecedor/config corretos, preço numérico positivo, variação plausível versus histórico, origem/URL, timestamp e evidência quando houver erro. Quedas >70% ou altas >300% são bloqueadas por padrão e devem ir para revisão humana. Os percentuais são configuráveis por ambiente.
