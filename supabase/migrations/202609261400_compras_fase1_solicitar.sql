-- Fase 1 do addon compras: solicitação, pedido (carga/aprovação) e alçada por grupo.
-- Sem cotação, sem entrada de estoque e sem PDF ao fornecedor.

INSERT INTO public.addon_registry (
  codigo, nome, descricao, tipo, sort_order, ativo,
  default_enabled, rn3_only, billable, billing_model, list_price_cents
) VALUES (
  'compras',
  'Compras',
  'Solicitação, pedido, recebimento e conferência. Depende do estoque para saldo.',
  'addon', 45, true,
  false, false, true, 'flat', NULL
)
ON CONFLICT (codigo) DO UPDATE SET
  nome = EXCLUDED.nome,
  descricao = EXCLUDED.descricao,
  tipo = EXCLUDED.tipo,
  sort_order = EXCLUDED.sort_order,
  ativo = EXCLUDED.ativo,
  updated_at = now();

INSERT INTO public.empresa_addons (
  empresa_id, addon_codigo, enabled, commercial_status, quantity, updated_at
)
SELECT e.id, 'compras', false, 'ended', 1, now()
FROM public.empresas e
ON CONFLICT (empresa_id, addon_codigo) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.com_config (
  empresa_id uuid PRIMARY KEY REFERENCES public.empresas (id) ON DELETE CASCADE,
  aprovacao_ativa boolean NOT NULL DEFAULT true,
  nivel1_grupo_id uuid NULL REFERENCES public.grupos_acesso (id) ON DELETE SET NULL,
  nivel1_teto numeric(14, 2) NULL,
  nivel2_grupo_id uuid NULL REFERENCES public.grupos_acesso (id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.com_solicitacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas (id) ON DELETE CASCADE,
  numero text NOT NULL,
  solicitante_usuario_id uuid NULL REFERENCES public.usuarios (id) ON DELETE SET NULL,
  data_necessidade date NULL,
  tipo text NOT NULL CHECK (tipo IN ('produtivo', 'consumo', 'servico')),
  observacao text NULL,
  status text NOT NULL DEFAULT 'registrada' CHECK (status IN ('rascunho', 'registrada', 'cancelada')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT com_solicitacoes_empresa_numero_uq UNIQUE (empresa_id, numero)
);

CREATE INDEX IF NOT EXISTS idx_com_solicitacoes_empresa_status
  ON public.com_solicitacoes (empresa_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.com_solicitacao_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas (id) ON DELETE CASCADE,
  solicitacao_id uuid NOT NULL REFERENCES public.com_solicitacoes (id) ON DELETE CASCADE,
  sku_id uuid NULL REFERENCES public.cad_skus (id) ON DELETE RESTRICT,
  descricao text NOT NULL,
  quantidade numeric(14, 4) NOT NULL CHECK (quantidade > 0),
  unidade text NOT NULL DEFAULT 'UN'
);

CREATE INDEX IF NOT EXISTS idx_com_solicitacao_itens_solicitacao
  ON public.com_solicitacao_itens (empresa_id, solicitacao_id);

CREATE TABLE IF NOT EXISTS public.com_pedidos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas (id) ON DELETE CASCADE,
  numero text NOT NULL,
  fornecedor_id uuid NOT NULL REFERENCES public.crm_leads (id) ON DELETE RESTRICT,
  previsao_chegada date NULL,
  tipo text NOT NULL CHECK (tipo IN ('produtivo', 'consumo', 'servico')),
  observacao text NULL,
  status text NOT NULL DEFAULT 'aguardando_aprovacao'
    CHECK (status IN ('aguardando_aprovacao', 'aprovado', 'recusado')),
  valor_total numeric(14, 2) NOT NULL DEFAULT 0,
  origem text NOT NULL DEFAULT 'planilha' CHECK (origem IN ('planilha', 'cotacao', 'direto', 'recorrente')),
  criador_usuario_id uuid NULL REFERENCES public.usuarios (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT com_pedidos_empresa_numero_uq UNIQUE (empresa_id, numero)
);

CREATE INDEX IF NOT EXISTS idx_com_pedidos_empresa_status
  ON public.com_pedidos (empresa_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.com_pedido_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas (id) ON DELETE CASCADE,
  pedido_id uuid NOT NULL REFERENCES public.com_pedidos (id) ON DELETE CASCADE,
  sku_id uuid NULL REFERENCES public.cad_skus (id) ON DELETE RESTRICT,
  descricao text NOT NULL,
  quantidade numeric(14, 4) NOT NULL CHECK (quantidade > 0),
  unidade text NOT NULL DEFAULT 'UN',
  preco_unitario numeric(14, 4) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_com_pedido_itens_pedido
  ON public.com_pedido_itens (empresa_id, pedido_id);

CREATE TABLE IF NOT EXISTS public.com_pedido_aprovacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas (id) ON DELETE CASCADE,
  pedido_id uuid NOT NULL REFERENCES public.com_pedidos (id) ON DELETE CASCADE,
  nivel smallint NOT NULL CHECK (nivel IN (1, 2)),
  usuario_id uuid NOT NULL REFERENCES public.usuarios (id) ON DELETE RESTRICT,
  decisao text NOT NULL CHECK (decisao IN ('aprovado', 'recusado')),
  motivo text NULL,
  decidido_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT com_pedido_aprovacoes_nivel_uq UNIQUE (pedido_id, nivel)
);

CREATE INDEX IF NOT EXISTS idx_com_pedido_aprovacoes_pedido
  ON public.com_pedido_aprovacoes (empresa_id, pedido_id);

ALTER TABLE public.com_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.com_solicitacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.com_solicitacao_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.com_pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.com_pedido_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.com_pedido_aprovacoes ENABLE ROW LEVEL SECURITY;

-- config
DROP POLICY IF EXISTS com_config_select ON public.com_config;
CREATE POLICY com_config_select ON public.com_config
FOR SELECT TO authenticated
USING (
  (public.check_permission('compras', 'view') OR public.check_permission('compras_config', 'view'))
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = com_config.empresa_id)
  )
);

DROP POLICY IF EXISTS com_config_write ON public.com_config;
CREATE POLICY com_config_write ON public.com_config
FOR ALL TO authenticated
USING (
  public.check_permission('compras_config', 'edit')
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = com_config.empresa_id)
  )
)
WITH CHECK (
  public.check_permission('compras_config', 'edit')
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = com_config.empresa_id)
  )
);

-- solicitações
DROP POLICY IF EXISTS com_solicitacoes_select ON public.com_solicitacoes;
CREATE POLICY com_solicitacoes_select ON public.com_solicitacoes
FOR SELECT TO authenticated
USING (
  public.check_permission('compras_solicitacoes', 'view')
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = com_solicitacoes.empresa_id)
  )
);

DROP POLICY IF EXISTS com_solicitacoes_insert ON public.com_solicitacoes;
CREATE POLICY com_solicitacoes_insert ON public.com_solicitacoes
FOR INSERT TO authenticated
WITH CHECK (
  public.check_permission('compras_solicitacoes', 'create')
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = com_solicitacoes.empresa_id)
  )
);

DROP POLICY IF EXISTS com_solicitacao_itens_all ON public.com_solicitacao_itens;
CREATE POLICY com_solicitacao_itens_all ON public.com_solicitacao_itens
FOR ALL TO authenticated
USING (
  public.check_permission('compras_solicitacoes', 'view')
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = com_solicitacao_itens.empresa_id)
  )
)
WITH CHECK (
  public.check_permission('compras_solicitacoes', 'create')
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = com_solicitacao_itens.empresa_id)
  )
);

-- pedidos
DROP POLICY IF EXISTS com_pedidos_select ON public.com_pedidos;
CREATE POLICY com_pedidos_select ON public.com_pedidos
FOR SELECT TO authenticated
USING (
  (public.check_permission('compras_pedidos', 'view') OR public.check_permission('compras_aprovacao', 'view'))
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = com_pedidos.empresa_id)
  )
);

DROP POLICY IF EXISTS com_pedidos_insert ON public.com_pedidos;
CREATE POLICY com_pedidos_insert ON public.com_pedidos
FOR INSERT TO authenticated
WITH CHECK (
  public.check_permission('compras_pedidos', 'create')
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = com_pedidos.empresa_id)
  )
);

DROP POLICY IF EXISTS com_pedidos_update ON public.com_pedidos;
CREATE POLICY com_pedidos_update ON public.com_pedidos
FOR UPDATE TO authenticated
USING (
  (public.check_permission('compras_pedidos', 'edit') OR public.check_permission('compras_aprovacao', 'edit'))
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = com_pedidos.empresa_id)
  )
);

DROP POLICY IF EXISTS com_pedido_itens_all ON public.com_pedido_itens;
CREATE POLICY com_pedido_itens_all ON public.com_pedido_itens
FOR ALL TO authenticated
USING (
  public.check_permission('compras_pedidos', 'view')
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = com_pedido_itens.empresa_id)
  )
)
WITH CHECK (
  public.check_permission('compras_pedidos', 'create')
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = com_pedido_itens.empresa_id)
  )
);

DROP POLICY IF EXISTS com_pedido_aprovacoes_select ON public.com_pedido_aprovacoes;
CREATE POLICY com_pedido_aprovacoes_select ON public.com_pedido_aprovacoes
FOR SELECT TO authenticated
USING (
  (public.check_permission('compras_pedidos', 'view') OR public.check_permission('compras_aprovacao', 'view'))
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = com_pedido_aprovacoes.empresa_id)
  )
);

DROP POLICY IF EXISTS com_pedido_aprovacoes_insert ON public.com_pedido_aprovacoes;
CREATE POLICY com_pedido_aprovacoes_insert ON public.com_pedido_aprovacoes
FOR INSERT TO authenticated
WITH CHECK (
  public.check_permission('compras_aprovacao', 'edit')
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = com_pedido_aprovacoes.empresa_id)
  )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.com_config,
  public.com_solicitacoes,
  public.com_solicitacao_itens,
  public.com_pedidos,
  public.com_pedido_itens,
  public.com_pedido_aprovacoes
TO authenticated, service_role;
