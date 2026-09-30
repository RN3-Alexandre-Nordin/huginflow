-- Fase 4 Compras: nota de entrada vinculada ao pedido. Sem movimento de estoque.

CREATE TABLE IF NOT EXISTS public.com_notas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas (id) ON DELETE CASCADE,
  pedido_id uuid NOT NULL REFERENCES public.com_pedidos (id) ON DELETE RESTRICT,
  fornecedor_id uuid NOT NULL REFERENCES public.crm_leads (id) ON DELETE RESTRICT,
  numero text NOT NULL,
  serie text NOT NULL DEFAULT '1',
  chave text NULL,
  data_emissao date NOT NULL,
  valor_total numeric(14, 2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'rascunho'
    CHECK (status IN ('rascunho', 'confirmada', 'cancelada')),
  origem text NOT NULL DEFAULT 'manual'
    CHECK (origem IN ('manual', 'xml')),
  emitente_documento text NULL,
  observacao text NULL,
  criador_usuario_id uuid NULL REFERENCES public.usuarios (id) ON DELETE SET NULL,
  confirmada_em timestamptz NULL,
  confirmada_usuario_id uuid NULL REFERENCES public.usuarios (id) ON DELETE SET NULL,
  cancelada_em timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT com_notas_empresa_pedido_numero_serie_uq UNIQUE (empresa_id, pedido_id, numero, serie)
);

CREATE UNIQUE INDEX IF NOT EXISTS com_notas_empresa_chave_uq
  ON public.com_notas (empresa_id, chave)
  WHERE chave IS NOT NULL AND chave <> '';

CREATE INDEX IF NOT EXISTS idx_com_notas_empresa_status
  ON public.com_notas (empresa_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_com_notas_pedido
  ON public.com_notas (empresa_id, pedido_id);

CREATE TABLE IF NOT EXISTS public.com_nota_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas (id) ON DELETE CASCADE,
  nota_id uuid NOT NULL REFERENCES public.com_notas (id) ON DELETE CASCADE,
  pedido_item_id uuid NULL REFERENCES public.com_pedido_itens (id) ON DELETE RESTRICT,
  sku_id uuid NULL REFERENCES public.cad_skus (id) ON DELETE RESTRICT,
  descricao text NOT NULL,
  quantidade numeric(14, 4) NOT NULL CHECK (quantidade > 0),
  unidade text NOT NULL DEFAULT 'UN',
  preco_unitario numeric(14, 4) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_com_nota_itens_nota
  ON public.com_nota_itens (empresa_id, nota_id);

ALTER TABLE public.com_notas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.com_nota_itens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS com_notas_select ON public.com_notas;
CREATE POLICY com_notas_select ON public.com_notas
FOR SELECT TO authenticated
USING (
  empresa_id = public.current_user_empresa_id()
  AND (
    public.current_user_is_superadmin()
    OR public.check_permission('compras_notas', 'view')
    OR public.check_permission('compras_pedidos', 'view')
  )
);

DROP POLICY IF EXISTS com_notas_insert ON public.com_notas;
CREATE POLICY com_notas_insert ON public.com_notas
FOR INSERT TO authenticated
WITH CHECK (
  empresa_id = public.current_user_empresa_id()
  AND (
    public.current_user_is_superadmin()
    OR public.check_permission('compras_notas', 'create')
  )
);

DROP POLICY IF EXISTS com_notas_update ON public.com_notas;
CREATE POLICY com_notas_update ON public.com_notas
FOR UPDATE TO authenticated
USING (
  empresa_id = public.current_user_empresa_id()
  AND (
    public.current_user_is_superadmin()
    OR public.check_permission('compras_notas', 'edit')
    OR public.check_permission('compras_notas', 'create')
  )
)
WITH CHECK (
  empresa_id = public.current_user_empresa_id()
  AND (
    public.current_user_is_superadmin()
    OR public.check_permission('compras_notas', 'edit')
    OR public.check_permission('compras_notas', 'create')
  )
);

DROP POLICY IF EXISTS com_nota_itens_select ON public.com_nota_itens;
CREATE POLICY com_nota_itens_select ON public.com_nota_itens
FOR SELECT TO authenticated
USING (
  empresa_id = public.current_user_empresa_id()
  AND (
    public.current_user_is_superadmin()
    OR public.check_permission('compras_notas', 'view')
    OR public.check_permission('compras_pedidos', 'view')
  )
);

DROP POLICY IF EXISTS com_nota_itens_insert ON public.com_nota_itens;
CREATE POLICY com_nota_itens_insert ON public.com_nota_itens
FOR INSERT TO authenticated
WITH CHECK (
  empresa_id = public.current_user_empresa_id()
  AND (
    public.current_user_is_superadmin()
    OR public.check_permission('compras_notas', 'create')
  )
);

GRANT SELECT, INSERT, UPDATE ON public.com_notas TO authenticated, service_role;
GRANT SELECT, INSERT ON public.com_nota_itens TO authenticated, service_role;

COMMENT ON TABLE public.com_notas IS
  'Nota de entrada da compra. Confirmar não gera movimento de estoque (Fase 5).';
