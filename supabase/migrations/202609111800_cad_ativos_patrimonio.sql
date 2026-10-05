-- Patrimônio / ativo fixo (cadastro do bem).
-- Fórmulas de depreciação: tabela stub agora; motor/UI do módulo Ativo depois.
-- Sempre filtrar por empresa_id (tenant).

CREATE TABLE IF NOT EXISTS public.cad_ativo_formulas_depreciacao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas (id) ON DELETE CASCADE,
  codigo text NOT NULL,
  nome text NOT NULL,
  descricao text,
  -- linear | soma_digitos | unidades_produzidas | custom (motor futuro)
  metodo text NOT NULL DEFAULT 'linear'
    CHECK (metodo IN ('linear', 'soma_digitos', 'unidades_produzidas', 'custom')),
  -- Parâmetros futuros da fórmula (taxas, tabela, script, etc.)
  config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cad_ativo_formulas_empresa_codigo_uq UNIQUE (empresa_id, codigo)
);

COMMENT ON TABLE public.cad_ativo_formulas_depreciacao IS
  'Stub de fórmulas de depreciação. Cadastro/motor completo no módulo Ativo (futuro).';
COMMENT ON COLUMN public.cad_ativo_formulas_depreciacao.config_json IS
  'Reservado para parâmetros da fórmula (não interpretar no app até o módulo Ativo).';

CREATE INDEX IF NOT EXISTS idx_cad_ativo_formulas_empresa
  ON public.cad_ativo_formulas_depreciacao (empresa_id, ativo);

CREATE TABLE IF NOT EXISTS public.cad_ativos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas (id) ON DELETE CASCADE,

  -- Identidade
  codigo text NOT NULL,
  nome text NOT NULL,
  descricao text,
  numero_patrimonio text,
  numero_serie text,
  categoria text,
  -- opcional: bem originado do catálogo SKU
  sku_id uuid REFERENCES public.cad_skus (id) ON DELETE SET NULL,

  -- Aquisição
  data_aquisicao date,
  valor_aquisicao numeric(18, 4),
  valor_residual numeric(18, 4),
  moeda text NOT NULL DEFAULT 'BRL',
  nf_compra text,
  fornecedor_id uuid REFERENCES public.crm_leads (id) ON DELETE SET NULL,

  -- Depreciação (vínculo à fórmula futura + campos operacionais)
  formula_depreciacao_id uuid
    REFERENCES public.cad_ativo_formulas_depreciacao (id) ON DELETE SET NULL,
  vida_util_meses integer
    CHECK (vida_util_meses IS NULL OR vida_util_meses > 0),
  data_inicio_depreciacao date,
  taxa_anual_pct numeric(8, 4),
  valor_contabil_atual numeric(18, 4),

  -- Localização / responsabilidade
  localizacao text,
  -- Centro de custo = departamento (estrutura enxuta; mesma lista do organograma)
  departamento_id uuid REFERENCES public.departamentos (id) ON DELETE SET NULL,
  responsavel_id uuid REFERENCES public.crm_leads (id) ON DELETE SET NULL,

  -- Situação patrimonial
  status text NOT NULL DEFAULT 'em_uso'
    CHECK (status IN (
      'disponivel',
      'em_uso',
      'em_manutencao',
      'baixado',
      'alienado'
    )),
  data_baixa date,
  motivo_baixa text,

  observacoes text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT cad_ativos_empresa_codigo_uq UNIQUE (empresa_id, codigo)
);

COMMENT ON TABLE public.cad_ativos IS
  'Cadastro mestre de ativos fixos / patrimônio. Depreciação via formula_depreciacao_id (módulo futuro).';
COMMENT ON COLUMN public.cad_ativos.sku_id IS
  'Opcional: SKU de origem quando o bem veio do catálogo.';
COMMENT ON COLUMN public.cad_ativos.formula_depreciacao_id IS
  'FK para cad_ativo_formulas_depreciacao. Motor de cálculo virá no módulo Ativo.';
COMMENT ON COLUMN public.cad_ativos.departamento_id IS
  'Centro de custo / área organizacional (= departamentos). Não renomear tabela departamentos.';
COMMENT ON COLUMN public.cad_ativos.localizacao IS
  'Local físico do bem (texto livre). Locais de estoque ficam no addon estoque.';

CREATE INDEX IF NOT EXISTS idx_cad_ativos_empresa_ativo
  ON public.cad_ativos (empresa_id, ativo);
CREATE INDEX IF NOT EXISTS idx_cad_ativos_empresa_status
  ON public.cad_ativos (empresa_id, status);
CREATE INDEX IF NOT EXISTS idx_cad_ativos_sku
  ON public.cad_ativos (sku_id)
  WHERE sku_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cad_ativos_formula
  ON public.cad_ativos (formula_depreciacao_id)
  WHERE formula_depreciacao_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cad_ativos_departamento
  ON public.cad_ativos (departamento_id)
  WHERE departamento_id IS NOT NULL;

-- RLS
ALTER TABLE public.cad_ativo_formulas_depreciacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cad_ativos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cad_ativo_formulas_select ON public.cad_ativo_formulas_depreciacao;
CREATE POLICY cad_ativo_formulas_select ON public.cad_ativo_formulas_depreciacao
FOR SELECT TO authenticated
USING (
  public.check_permission('ativos', 'view')
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = cad_ativo_formulas_depreciacao.empresa_id)
  )
);

DROP POLICY IF EXISTS cad_ativo_formulas_insert ON public.cad_ativo_formulas_depreciacao;
CREATE POLICY cad_ativo_formulas_insert ON public.cad_ativo_formulas_depreciacao
FOR INSERT TO authenticated
WITH CHECK (
  (public.check_permission('ativos', 'create') OR public.check_permission('ativos', 'edit'))
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = cad_ativo_formulas_depreciacao.empresa_id)
  )
);

DROP POLICY IF EXISTS cad_ativo_formulas_update ON public.cad_ativo_formulas_depreciacao;
CREATE POLICY cad_ativo_formulas_update ON public.cad_ativo_formulas_depreciacao
FOR UPDATE TO authenticated
USING (
  public.check_permission('ativos', 'edit')
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = cad_ativo_formulas_depreciacao.empresa_id)
  )
)
WITH CHECK (
  public.check_permission('ativos', 'edit')
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = cad_ativo_formulas_depreciacao.empresa_id)
  )
);

DROP POLICY IF EXISTS cad_ativo_formulas_delete ON public.cad_ativo_formulas_depreciacao;
CREATE POLICY cad_ativo_formulas_delete ON public.cad_ativo_formulas_depreciacao
FOR DELETE TO authenticated
USING (
  public.check_permission('ativos', 'delete')
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = cad_ativo_formulas_depreciacao.empresa_id)
  )
);

DROP POLICY IF EXISTS cad_ativos_select ON public.cad_ativos;
CREATE POLICY cad_ativos_select ON public.cad_ativos
FOR SELECT TO authenticated
USING (
  public.check_permission('ativos', 'view')
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = cad_ativos.empresa_id)
  )
);

DROP POLICY IF EXISTS cad_ativos_insert ON public.cad_ativos;
CREATE POLICY cad_ativos_insert ON public.cad_ativos
FOR INSERT TO authenticated
WITH CHECK (
  public.check_permission('ativos', 'create')
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = cad_ativos.empresa_id)
  )
);

DROP POLICY IF EXISTS cad_ativos_update ON public.cad_ativos;
CREATE POLICY cad_ativos_update ON public.cad_ativos
FOR UPDATE TO authenticated
USING (
  public.check_permission('ativos', 'edit')
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = cad_ativos.empresa_id)
  )
)
WITH CHECK (
  public.check_permission('ativos', 'edit')
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = cad_ativos.empresa_id)
  )
);

DROP POLICY IF EXISTS cad_ativos_delete ON public.cad_ativos;
CREATE POLICY cad_ativos_delete ON public.cad_ativos
FOR DELETE TO authenticated
USING (
  public.check_permission('ativos', 'delete')
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = cad_ativos.empresa_id)
  )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cad_ativo_formulas_depreciacao TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cad_ativos TO authenticated;
