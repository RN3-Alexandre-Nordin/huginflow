-- Fase 2 Compras: cotação (até 3 fornecedores), propostas e vínculo ao pedido.

CREATE TABLE IF NOT EXISTS public.com_cotacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas (id) ON DELETE CASCADE,
  numero text NOT NULL,
  solicitacao_id uuid NULL REFERENCES public.com_solicitacoes (id) ON DELETE SET NULL,
  tipo text NOT NULL CHECK (tipo IN ('produtivo', 'consumo', 'servico')),
  status text NOT NULL DEFAULT 'rascunho'
    CHECK (status IN ('rascunho', 'em_cotacao', 'confirmada', 'cancelada')),
  observacao text NULL,
  criador_usuario_id uuid NULL REFERENCES public.usuarios (id) ON DELETE SET NULL,
  confirmada_em timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT com_cotacoes_empresa_numero_uq UNIQUE (empresa_id, numero)
);

CREATE INDEX IF NOT EXISTS idx_com_cotacoes_empresa_status
  ON public.com_cotacoes (empresa_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_com_cotacoes_solicitacao
  ON public.com_cotacoes (empresa_id, solicitacao_id)
  WHERE solicitacao_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.com_cotacao_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas (id) ON DELETE CASCADE,
  cotacao_id uuid NOT NULL REFERENCES public.com_cotacoes (id) ON DELETE CASCADE,
  sku_id uuid NULL REFERENCES public.cad_skus (id) ON DELETE RESTRICT,
  servico_id uuid NULL REFERENCES public.cad_servicos (id) ON DELETE RESTRICT,
  descricao text NOT NULL,
  quantidade numeric(14, 4) NOT NULL CHECK (quantidade > 0),
  unidade text NOT NULL DEFAULT 'UN',
  vencedor_fornecedor_id uuid NULL REFERENCES public.crm_leads (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_com_cotacao_itens_cotacao
  ON public.com_cotacao_itens (empresa_id, cotacao_id);

CREATE TABLE IF NOT EXISTS public.com_cotacao_fornecedores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas (id) ON DELETE CASCADE,
  cotacao_id uuid NOT NULL REFERENCES public.com_cotacoes (id) ON DELETE CASCADE,
  fornecedor_id uuid NOT NULL REFERENCES public.crm_leads (id) ON DELETE RESTRICT,
  prazo_texto text NULL,
  condicao_texto text NULL,
  ordem smallint NOT NULL DEFAULT 1 CHECK (ordem BETWEEN 1 AND 3),
  CONSTRAINT com_cotacao_fornecedores_uq UNIQUE (cotacao_id, fornecedor_id),
  CONSTRAINT com_cotacao_fornecedores_ordem_uq UNIQUE (cotacao_id, ordem)
);

CREATE INDEX IF NOT EXISTS idx_com_cotacao_fornecedores_cotacao
  ON public.com_cotacao_fornecedores (empresa_id, cotacao_id);

CREATE TABLE IF NOT EXISTS public.com_cotacao_propostas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas (id) ON DELETE CASCADE,
  cotacao_id uuid NOT NULL REFERENCES public.com_cotacoes (id) ON DELETE CASCADE,
  cotacao_item_id uuid NOT NULL REFERENCES public.com_cotacao_itens (id) ON DELETE CASCADE,
  fornecedor_id uuid NOT NULL REFERENCES public.crm_leads (id) ON DELETE RESTRICT,
  preco_unitario numeric(14, 4) NOT NULL DEFAULT 0 CHECK (preco_unitario >= 0),
  CONSTRAINT com_cotacao_propostas_uq UNIQUE (cotacao_item_id, fornecedor_id)
);

CREATE INDEX IF NOT EXISTS idx_com_cotacao_propostas_cotacao
  ON public.com_cotacao_propostas (empresa_id, cotacao_id);

ALTER TABLE public.com_pedidos
  ADD COLUMN IF NOT EXISTS cotacao_id uuid NULL
    REFERENCES public.com_cotacoes (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_com_pedidos_cotacao
  ON public.com_pedidos (empresa_id, cotacao_id)
  WHERE cotacao_id IS NOT NULL;

ALTER TABLE public.com_cotacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.com_cotacao_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.com_cotacao_fornecedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.com_cotacao_propostas ENABLE ROW LEVEL SECURITY;

-- Cotacoes
DROP POLICY IF EXISTS com_cotacoes_select ON public.com_cotacoes;
CREATE POLICY com_cotacoes_select ON public.com_cotacoes
  FOR SELECT TO authenticated
  USING (
    empresa_id = public.current_user_empresa_id()
    AND (
      public.current_user_is_superadmin()
      OR public.check_permission('compras_cotacoes', 'view')
      OR public.check_permission('compras', 'view')
    )
  );

DROP POLICY IF EXISTS com_cotacoes_insert ON public.com_cotacoes;
CREATE POLICY com_cotacoes_insert ON public.com_cotacoes
  FOR INSERT TO authenticated
  WITH CHECK (
    empresa_id = public.current_user_empresa_id()
    AND (
      public.current_user_is_superadmin()
      OR public.check_permission('compras_cotacoes', 'create')
    )
  );

DROP POLICY IF EXISTS com_cotacoes_update ON public.com_cotacoes;
CREATE POLICY com_cotacoes_update ON public.com_cotacoes
  FOR UPDATE TO authenticated
  USING (
    empresa_id = public.current_user_empresa_id()
    AND (
      public.current_user_is_superadmin()
      OR public.check_permission('compras_cotacoes', 'edit')
      OR public.check_permission('compras_cotacoes', 'create')
    )
  )
  WITH CHECK (
    empresa_id = public.current_user_empresa_id()
    AND (
      public.current_user_is_superadmin()
      OR public.check_permission('compras_cotacoes', 'edit')
      OR public.check_permission('compras_cotacoes', 'create')
    )
  );

-- Itens
DROP POLICY IF EXISTS com_cotacao_itens_select ON public.com_cotacao_itens;
CREATE POLICY com_cotacao_itens_select ON public.com_cotacao_itens
  FOR SELECT TO authenticated
  USING (
    empresa_id = public.current_user_empresa_id()
    AND (
      public.current_user_is_superadmin()
      OR public.check_permission('compras_cotacoes', 'view')
      OR public.check_permission('compras', 'view')
    )
  );

DROP POLICY IF EXISTS com_cotacao_itens_write ON public.com_cotacao_itens;
CREATE POLICY com_cotacao_itens_write ON public.com_cotacao_itens
  FOR ALL TO authenticated
  USING (
    empresa_id = public.current_user_empresa_id()
    AND (
      public.current_user_is_superadmin()
      OR public.check_permission('compras_cotacoes', 'create')
      OR public.check_permission('compras_cotacoes', 'edit')
    )
  )
  WITH CHECK (
    empresa_id = public.current_user_empresa_id()
    AND (
      public.current_user_is_superadmin()
      OR public.check_permission('compras_cotacoes', 'create')
      OR public.check_permission('compras_cotacoes', 'edit')
    )
  );

-- Fornecedores da cotação
DROP POLICY IF EXISTS com_cotacao_fornecedores_select ON public.com_cotacao_fornecedores;
CREATE POLICY com_cotacao_fornecedores_select ON public.com_cotacao_fornecedores
  FOR SELECT TO authenticated
  USING (
    empresa_id = public.current_user_empresa_id()
    AND (
      public.current_user_is_superadmin()
      OR public.check_permission('compras_cotacoes', 'view')
      OR public.check_permission('compras', 'view')
    )
  );

DROP POLICY IF EXISTS com_cotacao_fornecedores_write ON public.com_cotacao_fornecedores;
CREATE POLICY com_cotacao_fornecedores_write ON public.com_cotacao_fornecedores
  FOR ALL TO authenticated
  USING (
    empresa_id = public.current_user_empresa_id()
    AND (
      public.current_user_is_superadmin()
      OR public.check_permission('compras_cotacoes', 'create')
      OR public.check_permission('compras_cotacoes', 'edit')
    )
  )
  WITH CHECK (
    empresa_id = public.current_user_empresa_id()
    AND (
      public.current_user_is_superadmin()
      OR public.check_permission('compras_cotacoes', 'create')
      OR public.check_permission('compras_cotacoes', 'edit')
    )
  );

-- Propostas
DROP POLICY IF EXISTS com_cotacao_propostas_select ON public.com_cotacao_propostas;
CREATE POLICY com_cotacao_propostas_select ON public.com_cotacao_propostas
  FOR SELECT TO authenticated
  USING (
    empresa_id = public.current_user_empresa_id()
    AND (
      public.current_user_is_superadmin()
      OR public.check_permission('compras_cotacoes', 'view')
      OR public.check_permission('compras', 'view')
    )
  );

DROP POLICY IF EXISTS com_cotacao_propostas_write ON public.com_cotacao_propostas;
CREATE POLICY com_cotacao_propostas_write ON public.com_cotacao_propostas
  FOR ALL TO authenticated
  USING (
    empresa_id = public.current_user_empresa_id()
    AND (
      public.current_user_is_superadmin()
      OR public.check_permission('compras_cotacoes', 'create')
      OR public.check_permission('compras_cotacoes', 'edit')
    )
  )
  WITH CHECK (
    empresa_id = public.current_user_empresa_id()
    AND (
      public.current_user_is_superadmin()
      OR public.check_permission('compras_cotacoes', 'create')
      OR public.check_permission('compras_cotacoes', 'edit')
    )
  );
