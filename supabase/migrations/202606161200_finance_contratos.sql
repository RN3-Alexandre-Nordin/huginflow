-- =============================================================================
-- Contratos comerciais (finance_contratos + serviços extras)
-- Multi-tenant: empresa_id + RLS padrão financeiro
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.finance_contratos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  numero_contrato text,
  titulo text,
  status text NOT NULL DEFAULT 'rascunho',
  data_assinatura date,
  data_inicio date NOT NULL,
  data_fim date,
  dia_vencimento_mensal smallint,
  valor_setup numeric(12, 2) NOT NULL DEFAULT 0,
  setup_parcelas smallint NOT NULL DEFAULT 1,
  valor_mensalidade numeric(12, 2) NOT NULL DEFAULT 0,
  moeda text NOT NULL DEFAULT 'BRL',
  indice_reajuste text,
  observacoes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT finance_contratos_status_check
    CHECK (status IN ('rascunho', 'ativo', 'suspenso', 'encerrado', 'cancelado')),

  CONSTRAINT finance_contratos_valores_nonneg
    CHECK (valor_setup >= 0 AND valor_mensalidade >= 0),

  CONSTRAINT finance_contratos_setup_parcelas_check
    CHECK (setup_parcelas >= 1 AND setup_parcelas <= 120),

  CONSTRAINT finance_contratos_dia_vencimento_check
    CHECK (dia_vencimento_mensal IS NULL OR (dia_vencimento_mensal >= 1 AND dia_vencimento_mensal <= 28)),

  CONSTRAINT finance_contratos_datas_check
    CHECK (data_fim IS NULL OR data_fim >= data_inicio),

  CONSTRAINT finance_contratos_indice_reajuste_check
    CHECK (indice_reajuste IS NULL OR indice_reajuste IN ('nenhum', 'ipca', 'igpm', 'outro'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_contratos_numero_empresa
  ON public.finance_contratos (empresa_id, numero_contrato)
  WHERE numero_contrato IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_finance_contratos_empresa_status
  ON public.finance_contratos (empresa_id, status);

COMMENT ON TABLE public.finance_contratos IS
  'Contrato comercial por empresa: vigência, setup, mensalidade e metadados.';

CREATE TABLE IF NOT EXISTS public.finance_contrato_servicos_extra (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id uuid NOT NULL REFERENCES public.finance_contratos(id) ON DELETE CASCADE,
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  descricao text NOT NULL,
  valor numeric(12, 2) NOT NULL,
  parcelas smallint NOT NULL DEFAULT 1,
  recorrente_mensal boolean NOT NULL DEFAULT false,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT finance_contrato_extra_valor_nonneg CHECK (valor >= 0),
  CONSTRAINT finance_contrato_extra_parcelas_check CHECK (parcelas >= 1 AND parcelas <= 120)
);

CREATE INDEX IF NOT EXISTS idx_finance_contrato_extra_contrato
  ON public.finance_contrato_servicos_extra (contrato_id);

COMMENT ON TABLE public.finance_contrato_servicos_extra IS
  'Itens avulsos ou recorrentes vinculados ao contrato comercial.';

-- updated_at
DROP TRIGGER IF EXISTS trg_finance_contratos_updated_at ON public.finance_contratos;
CREATE TRIGGER trg_finance_contratos_updated_at
  BEFORE UPDATE ON public.finance_contratos
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_set_updated_at();

-- numero_contrato automático
CREATE OR REPLACE FUNCTION public.tg_finance_contrato_before_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.numero_contrato IS NULL OR btrim(NEW.numero_contrato) = '' THEN
    NEW.numero_contrato := 'CTR-' || to_char(now(), 'YYYY') || '-' || lpad(
      (SELECT COUNT(*) + 1 FROM public.finance_contratos c WHERE c.empresa_id = NEW.empresa_id)::text,
      4, '0'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_finance_contrato_before_insert ON public.finance_contratos;
CREATE TRIGGER tg_finance_contrato_before_insert
  BEFORE INSERT ON public.finance_contratos
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_finance_contrato_before_insert();

-- empresa_id em extras = contrato.empresa_id
CREATE OR REPLACE FUNCTION public.tg_finance_contrato_extra_set_empresa()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_empresa uuid;
BEGIN
  SELECT c.empresa_id INTO v_empresa
  FROM public.finance_contratos c
  WHERE c.id = NEW.contrato_id;

  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Contrato não encontrado: %', NEW.contrato_id;
  END IF;

  NEW.empresa_id := v_empresa;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_finance_contrato_extra_set_empresa ON public.finance_contrato_servicos_extra;
CREATE TRIGGER tg_finance_contrato_extra_set_empresa
  BEFORE INSERT OR UPDATE OF contrato_id ON public.finance_contrato_servicos_extra
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_finance_contrato_extra_set_empresa();

-- RLS
ALTER TABLE public.finance_contratos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_contrato_servicos_extra ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS finance_contratos_tenant ON public.finance_contratos;
CREATE POLICY finance_contratos_tenant ON public.finance_contratos
  FOR ALL
  USING (public.fn_is_superadmin() OR empresa_id = public.fn_current_user_empresa_id())
  WITH CHECK (public.fn_is_superadmin() OR empresa_id = public.fn_current_user_empresa_id());

DROP POLICY IF EXISTS finance_contrato_extra_tenant ON public.finance_contrato_servicos_extra;
CREATE POLICY finance_contrato_extra_tenant ON public.finance_contrato_servicos_extra
  FOR ALL
  USING (public.fn_is_superadmin() OR empresa_id = public.fn_current_user_empresa_id())
  WITH CHECK (public.fn_is_superadmin() OR empresa_id = public.fn_current_user_empresa_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_contratos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_contrato_servicos_extra TO authenticated;

COMMIT;
