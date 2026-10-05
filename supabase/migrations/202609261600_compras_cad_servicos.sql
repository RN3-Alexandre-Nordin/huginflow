-- Cadastro de serviços de compra + vínculo nos itens + rascunho com número na abertura.

CREATE TABLE IF NOT EXISTS public.cad_servicos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas (id) ON DELETE CASCADE,
  codigo text NOT NULL,
  nome text NOT NULL,
  unidade text NOT NULL DEFAULT 'HORAS',
  preco_referencia numeric(14, 4) NULL,
  descricao text NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cad_servicos_empresa_codigo_uq UNIQUE (empresa_id, codigo)
);

CREATE INDEX IF NOT EXISTS idx_cad_servicos_empresa_ativo
  ON public.cad_servicos (empresa_id, ativo, codigo);

COMMENT ON TABLE public.cad_servicos IS
  'Catálogo de serviços comprados (limpeza, consultoria, etc.). Visível no Cadastros quando addon compras estiver ligado.';

ALTER TABLE public.com_solicitacao_itens
  ADD COLUMN IF NOT EXISTS servico_id uuid NULL
    REFERENCES public.cad_servicos (id) ON DELETE RESTRICT;

ALTER TABLE public.com_pedido_itens
  ADD COLUMN IF NOT EXISTS servico_id uuid NULL
    REFERENCES public.cad_servicos (id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_com_solicitacao_itens_servico
  ON public.com_solicitacao_itens (empresa_id, servico_id)
  WHERE servico_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_com_pedido_itens_servico
  ON public.com_pedido_itens (empresa_id, servico_id)
  WHERE servico_id IS NOT NULL;

-- Pedido: rascunho na abertura (número já associado); fornecedor só obrigatório ao registrar.
ALTER TABLE public.com_pedidos
  DROP CONSTRAINT IF EXISTS com_pedidos_status_check;

ALTER TABLE public.com_pedidos
  ADD CONSTRAINT com_pedidos_status_check
  CHECK (status IN ('rascunho', 'aguardando_aprovacao', 'aprovado', 'recusado'));

ALTER TABLE public.com_pedidos
  ALTER COLUMN fornecedor_id DROP NOT NULL;

ALTER TABLE public.cad_servicos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cad_servicos_select ON public.cad_servicos;
CREATE POLICY cad_servicos_select ON public.cad_servicos
  FOR SELECT TO authenticated
  USING (
    empresa_id = public.current_user_empresa_id()
    AND (
      public.current_user_is_superadmin()
      OR public.check_permission('compras_servicos', 'view')
      OR public.check_permission('compras', 'view')
      OR public.check_permission('compras_solicitacoes', 'view')
      OR public.check_permission('compras_pedidos', 'view')
    )
  );

DROP POLICY IF EXISTS cad_servicos_insert ON public.cad_servicos;
CREATE POLICY cad_servicos_insert ON public.cad_servicos
  FOR INSERT TO authenticated
  WITH CHECK (
    empresa_id = public.current_user_empresa_id()
    AND (
      public.current_user_is_superadmin()
      OR public.check_permission('compras_servicos', 'create')
    )
  );

DROP POLICY IF EXISTS cad_servicos_update ON public.cad_servicos;
CREATE POLICY cad_servicos_update ON public.cad_servicos
  FOR UPDATE TO authenticated
  USING (
    empresa_id = public.current_user_empresa_id()
    AND (
      public.current_user_is_superadmin()
      OR public.check_permission('compras_servicos', 'edit')
    )
  )
  WITH CHECK (
    empresa_id = public.current_user_empresa_id()
    AND (
      public.current_user_is_superadmin()
      OR public.check_permission('compras_servicos', 'edit')
    )
  );

DROP POLICY IF EXISTS cad_servicos_delete ON public.cad_servicos;
CREATE POLICY cad_servicos_delete ON public.cad_servicos
  FOR DELETE TO authenticated
  USING (
    empresa_id = public.current_user_empresa_id()
    AND (
      public.current_user_is_superadmin()
      OR public.check_permission('compras_servicos', 'delete')
    )
  );
