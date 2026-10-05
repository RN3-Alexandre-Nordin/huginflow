-- Recebimento de importados. Não altera o recebimento comum nem a caixa CX-.

ALTER TABLE public.com_config
  ADD COLUMN IF NOT EXISTS recebimento_importados boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS importados_limpeza text NOT NULL DEFAULT 'baixa_manual',
  ADD COLUMN IF NOT EXISTS importados_agenda text NULL,
  ADD COLUMN IF NOT EXISTS impressora_etiqueta text NOT NULL DEFAULT 'prevista';

ALTER TABLE public.com_config
  DROP CONSTRAINT IF EXISTS com_config_importados_limpeza_check;
ALTER TABLE public.com_config
  ADD CONSTRAINT com_config_importados_limpeza_check
  CHECK (importados_limpeza IN ('transferencia', 'baixa_manual', 'baixa_agendada'));

ALTER TABLE public.com_config
  DROP CONSTRAINT IF EXISTS com_config_importados_agenda_check;
ALTER TABLE public.com_config
  ADD CONSTRAINT com_config_importados_agenda_check
  CHECK (importados_agenda IS NULL OR importados_agenda IN ('diaria', 'semanal', 'mensal'));

COMMENT ON COLUMN public.com_config.recebimento_importados IS
  'Segunda forma de recebimento. Desligada, nada desta forma aparece.';
COMMENT ON COLUMN public.com_config.impressora_etiqueta IS
  'Homologação da impressora de etiqueta. prevista = modelo ainda não escolhido.';

ALTER TABLE public.com_pedidos
  ADD COLUMN IF NOT EXISTS codigo_fornecedor text NULL;

CREATE UNIQUE INDEX IF NOT EXISTS com_pedidos_empresa_codigo_fornecedor_uq
  ON public.com_pedidos (empresa_id, codigo_fornecedor)
  WHERE codigo_fornecedor IS NOT NULL;

COMMENT ON COLUMN public.com_pedidos.codigo_fornecedor IS
  'Código impresso na caixa do pedido de importação. A doca lê este código.';

CREATE TABLE IF NOT EXISTS public.com_importado_leituras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas (id) ON DELETE CASCADE,
  pedido_id uuid NOT NULL REFERENCES public.com_pedidos (id) ON DELETE CASCADE,
  pedido_item_id uuid NOT NULL REFERENCES public.com_pedido_itens (id) ON DELETE RESTRICT,
  recebimento_id uuid NULL REFERENCES public.com_recebimentos (id) ON DELETE SET NULL,
  codigo_lido text NOT NULL,
  codigo_normalizado text NOT NULL,
  quantidade numeric(14, 4) NOT NULL CHECK (quantidade > 0),
  local_id uuid NULL REFERENCES public.cad_locais_estoque (id) ON DELETE RESTRICT,
  local_temporario text NULL,
  limpeza text NULL,
  imprimiu_etiqueta boolean NOT NULL DEFAULT false,
  alocado_em timestamptz NULL,
  usuario_id uuid NULL REFERENCES public.usuarios (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT com_importado_leituras_destino_check CHECK (
    (local_id IS NOT NULL AND local_temporario IS NULL)
    OR (local_id IS NULL AND local_temporario IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_com_importado_leituras_pedido
  ON public.com_importado_leituras (empresa_id, pedido_id, created_at);

ALTER TABLE public.com_importado_leituras ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS com_importado_leituras_select ON public.com_importado_leituras;
CREATE POLICY com_importado_leituras_select ON public.com_importado_leituras
FOR SELECT TO authenticated
USING (
  empresa_id = public.current_user_empresa_id()
  AND (
    public.current_user_is_superadmin()
    OR public.check_permission('compras_conferencia', 'view')
    OR public.check_permission('compras_pedidos', 'view')
  )
);

DROP POLICY IF EXISTS com_importado_leituras_insert ON public.com_importado_leituras;
CREATE POLICY com_importado_leituras_insert ON public.com_importado_leituras
FOR INSERT TO authenticated
WITH CHECK (
  empresa_id = public.current_user_empresa_id()
  AND (
    public.current_user_is_superadmin()
    OR public.check_permission('compras_conferencia', 'create')
    OR public.check_permission('compras_conferencia', 'edit')
  )
);

DROP POLICY IF EXISTS com_importado_leituras_update ON public.com_importado_leituras;
CREATE POLICY com_importado_leituras_update ON public.com_importado_leituras
FOR UPDATE TO authenticated
USING (
  empresa_id = public.current_user_empresa_id()
  AND (
    public.current_user_is_superadmin()
    OR public.check_permission('compras_conferencia', 'create')
    OR public.check_permission('compras_conferencia', 'edit')
  )
)
WITH CHECK (empresa_id = public.current_user_empresa_id());

GRANT SELECT, INSERT, UPDATE ON public.com_importado_leituras TO authenticated, service_role;
