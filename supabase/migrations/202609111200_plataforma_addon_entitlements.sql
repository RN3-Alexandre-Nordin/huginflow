-- Plataforma: catálogo de addons + entitlements por empresa
-- Billing SaaS RN3 permanece em finance_* (rn3Only). FinOps do cliente = slug finops (reservado).

CREATE TABLE IF NOT EXISTS public.addon_registry (
  codigo text PRIMARY KEY,
  nome text NOT NULL,
  descricao text,
  tipo text NOT NULL
    CHECK (tipo IN ('foundation', 'addon')),
  sort_order int NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  default_enabled boolean NOT NULL DEFAULT false,
  rn3_only boolean NOT NULL DEFAULT false,
  billable boolean NOT NULL DEFAULT true,
  billing_model text NOT NULL DEFAULT 'flat'
    CHECK (billing_model IN ('flat', 'per_seat', 'usage', 'included')),
  list_price_cents int
    CHECK (list_price_cents IS NULL OR list_price_cents >= 0),
  currency text NOT NULL DEFAULT 'BRL',
  sku_externo text,
  config_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.usuarios (id) ON DELETE SET NULL
);

COMMENT ON TABLE public.addon_registry IS
  'Catálogo global de addons da plataforma (SKU). Não é por tenant.';
COMMENT ON COLUMN public.addon_registry.billable IS
  'Se true, linha pode entrar no billing SaaS RN3 (finance_*).';
COMMENT ON COLUMN public.addon_registry.billing_model IS
  'flat | per_seat | usage | included (foundation / pacote).';

CREATE TABLE IF NOT EXISTS public.empresa_addons (
  empresa_id uuid NOT NULL REFERENCES public.empresas (id) ON DELETE CASCADE,
  addon_codigo text NOT NULL REFERENCES public.addon_registry (codigo) ON DELETE RESTRICT,
  enabled boolean NOT NULL DEFAULT false,
  plano text,
  commercial_status text NOT NULL DEFAULT 'active'
    CHECK (commercial_status IN ('active', 'trial', 'courtesy', 'suspended', 'ended')),
  quantity int NOT NULL DEFAULT 1
    CHECK (quantity >= 0),
  price_override_cents int
    CHECK (price_override_cents IS NULL OR price_override_cents >= 0),
  starts_at timestamptz,
  ends_at timestamptz,
  config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.usuarios (id) ON DELETE SET NULL,
  PRIMARY KEY (empresa_id, addon_codigo),
  CONSTRAINT empresa_addons_vigencia_chk
    CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at >= starts_at)
);

COMMENT ON TABLE public.empresa_addons IS
  'Entitlement + linha comercial por empresa. enabled = acesso; commercial_status/billable = cobrança.';
COMMENT ON COLUMN public.empresa_addons.enabled IS
  'Acesso técnico ao módulo. Independente de faturar (piloto/cortesia).';

CREATE INDEX IF NOT EXISTS idx_empresa_addons_empresa
  ON public.empresa_addons (empresa_id);
CREATE INDEX IF NOT EXISTS idx_empresa_addons_codigo_enabled
  ON public.empresa_addons (addon_codigo, enabled)
  WHERE enabled = true;

-- Seed catálogo (idempotente)
INSERT INTO public.addon_registry (
  codigo, nome, descricao, tipo, sort_order, ativo,
  default_enabled, rn3_only, billable, billing_model, list_price_cents
) VALUES
  (
    'cadastros',
    'Cadastros',
    'Fundação da plataforma (empresa, usuários, departamentos). Sempre on.',
    'foundation', 10, true,
    true, false, false, 'included', NULL
  ),
  (
    'workflow',
    'Workflows / funis',
    'Funis, cards e base de leads operacional ligada a funil.',
    'addon', 20, true,
    true, false, true, 'flat', NULL
  ),
  (
    'omni',
    'Omni / IA',
    'Chat omnichannel, canais inbound, conhecimento e simulador.',
    'addon', 30, true,
    true, false, true, 'flat', NULL
  ),
  (
    'estoque',
    'Estoque',
    'Reservado — app ainda não existe na plataforma.',
    'addon', 40, true,
    false, false, true, 'flat', NULL
  ),
  (
    'crm',
    'CRM comercial',
    'Reservado — CRM comercial (não o funil interno).',
    'addon', 50, true,
    false, false, true, 'flat', NULL
  ),
  (
    'finops',
    'FinOps do cliente',
    'Reservado — financeiro operacional do tenant. NÃO é o billing SaaS RN3 (finance_*).',
    'addon', 60, true,
    false, false, true, 'flat', NULL
  )
ON CONFLICT (codigo) DO UPDATE SET
  nome = EXCLUDED.nome,
  descricao = EXCLUDED.descricao,
  tipo = EXCLUDED.tipo,
  sort_order = EXCLUDED.sort_order,
  ativo = EXCLUDED.ativo,
  default_enabled = EXCLUDED.default_enabled,
  rn3_only = EXCLUDED.rn3_only,
  billable = EXCLUDED.billable,
  billing_model = EXCLUDED.billing_model,
  updated_at = now();

-- Backfill: toda empresa recebe todas as linhas do registry com default_enabled
INSERT INTO public.empresa_addons (
  empresa_id,
  addon_codigo,
  enabled,
  commercial_status,
  quantity,
  updated_at
)
SELECT
  e.id,
  r.codigo,
  r.default_enabled,
  CASE WHEN r.default_enabled THEN 'active' ELSE 'ended' END,
  1,
  now()
FROM public.empresas e
CROSS JOIN public.addon_registry r
ON CONFLICT (empresa_id, addon_codigo) DO NOTHING;

ALTER TABLE public.addon_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empresa_addons ENABLE ROW LEVEL SECURITY;

-- Catálogo: leitura autenticada; escrita só service_role (actions superadmin)
DROP POLICY IF EXISTS addon_registry_select_authenticated ON public.addon_registry;
CREATE POLICY addon_registry_select_authenticated
  ON public.addon_registry
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS addon_registry_service_all ON public.addon_registry;
CREATE POLICY addon_registry_service_all
  ON public.addon_registry
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Entitlements: SELECT do próprio tenant ou superadmin; escrita só service_role
DROP POLICY IF EXISTS empresa_addons_select_tenant ON public.empresa_addons;
CREATE POLICY empresa_addons_select_tenant
  ON public.empresa_addons
  FOR SELECT
  TO authenticated
  USING (
    public.current_user_is_superadmin()
    OR empresa_id = public.current_user_empresa_id()
  );

DROP POLICY IF EXISTS empresa_addons_service_all ON public.empresa_addons;
CREATE POLICY empresa_addons_service_all
  ON public.empresa_addons
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT ON public.addon_registry TO authenticated;
GRANT SELECT ON public.empresa_addons TO authenticated;
GRANT ALL ON public.addon_registry TO service_role;
GRANT ALL ON public.empresa_addons TO service_role;

REVOKE INSERT, UPDATE, DELETE ON public.addon_registry FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.empresa_addons FROM authenticated;
