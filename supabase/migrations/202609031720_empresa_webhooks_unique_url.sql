-- URL de webhook única por empresa (CNPJ no path). Uma linha por cliente.

CREATE UNIQUE INDEX IF NOT EXISTS empresa_webhooks_empresa_unique
  ON public.empresa_webhooks (empresa_id);

CREATE UNIQUE INDEX IF NOT EXISTS empresa_webhooks_url_unique
  ON public.empresa_webhooks (url);
