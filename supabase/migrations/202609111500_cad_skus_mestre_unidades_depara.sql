-- Cadastro mestre de SKUs (produtos/serviços) + conversão de UM + de-para parceiro
-- Sem sku_externo na ficha: conversão externa via cad_sku_depara.

CREATE TABLE IF NOT EXISTS public.cad_skus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas (id) ON DELETE CASCADE,
  codigo text NOT NULL,
  nome text NOT NULL,
  nome_fiscal text,
  descricao text,
  tipo text NOT NULL DEFAULT 'produto'
    CHECK (tipo IN ('produto', 'servico')),
  natureza text
    CHECK (natureza IS NULL OR natureza IN ('fisico', 'digital', 'servico')),
  codigo_barras text,

  -- Três unidades de medida
  unidade_venda text NOT NULL DEFAULT 'UN',
  unidade_compra text NOT NULL DEFAULT 'UN',
  unidade_estoque text NOT NULL DEFAULT 'UN',

  -- Comercial
  preco_venda numeric(18, 4),
  preco_custo numeric(18, 4),
  moeda text NOT NULL DEFAULT 'BRL',

  -- Estoque
  controla_estoque boolean NOT NULL DEFAULT false,
  ponto_reposicao numeric(18, 4),
  estoque_minimo numeric(18, 4),
  estoque_maximo numeric(18, 4),
  lead_time_dias integer
    CHECK (lead_time_dias IS NULL OR lead_time_dias >= 0),
  fornecedor_padrao_id uuid REFERENCES public.crm_leads (id) ON DELETE SET NULL,

  -- Fiscal produto
  ncm text,
  cest text,
  origem_mercadoria text
    CHECK (origem_mercadoria IS NULL OR origem_mercadoria ~ '^[0-8]$'),
  cfop_venda_dentro text,
  cfop_venda_fora text,
  cst_icms text,
  csosn text,
  aliq_icms numeric(8, 4),
  aliq_ipi numeric(8, 4),
  aliq_pis numeric(8, 4),
  aliq_cofins numeric(8, 4),
  cst_pis text,
  cst_cofins text,
  cst_ipi text,

  -- Fiscal serviço
  codigo_servico_lc116 text,
  codigo_servico_municipal text,
  cnae_servico text,
  iss_retido boolean,
  aliq_iss numeric(8, 4),
  municipio_prestacao_ibge text,

  metadados_fiscais jsonb NOT NULL DEFAULT '{}'::jsonb,
  observacoes text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cad_skus_empresa_codigo_uq UNIQUE (empresa_id, codigo)
);

COMMENT ON TABLE public.cad_skus IS
  'Cadastro mestre de produtos/serviços (SKU Hugin). De-para externo em cad_sku_depara.';
COMMENT ON COLUMN public.cad_skus.unidade_venda IS 'UM de venda';
COMMENT ON COLUMN public.cad_skus.unidade_compra IS 'UM de compra';
COMMENT ON COLUMN public.cad_skus.unidade_estoque IS 'UM de estoque / inventário';
COMMENT ON COLUMN public.cad_skus.ponto_reposicao IS 'Ponto de reposição (na UM de estoque)';

CREATE INDEX IF NOT EXISTS idx_cad_skus_empresa_ativo
  ON public.cad_skus (empresa_id, ativo);
CREATE INDEX IF NOT EXISTS idx_cad_skus_empresa_tipo
  ON public.cad_skus (empresa_id, tipo);
CREATE INDEX IF NOT EXISTS idx_cad_skus_empresa_nome
  ON public.cad_skus (empresa_id, nome);

-- Conversão entre unidades do mesmo SKU: 1 origem = fator × destino
CREATE TABLE IF NOT EXISTS public.cad_sku_unidade_conversao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas (id) ON DELETE CASCADE,
  sku_id uuid NOT NULL REFERENCES public.cad_skus (id) ON DELETE CASCADE,
  unidade_origem text NOT NULL,
  unidade_destino text NOT NULL,
  fator_conversao numeric(18, 8) NOT NULL
    CHECK (fator_conversao > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cad_sku_um_conv_par_uq
    UNIQUE (empresa_id, sku_id, unidade_origem, unidade_destino),
  CONSTRAINT cad_sku_um_conv_diff_chk
    CHECK (btrim(unidade_origem) <> '' AND btrim(unidade_destino) <> ''
      AND upper(unidade_origem) <> upper(unidade_destino))
);

COMMENT ON TABLE public.cad_sku_unidade_conversao IS
  'Fator: 1 unidade_origem = fator_conversao × unidade_destino (por SKU).';

CREATE INDEX IF NOT EXISTS idx_cad_sku_um_conv_sku
  ON public.cad_sku_unidade_conversao (sku_id);

-- De-para: SKU Hugin ↔ pessoa (cliente/fornecedor) ↔ código do parceiro
CREATE TABLE IF NOT EXISTS public.cad_sku_depara (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas (id) ON DELETE CASCADE,
  sku_id uuid NOT NULL REFERENCES public.cad_skus (id) ON DELETE CASCADE,
  pessoa_id uuid NOT NULL REFERENCES public.crm_leads (id) ON DELETE CASCADE,
  codigo_parceiro text NOT NULL,
  observacao text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cad_sku_depara_pessoa_codigo_uq
    UNIQUE (empresa_id, pessoa_id, codigo_parceiro),
  CONSTRAINT cad_sku_depara_sku_pessoa_uq
    UNIQUE (empresa_id, sku_id, pessoa_id)
);

COMMENT ON TABLE public.cad_sku_depara IS
  'Mapeia SKU Hugin + pessoa (cliente/fornecedor) → código SKU do parceiro.';

CREATE INDEX IF NOT EXISTS idx_cad_sku_depara_sku
  ON public.cad_sku_depara (sku_id);
CREATE INDEX IF NOT EXISTS idx_cad_sku_depara_pessoa
  ON public.cad_sku_depara (pessoa_id);

-- RLS
ALTER TABLE public.cad_skus ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cad_sku_unidade_conversao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cad_sku_depara ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cad_skus_select ON public.cad_skus;
CREATE POLICY cad_skus_select ON public.cad_skus
FOR SELECT TO authenticated
USING (
  public.check_permission('skus', 'view')
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = cad_skus.empresa_id)
  )
);

DROP POLICY IF EXISTS cad_skus_insert ON public.cad_skus;
CREATE POLICY cad_skus_insert ON public.cad_skus
FOR INSERT TO authenticated
WITH CHECK (
  public.check_permission('skus', 'create')
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = cad_skus.empresa_id)
  )
);

DROP POLICY IF EXISTS cad_skus_update ON public.cad_skus;
CREATE POLICY cad_skus_update ON public.cad_skus
FOR UPDATE TO authenticated
USING (
  public.check_permission('skus', 'edit')
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = cad_skus.empresa_id)
  )
)
WITH CHECK (
  public.check_permission('skus', 'edit')
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = cad_skus.empresa_id)
  )
);

DROP POLICY IF EXISTS cad_skus_delete ON public.cad_skus;
CREATE POLICY cad_skus_delete ON public.cad_skus
FOR DELETE TO authenticated
USING (
  public.check_permission('skus', 'delete')
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = cad_skus.empresa_id)
  )
);

DROP POLICY IF EXISTS cad_sku_um_conv_select ON public.cad_sku_unidade_conversao;
CREATE POLICY cad_sku_um_conv_select ON public.cad_sku_unidade_conversao
FOR SELECT TO authenticated
USING (
  public.check_permission('skus', 'view')
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = cad_sku_unidade_conversao.empresa_id)
  )
);

DROP POLICY IF EXISTS cad_sku_um_conv_insert ON public.cad_sku_unidade_conversao;
CREATE POLICY cad_sku_um_conv_insert ON public.cad_sku_unidade_conversao
FOR INSERT TO authenticated
WITH CHECK (
  (public.check_permission('skus', 'edit') OR public.check_permission('skus', 'create'))
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = cad_sku_unidade_conversao.empresa_id)
  )
);

DROP POLICY IF EXISTS cad_sku_um_conv_update ON public.cad_sku_unidade_conversao;
CREATE POLICY cad_sku_um_conv_update ON public.cad_sku_unidade_conversao
FOR UPDATE TO authenticated
USING (
  public.check_permission('skus', 'edit')
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = cad_sku_unidade_conversao.empresa_id)
  )
)
WITH CHECK (
  public.check_permission('skus', 'edit')
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = cad_sku_unidade_conversao.empresa_id)
  )
);

DROP POLICY IF EXISTS cad_sku_um_conv_delete ON public.cad_sku_unidade_conversao;
CREATE POLICY cad_sku_um_conv_delete ON public.cad_sku_unidade_conversao
FOR DELETE TO authenticated
USING (
  (public.check_permission('skus', 'edit') OR public.check_permission('skus', 'create'))
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = cad_sku_unidade_conversao.empresa_id)
  )
);

DROP POLICY IF EXISTS cad_sku_depara_select ON public.cad_sku_depara;
CREATE POLICY cad_sku_depara_select ON public.cad_sku_depara
FOR SELECT TO authenticated
USING (
  public.check_permission('skus', 'view')
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = cad_sku_depara.empresa_id)
  )
);

DROP POLICY IF EXISTS cad_sku_depara_insert ON public.cad_sku_depara;
CREATE POLICY cad_sku_depara_insert ON public.cad_sku_depara
FOR INSERT TO authenticated
WITH CHECK (
  (public.check_permission('skus', 'edit') OR public.check_permission('skus', 'create'))
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = cad_sku_depara.empresa_id)
  )
);

DROP POLICY IF EXISTS cad_sku_depara_update ON public.cad_sku_depara;
CREATE POLICY cad_sku_depara_update ON public.cad_sku_depara
FOR UPDATE TO authenticated
USING (
  public.check_permission('skus', 'edit')
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = cad_sku_depara.empresa_id)
  )
)
WITH CHECK (
  public.check_permission('skus', 'edit')
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = cad_sku_depara.empresa_id)
  )
);

DROP POLICY IF EXISTS cad_sku_depara_delete ON public.cad_sku_depara;
CREATE POLICY cad_sku_depara_delete ON public.cad_sku_depara
FOR DELETE TO authenticated
USING (
  (public.check_permission('skus', 'edit') OR public.check_permission('skus', 'create'))
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = cad_sku_depara.empresa_id)
  )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cad_skus TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cad_sku_unidade_conversao TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cad_sku_depara TO authenticated;
