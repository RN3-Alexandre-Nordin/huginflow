-- Fase 6: documento de devolução ao fornecedor. Não emite NF-e, não gera título e não move saldo.

CREATE TABLE IF NOT EXISTS public.com_devolucoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas (id) ON DELETE CASCADE,
  pedido_id uuid NOT NULL REFERENCES public.com_pedidos (id) ON DELETE RESTRICT,
  fornecedor_id uuid NOT NULL REFERENCES public.crm_leads (id) ON DELETE RESTRICT,
  numero text NOT NULL,
  status text NOT NULL DEFAULT 'rascunho',
  observacao text,
  criador_usuario_id uuid NULL REFERENCES public.usuarios (id) ON DELETE SET NULL,
  confirmada_em timestamptz,
  confirmada_usuario_id uuid NULL REFERENCES public.usuarios (id) ON DELETE SET NULL,
  cancelada_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT com_devolucoes_status_check CHECK (status IN ('rascunho', 'confirmada', 'cancelada')),
  CONSTRAINT com_devolucoes_empresa_numero_uq UNIQUE (empresa_id, numero)
);

CREATE TABLE IF NOT EXISTS public.com_devolucao_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas (id) ON DELETE CASCADE,
  devolucao_id uuid NOT NULL REFERENCES public.com_devolucoes (id) ON DELETE CASCADE,
  pedido_item_id uuid NOT NULL REFERENCES public.com_pedido_itens (id) ON DELETE RESTRICT,
  sku_id uuid NULL REFERENCES public.cad_skus (id) ON DELETE RESTRICT,
  descricao text NOT NULL,
  quantidade numeric(14, 4) NOT NULL CHECK (quantidade > 0),
  unidade text NOT NULL DEFAULT 'UN',
  motivo text NOT NULL,
  CONSTRAINT com_devolucao_itens_motivo_check CHECK (motivo IN ('trocado', 'avaria', 'outro'))
);

CREATE INDEX IF NOT EXISTS com_devolucoes_empresa_pedido_idx
  ON public.com_devolucoes (empresa_id, pedido_id);
CREATE INDEX IF NOT EXISTS com_devolucao_itens_empresa_item_idx
  ON public.com_devolucao_itens (empresa_id, pedido_item_id);

COMMENT ON TABLE public.com_devolucoes IS
  'Devolução ao fornecedor por SKU trocado, avaria ou outro. Não emite NF-e e não baixa título.';

ALTER TABLE public.com_devolucoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.com_devolucao_itens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS com_devolucoes_select ON public.com_devolucoes;
CREATE POLICY com_devolucoes_select ON public.com_devolucoes
FOR SELECT TO authenticated
USING (
  empresa_id = public.current_user_empresa_id()
  AND (
    public.current_user_is_superadmin()
    OR public.check_permission('compras_devolucoes', 'view')
    OR public.check_permission('compras_pedidos', 'view')
  )
);

DROP POLICY IF EXISTS com_devolucoes_insert ON public.com_devolucoes;
CREATE POLICY com_devolucoes_insert ON public.com_devolucoes
FOR INSERT TO authenticated
WITH CHECK (
  empresa_id = public.current_user_empresa_id()
  AND (
    public.current_user_is_superadmin()
    OR public.check_permission('compras_devolucoes', 'create')
  )
);

DROP POLICY IF EXISTS com_devolucoes_update ON public.com_devolucoes;
CREATE POLICY com_devolucoes_update ON public.com_devolucoes
FOR UPDATE TO authenticated
USING (
  empresa_id = public.current_user_empresa_id()
  AND (
    public.current_user_is_superadmin()
    OR public.check_permission('compras_devolucoes', 'edit')
    OR public.check_permission('compras_devolucoes', 'create')
  )
)
WITH CHECK (
  empresa_id = public.current_user_empresa_id()
  AND (
    public.current_user_is_superadmin()
    OR public.check_permission('compras_devolucoes', 'edit')
    OR public.check_permission('compras_devolucoes', 'create')
  )
);

DROP POLICY IF EXISTS com_devolucao_itens_select ON public.com_devolucao_itens;
CREATE POLICY com_devolucao_itens_select ON public.com_devolucao_itens
FOR SELECT TO authenticated
USING (
  empresa_id = public.current_user_empresa_id()
  AND (
    public.current_user_is_superadmin()
    OR public.check_permission('compras_devolucoes', 'view')
    OR public.check_permission('compras_pedidos', 'view')
  )
);

DROP POLICY IF EXISTS com_devolucao_itens_insert ON public.com_devolucao_itens;
CREATE POLICY com_devolucao_itens_insert ON public.com_devolucao_itens
FOR INSERT TO authenticated
WITH CHECK (
  empresa_id = public.current_user_empresa_id()
  AND (
    public.current_user_is_superadmin()
    OR public.check_permission('compras_devolucoes', 'create')
  )
);

GRANT SELECT, INSERT, UPDATE ON public.com_devolucoes TO authenticated, service_role;
GRANT SELECT, INSERT ON public.com_devolucao_itens TO authenticated, service_role;
