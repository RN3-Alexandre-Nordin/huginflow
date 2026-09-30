-- Fase 3 Compras: editar, cancelar (com motivo) e receber o pedido.

ALTER TABLE public.com_pedidos
  DROP CONSTRAINT IF EXISTS com_pedidos_status_check;

ALTER TABLE public.com_pedidos
  ADD CONSTRAINT com_pedidos_status_check
  CHECK (
    status IN (
      'rascunho',
      'aguardando_aprovacao',
      'aprovado',
      'recusado',
      'cancelado',
      'recebido_parcial',
      'recebido'
    )
  );

ALTER TABLE public.com_pedidos
  ADD COLUMN IF NOT EXISTS cancelamento_motivo text NULL,
  ADD COLUMN IF NOT EXISTS cancelado_em timestamptz NULL,
  ADD COLUMN IF NOT EXISTS cancelado_usuario_id uuid NULL
    REFERENCES public.usuarios (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.com_pedidos.cancelamento_motivo IS
  'Texto livre informado ao cancelar o pedido (antes de qualquer recebimento).';

CREATE TABLE IF NOT EXISTS public.com_recebimentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas (id) ON DELETE CASCADE,
  pedido_id uuid NOT NULL REFERENCES public.com_pedidos (id) ON DELETE CASCADE,
  usuario_id uuid NULL REFERENCES public.usuarios (id) ON DELETE SET NULL,
  observacao text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_com_recebimentos_pedido
  ON public.com_recebimentos (empresa_id, pedido_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.com_recebimento_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas (id) ON DELETE CASCADE,
  recebimento_id uuid NOT NULL REFERENCES public.com_recebimentos (id) ON DELETE CASCADE,
  pedido_item_id uuid NOT NULL REFERENCES public.com_pedido_itens (id) ON DELETE RESTRICT,
  quantidade numeric(14, 4) NOT NULL CHECK (quantidade > 0),
  divergencia text NULL
);

CREATE INDEX IF NOT EXISTS idx_com_recebimento_itens_pedido_item
  ON public.com_recebimento_itens (empresa_id, pedido_item_id);

-- Itens do pedido: quem edita também grava qtd/preço.
DROP POLICY IF EXISTS com_pedido_itens_all ON public.com_pedido_itens;
CREATE POLICY com_pedido_itens_all ON public.com_pedido_itens
FOR ALL TO authenticated
USING (
  (
    public.current_user_is_superadmin()
    OR public.check_permission('compras_pedidos', 'view')
    OR public.check_permission('compras_conferencia', 'view')
  )
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = com_pedido_itens.empresa_id)
  )
)
WITH CHECK (
  (
    public.current_user_is_superadmin()
    OR public.check_permission('compras_pedidos', 'create')
    OR public.check_permission('compras_pedidos', 'edit')
    OR public.check_permission('compras_conferencia', 'edit')
  )
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = com_pedido_itens.empresa_id)
  )
);

ALTER TABLE public.com_recebimentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.com_recebimento_itens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS com_recebimentos_select ON public.com_recebimentos;
CREATE POLICY com_recebimentos_select ON public.com_recebimentos
FOR SELECT TO authenticated
USING (
  empresa_id = public.current_user_empresa_id()
  AND (
    public.current_user_is_superadmin()
    OR public.check_permission('compras_conferencia', 'view')
    OR public.check_permission('compras_pedidos', 'view')
  )
);

DROP POLICY IF EXISTS com_recebimentos_insert ON public.com_recebimentos;
CREATE POLICY com_recebimentos_insert ON public.com_recebimentos
FOR INSERT TO authenticated
WITH CHECK (
  empresa_id = public.current_user_empresa_id()
  AND (
    public.current_user_is_superadmin()
    OR public.check_permission('compras_conferencia', 'create')
    OR public.check_permission('compras_conferencia', 'edit')
  )
);

DROP POLICY IF EXISTS com_recebimento_itens_select ON public.com_recebimento_itens;
CREATE POLICY com_recebimento_itens_select ON public.com_recebimento_itens
FOR SELECT TO authenticated
USING (
  empresa_id = public.current_user_empresa_id()
  AND (
    public.current_user_is_superadmin()
    OR public.check_permission('compras_conferencia', 'view')
    OR public.check_permission('compras_pedidos', 'view')
  )
);

DROP POLICY IF EXISTS com_recebimento_itens_insert ON public.com_recebimento_itens;
CREATE POLICY com_recebimento_itens_insert ON public.com_recebimento_itens
FOR INSERT TO authenticated
WITH CHECK (
  empresa_id = public.current_user_empresa_id()
  AND (
    public.current_user_is_superadmin()
    OR public.check_permission('compras_conferencia', 'create')
    OR public.check_permission('compras_conferencia', 'edit')
  )
);
