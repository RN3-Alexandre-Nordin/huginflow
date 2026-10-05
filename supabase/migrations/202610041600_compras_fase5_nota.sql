-- Fase 5: impostos, frete, CFOP, centro de custo e custo da última compra.
-- A série do XML fica na linha da nota. O saldo por série é a Fase 8.

ALTER TABLE public.com_notas
  ADD COLUMN IF NOT EXISTS frete numeric(14, 4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vencimento date,
  ADD COLUMN IF NOT EXISTS impostos jsonb;

ALTER TABLE public.com_nota_itens
  ADD COLUMN IF NOT EXISTS cfop text,
  ADD COLUMN IF NOT EXISTS centro_custo text,
  ADD COLUMN IF NOT EXISTS n_serie text,
  ADD COLUMN IF NOT EXISTS preco_pedido numeric(14, 4),
  ADD COLUMN IF NOT EXISTS aviso_preco boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS impostos jsonb,
  ADD COLUMN IF NOT EXISTS frete_rateado numeric(14, 4) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.com_nota_itens.n_serie IS
  'Número de série lido do XML. Não entra no saldo; a conferência por série é a Fase 8.';
COMMENT ON COLUMN public.com_nota_itens.aviso_preco IS
  'O preço da nota difere do preço do pedido. Não bloqueia a confirmação.';

ALTER TABLE public.com_config
  ADD COLUMN IF NOT EXISTS local_entrada_id uuid REFERENCES public.cad_locais_estoque (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.com_config.local_entrada_id IS
  'Local padrão da entrada gerada ao confirmar nota de material produtivo.';

CREATE TABLE IF NOT EXISTS public.com_sku_custo_ultima (
  empresa_id uuid NOT NULL REFERENCES public.empresas (id) ON DELETE CASCADE,
  sku_id uuid NOT NULL REFERENCES public.cad_skus (id) ON DELETE CASCADE,
  nota_id uuid REFERENCES public.com_notas (id) ON DELETE SET NULL,
  valor numeric(14, 4) NOT NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa_id, sku_id)
);

COMMENT ON TABLE public.com_sku_custo_ultima IS
  'Custo da última compra (item + frete rateado). Não é o valor do estoque.';

ALTER TABLE public.com_sku_custo_ultima ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS com_sku_custo_ultima_select ON public.com_sku_custo_ultima;
CREATE POLICY com_sku_custo_ultima_select ON public.com_sku_custo_ultima
FOR SELECT TO authenticated
USING (
  empresa_id = public.current_user_empresa_id()
  AND (
    public.current_user_is_superadmin()
    OR public.check_permission('compras_notas', 'view')
    OR public.check_permission('compras_pedidos', 'view')
  )
);

DROP POLICY IF EXISTS com_sku_custo_ultima_write ON public.com_sku_custo_ultima;
CREATE POLICY com_sku_custo_ultima_write ON public.com_sku_custo_ultima
FOR ALL TO authenticated
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

GRANT SELECT, INSERT, UPDATE ON public.com_sku_custo_ultima TO authenticated, service_role;
