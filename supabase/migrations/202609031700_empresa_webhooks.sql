-- Webhooks de saída por empresa (alarme de canal WhatsApp, etc.)

CREATE TABLE IF NOT EXISTS public.empresa_webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nome text NOT NULL DEFAULT 'Webhook',
  url text NOT NULL,
  secret text NOT NULL,
  events text[] NOT NULL DEFAULT ARRAY['channel.disconnected']::text[],
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT empresa_webhooks_url_http CHECK (url ~* '^https?://'),
  CONSTRAINT empresa_webhooks_events_not_empty CHECK (cardinality(events) >= 1)
);

COMMENT ON TABLE public.empresa_webhooks IS
  'Destinos HTTP cadastrados pela empresa para receber eventos do HuginFlow (ex.: canal desconectado).';

CREATE INDEX IF NOT EXISTS idx_empresa_webhooks_empresa_ativo
  ON public.empresa_webhooks (empresa_id, ativo);

CREATE TABLE IF NOT EXISTS public.empresa_webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  webhook_id uuid NOT NULL REFERENCES public.empresa_webhooks(id) ON DELETE CASCADE,
  event text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status_code integer,
  success boolean NOT NULL DEFAULT false,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.empresa_webhook_deliveries IS
  'Log de entregas dos webhooks de saída (auditoria).';

CREATE INDEX IF NOT EXISTS idx_empresa_webhook_deliveries_empresa_created
  ON public.empresa_webhook_deliveries (empresa_id, created_at DESC);

ALTER TABLE public.empresa_webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empresa_webhooks FORCE ROW LEVEL SECURITY;
ALTER TABLE public.empresa_webhook_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empresa_webhook_deliveries FORCE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.empresa_webhooks_tenant_ok(p_empresa_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(public.get_my_role(), '') = 'superadmin'
    OR p_empresa_id IN (
      SELECT u.empresa_id
      FROM public.usuarios u
      WHERE u.auth_user_id = auth.uid() OR u.id = auth.uid()
    );
$$;

DROP POLICY IF EXISTS empresa_webhooks_select ON public.empresa_webhooks;
DROP POLICY IF EXISTS empresa_webhooks_insert ON public.empresa_webhooks;
DROP POLICY IF EXISTS empresa_webhooks_update ON public.empresa_webhooks;
DROP POLICY IF EXISTS empresa_webhooks_delete ON public.empresa_webhooks;
DROP POLICY IF EXISTS empresa_webhook_deliveries_select ON public.empresa_webhook_deliveries;

CREATE POLICY empresa_webhooks_select
  ON public.empresa_webhooks FOR SELECT TO authenticated
  USING (public.empresa_webhooks_tenant_ok(empresa_id));

CREATE POLICY empresa_webhooks_insert
  ON public.empresa_webhooks FOR INSERT TO authenticated
  WITH CHECK (public.empresa_webhooks_tenant_ok(empresa_id));

CREATE POLICY empresa_webhooks_update
  ON public.empresa_webhooks FOR UPDATE TO authenticated
  USING (public.empresa_webhooks_tenant_ok(empresa_id))
  WITH CHECK (public.empresa_webhooks_tenant_ok(empresa_id));

CREATE POLICY empresa_webhooks_delete
  ON public.empresa_webhooks FOR DELETE TO authenticated
  USING (public.empresa_webhooks_tenant_ok(empresa_id));

CREATE POLICY empresa_webhook_deliveries_select
  ON public.empresa_webhook_deliveries FOR SELECT TO authenticated
  USING (public.empresa_webhooks_tenant_ok(empresa_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.empresa_webhooks TO authenticated;
GRANT SELECT ON public.empresa_webhook_deliveries TO authenticated;
GRANT ALL ON public.empresa_webhooks TO service_role;
GRANT ALL ON public.empresa_webhook_deliveries TO service_role;
