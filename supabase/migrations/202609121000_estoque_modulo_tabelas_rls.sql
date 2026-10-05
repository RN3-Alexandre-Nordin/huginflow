-- ============================================================================
-- Módulo Estoque: Tabelas mestres, operacionais, Cardex, Saldos e RLS
-- F4.1 Fundação do módulo Estoque (Hugin Flow)
-- Documento de referência: docs/desenvolvimento-modulo-estoque.md
-- ============================================================================

-- 1. Locais de estoque (cad_locais_estoque)
CREATE TABLE IF NOT EXISTS public.cad_locais_estoque (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas (id) ON DELETE CASCADE,
  codigo text NOT NULL,
  nome text NOT NULL,
  tipo text NOT NULL DEFAULT 'deposito'
    CHECK (tipo IN ('deposito', 'almoxarifado', 'loja', 'outro', 'principal')),
  eh_principal boolean NOT NULL DEFAULT false,
  departamento_id uuid REFERENCES public.departamentos (id) ON DELETE SET NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cad_locais_estoque_empresa_codigo_uq UNIQUE (empresa_id, codigo)
);

COMMENT ON TABLE public.cad_locais_estoque IS
  'Locais de armazenamento de estoque por tenant. Suporta local principal BRANCO.';
COMMENT ON COLUMN public.cad_locais_estoque.codigo IS
  'Código identificador no tenant. Reservado BRANCO para empresas sem múltiplos locais.';
COMMENT ON COLUMN public.cad_locais_estoque.eh_principal IS
  'Indica se é o local principal do tenant (no máximo 1 por empresa).';

CREATE INDEX IF NOT EXISTS idx_cad_locais_estoque_empresa_ativo
  ON public.cad_locais_estoque (empresa_id, ativo);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cad_locais_estoque_principal
  ON public.cad_locais_estoque (empresa_id)
  WHERE eh_principal = true;
CREATE INDEX IF NOT EXISTS idx_cad_locais_estoque_departamento
  ON public.cad_locais_estoque (departamento_id)
  WHERE departamento_id IS NOT NULL;

-- 2. Configuração do módulo por empresa (est_config)
CREATE TABLE IF NOT EXISTS public.est_config (
  empresa_id uuid PRIMARY KEY REFERENCES public.empresas (id) ON DELETE CASCADE,
  nfe_xml_diretorio text,
  nfe_xml_local_padrao_id uuid REFERENCES public.cad_locais_estoque (id) ON DELETE SET NULL,
  req_saldo_insuficiente_modo text NOT NULL DEFAULT 'atende_parcial_pendente'
    CHECK (req_saldo_insuficiente_modo IN ('atende_parcial_pendente', 'nao_atende_requisicao', 'pula_item')),
  aprovacao_via_workflow boolean NOT NULL DEFAULT false,
  aprovacao_funil_id uuid REFERENCES public.pipelines (id) ON DELETE SET NULL,
  aprovacao_estagio_id uuid REFERENCES public.pipeline_stages (id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.usuarios (id) ON DELETE SET NULL
);

COMMENT ON TABLE public.est_config IS
  'Parâmetros e integrações do módulo Estoque por tenant (1 linha por empresa).';
COMMENT ON COLUMN public.est_config.nfe_xml_diretorio IS
  'Caminho UNC/local na rede do cliente onde os XMLs de NFe são disponibilizados.';

-- 3. Saldo materializado por local (est_saldos)
CREATE TABLE IF NOT EXISTS public.est_saldos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas (id) ON DELETE CASCADE,
  sku_id uuid NOT NULL REFERENCES public.cad_skus (id) ON DELETE RESTRICT,
  local_id uuid NOT NULL REFERENCES public.cad_locais_estoque (id) ON DELETE RESTRICT,
  quantidade numeric(18, 4) NOT NULL DEFAULT 0 CHECK (quantidade >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT est_saldos_empresa_sku_local_uq UNIQUE (empresa_id, sku_id, local_id)
);

COMMENT ON TABLE public.est_saldos IS
  'Posição de saldo atual em UM de estoque por SKU e local.';

CREATE INDEX IF NOT EXISTS idx_est_saldos_empresa_sku
  ON public.est_saldos (empresa_id, sku_id);
CREATE INDEX IF NOT EXISTS idx_est_saldos_empresa_local
  ON public.est_saldos (empresa_id, local_id);

-- 4. Saldo em poder de terceiros (est_saldos_poder_terceiros)
CREATE TABLE IF NOT EXISTS public.est_saldos_poder_terceiros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas (id) ON DELETE CASCADE,
  pessoa_id uuid NOT NULL REFERENCES public.crm_leads (id) ON DELETE RESTRICT,
  sku_id uuid NOT NULL REFERENCES public.cad_skus (id) ON DELETE RESTRICT,
  quantidade numeric(18, 4) NOT NULL DEFAULT 0 CHECK (quantidade >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT est_saldos_terceiros_empresa_pessoa_sku_uq UNIQUE (empresa_id, pessoa_id, sku_id)
);

COMMENT ON TABLE public.est_saldos_poder_terceiros IS
  'Posição materializada de estoque próprio em poder de terceiros (oficinas, locações, etc.).';

CREATE INDEX IF NOT EXISTS idx_est_saldos_terceiros_empresa_pessoa
  ON public.est_saldos_poder_terceiros (empresa_id, pessoa_id);
CREATE INDEX IF NOT EXISTS idx_est_saldos_terceiros_empresa_sku
  ON public.est_saldos_poder_terceiros (empresa_id, sku_id);

-- 5. Lotes de entrada (est_entrada_lotes)
CREATE TABLE IF NOT EXISTS public.est_entrada_lotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas (id) ON DELETE CASCADE,
  numero text NOT NULL,
  origem text NOT NULL CHECK (origem IN ('lote_tela', 'planilha', 'nfe_xml')),
  status text NOT NULL DEFAULT 'rascunho'
    CHECK (status IN ('rascunho', 'processando', 'concluido', 'erro', 'parcial')),
  pessoa_id uuid NOT NULL REFERENCES public.crm_leads (id) ON DELETE RESTRICT,
  local_id uuid NOT NULL REFERENCES public.cad_locais_estoque (id) ON DELETE RESTRICT,
  documento text,
  nfe_chave text,
  nfe_xml_nome text,
  observacao text,
  erro_resumo text,
  usuario_id uuid REFERENCES public.usuarios (id) ON DELETE SET NULL,
  movimento_em timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.est_entrada_lotes IS
  'Cabeçalho de lotes de entrada de mercadoria (manual tela, planilha ou NFe XML).';

CREATE INDEX IF NOT EXISTS idx_est_entrada_lotes_empresa_status
  ON public.est_entrada_lotes (empresa_id, status);
CREATE INDEX IF NOT EXISTS idx_est_entrada_lotes_pessoa
  ON public.est_entrada_lotes (empresa_id, pessoa_id);
CREATE INDEX IF NOT EXISTS idx_est_entrada_lotes_nfe_chave
  ON public.est_entrada_lotes (empresa_id, nfe_chave)
  WHERE nfe_chave IS NOT NULL;

-- 6. Lotes de retirada manual (est_retirada_lotes)
CREATE TABLE IF NOT EXISTS public.est_retirada_lotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas (id) ON DELETE CASCADE,
  numero text NOT NULL,
  status text NOT NULL DEFAULT 'rascunho'
    CHECK (status IN ('rascunho', 'concluido', 'parcial', 'erro')),
  observacao text,
  erro_resumo text,
  usuario_id uuid REFERENCES public.usuarios (id) ON DELETE SET NULL,
  movimento_em timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.est_retirada_lotes IS
  'Cabeçalho de lotes de retirada manual de mercadoria para consumo.';

CREATE INDEX IF NOT EXISTS idx_est_retirada_lotes_empresa_status
  ON public.est_retirada_lotes (empresa_id, status);

-- 7. Lotes de ajuste (est_ajuste_lotes)
CREATE TABLE IF NOT EXISTS public.est_ajuste_lotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas (id) ON DELETE CASCADE,
  numero text NOT NULL,
  status text NOT NULL DEFAULT 'rascunho'
    CHECK (status IN ('rascunho', 'concluido', 'parcial', 'erro')),
  observacao text,
  erro_resumo text,
  usuario_id uuid REFERENCES public.usuarios (id) ON DELETE SET NULL,
  movimento_em timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.est_ajuste_lotes IS
  'Cabeçalho de lotes de ajuste manual de saldo (positivo ou negativo).';

CREATE INDEX IF NOT EXISTS idx_est_ajuste_lotes_empresa_status
  ON public.est_ajuste_lotes (empresa_id, status);

-- 8. Lotes de remessa para terceiros (est_remessa_lotes)
CREATE TABLE IF NOT EXISTS public.est_remessa_lotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas (id) ON DELETE CASCADE,
  numero text NOT NULL,
  destinatario_pessoa_id uuid NOT NULL REFERENCES public.crm_leads (id) ON DELETE RESTRICT,
  motivo_codigo text NOT NULL,
  motivo_texto text,
  local_origem_id uuid NOT NULL REFERENCES public.cad_locais_estoque (id) ON DELETE RESTRICT,
  documento text,
  previsao_retorno_em date,
  status text NOT NULL DEFAULT 'aberta'
    CHECK (status IN ('aberta', 'parcial', 'fechada', 'cancelada')),
  usuario_id uuid REFERENCES public.usuarios (id) ON DELETE SET NULL,
  enviado_em timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.est_remessa_lotes IS
  'Cabeçalho de envio de material próprio em poder de terceiros (conserto, locação, etc.).';

CREATE INDEX IF NOT EXISTS idx_est_remessa_lotes_empresa_status
  ON public.est_remessa_lotes (empresa_id, status);
CREATE INDEX IF NOT EXISTS idx_est_remessa_lotes_destinatario
  ON public.est_remessa_lotes (empresa_id, destinatario_pessoa_id);

-- 9. Requisições de materiais (est_requisicoes)
CREATE TABLE IF NOT EXISTS public.est_requisicoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas (id) ON DELETE CASCADE,
  numero text NOT NULL,
  requisitante_pessoa_id uuid NOT NULL REFERENCES public.crm_leads (id) ON DELETE RESTRICT,
  solicitante_usuario_id uuid REFERENCES public.usuarios (id) ON DELETE SET NULL,
  departamento_id uuid REFERENCES public.departamentos (id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'rascunho'
    CHECK (status IN ('rascunho', 'pendente_aprovacao', 'aprovada', 'rejeitada', 'atendida_total', 'atendida_parcial', 'cancelada')),
  origem text NOT NULL DEFAULT 'manual'
    CHECK (origem IN ('manual', 'planilha')),
  workflow_card_id uuid REFERENCES public.crm_cards (id) ON DELETE SET NULL,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.est_requisicoes IS
  'Requisições internas de materiais solicitadas por pessoas/departamentos.';

CREATE INDEX IF NOT EXISTS idx_est_requisicoes_empresa_status
  ON public.est_requisicoes (empresa_id, status);
CREATE INDEX IF NOT EXISTS idx_est_requisicoes_requisitante
  ON public.est_requisicoes (empresa_id, requisitante_pessoa_id);
CREATE INDEX IF NOT EXISTS idx_est_requisicoes_card
  ON public.est_requisicoes (workflow_card_id)
  WHERE workflow_card_id IS NOT NULL;

-- 10. Itens da remessa (est_remessa_itens)
CREATE TABLE IF NOT EXISTS public.est_remessa_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas (id) ON DELETE CASCADE,
  remessa_id uuid NOT NULL REFERENCES public.est_remessa_lotes (id) ON DELETE CASCADE,
  sku_id uuid NOT NULL REFERENCES public.cad_skus (id) ON DELETE RESTRICT,
  quantidade_enviada numeric(18, 4) NOT NULL CHECK (quantidade_enviada > 0),
  quantidade_retornada numeric(18, 4) NOT NULL DEFAULT 0 CHECK (quantidade_retornada >= 0),
  status_item text NOT NULL DEFAULT 'em_poder'
    CHECK (status_item IN ('em_poder', 'parcial', 'retornado')),
  movimento_saida_id uuid, -- FK adicionada após criação de est_movimentos
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.est_remessa_itens IS
  'Itens de material enviado em poder de terceiros e saldo pendente de retorno.';

CREATE INDEX IF NOT EXISTS idx_est_remessa_itens_remessa
  ON public.est_remessa_itens (remessa_id);
CREATE INDEX IF NOT EXISTS idx_est_remessa_itens_sku
  ON public.est_remessa_itens (empresa_id, sku_id);

-- 11. Itens da requisição (est_requisicao_itens)
CREATE TABLE IF NOT EXISTS public.est_requisicao_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas (id) ON DELETE CASCADE,
  requisicao_id uuid NOT NULL REFERENCES public.est_requisicoes (id) ON DELETE CASCADE,
  sku_id uuid NOT NULL REFERENCES public.cad_skus (id) ON DELETE RESTRICT,
  quantidade_pedida numeric(18, 4) NOT NULL CHECK (quantidade_pedida > 0),
  quantidade_atendida numeric(18, 4) NOT NULL DEFAULT 0 CHECK (quantidade_atendida >= 0),
  quantidade_pendente numeric(18, 4) NOT NULL DEFAULT 0 CHECK (quantidade_pendente >= 0),
  local_id uuid REFERENCES public.cad_locais_estoque (id) ON DELETE SET NULL,
  status_item text NOT NULL DEFAULT 'pendente'
    CHECK (status_item IN ('pendente', 'atendido', 'parcial', 'nao_atendido', 'pulado')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.est_requisicao_itens IS
  'Itens solicitados na requisição de materiais e status de atendimento.';

CREATE INDEX IF NOT EXISTS idx_est_requisicao_itens_req
  ON public.est_requisicao_itens (requisicao_id);
CREATE INDEX IF NOT EXISTS idx_est_requisicao_itens_sku
  ON public.est_requisicao_itens (empresa_id, sku_id);

-- 12. Cardex / Livro razão de movimentos (est_movimentos)
CREATE TABLE IF NOT EXISTS public.est_movimentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas (id) ON DELETE CASCADE,
  tipo text NOT NULL
    CHECK (tipo IN ('entrada', 'saida', 'transferencia', 'ajuste', 'remessa_saida', 'remessa_retorno')),
  sku_id uuid NOT NULL REFERENCES public.cad_skus (id) ON DELETE RESTRICT,
  local_id uuid NOT NULL REFERENCES public.cad_locais_estoque (id) ON DELETE RESTRICT,
  local_destino_id uuid REFERENCES public.cad_locais_estoque (id) ON DELETE RESTRICT,
  quantidade numeric(18, 4) NOT NULL CHECK (quantidade > 0),
  documento text,
  pessoa_id uuid REFERENCES public.crm_leads (id) ON DELETE SET NULL,
  lote_entrada_id uuid REFERENCES public.est_entrada_lotes (id) ON DELETE SET NULL,
  lote_retirada_id uuid REFERENCES public.est_retirada_lotes (id) ON DELETE SET NULL,
  lote_ajuste_id uuid REFERENCES public.est_ajuste_lotes (id) ON DELETE SET NULL,
  lote_remessa_id uuid REFERENCES public.est_remessa_lotes (id) ON DELETE SET NULL,
  remessa_item_id uuid REFERENCES public.est_remessa_itens (id) ON DELETE SET NULL,
  requisicao_id uuid REFERENCES public.est_requisicoes (id) ON DELETE SET NULL,
  origem text
    CHECK (origem IS NULL OR origem IN ('lote_tela', 'planilha', 'nfe_xml', 'retirada', 'requisicao', 'ajuste', 'remessa')),
  ajuste_sinal text
    CHECK (ajuste_sinal IS NULL OR ajuste_sinal IN ('positivo', 'negativo')),
  motivo_codigo text,
  motivo text,
  usuario_id uuid REFERENCES public.usuarios (id) ON DELETE SET NULL,
  movimento_em timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.est_movimentos IS
  'Cardex: histórico imutável de todas as movimentações físicas de estoque.';

CREATE INDEX IF NOT EXISTS idx_est_movimentos_empresa_sku
  ON public.est_movimentos (empresa_id, sku_id, movimento_em DESC);
CREATE INDEX IF NOT EXISTS idx_est_movimentos_empresa_local
  ON public.est_movimentos (empresa_id, local_id, movimento_em DESC);
CREATE INDEX IF NOT EXISTS idx_est_movimentos_empresa_tipo
  ON public.est_movimentos (empresa_id, tipo, movimento_em DESC);
CREATE INDEX IF NOT EXISTS idx_est_movimentos_empresa_pessoa
  ON public.est_movimentos (empresa_id, pessoa_id)
  WHERE pessoa_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_est_movimentos_lote_entrada
  ON public.est_movimentos (lote_entrada_id)
  WHERE lote_entrada_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_est_movimentos_lote_retirada
  ON public.est_movimentos (lote_retirada_id)
  WHERE lote_retirada_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_est_movimentos_lote_ajuste
  ON public.est_movimentos (lote_ajuste_id)
  WHERE lote_ajuste_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_est_movimentos_lote_remessa
  ON public.est_movimentos (lote_remessa_id)
  WHERE lote_remessa_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_est_movimentos_requisicao
  ON public.est_movimentos (requisicao_id)
  WHERE requisicao_id IS NOT NULL;

-- Adiciona constraint FK em est_remessa_itens para est_movimentos
ALTER TABLE public.est_remessa_itens
  DROP CONSTRAINT IF EXISTS fk_est_remessa_itens_movimento,
  ADD CONSTRAINT fk_est_remessa_itens_movimento
  FOREIGN KEY (movimento_saida_id) REFERENCES public.est_movimentos (id) ON DELETE SET NULL;

-- 13. Itens do lote de entrada (est_entrada_itens)
CREATE TABLE IF NOT EXISTS public.est_entrada_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas (id) ON DELETE CASCADE,
  lote_id uuid NOT NULL REFERENCES public.est_entrada_lotes (id) ON DELETE CASCADE,
  linha integer NOT NULL,
  codigo_parceiro text,
  sku_id uuid REFERENCES public.cad_skus (id) ON DELETE RESTRICT,
  unidade_origem text NOT NULL,
  quantidade_origem numeric(18, 4) NOT NULL,
  unidade_estoque text,
  quantidade_estoque numeric(18, 4),
  fator_conversao numeric(18, 6),
  justificativa text,
  status text NOT NULL DEFAULT 'ok'
    CHECK (status IN ('ok', 'erro')),
  erro_codigo text,
  erro_mensagem text,
  movimento_id uuid REFERENCES public.est_movimentos (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.est_entrada_itens IS
  'Linhas de itens de entrada de lote com de-para e conversão de UM.';

CREATE INDEX IF NOT EXISTS idx_est_entrada_itens_lote
  ON public.est_entrada_itens (lote_id);
CREATE INDEX IF NOT EXISTS idx_est_entrada_itens_sku
  ON public.est_entrada_itens (empresa_id, sku_id)
  WHERE sku_id IS NOT NULL;

-- 14. Itens do lote de retirada (est_retirada_itens)
CREATE TABLE IF NOT EXISTS public.est_retirada_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas (id) ON DELETE CASCADE,
  lote_id uuid NOT NULL REFERENCES public.est_retirada_lotes (id) ON DELETE CASCADE,
  linha integer NOT NULL,
  sku_id uuid NOT NULL REFERENCES public.cad_skus (id) ON DELETE RESTRICT,
  local_id uuid NOT NULL REFERENCES public.cad_locais_estoque (id) ON DELETE RESTRICT,
  quantidade numeric(18, 4) NOT NULL CHECK (quantidade > 0),
  justificativa text NOT NULL,
  status text NOT NULL DEFAULT 'ok'
    CHECK (status IN ('ok', 'erro')),
  erro_codigo text,
  erro_mensagem text,
  movimento_id uuid REFERENCES public.est_movimentos (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.est_retirada_itens IS
  'Linhas de baixa manual direta por lote com justificativa obrigatória.';

CREATE INDEX IF NOT EXISTS idx_est_retirada_itens_lote
  ON public.est_retirada_itens (lote_id);
CREATE INDEX IF NOT EXISTS idx_est_retirada_itens_sku
  ON public.est_retirada_itens (empresa_id, sku_id);

-- 15. Itens do lote de ajuste (est_ajuste_itens)
CREATE TABLE IF NOT EXISTS public.est_ajuste_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas (id) ON DELETE CASCADE,
  lote_id uuid NOT NULL REFERENCES public.est_ajuste_lotes (id) ON DELETE CASCADE,
  linha integer NOT NULL,
  sku_id uuid NOT NULL REFERENCES public.cad_skus (id) ON DELETE RESTRICT,
  local_id uuid NOT NULL REFERENCES public.cad_locais_estoque (id) ON DELETE RESTRICT,
  quantidade numeric(18, 4) NOT NULL CHECK (quantidade > 0),
  sinal text NOT NULL CHECK (sinal IN ('positivo', 'negativo')),
  justificativa text NOT NULL,
  status text NOT NULL DEFAULT 'ok'
    CHECK (status IN ('ok', 'erro')),
  erro_codigo text,
  erro_mensagem text,
  movimento_id uuid REFERENCES public.est_movimentos (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.est_ajuste_itens IS
  'Linhas de ajuste de inventário (positivo ou negativo) com justificativa mandatória.';

CREATE INDEX IF NOT EXISTS idx_est_ajuste_itens_lote
  ON public.est_ajuste_itens (lote_id);
CREATE INDEX IF NOT EXISTS idx_est_ajuste_itens_sku
  ON public.est_ajuste_itens (empresa_id, sku_id);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE public.cad_locais_estoque ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.est_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.est_saldos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.est_saldos_poder_terceiros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.est_entrada_lotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.est_entrada_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.est_retirada_lotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.est_retirada_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.est_ajuste_lotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.est_ajuste_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.est_remessa_lotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.est_remessa_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.est_requisicoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.est_requisicao_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.est_movimentos ENABLE ROW LEVEL SECURITY;

-- Macro de checagem de usuário/empresa:
-- u.role_global = 'superadmin' OR u.empresa_id = <table>.empresa_id

-- ----------------------------------------------------------------------------
-- cad_locais_estoque
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS cad_locais_estoque_select ON public.cad_locais_estoque;
CREATE POLICY cad_locais_estoque_select ON public.cad_locais_estoque
FOR SELECT TO authenticated
USING (
  (public.check_permission('estoque', 'view') OR public.check_permission('estoque_locais', 'view'))
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = cad_locais_estoque.empresa_id)
  )
);

DROP POLICY IF EXISTS cad_locais_estoque_insert ON public.cad_locais_estoque;
CREATE POLICY cad_locais_estoque_insert ON public.cad_locais_estoque
FOR INSERT TO authenticated
WITH CHECK (
  (public.check_permission('estoque', 'create') OR public.check_permission('estoque', 'edit')
   OR public.check_permission('estoque_locais', 'create') OR public.check_permission('estoque_locais', 'edit'))
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = cad_locais_estoque.empresa_id)
  )
);

DROP POLICY IF EXISTS cad_locais_estoque_update ON public.cad_locais_estoque;
CREATE POLICY cad_locais_estoque_update ON public.cad_locais_estoque
FOR UPDATE TO authenticated
USING (
  (public.check_permission('estoque', 'edit') OR public.check_permission('estoque_locais', 'edit'))
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = cad_locais_estoque.empresa_id)
  )
)
WITH CHECK (
  (public.check_permission('estoque', 'edit') OR public.check_permission('estoque_locais', 'edit'))
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = cad_locais_estoque.empresa_id)
  )
);

DROP POLICY IF EXISTS cad_locais_estoque_delete ON public.cad_locais_estoque;
CREATE POLICY cad_locais_estoque_delete ON public.cad_locais_estoque
FOR DELETE TO authenticated
USING (
  (public.check_permission('estoque', 'delete') OR public.check_permission('estoque_locais', 'delete'))
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = cad_locais_estoque.empresa_id)
  )
);

-- ----------------------------------------------------------------------------
-- est_config
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS est_config_select ON public.est_config;
CREATE POLICY est_config_select ON public.est_config
FOR SELECT TO authenticated
USING (
  (public.check_permission('estoque', 'view') OR public.check_permission('estoque_config', 'view'))
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = est_config.empresa_id)
  )
);

DROP POLICY IF EXISTS est_config_insert ON public.est_config;
CREATE POLICY est_config_insert ON public.est_config
FOR INSERT TO authenticated
WITH CHECK (
  (public.check_permission('estoque', 'create') OR public.check_permission('estoque', 'edit')
   OR public.check_permission('estoque_config', 'create') OR public.check_permission('estoque_config', 'edit'))
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = est_config.empresa_id)
  )
);

DROP POLICY IF EXISTS est_config_update ON public.est_config;
CREATE POLICY est_config_update ON public.est_config
FOR UPDATE TO authenticated
USING (
  (public.check_permission('estoque', 'edit') OR public.check_permission('estoque_config', 'edit'))
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = est_config.empresa_id)
  )
)
WITH CHECK (
  (public.check_permission('estoque', 'edit') OR public.check_permission('estoque_config', 'edit'))
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = est_config.empresa_id)
  )
);

DROP POLICY IF EXISTS est_config_delete ON public.est_config;
CREATE POLICY est_config_delete ON public.est_config
FOR DELETE TO authenticated
USING (
  (public.check_permission('estoque', 'delete') OR public.check_permission('estoque_config', 'delete'))
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = est_config.empresa_id)
  )
);

-- ----------------------------------------------------------------------------
-- est_saldos
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS est_saldos_select ON public.est_saldos;
CREATE POLICY est_saldos_select ON public.est_saldos
FOR SELECT TO authenticated
USING (
  public.check_permission('estoque', 'view')
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = est_saldos.empresa_id)
  )
);

DROP POLICY IF EXISTS est_saldos_insert ON public.est_saldos;
CREATE POLICY est_saldos_insert ON public.est_saldos
FOR INSERT TO authenticated
WITH CHECK (
  (public.check_permission('estoque', 'create') OR public.check_permission('estoque', 'edit'))
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = est_saldos.empresa_id)
  )
);

DROP POLICY IF EXISTS est_saldos_update ON public.est_saldos;
CREATE POLICY est_saldos_update ON public.est_saldos
FOR UPDATE TO authenticated
USING (
  public.check_permission('estoque', 'edit')
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = est_saldos.empresa_id)
  )
)
WITH CHECK (
  public.check_permission('estoque', 'edit')
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = est_saldos.empresa_id)
  )
);

DROP POLICY IF EXISTS est_saldos_delete ON public.est_saldos;
CREATE POLICY est_saldos_delete ON public.est_saldos
FOR DELETE TO authenticated
USING (
  public.check_permission('estoque', 'delete')
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = est_saldos.empresa_id)
  )
);

-- ----------------------------------------------------------------------------
-- est_saldos_poder_terceiros
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS est_saldos_terceiros_select ON public.est_saldos_poder_terceiros;
CREATE POLICY est_saldos_terceiros_select ON public.est_saldos_poder_terceiros
FOR SELECT TO authenticated
USING (
  (public.check_permission('estoque', 'view') OR public.check_permission('estoque_remessas', 'view'))
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = est_saldos_poder_terceiros.empresa_id)
  )
);

DROP POLICY IF EXISTS est_saldos_terceiros_insert ON public.est_saldos_poder_terceiros;
CREATE POLICY est_saldos_terceiros_insert ON public.est_saldos_poder_terceiros
FOR INSERT TO authenticated
WITH CHECK (
  (public.check_permission('estoque', 'create') OR public.check_permission('estoque', 'edit')
   OR public.check_permission('estoque_remessas', 'create') OR public.check_permission('estoque_remessas', 'edit'))
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = est_saldos_poder_terceiros.empresa_id)
  )
);

DROP POLICY IF EXISTS est_saldos_terceiros_update ON public.est_saldos_poder_terceiros;
CREATE POLICY est_saldos_terceiros_update ON public.est_saldos_poder_terceiros
FOR UPDATE TO authenticated
USING (
  (public.check_permission('estoque', 'edit') OR public.check_permission('estoque_remessas', 'edit'))
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = est_saldos_poder_terceiros.empresa_id)
  )
)
WITH CHECK (
  (public.check_permission('estoque', 'edit') OR public.check_permission('estoque_remessas', 'edit'))
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = est_saldos_poder_terceiros.empresa_id)
  )
);

DROP POLICY IF EXISTS est_saldos_terceiros_delete ON public.est_saldos_poder_terceiros;
CREATE POLICY est_saldos_terceiros_delete ON public.est_saldos_poder_terceiros
FOR DELETE TO authenticated
USING (
  (public.check_permission('estoque', 'delete') OR public.check_permission('estoque_remessas', 'delete'))
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = est_saldos_poder_terceiros.empresa_id)
  )
);

-- ----------------------------------------------------------------------------
-- est_entrada_lotes & est_entrada_itens
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS est_entrada_lotes_select ON public.est_entrada_lotes;
CREATE POLICY est_entrada_lotes_select ON public.est_entrada_lotes
FOR SELECT TO authenticated
USING (
  (public.check_permission('estoque', 'view') OR public.check_permission('estoque_entradas', 'view'))
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = est_entrada_lotes.empresa_id)
  )
);

DROP POLICY IF EXISTS est_entrada_lotes_insert ON public.est_entrada_lotes;
CREATE POLICY est_entrada_lotes_insert ON public.est_entrada_lotes
FOR INSERT TO authenticated
WITH CHECK (
  (public.check_permission('estoque', 'create') OR public.check_permission('estoque', 'edit')
   OR public.check_permission('estoque_entradas', 'create') OR public.check_permission('estoque_entradas', 'edit'))
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = est_entrada_lotes.empresa_id)
  )
);

DROP POLICY IF EXISTS est_entrada_lotes_update ON public.est_entrada_lotes;
CREATE POLICY est_entrada_lotes_update ON public.est_entrada_lotes
FOR UPDATE TO authenticated
USING (
  (public.check_permission('estoque', 'edit') OR public.check_permission('estoque_entradas', 'edit'))
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = est_entrada_lotes.empresa_id)
  )
)
WITH CHECK (
  (public.check_permission('estoque', 'edit') OR public.check_permission('estoque_entradas', 'edit'))
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = est_entrada_lotes.empresa_id)
  )
);

DROP POLICY IF EXISTS est_entrada_lotes_delete ON public.est_entrada_lotes;
CREATE POLICY est_entrada_lotes_delete ON public.est_entrada_lotes
FOR DELETE TO authenticated
USING (
  (public.check_permission('estoque', 'delete') OR public.check_permission('estoque_entradas', 'delete'))
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = est_entrada_lotes.empresa_id)
  )
);

DROP POLICY IF EXISTS est_entrada_itens_select ON public.est_entrada_itens;
CREATE POLICY est_entrada_itens_select ON public.est_entrada_itens
FOR SELECT TO authenticated
USING (
  (public.check_permission('estoque', 'view') OR public.check_permission('estoque_entradas', 'view'))
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = est_entrada_itens.empresa_id)
  )
);

DROP POLICY IF EXISTS est_entrada_itens_insert ON public.est_entrada_itens;
CREATE POLICY est_entrada_itens_insert ON public.est_entrada_itens
FOR INSERT TO authenticated
WITH CHECK (
  (public.check_permission('estoque', 'create') OR public.check_permission('estoque', 'edit')
   OR public.check_permission('estoque_entradas', 'create') OR public.check_permission('estoque_entradas', 'edit'))
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = est_entrada_itens.empresa_id)
  )
);

DROP POLICY IF EXISTS est_entrada_itens_update ON public.est_entrada_itens;
CREATE POLICY est_entrada_itens_update ON public.est_entrada_itens
FOR UPDATE TO authenticated
USING (
  (public.check_permission('estoque', 'edit') OR public.check_permission('estoque_entradas', 'edit'))
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = est_entrada_itens.empresa_id)
  )
)
WITH CHECK (
  (public.check_permission('estoque', 'edit') OR public.check_permission('estoque_entradas', 'edit'))
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = est_entrada_itens.empresa_id)
  )
);

DROP POLICY IF EXISTS est_entrada_itens_delete ON public.est_entrada_itens;
CREATE POLICY est_entrada_itens_delete ON public.est_entrada_itens
FOR DELETE TO authenticated
USING (
  (public.check_permission('estoque', 'delete') OR public.check_permission('estoque_entradas', 'delete'))
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = est_entrada_itens.empresa_id)
  )
);

-- ----------------------------------------------------------------------------
-- est_retirada_lotes & est_retirada_itens
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS est_retirada_lotes_select ON public.est_retirada_lotes;
CREATE POLICY est_retirada_lotes_select ON public.est_retirada_lotes
FOR SELECT TO authenticated
USING (
  (public.check_permission('estoque', 'view') OR public.check_permission('estoque_retiradas', 'view'))
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = est_retirada_lotes.empresa_id)
  )
);

DROP POLICY IF EXISTS est_retirada_lotes_insert ON public.est_retirada_lotes;
CREATE POLICY est_retirada_lotes_insert ON public.est_retirada_lotes
FOR INSERT TO authenticated
WITH CHECK (
  (public.check_permission('estoque', 'create') OR public.check_permission('estoque', 'edit')
   OR public.check_permission('estoque_retiradas', 'create') OR public.check_permission('estoque_retiradas', 'edit'))
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = est_retirada_lotes.empresa_id)
  )
);

DROP POLICY IF EXISTS est_retirada_lotes_update ON public.est_retirada_lotes;
CREATE POLICY est_retirada_lotes_update ON public.est_retirada_lotes
FOR UPDATE TO authenticated
USING (
  (public.check_permission('estoque', 'edit') OR public.check_permission('estoque_retiradas', 'edit'))
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = est_retirada_lotes.empresa_id)
  )
)
WITH CHECK (
  (public.check_permission('estoque', 'edit') OR public.check_permission('estoque_retiradas', 'edit'))
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = est_retirada_lotes.empresa_id)
  )
);

DROP POLICY IF EXISTS est_retirada_lotes_delete ON public.est_retirada_lotes;
CREATE POLICY est_retirada_lotes_delete ON public.est_retirada_lotes
FOR DELETE TO authenticated
USING (
  (public.check_permission('estoque', 'delete') OR public.check_permission('estoque_retiradas', 'delete'))
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = est_retirada_lotes.empresa_id)
  )
);

DROP POLICY IF EXISTS est_retirada_itens_select ON public.est_retirada_itens;
CREATE POLICY est_retirada_itens_select ON public.est_retirada_itens
FOR SELECT TO authenticated
USING (
  (public.check_permission('estoque', 'view') OR public.check_permission('estoque_retiradas', 'view'))
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = est_retirada_itens.empresa_id)
  )
);

DROP POLICY IF EXISTS est_retirada_itens_insert ON public.est_retirada_itens;
CREATE POLICY est_retirada_itens_insert ON public.est_retirada_itens
FOR INSERT TO authenticated
WITH CHECK (
  (public.check_permission('estoque', 'create') OR public.check_permission('estoque', 'edit')
   OR public.check_permission('estoque_retiradas', 'create') OR public.check_permission('estoque_retiradas', 'edit'))
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = est_retirada_itens.empresa_id)
  )
);

DROP POLICY IF EXISTS est_retirada_itens_update ON public.est_retirada_itens;
CREATE POLICY est_retirada_itens_update ON public.est_retirada_itens
FOR UPDATE TO authenticated
USING (
  (public.check_permission('estoque', 'edit') OR public.check_permission('estoque_retiradas', 'edit'))
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = est_retirada_itens.empresa_id)
  )
)
WITH CHECK (
  (public.check_permission('estoque', 'edit') OR public.check_permission('estoque_retiradas', 'edit'))
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = est_retirada_itens.empresa_id)
  )
);

DROP POLICY IF EXISTS est_retirada_itens_delete ON public.est_retirada_itens;
CREATE POLICY est_retirada_itens_delete ON public.est_retirada_itens
FOR DELETE TO authenticated
USING (
  (public.check_permission('estoque', 'delete') OR public.check_permission('estoque_retiradas', 'delete'))
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = est_retirada_itens.empresa_id)
  )
);

-- ----------------------------------------------------------------------------
-- est_ajuste_lotes & est_ajuste_itens
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS est_ajuste_lotes_select ON public.est_ajuste_lotes;
CREATE POLICY est_ajuste_lotes_select ON public.est_ajuste_lotes
FOR SELECT TO authenticated
USING (
  (public.check_permission('estoque', 'view') OR public.check_permission('estoque_ajustes', 'view'))
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = est_ajuste_lotes.empresa_id)
  )
);

DROP POLICY IF EXISTS est_ajuste_lotes_insert ON public.est_ajuste_lotes;
CREATE POLICY est_ajuste_lotes_insert ON public.est_ajuste_lotes
FOR INSERT TO authenticated
WITH CHECK (
  (public.check_permission('estoque', 'create') OR public.check_permission('estoque', 'edit')
   OR public.check_permission('estoque_ajustes', 'create') OR public.check_permission('estoque_ajustes', 'edit'))
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = est_ajuste_lotes.empresa_id)
  )
);

DROP POLICY IF EXISTS est_ajuste_lotes_update ON public.est_ajuste_lotes;
CREATE POLICY est_ajuste_lotes_update ON public.est_ajuste_lotes
FOR UPDATE TO authenticated
USING (
  (public.check_permission('estoque', 'edit') OR public.check_permission('estoque_ajustes', 'edit'))
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = est_ajuste_lotes.empresa_id)
  )
)
WITH CHECK (
  (public.check_permission('estoque', 'edit') OR public.check_permission('estoque_ajustes', 'edit'))
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = est_ajuste_lotes.empresa_id)
  )
);

DROP POLICY IF EXISTS est_ajuste_lotes_delete ON public.est_ajuste_lotes;
CREATE POLICY est_ajuste_lotes_delete ON public.est_ajuste_lotes
FOR DELETE TO authenticated
USING (
  (public.check_permission('estoque', 'delete') OR public.check_permission('estoque_ajustes', 'delete'))
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = est_ajuste_lotes.empresa_id)
  )
);

DROP POLICY IF EXISTS est_ajuste_itens_select ON public.est_ajuste_itens;
CREATE POLICY est_ajuste_itens_select ON public.est_ajuste_itens
FOR SELECT TO authenticated
USING (
  (public.check_permission('estoque', 'view') OR public.check_permission('estoque_ajustes', 'view'))
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = est_ajuste_itens.empresa_id)
  )
);

DROP POLICY IF EXISTS est_ajuste_itens_insert ON public.est_ajuste_itens;
CREATE POLICY est_ajuste_itens_insert ON public.est_ajuste_itens
FOR INSERT TO authenticated
WITH CHECK (
  (public.check_permission('estoque', 'create') OR public.check_permission('estoque', 'edit')
   OR public.check_permission('estoque_ajustes', 'create') OR public.check_permission('estoque_ajustes', 'edit'))
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = est_ajuste_itens.empresa_id)
  )
);

DROP POLICY IF EXISTS est_ajuste_itens_update ON public.est_ajuste_itens;
CREATE POLICY est_ajuste_itens_update ON public.est_ajuste_itens
FOR UPDATE TO authenticated
USING (
  (public.check_permission('estoque', 'edit') OR public.check_permission('estoque_ajustes', 'edit'))
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = est_ajuste_itens.empresa_id)
  )
)
WITH CHECK (
  (public.check_permission('estoque', 'edit') OR public.check_permission('estoque_ajustes', 'edit'))
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = est_ajuste_itens.empresa_id)
  )
);

DROP POLICY IF EXISTS est_ajuste_itens_delete ON public.est_ajuste_itens;
CREATE POLICY est_ajuste_itens_delete ON public.est_ajuste_itens
FOR DELETE TO authenticated
USING (
  (public.check_permission('estoque', 'delete') OR public.check_permission('estoque_ajustes', 'delete'))
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = est_ajuste_itens.empresa_id)
  )
);

-- ----------------------------------------------------------------------------
-- est_remessa_lotes & est_remessa_itens
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS est_remessa_lotes_select ON public.est_remessa_lotes;
CREATE POLICY est_remessa_lotes_select ON public.est_remessa_lotes
FOR SELECT TO authenticated
USING (
  (public.check_permission('estoque', 'view') OR public.check_permission('estoque_remessas', 'view'))
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = est_remessa_lotes.empresa_id)
  )
);

DROP POLICY IF EXISTS est_remessa_lotes_insert ON public.est_remessa_lotes;
CREATE POLICY est_remessa_lotes_insert ON public.est_remessa_lotes
FOR INSERT TO authenticated
WITH CHECK (
  (public.check_permission('estoque', 'create') OR public.check_permission('estoque', 'edit')
   OR public.check_permission('estoque_remessas', 'create') OR public.check_permission('estoque_remessas', 'edit'))
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = est_remessa_lotes.empresa_id)
  )
);

DROP POLICY IF EXISTS est_remessa_lotes_update ON public.est_remessa_lotes;
CREATE POLICY est_remessa_lotes_update ON public.est_remessa_lotes
FOR UPDATE TO authenticated
USING (
  (public.check_permission('estoque', 'edit') OR public.check_permission('estoque_remessas', 'edit'))
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = est_remessa_lotes.empresa_id)
  )
)
WITH CHECK (
  (public.check_permission('estoque', 'edit') OR public.check_permission('estoque_remessas', 'edit'))
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = est_remessa_lotes.empresa_id)
  )
);

DROP POLICY IF EXISTS est_remessa_lotes_delete ON public.est_remessa_lotes;
CREATE POLICY est_remessa_lotes_delete ON public.est_remessa_lotes
FOR DELETE TO authenticated
USING (
  (public.check_permission('estoque', 'delete') OR public.check_permission('estoque_remessas', 'delete'))
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = est_remessa_lotes.empresa_id)
  )
);

DROP POLICY IF EXISTS est_remessa_itens_select ON public.est_remessa_itens;
CREATE POLICY est_remessa_itens_select ON public.est_remessa_itens
FOR SELECT TO authenticated
USING (
  (public.check_permission('estoque', 'view') OR public.check_permission('estoque_remessas', 'view'))
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = est_remessa_itens.empresa_id)
  )
);

DROP POLICY IF EXISTS est_remessa_itens_insert ON public.est_remessa_itens;
CREATE POLICY est_remessa_itens_insert ON public.est_remessa_itens
FOR INSERT TO authenticated
WITH CHECK (
  (public.check_permission('estoque', 'create') OR public.check_permission('estoque', 'edit')
   OR public.check_permission('estoque_remessas', 'create') OR public.check_permission('estoque_remessas', 'edit'))
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = est_remessa_itens.empresa_id)
  )
);

DROP POLICY IF EXISTS est_remessa_itens_update ON public.est_remessa_itens;
CREATE POLICY est_remessa_itens_update ON public.est_remessa_itens
FOR UPDATE TO authenticated
USING (
  (public.check_permission('estoque', 'edit') OR public.check_permission('estoque_remessas', 'edit'))
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = est_remessa_itens.empresa_id)
  )
)
WITH CHECK (
  (public.check_permission('estoque', 'edit') OR public.check_permission('estoque_remessas', 'edit'))
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = est_remessa_itens.empresa_id)
  )
);

DROP POLICY IF EXISTS est_remessa_itens_delete ON public.est_remessa_itens;
CREATE POLICY est_remessa_itens_delete ON public.est_remessa_itens
FOR DELETE TO authenticated
USING (
  (public.check_permission('estoque', 'delete') OR public.check_permission('estoque_remessas', 'delete'))
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = est_remessa_itens.empresa_id)
  )
);

-- ----------------------------------------------------------------------------
-- est_requisicoes & est_requisicao_itens
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS est_requisicoes_select ON public.est_requisicoes;
CREATE POLICY est_requisicoes_select ON public.est_requisicoes
FOR SELECT TO authenticated
USING (
  (public.check_permission('estoque', 'view') OR public.check_permission('estoque_requisicoes', 'view'))
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = est_requisicoes.empresa_id)
  )
);

DROP POLICY IF EXISTS est_requisicoes_insert ON public.est_requisicoes;
CREATE POLICY est_requisicoes_insert ON public.est_requisicoes
FOR INSERT TO authenticated
WITH CHECK (
  (public.check_permission('estoque', 'create') OR public.check_permission('estoque', 'edit')
   OR public.check_permission('estoque_requisicoes', 'create') OR public.check_permission('estoque_requisicoes', 'edit'))
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = est_requisicoes.empresa_id)
  )
);

DROP POLICY IF EXISTS est_requisicoes_update ON public.est_requisicoes;
CREATE POLICY est_requisicoes_update ON public.est_requisicoes
FOR UPDATE TO authenticated
USING (
  (public.check_permission('estoque', 'edit') OR public.check_permission('estoque_requisicoes', 'edit')
   OR public.check_permission('estoque_aprovacao', 'edit') OR public.check_permission('estoque_atendimento', 'edit'))
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = est_requisicoes.empresa_id)
  )
)
WITH CHECK (
  (public.check_permission('estoque', 'edit') OR public.check_permission('estoque_requisicoes', 'edit')
   OR public.check_permission('estoque_aprovacao', 'edit') OR public.check_permission('estoque_atendimento', 'edit'))
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = est_requisicoes.empresa_id)
  )
);

DROP POLICY IF EXISTS est_requisicoes_delete ON public.est_requisicoes;
CREATE POLICY est_requisicoes_delete ON public.est_requisicoes
FOR DELETE TO authenticated
USING (
  (public.check_permission('estoque', 'delete') OR public.check_permission('estoque_requisicoes', 'delete'))
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = est_requisicoes.empresa_id)
  )
);

DROP POLICY IF EXISTS est_requisicao_itens_select ON public.est_requisicao_itens;
CREATE POLICY est_requisicao_itens_select ON public.est_requisicao_itens
FOR SELECT TO authenticated
USING (
  (public.check_permission('estoque', 'view') OR public.check_permission('estoque_requisicoes', 'view'))
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = est_requisicao_itens.empresa_id)
  )
);

DROP POLICY IF EXISTS est_requisicao_itens_insert ON public.est_requisicao_itens;
CREATE POLICY est_requisicao_itens_insert ON public.est_requisicao_itens
FOR INSERT TO authenticated
WITH CHECK (
  (public.check_permission('estoque', 'create') OR public.check_permission('estoque', 'edit')
   OR public.check_permission('estoque_requisicoes', 'create') OR public.check_permission('estoque_requisicoes', 'edit'))
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = est_requisicao_itens.empresa_id)
  )
);

DROP POLICY IF EXISTS est_requisicao_itens_update ON public.est_requisicao_itens;
CREATE POLICY est_requisicao_itens_update ON public.est_requisicao_itens
FOR UPDATE TO authenticated
USING (
  (public.check_permission('estoque', 'edit') OR public.check_permission('estoque_requisicoes', 'edit')
   OR public.check_permission('estoque_atendimento', 'edit'))
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = est_requisicao_itens.empresa_id)
  )
)
WITH CHECK (
  (public.check_permission('estoque', 'edit') OR public.check_permission('estoque_requisicoes', 'edit')
   OR public.check_permission('estoque_atendimento', 'edit'))
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = est_requisicao_itens.empresa_id)
  )
);

DROP POLICY IF EXISTS est_requisicao_itens_delete ON public.est_requisicao_itens;
CREATE POLICY est_requisicao_itens_delete ON public.est_requisicao_itens
FOR DELETE TO authenticated
USING (
  (public.check_permission('estoque', 'delete') OR public.check_permission('estoque_requisicoes', 'delete'))
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = est_requisicao_itens.empresa_id)
  )
);

-- ----------------------------------------------------------------------------
-- est_movimentos (Cardex) - imutável pelo usuário comum
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS est_movimentos_select ON public.est_movimentos;
CREATE POLICY est_movimentos_select ON public.est_movimentos
FOR SELECT TO authenticated
USING (
  public.check_permission('estoque', 'view')
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = est_movimentos.empresa_id)
  )
);

DROP POLICY IF EXISTS est_movimentos_insert ON public.est_movimentos;
CREATE POLICY est_movimentos_insert ON public.est_movimentos
FOR INSERT TO authenticated
WITH CHECK (
  (public.check_permission('estoque', 'create') OR public.check_permission('estoque', 'edit'))
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = est_movimentos.empresa_id)
  )
);

DROP POLICY IF EXISTS est_movimentos_update ON public.est_movimentos;
CREATE POLICY est_movimentos_update ON public.est_movimentos
FOR UPDATE TO authenticated
USING (
  public.check_permission('estoque', 'edit')
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = est_movimentos.empresa_id)
  )
)
WITH CHECK (
  public.check_permission('estoque', 'edit')
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = est_movimentos.empresa_id)
  )
);

DROP POLICY IF EXISTS est_movimentos_delete ON public.est_movimentos;
CREATE POLICY est_movimentos_delete ON public.est_movimentos
FOR DELETE TO authenticated
USING (
  public.check_permission('estoque', 'delete')
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = est_movimentos.empresa_id)
  )
);

-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cad_locais_estoque TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.est_config TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.est_saldos TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.est_saldos_poder_terceiros TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.est_entrada_lotes TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.est_entrada_itens TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.est_retirada_lotes TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.est_retirada_itens TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.est_ajuste_lotes TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.est_ajuste_itens TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.est_remessa_lotes TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.est_remessa_itens TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.est_requisicoes TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.est_requisicao_itens TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.est_movimentos TO authenticated, service_role;
