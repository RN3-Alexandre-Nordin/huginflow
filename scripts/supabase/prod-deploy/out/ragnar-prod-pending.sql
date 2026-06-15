
-- ============================================================================
-- BUNDLE: empresas_campos_contrato
-- Campos jurídicos em empresas (contrato MSA)
-- Arquivo: scripts/migrations/empresas_campos_contrato.sql
-- ============================================================================
-- Campos jurídicos em empresas (qualificação do Cliente no MSA / contrato)
-- Aplicar no Supabase dev (develop): vujqukqsfwmoezwyuoum

ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS tipo_societario text,
  ADD COLUMN IF NOT EXISTS cidade text,
  ADD COLUMN IF NOT EXISTS responsavel_cpf text,
  ADD COLUMN IF NOT EXISTS responsavel_nacionalidade text,
  ADD COLUMN IF NOT EXISTS responsavel_estado_civil text,
  ADD COLUMN IF NOT EXISTS responsavel_profissao text;

COMMENT ON COLUMN empresas.tipo_societario IS 'Ex.: sociedade empresária limitada — preâmbulo do contrato';
COMMENT ON COLUMN empresas.cidade IS 'Cidade da sede — campo Local nas assinaturas';
COMMENT ON COLUMN empresas.responsavel_cpf IS 'CPF do representante legal do Cliente';
COMMENT ON COLUMN empresas.responsavel_nacionalidade IS 'Nacionalidade do representante legal';
COMMENT ON COLUMN empresas.responsavel_estado_civil IS 'Estado civil do representante legal';
COMMENT ON COLUMN empresas.responsavel_profissao IS 'Profissão do representante legal';


-- ============================================================================
-- BUNDLE: finance_ar_step1
-- AR etapa 1: enum, tabelas, RLS base
-- Arquivo: supabase/migrations/202606031200_finance_ar_step1.sql
-- ============================================================================
-- =============================================================================
-- Etapa 1/3 — Contas a Receber (AR): schema, multi-tenant, RLS, meio de pagamento
-- Projeto: Ragnar | Supabase Postgres
-- Referências: public.empresas(id uuid), public.usuarios(empresa_id, auth_user_id, role_global)
-- Superadmin: usuarios.role_global = 'superadmin' (padrão do app)
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 2.1 Enum: meio de pagamento
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  CREATE TYPE public.finance_meio_pagamento_enum AS ENUM (
    'pix',
    'boleto',
    'cartao',
    'transferencia',
    'dinheiro',
    'stripe',
    'outro'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 3.1 Funções auxiliares RLS (nomes solicitados na spec)
-- Nota: já existem current_user_empresa_id() e current_user_is_superadmin()
--       em migrations anteriores; estas funções seguem a mesma lógica.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_current_user_empresa_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.empresa_id
  FROM public.usuarios u
  WHERE u.auth_user_id = auth.uid()
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.fn_current_user_empresa_id() IS
  'Retorna empresa_id do usuário autenticado (usuarios.auth_user_id = auth.uid()).';

CREATE OR REPLACE FUNCTION public.fn_is_superadmin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND u.role_global = 'superadmin'
  );
$$;

COMMENT ON FUNCTION public.fn_is_superadmin() IS
  'Superadmin RN3: usuarios.role_global = ''superadmin''.';

-- ---------------------------------------------------------------------------
-- 2.5 Trigger utilitário: updated_at
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2.2 Tabela: finance_contas_receber
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.finance_contas_receber (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  tipo text NOT NULL,
  origem text NOT NULL DEFAULT 'manual',
  descricao text,
  competencia date,
  valor_total numeric(12, 2) NOT NULL,
  moeda text NOT NULL DEFAULT 'BRL',
  status text NOT NULL,
  vencimento date NOT NULL,
  pago_total numeric(12, 2) NOT NULL DEFAULT 0,
  saldo numeric(12, 2) GENERATED ALWAYS AS (valor_total - pago_total) STORED,
  meio_pagamento public.finance_meio_pagamento_enum,
  meio_pagamento_detalhe text,
  stripe_customer_id text,
  stripe_invoice_id text,
  stripe_payment_intent_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT finance_cr_tipo_check
    CHECK (tipo IN ('setup', 'mensalidade', 'extra')),

  CONSTRAINT finance_cr_origem_check
    CHECK (origem IN ('manual', 'stripe', 'ajuste')),

  CONSTRAINT finance_cr_status_check
    CHECK (status IN ('aberta', 'vencida', 'paga_parcial', 'paga', 'cancelada')),

  CONSTRAINT finance_cr_valor_total_nonneg
    CHECK (valor_total >= 0),

  CONSTRAINT finance_cr_pago_total_nonneg
    CHECK (pago_total >= 0),

  CONSTRAINT finance_cr_pago_lte_valor
    CHECK (pago_total <= valor_total),

  -- Opção A: mensalidade só aceita stripe (ou null até webhook Stripe na Etapa 3)
  CONSTRAINT finance_cr_mensalidade_meio_check
    CHECK (
      tipo <> 'mensalidade'
      OR meio_pagamento IS NULL
      OR meio_pagamento = 'stripe'::public.finance_meio_pagamento_enum
    )
);

COMMENT ON TABLE public.finance_contas_receber IS
  'Contas a receber por tenant (setup, mensalidade, extra).';
COMMENT ON COLUMN public.finance_contas_receber.meio_pagamento IS
  'Meio previsto/principal; mensalidade: apenas stripe ou null.';
COMMENT ON COLUMN public.finance_contas_receber.meio_pagamento_detalhe IS
  'Detalhe livre (ex.: PIX Copia e Cola, Boleto banco X).';

CREATE INDEX IF NOT EXISTS idx_finance_cr_empresa_vencimento
  ON public.finance_contas_receber (empresa_id, vencimento);

CREATE INDEX IF NOT EXISTS idx_finance_cr_empresa_status
  ON public.finance_contas_receber (empresa_id, status);

CREATE INDEX IF NOT EXISTS idx_finance_cr_empresa_tipo
  ON public.finance_contas_receber (empresa_id, tipo);

CREATE UNIQUE INDEX IF NOT EXISTS uq_finance_cr_empresa_stripe_invoice
  ON public.finance_contas_receber (empresa_id, stripe_invoice_id)
  WHERE stripe_invoice_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_finance_cr_set_updated_at ON public.finance_contas_receber;
CREATE TRIGGER trg_finance_cr_set_updated_at
  BEFORE UPDATE ON public.finance_contas_receber
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_set_updated_at();

-- ---------------------------------------------------------------------------
-- 2.3 Tabela: finance_contas_receber_baixas
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.finance_contas_receber_baixas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  conta_receber_id uuid NOT NULL
    REFERENCES public.finance_contas_receber(id) ON DELETE CASCADE,
  valor numeric(12, 2) NOT NULL,
  data_pagamento date NOT NULL,
  meio_pagamento public.finance_meio_pagamento_enum NOT NULL,
  meio_pagamento_detalhe text,
  observacao text,
  stripe_event_id text,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT finance_cr_baixa_valor_positivo
    CHECK (valor > 0)
);

COMMENT ON TABLE public.finance_contas_receber_baixas IS
  'Baixas (pagamentos) de contas a receber; meio real do recebimento.';
COMMENT ON COLUMN public.finance_contas_receber_baixas.meio_pagamento IS
  'Meio efetivo desta baixa (obrigatório; suporta parciais com meios distintos).';

CREATE INDEX IF NOT EXISTS idx_finance_cr_baixa_empresa_conta
  ON public.finance_contas_receber_baixas (empresa_id, conta_receber_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_finance_cr_baixa_empresa_stripe_event
  ON public.finance_contas_receber_baixas (empresa_id, stripe_event_id)
  WHERE stripe_event_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2.4 Consistência multi-tenant: baixa.empresa_id = conta.empresa_id
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_finance_baixa_validate_empresa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent_empresa uuid;
BEGIN
  SELECT cr.empresa_id
  INTO v_parent_empresa
  FROM public.finance_contas_receber cr
  WHERE cr.id = NEW.conta_receber_id;

  IF v_parent_empresa IS NULL THEN
    RAISE EXCEPTION 'finance_contas_receber % não encontrada', NEW.conta_receber_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NEW.empresa_id IS DISTINCT FROM v_parent_empresa THEN
    RAISE EXCEPTION
      'empresa_id da baixa (%) deve ser igual ao da conta a receber (%)',
      NEW.empresa_id, v_parent_empresa
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_finance_baixa_validate_empresa ON public.finance_contas_receber_baixas;
CREATE TRIGGER trg_finance_baixa_validate_empresa
  BEFORE INSERT OR UPDATE ON public.finance_contas_receber_baixas
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_finance_baixa_validate_empresa();

-- ---------------------------------------------------------------------------
-- 2.5 Recalcular pago_total e status no pai ao mudar baixas
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_finance_recalc_conta_receber()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conta_id uuid;
  v_pago numeric(12, 2);
  v_valor numeric(12, 2);
  v_vencimento date;
  v_status_atual text;
  v_novo_status text;
BEGIN
  v_conta_id := COALESCE(NEW.conta_receber_id, OLD.conta_receber_id);

  SELECT COALESCE(SUM(b.valor), 0)
  INTO v_pago
  FROM public.finance_contas_receber_baixas b
  WHERE b.conta_receber_id = v_conta_id;

  SELECT cr.valor_total, cr.vencimento, cr.status
  INTO v_valor, v_vencimento, v_status_atual
  FROM public.finance_contas_receber cr
  WHERE cr.id = v_conta_id;

  IF NOT FOUND THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF v_status_atual = 'cancelada' THEN
    UPDATE public.finance_contas_receber
    SET pago_total = v_pago,
        updated_at = now()
    WHERE id = v_conta_id;
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF v_pago >= v_valor THEN
    v_novo_status := 'paga';
  ELSIF v_pago > 0 THEN
    v_novo_status := 'paga_parcial';
  ELSIF v_vencimento < CURRENT_DATE THEN
    v_novo_status := 'vencida';
  ELSE
    v_novo_status := 'aberta';
  END IF;

  UPDATE public.finance_contas_receber
  SET pago_total = v_pago,
      status = v_novo_status,
      updated_at = now()
  WHERE id = v_conta_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_finance_baixa_recalc_conta ON public.finance_contas_receber_baixas;
CREATE TRIGGER trg_finance_baixa_recalc_conta
  AFTER INSERT OR UPDATE OR DELETE ON public.finance_contas_receber_baixas
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_finance_recalc_conta_receber();

-- ---------------------------------------------------------------------------
-- 3.2 RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.finance_contas_receber ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_contas_receber_baixas ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.finance_contas_receber FORCE ROW LEVEL SECURITY;
ALTER TABLE public.finance_contas_receber_baixas FORCE ROW LEVEL SECURITY;

-- finance_contas_receber
DROP POLICY IF EXISTS finance_contas_receber_select ON public.finance_contas_receber;
CREATE POLICY finance_contas_receber_select
  ON public.finance_contas_receber
  FOR SELECT
  TO authenticated
  USING (
    public.fn_is_superadmin()
    OR empresa_id = public.fn_current_user_empresa_id()
  );

DROP POLICY IF EXISTS finance_contas_receber_insert ON public.finance_contas_receber;
CREATE POLICY finance_contas_receber_insert
  ON public.finance_contas_receber
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.fn_is_superadmin()
    OR empresa_id = public.fn_current_user_empresa_id()
  );

DROP POLICY IF EXISTS finance_contas_receber_update ON public.finance_contas_receber;
CREATE POLICY finance_contas_receber_update
  ON public.finance_contas_receber
  FOR UPDATE
  TO authenticated
  USING (
    public.fn_is_superadmin()
    OR empresa_id = public.fn_current_user_empresa_id()
  )
  WITH CHECK (
    public.fn_is_superadmin()
    OR empresa_id = public.fn_current_user_empresa_id()
  );

DROP POLICY IF EXISTS finance_contas_receber_delete ON public.finance_contas_receber;
CREATE POLICY finance_contas_receber_delete
  ON public.finance_contas_receber
  FOR DELETE
  TO authenticated
  USING (
    public.fn_is_superadmin()
    OR empresa_id = public.fn_current_user_empresa_id()
  );

-- finance_contas_receber_baixas
DROP POLICY IF EXISTS finance_contas_receber_baixas_select ON public.finance_contas_receber_baixas;
CREATE POLICY finance_contas_receber_baixas_select
  ON public.finance_contas_receber_baixas
  FOR SELECT
  TO authenticated
  USING (
    public.fn_is_superadmin()
    OR empresa_id = public.fn_current_user_empresa_id()
  );

DROP POLICY IF EXISTS finance_contas_receber_baixas_insert ON public.finance_contas_receber_baixas;
CREATE POLICY finance_contas_receber_baixas_insert
  ON public.finance_contas_receber_baixas
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.fn_is_superadmin()
    OR empresa_id = public.fn_current_user_empresa_id()
  );

DROP POLICY IF EXISTS finance_contas_receber_baixas_update ON public.finance_contas_receber_baixas;
CREATE POLICY finance_contas_receber_baixas_update
  ON public.finance_contas_receber_baixas
  FOR UPDATE
  TO authenticated
  USING (
    public.fn_is_superadmin()
    OR empresa_id = public.fn_current_user_empresa_id()
  )
  WITH CHECK (
    public.fn_is_superadmin()
    OR empresa_id = public.fn_current_user_empresa_id()
  );

DROP POLICY IF EXISTS finance_contas_receber_baixas_delete ON public.finance_contas_receber_baixas;
CREATE POLICY finance_contas_receber_baixas_delete
  ON public.finance_contas_receber_baixas
  FOR DELETE
  TO authenticated
  USING (
    public.fn_is_superadmin()
    OR empresa_id = public.fn_current_user_empresa_id()
  );

-- Grants (RLS aplica por cima)
GRANT USAGE ON TYPE public.finance_meio_pagamento_enum TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_contas_receber TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_contas_receber_baixas TO authenticated;

COMMIT;

-- =============================================================================
-- 4) Script de teste mínimo (comentado — rodar manualmente em dev)
-- =============================================================================
/*
-- Pré-requisito: substitua :empresa_id e :outra_empresa por UUIDs reais de empresas.

-- 4.1 Mensalidade com meio inválido (deve falhar)
INSERT INTO public.finance_contas_receber (
  empresa_id, tipo, valor_total, status, vencimento, meio_pagamento
) VALUES (
  :empresa_id, 'mensalidade', 100.00, 'aberta', CURRENT_DATE + 10, 'pix'
);
-- esperado: ERROR constraint finance_cr_mensalidade_meio_check

-- 4.2 Setup com PIX (deve ok)
INSERT INTO public.finance_contas_receber (
  empresa_id, tipo, valor_total, status, vencimento, meio_pagamento, meio_pagamento_detalhe
) VALUES (
  :empresa_id, 'setup', 500.00, 'aberta', CURRENT_DATE + 30, 'pix', 'PIX Copia e Cola'
) RETURNING id;
-- guarde como :conta_id

-- 4.3 Baixa com empresa_id errado (deve falhar no trigger)
INSERT INTO public.finance_contas_receber_baixas (
  empresa_id, conta_receber_id, valor, data_pagamento, meio_pagamento
) VALUES (
  :outra_empresa, :conta_id, 100.00, CURRENT_DATE, 'pix'
);
-- esperado: ERROR empresa_id da baixa deve ser igual ao da conta

-- 4.4 Baixa parcial (deve recalcular pago_total e status paga_parcial)
INSERT INTO public.finance_contas_receber_baixas (
  empresa_id, conta_receber_id, valor, data_pagamento, meio_pagamento
) VALUES (
  :empresa_id, :conta_id, 200.00, CURRENT_DATE, 'pix'
);
SELECT id, pago_total, saldo, status FROM public.finance_contas_receber WHERE id = :conta_id;
-- esperado: pago_total=200, saldo=300, status=paga_parcial

-- 4.5 Baixa total (deve status=paga)
INSERT INTO public.finance_contas_receber_baixas (
  empresa_id, conta_receber_id, valor, data_pagamento, meio_pagamento
) VALUES (
  :empresa_id, :conta_id, 300.00, CURRENT_DATE, 'transferencia'
);
SELECT pago_total, saldo, status FROM public.finance_contas_receber WHERE id = :conta_id;
-- esperado: pago_total=500, saldo=0, status=paga

-- 4.6 Conta vencida sem baixas
INSERT INTO public.finance_contas_receber (
  empresa_id, tipo, valor_total, status, vencimento
) VALUES (
  :empresa_id, 'extra', 50.00, 'aberta', CURRENT_DATE - 1
) RETURNING id AS :conta_vencida;
-- após insert manual sem baixa, status inicial é 'aberta';
-- inserir e remover baixa fictícia ou chamar recalc via trigger:
-- UPDATE ... SET vencimento = CURRENT_DATE - 1 e inserir/deletar baixa de R$0.01 não permitido.
-- Alternativa: inserir baixa e deletar para disparar recalc com vencimento passado:
INSERT INTO public.finance_contas_receber_baixas (...) VALUES (... 0.01 ...) -- falha valor>0
-- Melhor: criar conta com vencimento passado, depois:
-- SELECT fn_finance_recalc manualmente não exposta; criar conta e:
UPDATE public.finance_contas_receber SET vencimento = CURRENT_DATE - 1 WHERE id = :conta_vencida;
-- Inserir/deletar baixa de teste para forçar recalc:
INSERT INTO public.finance_contas_receber_baixas (empresa_id, conta_receber_id, valor, data_pagamento, meio_pagamento)
VALUES (:empresa_id, :conta_vencida, 1.00, CURRENT_DATE, 'dinheiro');
DELETE FROM public.finance_contas_receber_baixas WHERE conta_receber_id = :conta_vencida;
SELECT status FROM public.finance_contas_receber WHERE id = :conta_vencida;
-- esperado: status=vencida (pago_total=0, vencimento < hoje)

-- 4.7 Mensalidade com stripe (deve ok)
INSERT INTO public.finance_contas_receber (
  empresa_id, tipo, origem, valor_total, status, vencimento, meio_pagamento
) VALUES (
  :empresa_id, 'mensalidade', 'stripe', 99.90, 'aberta', CURRENT_DATE + 5, 'stripe'
);
*/


-- ============================================================================
-- BUNDLE: finance_ar_step2_routines
-- AR etapa 2: RPCs, view relatório, dashboard
-- Arquivo: supabase/migrations/202606031400_finance_ar_step2_routines.sql
-- ============================================================================
-- =============================================================================
-- Etapa 2/3 — Contas a Receber (AR): funções, procedures e view de relatório
-- Alinhado ao schema da Etapa 1 (finance_contas_receber / _baixas)
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Helpers de tenant (security definer — obrigatório em SPs que bypassam RLS)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_finance_require_empresa_access(p_empresa_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_empresa_id IS NULL THEN
    RAISE EXCEPTION 'empresa_id obrigatório'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF NOT public.fn_is_superadmin()
     AND p_empresa_id IS DISTINCT FROM public.fn_current_user_empresa_id() THEN
    RAISE EXCEPTION 'Acesso negado à empresa %', p_empresa_id
      USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_finance_resolve_empresa_id(p_empresa_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa uuid;
BEGIN
  IF public.fn_is_superadmin() THEN
    IF p_empresa_id IS NOT NULL THEN
      PERFORM public.fn_finance_require_empresa_access(p_empresa_id);
      RETURN p_empresa_id;
    END IF;

    v_empresa := public.fn_current_user_empresa_id();
    IF v_empresa IS NOT NULL THEN
      RETURN v_empresa;
    END IF;

    RAISE EXCEPTION 'Superadmin: informe p_empresa_id ou vincule-se a uma empresa'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  v_empresa := public.fn_current_user_empresa_id();
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Usuário não está associado a uma empresa'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_empresa_id IS NOT NULL AND p_empresa_id IS DISTINCT FROM v_empresa THEN
    RAISE EXCEPTION 'Não é permitido operar em outra empresa'
      USING ERRCODE = '42501';
  END IF;

  RETURN v_empresa;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_finance_get_conta_tenant(p_conta_id uuid)
RETURNS public.finance_contas_receber
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conta public.finance_contas_receber;
BEGIN
  SELECT * INTO v_conta
  FROM public.finance_contas_receber
  WHERE id = p_conta_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta a receber % não encontrada', p_conta_id
      USING ERRCODE = 'no_data_found';
  END IF;

  PERFORM public.fn_finance_require_empresa_access(v_conta.empresa_id);
  RETURN v_conta;
END;
$$;

-- ---------------------------------------------------------------------------
-- Funções de apoio
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_finance_dias_atraso(p_vencimento date)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_vencimento < CURRENT_DATE THEN (CURRENT_DATE - p_vencimento)::integer
    ELSE 0
  END
$$;

COMMENT ON FUNCTION public.fn_finance_dias_atraso(date) IS
  'Dias em atraso a partir do vencimento (0 se ainda não venceu).';

CREATE OR REPLACE FUNCTION public.fn_finance_valor_aberto(p_conta_id uuid)
RETURNS numeric(12, 2)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(cr.saldo, 0)
  FROM public.finance_contas_receber cr
  WHERE cr.id = p_conta_id
$$;

COMMENT ON FUNCTION public.fn_finance_valor_aberto(uuid) IS
  'Saldo em aberto (valor_total - pago_total). Usa coluna saldo gerada.';

CREATE OR REPLACE FUNCTION public.fn_finance_status_inicial(p_vencimento date)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_vencimento < CURRENT_DATE THEN 'vencida'
    ELSE 'aberta'
  END
$$;

-- ---------------------------------------------------------------------------
-- sp_finance_criar_conta_receber
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sp_finance_criar_conta_receber(
  p_tipo text,
  p_valor_total numeric(12, 2),
  p_vencimento date,
  p_empresa_id uuid DEFAULT NULL,
  p_descricao text DEFAULT NULL,
  p_competencia date DEFAULT NULL,
  p_origem text DEFAULT 'manual',
  p_meio_pagamento public.finance_meio_pagamento_enum DEFAULT NULL,
  p_meio_pagamento_detalhe text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa_id uuid;
  v_conta_id uuid;
  v_status text;
  v_meio public.finance_meio_pagamento_enum;
BEGIN
  v_empresa_id := public.fn_finance_resolve_empresa_id(p_empresa_id);

  IF p_tipo NOT IN ('setup', 'mensalidade', 'extra') THEN
    RAISE EXCEPTION 'tipo inválido: %', p_tipo;
  END IF;

  IF p_origem NOT IN ('manual', 'stripe', 'ajuste') THEN
    RAISE EXCEPTION 'origem inválida: %', p_origem;
  END IF;

  IF p_valor_total IS NULL OR p_valor_total <= 0 THEN
    RAISE EXCEPTION 'valor_total deve ser maior que zero';
  END IF;

  IF p_vencimento IS NULL THEN
    RAISE EXCEPTION 'vencimento é obrigatório';
  END IF;

  IF p_vencimento < CURRENT_DATE - INTERVAL '5 years' THEN
    RAISE EXCEPTION 'vencimento não pode ser muito antigo';
  END IF;

  v_meio := p_meio_pagamento;
  IF p_tipo = 'mensalidade' AND v_meio IS NOT NULL AND v_meio <> 'stripe' THEN
    RAISE EXCEPTION 'mensalidade aceita meio_pagamento stripe ou null';
  END IF;

  v_status := public.fn_finance_status_inicial(p_vencimento);

  INSERT INTO public.finance_contas_receber (
    empresa_id,
    tipo,
    origem,
    descricao,
    competencia,
    valor_total,
    status,
    vencimento,
    meio_pagamento,
    meio_pagamento_detalhe,
    metadata
  ) VALUES (
    v_empresa_id,
    p_tipo,
    p_origem,
    p_descricao,
    p_competencia,
    p_valor_total,
    v_status,
    p_vencimento,
    v_meio,
    p_meio_pagamento_detalhe,
    COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_conta_id;

  RETURN v_conta_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- sp_finance_registrar_baixa
-- Status/pago_total recalculados pelo trigger trg_finance_baixa_recalc_conta
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sp_finance_registrar_baixa(
  p_conta_receber_id uuid,
  p_valor numeric(12, 2),
  p_meio_pagamento public.finance_meio_pagamento_enum,
  p_data_pagamento date DEFAULT CURRENT_DATE,
  p_meio_pagamento_detalhe text DEFAULT NULL,
  p_observacao text DEFAULT NULL,
  p_stripe_event_id text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conta public.finance_contas_receber;
  v_baixa_id uuid;
  v_saldo numeric(12, 2);
BEGIN
  v_conta := public.fn_finance_get_conta_tenant(p_conta_receber_id);

  IF v_conta.status = 'cancelada' THEN
    RAISE EXCEPTION 'Conta cancelada não aceita baixa';
  END IF;

  IF p_valor IS NULL OR p_valor <= 0 THEN
    RAISE EXCEPTION 'valor da baixa deve ser maior que zero';
  END IF;

  IF p_meio_pagamento IS NULL THEN
    RAISE EXCEPTION 'meio_pagamento é obrigatório na baixa';
  END IF;

  v_saldo := v_conta.saldo;

  IF v_saldo <= 0 THEN
    RAISE EXCEPTION 'Conta já está quitada';
  END IF;

  IF p_valor > v_saldo THEN
    RAISE EXCEPTION 'Valor da baixa (%) maior que saldo em aberto (%)', p_valor, v_saldo;
  END IF;

  IF p_stripe_event_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.finance_contas_receber_baixas b
      WHERE b.empresa_id = v_conta.empresa_id
        AND b.stripe_event_id = p_stripe_event_id
    ) THEN
      RAISE EXCEPTION 'stripe_event_id já processado: %', p_stripe_event_id;
    END IF;
  END IF;

  INSERT INTO public.finance_contas_receber_baixas (
    empresa_id,
    conta_receber_id,
    valor,
    data_pagamento,
    meio_pagamento,
    meio_pagamento_detalhe,
    observacao,
    stripe_event_id
  ) VALUES (
    v_conta.empresa_id,
    p_conta_receber_id,
    p_valor,
    p_data_pagamento,
    p_meio_pagamento,
    p_meio_pagamento_detalhe,
    p_observacao,
    p_stripe_event_id
  )
  RETURNING id INTO v_baixa_id;

  RETURN v_baixa_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- sp_finance_cancelar_conta_receber
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sp_finance_cancelar_conta_receber(
  p_conta_id uuid,
  p_motivo text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conta public.finance_contas_receber;
  v_tem_baixas boolean;
BEGIN
  v_conta := public.fn_finance_get_conta_tenant(p_conta_id);

  IF v_conta.status = 'cancelada' THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.finance_contas_receber_baixas b
    WHERE b.conta_receber_id = p_conta_id
  ) INTO v_tem_baixas;

  IF v_tem_baixas THEN
    RAISE EXCEPTION 'Não é possível cancelar conta com baixas registradas';
  END IF;

  UPDATE public.finance_contas_receber
  SET
    status = 'cancelada',
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'cancelamento',
      jsonb_build_object(
        'motivo', p_motivo,
        'em', now()
      )
    ),
    updated_at = now()
  WHERE id = p_conta_id
    AND empresa_id = v_conta.empresa_id;

  RETURN true;
END;
$$;

-- ---------------------------------------------------------------------------
-- View de relatório (security_invoker = RLS do caller nas tabelas base)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.vw_finance_contas_receber_relatorio
WITH (security_invoker = true)
AS
SELECT
  cr.id,
  cr.empresa_id,
  cr.tipo,
  cr.origem,
  cr.descricao,
  cr.competencia,
  cr.valor_total,
  cr.moeda,
  cr.status,
  cr.vencimento,
  cr.pago_total,
  cr.saldo,
  cr.meio_pagamento,
  cr.meio_pagamento_detalhe,
  cr.stripe_customer_id,
  cr.stripe_invoice_id,
  cr.stripe_payment_intent_id,
  cr.metadata,
  public.fn_finance_dias_atraso(cr.vencimento) AS dias_atraso,
  cr.saldo AS valor_aberto,
  cr.pago_total AS valor_pago,
  CASE
    WHEN cr.status = 'cancelada' THEN 'cancelada'
    WHEN cr.status = 'paga' THEN 'paga'
    WHEN cr.status = 'paga_parcial' THEN 'paga_parcial'
    WHEN public.fn_finance_dias_atraso(cr.vencimento) > 0 THEN 'vencida'
    WHEN cr.vencimento = CURRENT_DATE THEN 'vence_hoje'
    WHEN cr.vencimento BETWEEN CURRENT_DATE + 1 AND CURRENT_DATE + 7 THEN 'vence_7_dias'
    ELSE 'a_vencer'
  END AS status_calculado,
  baixas.ultima_baixa,
  cr.created_at,
  cr.updated_at
FROM public.finance_contas_receber cr
LEFT JOIN LATERAL (
  SELECT MAX(b.data_pagamento) AS ultima_baixa
  FROM public.finance_contas_receber_baixas b
  WHERE b.conta_receber_id = cr.id
) baixas ON true;

COMMENT ON VIEW public.vw_finance_contas_receber_relatorio IS
  'Relatório AR por conta; respeita RLS via security_invoker.';

-- ---------------------------------------------------------------------------
-- fn_finance_dashboard
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_finance_dashboard(
  p_empresa_id uuid DEFAULT NULL,
  p_data_inicio date DEFAULT (CURRENT_DATE - 30),
  p_data_fim date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa_id uuid;
  v_resultado jsonb;
BEGIN
  v_empresa_id := public.fn_finance_resolve_empresa_id(p_empresa_id);

  SELECT jsonb_build_object(
    'empresa_id', v_empresa_id,
    'total_aberto', COALESCE((
      SELECT SUM(cr.saldo)
      FROM public.finance_contas_receber cr
      WHERE cr.empresa_id = v_empresa_id
        AND cr.status NOT IN ('paga', 'cancelada')
    ), 0),
    'total_vencido', COALESCE((
      SELECT SUM(cr.saldo)
      FROM public.finance_contas_receber cr
      WHERE cr.empresa_id = v_empresa_id
        AND cr.status NOT IN ('paga', 'cancelada')
        AND cr.vencimento < CURRENT_DATE
    ), 0),
    'total_a_vencer_7_dias', COALESCE((
      SELECT SUM(cr.saldo)
      FROM public.finance_contas_receber cr
      WHERE cr.empresa_id = v_empresa_id
        AND cr.status NOT IN ('paga', 'cancelada')
        AND cr.vencimento BETWEEN CURRENT_DATE AND CURRENT_DATE + 7
    ), 0),
    'total_recebido_periodo', COALESCE((
      SELECT SUM(b.valor)
      FROM public.finance_contas_receber_baixas b
      WHERE b.empresa_id = v_empresa_id
        AND b.data_pagamento BETWEEN p_data_inicio AND p_data_fim
    ), 0),
    'qtd_contas_abertas', COALESCE((
      SELECT COUNT(*)
      FROM public.finance_contas_receber cr
      WHERE cr.empresa_id = v_empresa_id
        AND cr.status IN ('aberta', 'vencida', 'paga_parcial')
    ), 0),
    'qtd_contas_vencidas', COALESCE((
      SELECT COUNT(*)
      FROM public.finance_contas_receber cr
      WHERE cr.empresa_id = v_empresa_id
        AND cr.status IN ('aberta', 'vencida', 'paga_parcial')
        AND cr.vencimento < CURRENT_DATE
    ), 0),
    'qtd_contas_pagas', COALESCE((
      SELECT COUNT(*)
      FROM public.finance_contas_receber cr
      WHERE cr.empresa_id = v_empresa_id
        AND cr.status = 'paga'
    ), 0),
    'por_tipo', COALESCE((
      SELECT jsonb_object_agg(sub.tipo, sub.total_aberto)
      FROM (
        SELECT cr2.tipo, SUM(cr2.saldo) AS total_aberto
        FROM public.finance_contas_receber cr2
        WHERE cr2.empresa_id = v_empresa_id
          AND cr2.status NOT IN ('paga', 'cancelada')
        GROUP BY cr2.tipo
      ) sub
    ), '{}'::jsonb)
  )
  INTO v_resultado;

  RETURN v_resultado;
END;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.fn_finance_dias_atraso(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_finance_valor_aberto(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_finance_dashboard(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sp_finance_criar_conta_receber(
  text, numeric, date, uuid, text, date, text,
  public.finance_meio_pagamento_enum, text, jsonb
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sp_finance_registrar_baixa(
  uuid, numeric, public.finance_meio_pagamento_enum,
  date, text, text, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sp_finance_cancelar_conta_receber(uuid, text) TO authenticated;

GRANT SELECT ON public.vw_finance_contas_receber_relatorio TO authenticated;

COMMIT;

-- =============================================================================
-- Testes manuais (comentado)
-- =============================================================================
/*
SELECT public.sp_finance_criar_conta_receber(
  p_tipo := 'setup',
  p_valor_total := 1500.00,
  p_vencimento := CURRENT_DATE + 15,
  p_descricao := 'Setup inicial',
  p_meio_pagamento := 'pix',
  p_meio_pagamento_detalhe := 'PIX Copia e Cola'
);

SELECT public.sp_finance_registrar_baixa(
  p_conta_receber_id := '...',
  p_valor := 500.00,
  p_meio_pagamento := 'pix'
);

SELECT public.fn_finance_dashboard();
SELECT * FROM public.vw_finance_contas_receber_relatorio LIMIT 20;
*/


-- ============================================================================
-- BUNDLE: etapa3_helpers
-- AR etapa 3: helpers tenant, fn_total_baixas, enqueue_event
-- Arquivo: supabase/migrations/202606031600_etapa3_helpers.sql
-- ============================================================================
-- =============================================================================
-- Etapa 3/3 — Helpers de contexto, totais e outbox enqueue
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Contexto do caller (JWT quando existir; fallback usuarios — ver nota)
-- Nota: Ragnar hoje NÃO injeta empresa_id no JWT por padrão; fallback via usuarios.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_empresa_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    NULLIF(auth.jwt() ->> 'empresa_id', '')::uuid,
    public.fn_current_user_empresa_id()
  );
$$;

COMMENT ON FUNCTION public.current_empresa_id() IS
  'Tenant ativo: claim JWT empresa_id ou usuarios.empresa_id (auth.uid()).';

CREATE OR REPLACE FUNCTION public.current_usuario_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    NULLIF(auth.jwt() ->> 'usuario_id', '')::uuid,
    (
      SELECT u.id
      FROM public.usuarios u
      WHERE u.auth_user_id = auth.uid()
      LIMIT 1
    ),
    auth.uid()
  );
$$;

COMMENT ON FUNCTION public.current_usuario_id() IS
  'Perfil usuarios.id: claim JWT usuario_id ou lookup por auth.uid().';

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    NULLIF(auth.jwt() ->> 'is_admin', '')::boolean,
    EXISTS (
      SELECT 1
      FROM public.usuarios u
      LEFT JOIN public.grupos_acesso g ON g.id = u.grupo_id
      WHERE u.auth_user_id = auth.uid()
        AND (
          u.role_global IN ('superadmin', 'admin')
          OR COALESCE(g.is_admin, false) = true
        )
    ),
    false
  );
$$;

COMMENT ON FUNCTION public.is_admin() IS
  'Admin do tenant ou superadmin; claim JWT is_admin ou role/grupo.';

-- ---------------------------------------------------------------------------
-- Soma de baixas por conta (coluna valor — Etapa 1)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_total_baixas(p_conta_id uuid)
RETURNS numeric(12, 2)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(b.valor), 0)::numeric(12, 2)
  FROM public.finance_contas_receber_baixas b
  WHERE b.conta_receber_id = p_conta_id;
$$;

COMMENT ON FUNCTION public.fn_total_baixas(uuid) IS
  'Total pago (soma das baixas) de uma conta a receber.';

COMMIT;


-- ============================================================================
-- BUNDLE: etapa3_outbox
-- AR etapa 3: integration_outbox
-- Arquivo: supabase/migrations/202606031601_etapa3_outbox.sql
-- ============================================================================
-- =============================================================================
-- Etapa 3 — integration_outbox
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.integration_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  topic text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'PENDING',
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,

  CONSTRAINT integration_outbox_status_check
    CHECK (status IN ('PENDING', 'SENT', 'ERROR'))
);

COMMENT ON TABLE public.integration_outbox IS
  'Outbox de eventos para integrações (Stripe, webhooks internos, etc.).';

CREATE INDEX IF NOT EXISTS idx_integration_outbox_empresa_status
  ON public.integration_outbox (empresa_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_integration_outbox_aggregate
  ON public.integration_outbox (aggregate_type, aggregate_id);

ALTER TABLE public.integration_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_outbox FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- enqueue_event — depende da tabela integration_outbox
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enqueue_event(
  p_empresa_id uuid,
  p_topic text,
  p_aggregate_type text,
  p_aggregate_id uuid,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_empresa_id IS NULL THEN
    RAISE EXCEPTION 'enqueue_event: empresa_id obrigatório';
  END IF;

  INSERT INTO public.integration_outbox (
    empresa_id,
    topic,
    aggregate_type,
    aggregate_id,
    payload,
    status
  ) VALUES (
    p_empresa_id,
    p_topic,
    p_aggregate_type,
    p_aggregate_id,
    COALESCE(p_payload, '{}'::jsonb),
    'PENDING'
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.enqueue_event(uuid, text, text, uuid, jsonb) IS
  'Enfileira evento de integração (outbox pattern).';

COMMIT;


-- ============================================================================
-- BUNDLE: etapa3_auditoria
-- AR etapa 3: finance_audit_log
-- Arquivo: supabase/migrations/202606031602_etapa3_auditoria.sql
-- ============================================================================
-- =============================================================================
-- Etapa 3 — finance_audit_log + trigger genérica
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.finance_audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  tabela text NOT NULL,
  registro_id uuid NOT NULL,
  acao text NOT NULL,
  old_data jsonb,
  new_data jsonb,
  reason text,
  actor_auth_uid uuid,
  actor_usuario_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT finance_audit_log_acao_check
    CHECK (acao IN ('INSERT', 'UPDATE', 'DELETE'))
);

COMMENT ON TABLE public.finance_audit_log IS
  'Trilha de auditoria do módulo financeiro (OLD/NEW + ator).';

CREATE INDEX IF NOT EXISTS idx_finance_audit_empresa_created
  ON public.finance_audit_log (empresa_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_finance_audit_registro
  ON public.finance_audit_log (tabela, registro_id);

ALTER TABLE public.finance_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_audit_log FORCE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.tg_audit_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa_id uuid;
  v_registro_id uuid;
  v_reason text;
BEGIN
  v_reason := NULLIF(current_setting('app.audit_reason', true), '');

  IF TG_OP = 'DELETE' THEN
    v_empresa_id := OLD.empresa_id;
    v_registro_id := OLD.id;
    INSERT INTO public.finance_audit_log (
      empresa_id, tabela, registro_id, acao, old_data, new_data, reason,
      actor_auth_uid, actor_usuario_id
    ) VALUES (
      v_empresa_id, TG_TABLE_NAME, v_registro_id, 'DELETE',
      to_jsonb(OLD), NULL, v_reason, auth.uid(), public.current_usuario_id()
    );
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    v_empresa_id := NEW.empresa_id;
    v_registro_id := NEW.id;
    INSERT INTO public.finance_audit_log (
      empresa_id, tabela, registro_id, acao, old_data, new_data, reason,
      actor_auth_uid, actor_usuario_id
    ) VALUES (
      v_empresa_id, TG_TABLE_NAME, v_registro_id, 'UPDATE',
      to_jsonb(OLD), to_jsonb(NEW), v_reason, auth.uid(), public.current_usuario_id()
    );
    RETURN NEW;
  ELSE
    v_empresa_id := NEW.empresa_id;
    v_registro_id := NEW.id;
    INSERT INTO public.finance_audit_log (
      empresa_id, tabela, registro_id, acao, old_data, new_data, reason,
      actor_auth_uid, actor_usuario_id
    ) VALUES (
      v_empresa_id, TG_TABLE_NAME, v_registro_id, 'INSERT',
      NULL, to_jsonb(NEW), v_reason, auth.uid(), public.current_usuario_id()
    );
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS tg_audit_finance_contas_receber ON public.finance_contas_receber;
CREATE TRIGGER tg_audit_finance_contas_receber
  AFTER INSERT OR UPDATE OR DELETE ON public.finance_contas_receber
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_audit_row();

DROP TRIGGER IF EXISTS tg_audit_finance_contas_receber_baixas ON public.finance_contas_receber_baixas;
CREATE TRIGGER tg_audit_finance_contas_receber_baixas
  AFTER INSERT OR UPDATE OR DELETE ON public.finance_contas_receber_baixas
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_audit_row();

COMMIT;


-- ============================================================================
-- BUNDLE: etapa3_triggers
-- AR etapa 3: triggers baixa/conta, numero_documento
-- Arquivo: supabase/migrations/202606031603_etapa3_triggers.sql
-- ============================================================================
-- =============================================================================
-- Etapa 3 — Triggers de consistência (substitui triggers da Etapa 1)
-- =============================================================================

BEGIN;

-- Colunas auxiliares para relatórios / integrações
ALTER TABLE public.finance_contas_receber
  ADD COLUMN IF NOT EXISTS numero_documento text,
  ADD COLUMN IF NOT EXISTS data_pagamento date;

CREATE UNIQUE INDEX IF NOT EXISTS ux_fin_cr_empresa_doc
  ON public.finance_contas_receber (empresa_id, numero_documento)
  WHERE numero_documento IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fin_baixas_conta
  ON public.finance_contas_receber_baixas (conta_receber_id);

-- ---------------------------------------------------------------------------
-- Sincroniza conta pai após mudança nas baixas (shared)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_finance_sync_conta_from_baixas(p_conta_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pago numeric(12, 2);
  v_valor numeric(12, 2);
  v_vencimento date;
  v_status_atual text;
  v_novo_status text;
  v_ultima_baixa date;
BEGIN
  SELECT COALESCE(public.fn_total_baixas(p_conta_id), 0)
  INTO v_pago;

  SELECT cr.valor_total, cr.vencimento, cr.status
  INTO v_valor, v_vencimento, v_status_atual
  FROM public.finance_contas_receber cr
  WHERE cr.id = p_conta_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_status_atual = 'cancelada' THEN
    UPDATE public.finance_contas_receber
    SET pago_total = v_pago,
        updated_at = now()
    WHERE id = p_conta_id;
    RETURN;
  END IF;

  IF v_pago >= v_valor THEN
    v_novo_status := 'paga';
    SELECT MAX(b.data_pagamento)
    INTO v_ultima_baixa
    FROM public.finance_contas_receber_baixas b
    WHERE b.conta_receber_id = p_conta_id;
  ELSIF v_pago > 0 THEN
    v_novo_status := 'paga_parcial';
    v_ultima_baixa := NULL;
  ELSIF v_vencimento < CURRENT_DATE THEN
    v_novo_status := 'vencida';
    v_ultima_baixa := NULL;
  ELSE
    v_novo_status := 'aberta';
    v_ultima_baixa := NULL;
  END IF;

  UPDATE public.finance_contas_receber
  SET
    pago_total = v_pago,
    status = v_novo_status,
    data_pagamento = CASE WHEN v_novo_status = 'paga' THEN v_ultima_baixa ELSE NULL END,
    updated_at = now()
  WHERE id = p_conta_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- tg_baixa_before
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_finance_baixa_before()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conta public.finance_contas_receber;
  v_pago_outros numeric(12, 2);
  v_aberto numeric(12, 2);
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.conta_receber_id IS DISTINCT FROM OLD.conta_receber_id THEN
      RAISE EXCEPTION 'Não é permitido alterar conta_receber_id da baixa';
    END IF;
    IF NEW.empresa_id IS DISTINCT FROM OLD.empresa_id THEN
      RAISE EXCEPTION 'Não é permitido alterar empresa_id da baixa';
    END IF;
  END IF;

  IF NEW.valor IS NULL OR NEW.valor <= 0 THEN
    RAISE EXCEPTION 'valor da baixa deve ser maior que zero';
  END IF;

  SELECT * INTO v_conta
  FROM public.finance_contas_receber
  WHERE id = NEW.conta_receber_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta a receber % não encontrada', NEW.conta_receber_id;
  END IF;

  IF v_conta.status = 'cancelada' THEN
    RAISE EXCEPTION 'Conta cancelada não aceita baixa';
  END IF;

  NEW.empresa_id := v_conta.empresa_id;

  SELECT COALESCE(SUM(b.valor), 0)
  INTO v_pago_outros
  FROM public.finance_contas_receber_baixas b
  WHERE b.conta_receber_id = NEW.conta_receber_id
    AND (TG_OP = 'INSERT' OR b.id <> OLD.id);

  v_aberto := v_conta.valor_total - v_pago_outros;

  IF NEW.valor > v_aberto THEN
    RAISE EXCEPTION 'Valor da baixa (%) excede saldo em aberto (%)', NEW.valor, v_aberto;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_finance_baixa_validate_empresa ON public.finance_contas_receber_baixas;
DROP TRIGGER IF EXISTS tg_baixa_before ON public.finance_contas_receber_baixas;
CREATE TRIGGER tg_baixa_before
  BEFORE INSERT OR UPDATE ON public.finance_contas_receber_baixas
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_finance_baixa_before();

-- ---------------------------------------------------------------------------
-- tg_baixa_after
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_finance_baixa_after()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conta_id uuid;
  v_empresa_id uuid;
  v_status text;
  v_payload jsonb;
BEGIN
  v_conta_id := COALESCE(NEW.conta_receber_id, OLD.conta_receber_id);
  v_empresa_id := COALESCE(NEW.empresa_id, OLD.empresa_id);

  PERFORM public.fn_finance_sync_conta_from_baixas(v_conta_id);

  SELECT cr.status INTO v_status
  FROM public.finance_contas_receber cr
  WHERE cr.id = v_conta_id;

  IF TG_OP = 'INSERT' THEN
    v_payload := jsonb_build_object(
      'baixa_id', NEW.id,
      'valor', NEW.valor,
      'meio_pagamento', NEW.meio_pagamento,
      'data_pagamento', NEW.data_pagamento
    );
    PERFORM public.enqueue_event(
      v_empresa_id,
      'finance.cr.payment_registered',
      'finance_contas_receber',
      v_conta_id,
      v_payload
    );
    IF v_status = 'paga' THEN
      PERFORM public.enqueue_event(
        v_empresa_id,
        'finance.cr.paid',
        'finance_contas_receber',
        v_conta_id,
        jsonb_build_object('baixa_id', NEW.id, 'status', v_status)
      );
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.enqueue_event(
      v_empresa_id,
      'finance.cr.payment_reversed',
      'finance_contas_receber',
      v_conta_id,
      jsonb_build_object('baixa_id', OLD.id, 'valor', OLD.valor)
    );
  ELSIF TG_OP = 'UPDATE' THEN
    v_payload := jsonb_build_object(
      'baixa_id', NEW.id,
      'valor_anterior', OLD.valor,
      'valor_novo', NEW.valor
    );
    PERFORM public.enqueue_event(
      v_empresa_id,
      'finance.cr.payment_updated',
      'finance_contas_receber',
      v_conta_id,
      v_payload
    );
    IF v_status = 'paga' THEN
      PERFORM public.enqueue_event(
        v_empresa_id,
        'finance.cr.paid',
        'finance_contas_receber',
        v_conta_id,
        jsonb_build_object('baixa_id', NEW.id, 'status', v_status)
      );
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_finance_baixa_recalc_conta ON public.finance_contas_receber_baixas;
DROP TRIGGER IF EXISTS tg_baixa_after ON public.finance_contas_receber_baixas;
CREATE TRIGGER tg_baixa_after
  AFTER INSERT OR UPDATE OR DELETE ON public.finance_contas_receber_baixas
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_finance_baixa_after();

-- Mantém compatibilidade se algo ainda referenciar a função da Etapa 1
CREATE OR REPLACE FUNCTION public.fn_finance_recalc_conta_receber()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.fn_finance_sync_conta_from_baixas(
    COALESCE(NEW.conta_receber_id, OLD.conta_receber_id)
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ---------------------------------------------------------------------------
-- tg_cr_before_insert / tg_cr_before_update
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_finance_cr_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.numero_documento IS NULL OR btrim(NEW.numero_documento) = '' THEN
    NEW.numero_documento := 'DOC-' || extract(epoch from now())::bigint::text;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_cr_before_insert ON public.finance_contas_receber;
CREATE TRIGGER tg_cr_before_insert
  BEFORE INSERT ON public.finance_contas_receber
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_finance_cr_before_insert();

CREATE OR REPLACE FUNCTION public.tg_finance_cr_before_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pago numeric(12, 2);
BEGIN
  IF NEW.empresa_id IS DISTINCT FROM OLD.empresa_id THEN
    RAISE EXCEPTION 'Não é permitido alterar empresa_id da conta';
  END IF;

  IF OLD.status = 'cancelada' AND NEW.status IS DISTINCT FROM 'cancelada' THEN
    RAISE EXCEPTION 'Conta cancelada não pode ser reaberta via update direto';
  END IF;

  v_pago := public.fn_total_baixas(NEW.id);

  IF NEW.valor_total < v_pago THEN
    RAISE EXCEPTION 'valor_total (%) não pode ser menor que o total já pago (%)',
      NEW.valor_total, v_pago;
  END IF;

  IF NEW.numero_documento IS NULL OR btrim(NEW.numero_documento) = '' THEN
    NEW.numero_documento := 'DOC-' || extract(epoch from now())::bigint::text;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_cr_before_update ON public.finance_contas_receber;
CREATE TRIGGER tg_cr_before_update
  BEFORE UPDATE ON public.finance_contas_receber
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_finance_cr_before_update();

-- ---------------------------------------------------------------------------
-- tg_cr_after_insert / tg_cr_after_update
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_finance_cr_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.enqueue_event(
    NEW.empresa_id,
    'finance.cr.created',
    'finance_contas_receber',
    NEW.id,
    to_jsonb(NEW)
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_finance_cr_after_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'cancelada' AND OLD.status IS DISTINCT FROM 'cancelada' THEN
    PERFORM public.enqueue_event(
      NEW.empresa_id,
      'finance.cr.cancelled',
      'finance_contas_receber',
      NEW.id,
      jsonb_build_object(
        'old_status', OLD.status,
        'metadata', NEW.metadata
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_cr_after_insert ON public.finance_contas_receber;
CREATE TRIGGER tg_cr_after_insert
  AFTER INSERT ON public.finance_contas_receber
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_finance_cr_after_insert();

DROP TRIGGER IF EXISTS tg_cr_after_update ON public.finance_contas_receber;
CREATE TRIGGER tg_cr_after_update
  AFTER UPDATE ON public.finance_contas_receber
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_finance_cr_after_update();

COMMIT;


-- ============================================================================
-- BUNDLE: etapa3_rls
-- AR etapa 3: RLS atualizado, revoke DML direto
-- Arquivo: supabase/migrations/202606031604_etapa3_rls.sql
-- ============================================================================
-- =============================================================================
-- Etapa 3 — RLS multi-tenant (current_empresa_id + is_admin)
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- finance_contas_receber
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS finance_contas_receber_select ON public.finance_contas_receber;
DROP POLICY IF EXISTS finance_contas_receber_insert ON public.finance_contas_receber;
DROP POLICY IF EXISTS finance_contas_receber_update ON public.finance_contas_receber;
DROP POLICY IF EXISTS finance_contas_receber_delete ON public.finance_contas_receber;

CREATE POLICY finance_cr_select_tenant
  ON public.finance_contas_receber
  FOR SELECT
  TO authenticated
  USING (
    empresa_id = public.current_empresa_id()
    OR public.fn_is_superadmin()
  );

CREATE POLICY finance_cr_insert_tenant
  ON public.finance_contas_receber
  FOR INSERT
  TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());

CREATE POLICY finance_cr_update_tenant
  ON public.finance_contas_receber
  FOR UPDATE
  TO authenticated
  USING (empresa_id = public.current_empresa_id())
  WITH CHECK (empresa_id = public.current_empresa_id());

-- Sem DELETE policy → bloqueado para authenticated

-- ---------------------------------------------------------------------------
-- finance_contas_receber_baixas
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS finance_contas_receber_baixas_select ON public.finance_contas_receber_baixas;
DROP POLICY IF EXISTS finance_contas_receber_baixas_insert ON public.finance_contas_receber_baixas;
DROP POLICY IF EXISTS finance_contas_receber_baixas_update ON public.finance_contas_receber_baixas;
DROP POLICY IF EXISTS finance_contas_receber_baixas_delete ON public.finance_contas_receber_baixas;

CREATE POLICY finance_cr_baixas_select_tenant
  ON public.finance_contas_receber_baixas
  FOR SELECT
  TO authenticated
  USING (
    empresa_id = public.current_empresa_id()
    OR public.fn_is_superadmin()
  );

CREATE POLICY finance_cr_baixas_insert_tenant
  ON public.finance_contas_receber_baixas
  FOR INSERT
  TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());

CREATE POLICY finance_cr_baixas_update_tenant
  ON public.finance_contas_receber_baixas
  FOR UPDATE
  TO authenticated
  USING (empresa_id = public.current_empresa_id())
  WITH CHECK (empresa_id = public.current_empresa_id());

CREATE POLICY finance_cr_baixas_delete_tenant
  ON public.finance_contas_receber_baixas
  FOR DELETE
  TO authenticated
  USING (empresa_id = public.current_empresa_id());

-- ---------------------------------------------------------------------------
-- finance_audit_log
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS finance_audit_log_insert ON public.finance_audit_log;
DROP POLICY IF EXISTS finance_audit_log_select ON public.finance_audit_log;

CREATE POLICY finance_audit_log_insert
  ON public.finance_audit_log
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY finance_audit_log_select
  ON public.finance_audit_log
  FOR SELECT
  TO authenticated
  USING (
    empresa_id = public.current_empresa_id()
    AND public.is_admin()
  );

-- ---------------------------------------------------------------------------
-- integration_outbox
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS integration_outbox_insert ON public.integration_outbox;
DROP POLICY IF EXISTS integration_outbox_select ON public.integration_outbox;
DROP POLICY IF EXISTS integration_outbox_update ON public.integration_outbox;

CREATE POLICY integration_outbox_insert
  ON public.integration_outbox
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY integration_outbox_select
  ON public.integration_outbox
  FOR SELECT
  TO authenticated
  USING (
    empresa_id = public.current_empresa_id()
    AND public.is_admin()
  );

CREATE POLICY integration_outbox_update
  ON public.integration_outbox
  FOR UPDATE
  TO authenticated
  USING (
    empresa_id = public.current_empresa_id()
    AND public.is_admin()
  )
  WITH CHECK (
    empresa_id = public.current_empresa_id()
    AND public.is_admin()
  );

COMMIT;


-- ============================================================================
-- BUNDLE: etapa3_grants
-- AR etapa 3: grants RPC + SELECT
-- Arquivo: supabase/migrations/202606031605_etapa3_grants.sql
-- ============================================================================
-- =============================================================================
-- Etapa 3 — REVOKE DML direto + GRANTs finais
-- App escreve somente via RPC SECURITY DEFINER
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- REVOKE DML nas tabelas base
-- ---------------------------------------------------------------------------
REVOKE ALL ON TABLE public.finance_contas_receber FROM anon, authenticated;
REVOKE ALL ON TABLE public.finance_contas_receber_baixas FROM anon, authenticated;
REVOKE ALL ON TABLE public.finance_audit_log FROM anon, authenticated;
REVOKE ALL ON TABLE public.integration_outbox FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- GRANT SELECT (RLS filtra por tenant)
-- ---------------------------------------------------------------------------
GRANT SELECT ON TABLE public.finance_contas_receber TO authenticated;
GRANT SELECT ON TABLE public.finance_contas_receber_baixas TO authenticated;
GRANT SELECT ON TABLE public.finance_audit_log TO authenticated;
-- integration_outbox: sem SELECT para authenticated (service_role / worker)

-- ---------------------------------------------------------------------------
-- GRANT EXECUTE — helpers de contexto
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.current_empresa_id() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.current_usuario_id() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.fn_total_baixas(uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.enqueue_event(uuid, text, text, uuid, jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- GRANT EXECUTE — RPCs Etapa 2 (nomes reais do projeto)
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.sp_finance_criar_conta_receber(
  text, numeric, date, uuid, text, date, text,
  public.finance_meio_pagamento_enum, text, jsonb
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.sp_finance_registrar_baixa(
  uuid, numeric, public.finance_meio_pagamento_enum,
  date, text, text, text
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.sp_finance_cancelar_conta_receber(uuid, text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.fn_finance_dashboard(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_finance_dias_atraso(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_finance_valor_aberto(uuid) TO authenticated;

GRANT SELECT ON public.vw_finance_contas_receber_relatorio TO authenticated;

COMMIT;

-- =============================================================================
-- VERIFICAÇÃO DE SANIDADE (rode manualmente após deploy)
-- =============================================================================
/*
-- 1. Policies ativas
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'finance_contas_receber',
    'finance_contas_receber_baixas',
    'finance_audit_log',
    'integration_outbox'
  )
ORDER BY tablename, policyname;

-- 2. Triggers ativos
SELECT trigger_name, event_manipulation, event_object_table, action_timing
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND event_object_table LIKE 'finance%'
ORDER BY event_object_table, trigger_name;

-- 3. authenticated sem DML direto nas tabelas base
SELECT grantee, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('finance_contas_receber', 'finance_contas_receber_baixas')
  AND grantee = 'authenticated'
  AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE');
*/


-- ============================================================================
-- BUNDLE: finance_ar_parcelas
-- Parcelamento: colunas, RPC com p_parcelas_total, view
-- Arquivo: supabase/migrations/202606041200_finance_ar_parcelas.sql
-- ============================================================================
-- =============================================================================
-- Parcelamento em Contas a Receber (AR)
-- - grupo_parcelamento_id liga parcelas do mesmo lançamento
-- - mensalidade: p_valor_total = valor de cada mês; gera N mensalidades
-- - setup/extra: p_valor_total = valor total; divide em N parcelas iguais
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Colunas de parcelamento
-- ---------------------------------------------------------------------------
ALTER TABLE public.finance_contas_receber
  ADD COLUMN IF NOT EXISTS grupo_parcelamento_id uuid,
  ADD COLUMN IF NOT EXISTS parcela_numero smallint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS parcelas_total smallint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS valor_contrato_original numeric(12, 2);

ALTER TABLE public.finance_contas_receber
  DROP CONSTRAINT IF EXISTS finance_cr_parcela_numero_check;

ALTER TABLE public.finance_contas_receber
  ADD CONSTRAINT finance_cr_parcela_numero_check
    CHECK (parcela_numero >= 1 AND parcelas_total >= 1 AND parcela_numero <= parcelas_total);

ALTER TABLE public.finance_contas_receber
  DROP CONSTRAINT IF EXISTS finance_cr_parcelas_total_max_check;

ALTER TABLE public.finance_contas_receber
  ADD CONSTRAINT finance_cr_parcelas_total_max_check
    CHECK (parcelas_total <= 120);

CREATE INDEX IF NOT EXISTS idx_finance_cr_grupo_parcelamento
  ON public.finance_contas_receber (grupo_parcelamento_id)
  WHERE grupo_parcelamento_id IS NOT NULL;

COMMENT ON COLUMN public.finance_contas_receber.grupo_parcelamento_id IS
  'Agrupa parcelas/mensalidades criadas no mesmo lançamento.';
COMMENT ON COLUMN public.finance_contas_receber.parcela_numero IS
  'Número da parcela (1..parcelas_total).';
COMMENT ON COLUMN public.finance_contas_receber.parcelas_total IS
  'Quantidade total de parcelas do grupo.';
COMMENT ON COLUMN public.finance_contas_receber.valor_contrato_original IS
  'Valor total do contrato/lançamento (soma das parcelas).';

-- ---------------------------------------------------------------------------
-- sp_finance_criar_conta_receber — com parcelas
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sp_finance_criar_conta_receber(
  p_tipo text,
  p_valor_total numeric(12, 2),
  p_vencimento date,
  p_empresa_id uuid DEFAULT NULL,
  p_descricao text DEFAULT NULL,
  p_competencia date DEFAULT NULL,
  p_origem text DEFAULT 'manual',
  p_meio_pagamento public.finance_meio_pagamento_enum DEFAULT NULL,
  p_meio_pagamento_detalhe text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_parcelas_total integer DEFAULT 1
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa_id uuid;
  v_conta_id uuid;
  v_primeira_conta_id uuid;
  v_status text;
  v_meio public.finance_meio_pagamento_enum;
  v_parcelas integer;
  v_grupo_id uuid;
  v_i integer;
  v_valor_parcela numeric(12, 2);
  v_valor_contrato numeric(12, 2);
  v_vencimento date;
  v_competencia date;
  v_descricao text;
  v_doc_base text;
  v_soma_parcelas numeric(12, 2);
  v_valor_base numeric(12, 2);
BEGIN
  v_empresa_id := public.fn_finance_resolve_empresa_id(p_empresa_id);

  IF p_tipo NOT IN ('setup', 'mensalidade', 'extra') THEN
    RAISE EXCEPTION 'tipo inválido: %', p_tipo;
  END IF;

  IF p_origem NOT IN ('manual', 'stripe', 'ajuste') THEN
    RAISE EXCEPTION 'origem inválida: %', p_origem;
  END IF;

  IF p_valor_total IS NULL OR p_valor_total <= 0 THEN
    RAISE EXCEPTION 'valor_total deve ser maior que zero';
  END IF;

  IF p_vencimento IS NULL THEN
    RAISE EXCEPTION 'vencimento é obrigatório';
  END IF;

  IF p_vencimento < CURRENT_DATE - INTERVAL '5 years' THEN
    RAISE EXCEPTION 'vencimento não pode ser muito antigo';
  END IF;

  v_parcelas := COALESCE(p_parcelas_total, 1);
  IF v_parcelas < 1 THEN
    RAISE EXCEPTION 'parcelas_total deve ser >= 1';
  END IF;

  IF v_parcelas > 120 THEN
    RAISE EXCEPTION 'parcelas_total não pode exceder 120';
  END IF;

  v_meio := p_meio_pagamento;
  IF p_tipo = 'mensalidade' AND v_meio IS NOT NULL AND v_meio <> 'stripe' THEN
    RAISE EXCEPTION 'mensalidade aceita meio_pagamento stripe ou null';
  END IF;

  v_grupo_id := CASE WHEN v_parcelas > 1 THEN gen_random_uuid() ELSE NULL END;
  v_doc_base := 'DOC-' || to_char(extract(epoch from clock_timestamp())::bigint, 'FM999999999999');

  IF p_tipo = 'mensalidade' THEN
    v_valor_contrato := round(p_valor_total * v_parcelas, 2);
    v_valor_base := p_valor_total;
  ELSE
    v_valor_contrato := p_valor_total;
    v_valor_base := round(p_valor_total / v_parcelas, 2);
  END IF;

  v_soma_parcelas := 0;

  FOR v_i IN 1..v_parcelas LOOP
    IF p_tipo = 'mensalidade' THEN
      v_valor_parcela := v_valor_base;
    ELSIF v_i < v_parcelas THEN
      v_valor_parcela := v_valor_base;
      v_soma_parcelas := v_soma_parcelas + v_valor_parcela;
    ELSE
      v_valor_parcela := round(v_valor_contrato - v_soma_parcelas, 2);
    END IF;

    v_vencimento := (p_vencimento + ((v_i - 1) || ' months')::interval)::date;

    IF p_competencia IS NOT NULL THEN
      v_competencia := (p_competencia + ((v_i - 1) || ' months')::interval)::date;
    ELSIF p_tipo = 'mensalidade' THEN
      v_competencia := v_vencimento;
    ELSE
      v_competencia := p_competencia;
    END IF;

    IF v_parcelas > 1 THEN
      v_descricao := trim(both from coalesce(p_descricao, ''));
      IF v_descricao = '' THEN
        v_descricao := initcap(p_tipo) || ' — parcela ' || v_i || '/' || v_parcelas;
      ELSE
        v_descricao := v_descricao || ' (Parcela ' || v_i || '/' || v_parcelas || ')';
      END IF;
    ELSE
      v_descricao := p_descricao;
    END IF;

    v_status := public.fn_finance_status_inicial(v_vencimento);

    INSERT INTO public.finance_contas_receber (
      empresa_id,
      tipo,
      origem,
      descricao,
      competencia,
      valor_total,
      status,
      vencimento,
      meio_pagamento,
      meio_pagamento_detalhe,
      metadata,
      grupo_parcelamento_id,
      parcela_numero,
      parcelas_total,
      valor_contrato_original,
      numero_documento
    ) VALUES (
      v_empresa_id,
      p_tipo,
      p_origem,
      v_descricao,
      v_competencia,
      v_valor_parcela,
      v_status,
      v_vencimento,
      v_meio,
      p_meio_pagamento_detalhe,
      COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object(
        'parcelamento',
        jsonb_build_object(
          'grupo_id', v_grupo_id,
          'parcela', v_i,
          'total', v_parcelas
        )
      ),
      v_grupo_id,
      v_i,
      v_parcelas,
      v_valor_contrato,
      CASE
        WHEN v_parcelas > 1 THEN v_doc_base || '-' || lpad(v_i::text, 2, '0') || '/' || v_parcelas
        ELSE NULL
      END
    )
    RETURNING id INTO v_conta_id;

    IF v_i = 1 THEN
      v_primeira_conta_id := v_conta_id;
    END IF;
  END LOOP;

  RETURN v_primeira_conta_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- View relatório — inclui parcelas
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS public.vw_finance_contas_receber_relatorio;

CREATE VIEW public.vw_finance_contas_receber_relatorio
WITH (security_invoker = true)
AS
SELECT
  cr.id,
  cr.empresa_id,
  cr.tipo,
  cr.origem,
  cr.descricao,
  cr.competencia,
  cr.valor_total,
  cr.moeda,
  cr.status,
  cr.vencimento,
  cr.pago_total,
  cr.saldo,
  cr.meio_pagamento,
  cr.meio_pagamento_detalhe,
  cr.stripe_customer_id,
  cr.stripe_invoice_id,
  cr.stripe_payment_intent_id,
  cr.metadata,
  cr.grupo_parcelamento_id,
  cr.parcela_numero,
  cr.parcelas_total,
  cr.valor_contrato_original,
  cr.numero_documento,
  public.fn_finance_dias_atraso(cr.vencimento) AS dias_atraso,
  cr.saldo AS valor_aberto,
  cr.pago_total AS valor_pago,
  CASE
    WHEN cr.status = 'cancelada' THEN 'cancelada'
    WHEN cr.status = 'paga' THEN 'paga'
    WHEN cr.status = 'paga_parcial' THEN 'paga_parcial'
    WHEN public.fn_finance_dias_atraso(cr.vencimento) > 0 THEN 'vencida'
    WHEN cr.vencimento = CURRENT_DATE THEN 'vence_hoje'
    WHEN cr.vencimento BETWEEN CURRENT_DATE + 1 AND CURRENT_DATE + 7 THEN 'vence_7_dias'
    ELSE 'a_vencer'
  END AS status_calculado,
  baixas.ultima_baixa,
  cr.created_at,
  cr.updated_at
FROM public.finance_contas_receber cr
LEFT JOIN LATERAL (
  SELECT MAX(b.data_pagamento) AS ultima_baixa
  FROM public.finance_contas_receber_baixas b
  WHERE b.conta_receber_id = cr.id
) baixas ON true;

-- ---------------------------------------------------------------------------
-- Grants (nova assinatura da RPC)
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.sp_finance_criar_conta_receber(
  text, numeric, date, uuid, text, date, text,
  public.finance_meio_pagamento_enum, text, jsonb
) FROM PUBLIC, authenticated, anon;

GRANT EXECUTE ON FUNCTION public.sp_finance_criar_conta_receber(
  text, numeric, date, uuid, text, date, text,
  public.finance_meio_pagamento_enum, text, jsonb, integer
) TO authenticated;

GRANT SELECT ON public.vw_finance_contas_receber_relatorio TO authenticated;

COMMIT;


-- ============================================================================
-- BUNDLE: finance_contratos
-- Contratos comerciais + serviços extras
-- Arquivo: supabase/migrations/202606161200_finance_contratos.sql
-- ============================================================================
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


-- ============================================================================
-- BUNDLE: finance_contrato_gerar_ar
-- Gerar AR do contrato: contrato_id + RPC
-- Arquivo: supabase/migrations/202606171200_finance_contrato_gerar_ar.sql
-- ============================================================================
-- =============================================================================
-- Gerar contas a receber a partir de contrato comercial
-- - finance_contas_receber.contrato_id
-- - sp_finance_gerar_contas_do_contrato
-- - sp_finance_criar_conta_receber aceita p_contrato_id
-- =============================================================================

BEGIN;

ALTER TABLE public.finance_contas_receber
  ADD COLUMN IF NOT EXISTS contrato_id uuid REFERENCES public.finance_contratos(id) ON DELETE SET NULL;

ALTER TABLE public.finance_contas_receber
  DROP CONSTRAINT IF EXISTS finance_cr_origem_check;

ALTER TABLE public.finance_contas_receber
  ADD CONSTRAINT finance_cr_origem_check
    CHECK (origem IN ('manual', 'stripe', 'ajuste', 'contrato'));

CREATE INDEX IF NOT EXISTS idx_finance_cr_contrato
  ON public.finance_contas_receber (contrato_id)
  WHERE contrato_id IS NOT NULL;

ALTER TABLE public.finance_contratos
  ADD COLUMN IF NOT EXISTS contas_ar_geradas_em timestamptz,
  ADD COLUMN IF NOT EXISTS contas_ar_geradas_qtd integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.finance_contas_receber.contrato_id IS
  'Contrato comercial que originou a conta (quando gerada automaticamente).';

-- Vencimento no mês N a partir da data de referência, respeitando dia (1–28)
CREATE OR REPLACE FUNCTION public.fn_finance_vencimento_no_mes(
  p_ref date,
  p_offset_months integer,
  p_dia smallint DEFAULT NULL
)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_mes date;
  v_dia integer;
  v_ultimo_dia integer;
BEGIN
  v_mes := date_trunc('month', p_ref + (p_offset_months || ' months')::interval)::date;
  v_dia := COALESCE(p_dia::integer, EXTRACT(day FROM p_ref)::integer);
  v_dia := GREATEST(1, LEAST(28, v_dia));
  v_ultimo_dia := EXTRACT(day FROM (v_mes + interval '1 month - 1 day'))::integer;
  v_dia := LEAST(v_dia, v_ultimo_dia);
  RETURN v_mes + (v_dia - 1);
END;
$$;

-- Meses de vigência (inclusive): data_fim null => 12 meses padrão
CREATE OR REPLACE FUNCTION public.fn_finance_meses_vigencia(
  p_inicio date,
  p_fim date
)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_meses integer;
BEGIN
  IF p_fim IS NULL THEN
    RETURN 12;
  END IF;
  IF p_fim < p_inicio THEN
    RETURN 0;
  END IF;
  v_meses := (
    (EXTRACT(year FROM age(p_fim, p_inicio))::integer * 12)
    + EXTRACT(month FROM age(p_fim, p_inicio))::integer
    + 1
  );
  RETURN LEAST(GREATEST(v_meses, 0), 120);
END;
$$;

-- Atualiza sp_finance_criar_conta_receber com p_contrato_id
CREATE OR REPLACE FUNCTION public.sp_finance_criar_conta_receber(
  p_tipo text,
  p_valor_total numeric(12, 2),
  p_vencimento date,
  p_empresa_id uuid DEFAULT NULL,
  p_descricao text DEFAULT NULL,
  p_competencia date DEFAULT NULL,
  p_origem text DEFAULT 'manual',
  p_meio_pagamento public.finance_meio_pagamento_enum DEFAULT NULL,
  p_meio_pagamento_detalhe text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_parcelas_total integer DEFAULT 1,
  p_contrato_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa_id uuid;
  v_conta_id uuid;
  v_primeira_conta_id uuid;
  v_status text;
  v_meio public.finance_meio_pagamento_enum;
  v_parcelas integer;
  v_grupo_id uuid;
  v_i integer;
  v_valor_parcela numeric(12, 2);
  v_valor_contrato numeric(12, 2);
  v_vencimento date;
  v_competencia date;
  v_descricao text;
  v_doc_base text;
  v_soma_parcelas numeric(12, 2);
  v_valor_base numeric(12, 2);
  v_meta jsonb;
BEGIN
  v_empresa_id := public.fn_finance_resolve_empresa_id(p_empresa_id);

  IF p_tipo NOT IN ('setup', 'mensalidade', 'extra') THEN
    RAISE EXCEPTION 'tipo inválido: %', p_tipo;
  END IF;

  IF p_origem NOT IN ('manual', 'stripe', 'ajuste', 'contrato') THEN
    RAISE EXCEPTION 'origem inválida: %', p_origem;
  END IF;

  IF p_valor_total IS NULL OR p_valor_total <= 0 THEN
    RAISE EXCEPTION 'valor_total deve ser maior que zero';
  END IF;

  IF p_vencimento IS NULL THEN
    RAISE EXCEPTION 'vencimento é obrigatório';
  END IF;

  v_parcelas := COALESCE(p_parcelas_total, 1);
  IF v_parcelas < 1 OR v_parcelas > 120 THEN
    RAISE EXCEPTION 'parcelas_total inválido: %', v_parcelas;
  END IF;

  v_meio := p_meio_pagamento;
  IF p_tipo = 'mensalidade' AND v_meio IS NOT NULL AND v_meio <> 'stripe' THEN
    RAISE EXCEPTION 'mensalidade aceita meio_pagamento stripe ou null';
  END IF;

  v_grupo_id := CASE WHEN v_parcelas > 1 THEN gen_random_uuid() ELSE NULL END;
  v_doc_base := 'DOC-' || to_char(extract(epoch from clock_timestamp())::bigint, 'FM999999999999');

  IF p_tipo = 'mensalidade' THEN
    v_valor_contrato := round(p_valor_total * v_parcelas, 2);
    v_valor_base := p_valor_total;
  ELSE
    v_valor_contrato := p_valor_total;
    v_valor_base := round(p_valor_total / v_parcelas, 2);
  END IF;

  v_soma_parcelas := 0;

  FOR v_i IN 1..v_parcelas LOOP
    IF p_tipo = 'mensalidade' THEN
      v_valor_parcela := v_valor_base;
    ELSIF v_i < v_parcelas THEN
      v_valor_parcela := v_valor_base;
      v_soma_parcelas := v_soma_parcelas + v_valor_parcela;
    ELSE
      v_valor_parcela := round(v_valor_contrato - v_soma_parcelas, 2);
    END IF;

    v_vencimento := (p_vencimento + ((v_i - 1) || ' months')::interval)::date;

    IF p_competencia IS NOT NULL THEN
      v_competencia := (p_competencia + ((v_i - 1) || ' months')::interval)::date;
    ELSIF p_tipo = 'mensalidade' THEN
      v_competencia := v_vencimento;
    ELSE
      v_competencia := p_competencia;
    END IF;

    IF v_parcelas > 1 THEN
      v_descricao := trim(both from coalesce(p_descricao, ''));
      IF v_descricao = '' THEN
        v_descricao := initcap(p_tipo) || ' — parcela ' || v_i || '/' || v_parcelas;
      ELSE
        v_descricao := v_descricao || ' (Parcela ' || v_i || '/' || v_parcelas || ')';
      END IF;
    ELSE
      v_descricao := p_descricao;
    END IF;

    v_status := public.fn_finance_status_inicial(v_vencimento);
    v_meta := COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'parcelamento', jsonb_build_object('grupo_id', v_grupo_id, 'parcela', v_i, 'total', v_parcelas)
    );
    IF p_contrato_id IS NOT NULL THEN
      v_meta := v_meta || jsonb_build_object('contrato_id', p_contrato_id);
    END IF;

    INSERT INTO public.finance_contas_receber (
      empresa_id, tipo, origem, descricao, competencia, valor_total, status, vencimento,
      meio_pagamento, meio_pagamento_detalhe, metadata,
      grupo_parcelamento_id, parcela_numero, parcelas_total, valor_contrato_original,
      numero_documento, contrato_id
    ) VALUES (
      v_empresa_id, p_tipo, p_origem, v_descricao, v_competencia, v_valor_parcela, v_status, v_vencimento,
      v_meio, p_meio_pagamento_detalhe, v_meta,
      v_grupo_id, v_i, v_parcelas, v_valor_contrato,
      CASE WHEN v_parcelas > 1 THEN v_doc_base || '-' || lpad(v_i::text, 2, '0') || '/' || v_parcelas ELSE NULL END,
      p_contrato_id
    )
    RETURNING id INTO v_conta_id;

    IF v_i = 1 THEN v_primeira_conta_id := v_conta_id; END IF;
  END LOOP;

  RETURN v_primeira_conta_id;
END;
$$;

-- Gera AR a partir do contrato
CREATE OR REPLACE FUNCTION public.sp_finance_gerar_contas_do_contrato(
  p_contrato_id uuid,
  p_forcar boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_c public.finance_contratos;
  v_extra record;
  v_meses integer;
  v_i integer;
  v_venc date;
  v_comp date;
  v_desc text;
  v_qtd_setup integer := 0;
  v_qtd_mensal integer := 0;
  v_qtd_extra integer := 0;
  v_total integer := 0;
  v_existentes integer;
  v_primeira uuid;
  v_ref text;
BEGIN
  SELECT * INTO v_c
  FROM public.finance_contratos c
  WHERE c.id = p_contrato_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato não encontrado: %', p_contrato_id;
  END IF;

  PERFORM public.fn_finance_require_empresa_access(v_c.empresa_id);

  IF v_c.status = 'cancelado' THEN
    RAISE EXCEPTION 'Não é possível gerar contas de contrato cancelado';
  END IF;

  SELECT COUNT(*) INTO v_existentes
  FROM public.finance_contas_receber cr
  WHERE cr.contrato_id = p_contrato_id
    AND cr.status <> 'cancelada';

  IF v_existentes > 0 AND NOT COALESCE(p_forcar, false) THEN
    RAISE EXCEPTION 'Este contrato já possui % conta(s) a receber. Use p_forcar=true para gerar novamente.', v_existentes;
  END IF;

  v_ref := COALESCE(v_c.numero_contrato, v_c.id::text);
  v_meses := public.fn_finance_meses_vigencia(v_c.data_inicio, v_c.data_fim);

  -- Setup parcelado
  IF COALESCE(v_c.valor_setup, 0) > 0 THEN
    v_venc := public.fn_finance_vencimento_no_mes(v_c.data_inicio, 0, v_c.dia_vencimento_mensal);
    v_desc := 'Setup — ' || COALESCE(v_c.titulo, 'Contrato') || ' (' || v_ref || ')';
    PERFORM public.sp_finance_criar_conta_receber(
      p_tipo := 'setup',
      p_valor_total := v_c.valor_setup,
      p_vencimento := v_venc,
      p_empresa_id := v_c.empresa_id,
      p_descricao := v_desc,
      p_competencia := v_c.data_inicio,
      p_origem := 'contrato',
      p_parcelas_total := GREATEST(v_c.setup_parcelas, 1),
      p_contrato_id := p_contrato_id,
      p_metadata := jsonb_build_object('gerado_de', 'contrato', 'contrato_id', p_contrato_id)
    );
    v_qtd_setup := GREATEST(v_c.setup_parcelas, 1);
    v_total := v_total + v_qtd_setup;
  END IF;

  -- Mensalidades
  IF COALESCE(v_c.valor_mensalidade, 0) > 0 AND v_meses > 0 THEN
    FOR v_i IN 0..(v_meses - 1) LOOP
      v_venc := public.fn_finance_vencimento_no_mes(v_c.data_inicio, v_i, v_c.dia_vencimento_mensal);
      v_comp := v_venc;
      v_desc := 'Mensalidade — ' || COALESCE(v_c.titulo, 'Contrato') || ' (' || v_ref || ')';
      PERFORM public.sp_finance_criar_conta_receber(
        p_tipo := 'mensalidade',
        p_valor_total := v_c.valor_mensalidade,
        p_vencimento := v_venc,
        p_empresa_id := v_c.empresa_id,
        p_descricao := v_desc,
        p_competencia := v_comp,
        p_origem := 'contrato',
        p_parcelas_total := 1,
        p_contrato_id := p_contrato_id,
        p_metadata := jsonb_build_object('gerado_de', 'contrato', 'mes_offset', v_i)
      );
      v_qtd_mensal := v_qtd_mensal + 1;
      v_total := v_total + 1;
    END LOOP;
  END IF;

  -- Serviços extras
  FOR v_extra IN
    SELECT e.*
    FROM public.finance_contrato_servicos_extra e
    WHERE e.contrato_id = p_contrato_id
    ORDER BY e.created_at
  LOOP
    IF COALESCE(v_extra.valor, 0) <= 0 THEN
      CONTINUE;
    END IF;

    IF v_extra.recorrente_mensal THEN
      FOR v_i IN 0..(v_meses - 1) LOOP
        v_venc := public.fn_finance_vencimento_no_mes(v_c.data_inicio, v_i, v_c.dia_vencimento_mensal);
        v_desc := 'Extra — ' || v_extra.descricao || ' (' || v_ref || ')';
        PERFORM public.sp_finance_criar_conta_receber(
          p_tipo := 'extra',
          p_valor_total := v_extra.valor,
          p_vencimento := v_venc,
          p_empresa_id := v_c.empresa_id,
          p_descricao := v_desc,
          p_competencia := v_venc,
          p_origem := 'contrato',
          p_parcelas_total := 1,
          p_contrato_id := p_contrato_id,
          p_metadata := jsonb_build_object('servico_extra_id', v_extra.id, 'recorrente', true)
        );
        v_qtd_extra := v_qtd_extra + 1;
        v_total := v_total + 1;
      END LOOP;
    ELSE
      v_venc := public.fn_finance_vencimento_no_mes(v_c.data_inicio, 0, v_c.dia_vencimento_mensal);
      v_desc := 'Extra — ' || v_extra.descricao || ' (' || v_ref || ')';
      PERFORM public.sp_finance_criar_conta_receber(
        p_tipo := 'extra',
        p_valor_total := v_extra.valor,
        p_vencimento := v_venc,
        p_empresa_id := v_c.empresa_id,
        p_descricao := v_desc,
        p_competencia := v_c.data_inicio,
        p_origem := 'contrato',
        p_parcelas_total := GREATEST(v_extra.parcelas, 1),
        p_contrato_id := p_contrato_id,
        p_metadata := jsonb_build_object('servico_extra_id', v_extra.id, 'recorrente', false)
      );
      v_qtd_extra := v_qtd_extra + GREATEST(v_extra.parcelas, 1);
      v_total := v_total + GREATEST(v_extra.parcelas, 1);
    END IF;
  END LOOP;

  IF v_total = 0 THEN
    RAISE EXCEPTION 'Nenhuma conta a gerar: contrato sem valores de setup, mensalidade ou extras';
  END IF;

  UPDATE public.finance_contratos
  SET
    contas_ar_geradas_em = now(),
    contas_ar_geradas_qtd = contas_ar_geradas_qtd + v_total,
    status = CASE WHEN status = 'rascunho' THEN 'ativo' ELSE status END,
    updated_at = now()
  WHERE id = p_contrato_id;

  SELECT cr.id INTO v_primeira
  FROM public.finance_contas_receber cr
  WHERE cr.contrato_id = p_contrato_id
  ORDER BY cr.vencimento ASC, cr.created_at ASC
  LIMIT 1;

  RETURN jsonb_build_object(
    'contrato_id', p_contrato_id,
    'setup', v_qtd_setup,
    'mensalidades', v_qtd_mensal,
    'extras', v_qtd_extra,
    'total', v_total,
    'meses_vigencia', v_meses,
    'primeira_conta_id', v_primeira
  );
END;
$$;

-- View com contrato_id
DROP VIEW IF EXISTS public.vw_finance_contas_receber_relatorio;

CREATE VIEW public.vw_finance_contas_receber_relatorio
WITH (security_invoker = true)
AS
SELECT
  cr.id,
  cr.empresa_id,
  cr.contrato_id,
  cr.tipo,
  cr.origem,
  cr.descricao,
  cr.competencia,
  cr.valor_total,
  cr.moeda,
  cr.status,
  cr.vencimento,
  cr.pago_total,
  cr.saldo,
  cr.meio_pagamento,
  cr.meio_pagamento_detalhe,
  cr.stripe_customer_id,
  cr.stripe_invoice_id,
  cr.stripe_payment_intent_id,
  cr.metadata,
  cr.grupo_parcelamento_id,
  cr.parcela_numero,
  cr.parcelas_total,
  cr.valor_contrato_original,
  cr.numero_documento,
  public.fn_finance_dias_atraso(cr.vencimento) AS dias_atraso,
  cr.saldo AS valor_aberto,
  cr.pago_total AS valor_pago,
  CASE
    WHEN cr.status = 'cancelada' THEN 'cancelada'
    WHEN cr.status = 'paga' THEN 'paga'
    WHEN cr.status = 'paga_parcial' THEN 'paga_parcial'
    WHEN public.fn_finance_dias_atraso(cr.vencimento) > 0 THEN 'vencida'
    WHEN cr.vencimento = CURRENT_DATE THEN 'vence_hoje'
    WHEN cr.vencimento BETWEEN CURRENT_DATE + 1 AND CURRENT_DATE + 7 THEN 'vence_7_dias'
    ELSE 'a_vencer'
  END AS status_calculado,
  baixas.ultima_baixa,
  cr.created_at,
  cr.updated_at
FROM public.finance_contas_receber cr
LEFT JOIN LATERAL (
  SELECT MAX(b.data_pagamento) AS ultima_baixa
  FROM public.finance_contas_receber_baixas b
  WHERE b.conta_receber_id = cr.id
) baixas ON true;

-- Grants
GRANT EXECUTE ON FUNCTION public.fn_finance_vencimento_no_mes(date, integer, smallint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_finance_meses_vigencia(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sp_finance_gerar_contas_do_contrato(uuid, boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.sp_finance_criar_conta_receber(
  text, numeric, date, uuid, text, date, text,
  public.finance_meio_pagamento_enum, text, jsonb, integer
) FROM PUBLIC, authenticated, anon;

GRANT EXECUTE ON FUNCTION public.sp_finance_criar_conta_receber(
  text, numeric, date, uuid, text, date, text,
  public.finance_meio_pagamento_enum, text, jsonb, integer, uuid
) TO authenticated;

GRANT SELECT ON public.vw_finance_contas_receber_relatorio TO authenticated;

COMMIT;


-- ============================================================================
-- BUNDLE: finance_contrato_ar_fixes
-- Fixes AR/contrato: numero_documento único, RPC gerar contas
-- Arquivo: supabase/migrations/202606181200_finance_contrato_ar_fixes.sql
-- ============================================================================
-- =============================================================================
-- Correções geração AR do contrato
-- - numero_documento único (evita ux_fin_cr_empresa_doc em loops)
-- - mensalidades_total no contrato + parâmetro na RPC
-- =============================================================================

BEGIN;

ALTER TABLE public.finance_contratos
  ADD COLUMN IF NOT EXISTS mensalidades_total smallint;

ALTER TABLE public.finance_contratos
  DROP CONSTRAINT IF EXISTS finance_contratos_mensalidades_total_check;

ALTER TABLE public.finance_contratos
  ADD CONSTRAINT finance_contratos_mensalidades_total_check
    CHECK (mensalidades_total IS NULL OR (mensalidades_total >= 1 AND mensalidades_total <= 120));

COMMENT ON COLUMN public.finance_contratos.mensalidades_total IS
  'Quantidade de mensalidades a gerar no AR. Se null, calcula pela vigência.';

-- Garante numero_documento único por linha (trigger + RPC)
CREATE OR REPLACE FUNCTION public.tg_finance_cr_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.numero_documento IS NULL OR btrim(NEW.numero_documento) = '' THEN
    NEW.numero_documento :=
      'DOC-' || extract(epoch from clock_timestamp())::bigint::text
      || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_finance_cr_before_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pago numeric(12, 2);
BEGIN
  IF NEW.empresa_id IS DISTINCT FROM OLD.empresa_id THEN
    RAISE EXCEPTION 'Não é permitido alterar empresa_id da conta';
  END IF;

  IF OLD.status = 'cancelada' AND NEW.status IS DISTINCT FROM 'cancelada' THEN
    RAISE EXCEPTION 'Conta cancelada não pode ser reaberta via update direto';
  END IF;

  v_pago := public.fn_total_baixas(NEW.id);

  IF NEW.valor_total < v_pago THEN
    RAISE EXCEPTION 'valor_total (%) não pode ser menor que o total já pago (%)',
      NEW.valor_total, v_pago;
  END IF;

  IF NEW.numero_documento IS NULL OR btrim(NEW.numero_documento) = '' THEN
    NEW.numero_documento :=
      'DOC-' || extract(epoch from clock_timestamp())::bigint::text
      || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  END IF;

  RETURN NEW;
END;
$$;

-- sp_finance_criar_conta_receber: sempre define numero_documento único
CREATE OR REPLACE FUNCTION public.sp_finance_criar_conta_receber(
  p_tipo text,
  p_valor_total numeric(12, 2),
  p_vencimento date,
  p_empresa_id uuid DEFAULT NULL,
  p_descricao text DEFAULT NULL,
  p_competencia date DEFAULT NULL,
  p_origem text DEFAULT 'manual',
  p_meio_pagamento public.finance_meio_pagamento_enum DEFAULT NULL,
  p_meio_pagamento_detalhe text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_parcelas_total integer DEFAULT 1,
  p_contrato_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa_id uuid;
  v_conta_id uuid;
  v_primeira_conta_id uuid;
  v_status text;
  v_meio public.finance_meio_pagamento_enum;
  v_parcelas integer;
  v_grupo_id uuid;
  v_i integer;
  v_valor_parcela numeric(12, 2);
  v_valor_contrato numeric(12, 2);
  v_vencimento date;
  v_competencia date;
  v_descricao text;
  v_doc_base text;
  v_numero_doc text;
  v_soma_parcelas numeric(12, 2);
  v_valor_base numeric(12, 2);
  v_meta jsonb;
BEGIN
  v_empresa_id := public.fn_finance_resolve_empresa_id(p_empresa_id);

  IF p_tipo NOT IN ('setup', 'mensalidade', 'extra') THEN
    RAISE EXCEPTION 'tipo inválido: %', p_tipo;
  END IF;

  IF p_origem NOT IN ('manual', 'stripe', 'ajuste', 'contrato') THEN
    RAISE EXCEPTION 'origem inválida: %', p_origem;
  END IF;

  IF p_valor_total IS NULL OR p_valor_total <= 0 THEN
    RAISE EXCEPTION 'valor_total deve ser maior que zero';
  END IF;

  IF p_vencimento IS NULL THEN
    RAISE EXCEPTION 'vencimento é obrigatório';
  END IF;

  v_parcelas := COALESCE(p_parcelas_total, 1);
  IF v_parcelas < 1 OR v_parcelas > 120 THEN
    RAISE EXCEPTION 'parcelas_total inválido: %', v_parcelas;
  END IF;

  v_meio := p_meio_pagamento;
  IF p_tipo = 'mensalidade' AND v_meio IS NOT NULL AND v_meio <> 'stripe' THEN
    RAISE EXCEPTION 'mensalidade aceita meio_pagamento stripe ou null';
  END IF;

  v_grupo_id := CASE WHEN v_parcelas > 1 THEN gen_random_uuid() ELSE NULL END;
  v_doc_base :=
    'DOC-' || to_char(extract(epoch from clock_timestamp())::bigint, 'FM999999999999')
    || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

  IF p_tipo = 'mensalidade' THEN
    v_valor_contrato := round(p_valor_total * v_parcelas, 2);
    v_valor_base := p_valor_total;
  ELSE
    v_valor_contrato := p_valor_total;
    v_valor_base := round(p_valor_total / v_parcelas, 2);
  END IF;

  v_soma_parcelas := 0;

  FOR v_i IN 1..v_parcelas LOOP
    IF p_tipo = 'mensalidade' THEN
      v_valor_parcela := v_valor_base;
    ELSIF v_i < v_parcelas THEN
      v_valor_parcela := v_valor_base;
      v_soma_parcelas := v_soma_parcelas + v_valor_parcela;
    ELSE
      v_valor_parcela := round(v_valor_contrato - v_soma_parcelas, 2);
    END IF;

    v_vencimento := (p_vencimento + ((v_i - 1) || ' months')::interval)::date;

    IF p_competencia IS NOT NULL THEN
      v_competencia := (p_competencia + ((v_i - 1) || ' months')::interval)::date;
    ELSIF p_tipo = 'mensalidade' THEN
      v_competencia := v_vencimento;
    ELSE
      v_competencia := p_competencia;
    END IF;

    IF v_parcelas > 1 THEN
      v_descricao := trim(both from coalesce(p_descricao, ''));
      IF v_descricao = '' THEN
        v_descricao := initcap(p_tipo) || ' — parcela ' || v_i || '/' || v_parcelas;
      ELSE
        v_descricao := v_descricao || ' (Parcela ' || v_i || '/' || v_parcelas || ')';
      END IF;
    ELSE
      v_descricao := p_descricao;
    END IF;

    v_status := public.fn_finance_status_inicial(v_vencimento);
    v_meta := COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'parcelamento', jsonb_build_object('grupo_id', v_grupo_id, 'parcela', v_i, 'total', v_parcelas)
    );
    IF p_contrato_id IS NOT NULL THEN
      v_meta := v_meta || jsonb_build_object('contrato_id', p_contrato_id);
    END IF;

    v_numero_doc := CASE
      WHEN v_parcelas > 1 THEN v_doc_base || '-' || lpad(v_i::text, 2, '0') || '/' || v_parcelas
      ELSE v_doc_base
    END;

    INSERT INTO public.finance_contas_receber (
      empresa_id, tipo, origem, descricao, competencia, valor_total, status, vencimento,
      meio_pagamento, meio_pagamento_detalhe, metadata,
      grupo_parcelamento_id, parcela_numero, parcelas_total, valor_contrato_original,
      numero_documento, contrato_id
    ) VALUES (
      v_empresa_id, p_tipo, p_origem, v_descricao, v_competencia, v_valor_parcela, v_status, v_vencimento,
      v_meio, p_meio_pagamento_detalhe, v_meta,
      v_grupo_id, v_i, v_parcelas, v_valor_contrato,
      v_numero_doc,
      p_contrato_id
    )
    RETURNING id INTO v_conta_id;

    IF v_i = 1 THEN v_primeira_conta_id := v_conta_id; END IF;
  END LOOP;

  RETURN v_primeira_conta_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sp_finance_gerar_contas_do_contrato(
  p_contrato_id uuid,
  p_forcar boolean DEFAULT false,
  p_mensalidades integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_c public.finance_contratos;
  v_extra record;
  v_meses integer;
  v_i integer;
  v_venc date;
  v_comp date;
  v_desc text;
  v_qtd_setup integer := 0;
  v_qtd_mensal integer := 0;
  v_qtd_extra integer := 0;
  v_total integer := 0;
  v_existentes integer;
  v_primeira uuid;
  v_ref text;
BEGIN
  SELECT * INTO v_c
  FROM public.finance_contratos c
  WHERE c.id = p_contrato_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato não encontrado: %', p_contrato_id;
  END IF;

  PERFORM public.fn_finance_require_empresa_access(v_c.empresa_id);

  IF v_c.status = 'cancelado' THEN
    RAISE EXCEPTION 'Não é possível gerar contas de contrato cancelado';
  END IF;

  SELECT COUNT(*) INTO v_existentes
  FROM public.finance_contas_receber cr
  WHERE cr.contrato_id = p_contrato_id
    AND cr.status <> 'cancelada';

  IF v_existentes > 0 AND NOT COALESCE(p_forcar, false) THEN
    RAISE EXCEPTION 'Este contrato já possui % conta(s) a receber. Use p_forcar=true para gerar novamente.', v_existentes;
  END IF;

  v_ref := COALESCE(v_c.numero_contrato, v_c.id::text);
  v_meses := COALESCE(
    NULLIF(p_mensalidades, 0),
    v_c.mensalidades_total,
    public.fn_finance_meses_vigencia(v_c.data_inicio, v_c.data_fim)
  );
  v_meses := LEAST(GREATEST(v_meses, 0), 120);

  IF COALESCE(v_c.valor_setup, 0) > 0 THEN
    v_venc := public.fn_finance_vencimento_no_mes(v_c.data_inicio, 0, v_c.dia_vencimento_mensal);
    v_desc := 'Setup — ' || COALESCE(v_c.titulo, 'Contrato') || ' (' || v_ref || ')';
    PERFORM public.sp_finance_criar_conta_receber(
      p_tipo := 'setup',
      p_valor_total := v_c.valor_setup,
      p_vencimento := v_venc,
      p_empresa_id := v_c.empresa_id,
      p_descricao := v_desc,
      p_competencia := v_c.data_inicio,
      p_origem := 'contrato',
      p_parcelas_total := GREATEST(v_c.setup_parcelas, 1),
      p_contrato_id := p_contrato_id,
      p_metadata := jsonb_build_object('gerado_de', 'contrato', 'contrato_id', p_contrato_id)
    );
    v_qtd_setup := GREATEST(v_c.setup_parcelas, 1);
    v_total := v_total + v_qtd_setup;
  END IF;

  IF COALESCE(v_c.valor_mensalidade, 0) > 0 AND v_meses > 0 THEN
    FOR v_i IN 0..(v_meses - 1) LOOP
      v_venc := public.fn_finance_vencimento_no_mes(v_c.data_inicio, v_i, v_c.dia_vencimento_mensal);
      v_comp := v_venc;
      v_desc := 'Mensalidade — ' || COALESCE(v_c.titulo, 'Contrato') || ' (' || v_ref || ')';
      PERFORM public.sp_finance_criar_conta_receber(
        p_tipo := 'mensalidade',
        p_valor_total := v_c.valor_mensalidade,
        p_vencimento := v_venc,
        p_empresa_id := v_c.empresa_id,
        p_descricao := v_desc,
        p_competencia := v_comp,
        p_origem := 'contrato',
        p_parcelas_total := 1,
        p_contrato_id := p_contrato_id,
        p_metadata := jsonb_build_object('gerado_de', 'contrato', 'mes_offset', v_i)
      );
      v_qtd_mensal := v_qtd_mensal + 1;
      v_total := v_total + 1;
    END LOOP;
  END IF;

  FOR v_extra IN
    SELECT e.*
    FROM public.finance_contrato_servicos_extra e
    WHERE e.contrato_id = p_contrato_id
    ORDER BY e.created_at
  LOOP
    IF COALESCE(v_extra.valor, 0) <= 0 THEN
      CONTINUE;
    END IF;

    IF v_extra.recorrente_mensal THEN
      FOR v_i IN 0..(v_meses - 1) LOOP
        v_venc := public.fn_finance_vencimento_no_mes(v_c.data_inicio, v_i, v_c.dia_vencimento_mensal);
        v_desc := 'Extra — ' || v_extra.descricao || ' (' || v_ref || ')';
        PERFORM public.sp_finance_criar_conta_receber(
          p_tipo := 'extra',
          p_valor_total := v_extra.valor,
          p_vencimento := v_venc,
          p_empresa_id := v_c.empresa_id,
          p_descricao := v_desc,
          p_competencia := v_venc,
          p_origem := 'contrato',
          p_parcelas_total := 1,
          p_contrato_id := p_contrato_id,
          p_metadata := jsonb_build_object('servico_extra_id', v_extra.id, 'recorrente', true)
        );
        v_qtd_extra := v_qtd_extra + 1;
        v_total := v_total + 1;
      END LOOP;
    ELSE
      v_venc := public.fn_finance_vencimento_no_mes(v_c.data_inicio, 0, v_c.dia_vencimento_mensal);
      v_desc := 'Extra — ' || v_extra.descricao || ' (' || v_ref || ')';
      PERFORM public.sp_finance_criar_conta_receber(
        p_tipo := 'extra',
        p_valor_total := v_extra.valor,
        p_vencimento := v_venc,
        p_empresa_id := v_c.empresa_id,
        p_descricao := v_desc,
        p_competencia := v_c.data_inicio,
        p_origem := 'contrato',
        p_parcelas_total := GREATEST(v_extra.parcelas, 1),
        p_contrato_id := p_contrato_id,
        p_metadata := jsonb_build_object('servico_extra_id', v_extra.id, 'recorrente', false)
      );
      v_qtd_extra := v_qtd_extra + GREATEST(v_extra.parcelas, 1);
      v_total := v_total + GREATEST(v_extra.parcelas, 1);
    END IF;
  END LOOP;

  IF v_total = 0 THEN
    RAISE EXCEPTION 'Nenhuma conta a gerar: contrato sem valores de setup, mensalidade ou extras';
  END IF;

  UPDATE public.finance_contratos
  SET
    contas_ar_geradas_em = now(),
    contas_ar_geradas_qtd = contas_ar_geradas_qtd + v_total,
    status = CASE WHEN status = 'rascunho' THEN 'ativo' ELSE status END,
    updated_at = now()
  WHERE id = p_contrato_id;

  SELECT cr.id INTO v_primeira
  FROM public.finance_contas_receber cr
  WHERE cr.contrato_id = p_contrato_id
  ORDER BY cr.vencimento ASC, cr.created_at ASC
  LIMIT 1;

  RETURN jsonb_build_object(
    'contrato_id', p_contrato_id,
    'setup', v_qtd_setup,
    'mensalidades', v_qtd_mensal,
    'extras', v_qtd_extra,
    'total', v_total,
    'meses_vigencia', v_meses,
    'primeira_conta_id', v_primeira
  );
END;
$$;

REVOKE ALL ON FUNCTION public.sp_finance_gerar_contas_do_contrato(uuid, boolean) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.sp_finance_gerar_contas_do_contrato(uuid, boolean, integer) TO authenticated;

COMMIT;


-- ============================================================================
-- BUNDLE: finance_contrato_vencimento_meio
-- Meio pagamento setup, mensalidades_total, vencimento contrato
-- Arquivo: supabase/migrations/202606191200_finance_contrato_vencimento_meio.sql
-- ============================================================================
-- =============================================================================
-- Contrato → AR: primeiro vencimento futuro + meio pagamento setup/mensalidade
-- =============================================================================

BEGIN;

ALTER TABLE public.finance_contratos
  ADD COLUMN IF NOT EXISTS meio_pagamento_setup public.finance_meio_pagamento_enum;

ALTER TABLE public.finance_contratos
  DROP CONSTRAINT IF EXISTS finance_contratos_setup_meio_check;

ALTER TABLE public.finance_contratos
  ADD CONSTRAINT finance_contratos_setup_meio_check
    CHECK (
      meio_pagamento_setup IS NULL
      OR meio_pagamento_setup IN (
        'pix'::public.finance_meio_pagamento_enum,
        'boleto'::public.finance_meio_pagamento_enum,
        'cartao'::public.finance_meio_pagamento_enum,
        'transferencia'::public.finance_meio_pagamento_enum
      )
    );

COMMENT ON COLUMN public.finance_contratos.meio_pagamento_setup IS
  'Meio de pagamento previsto para setup (PIX, boleto, cartão ou depósito).';

ALTER TABLE public.finance_contas_receber
  DROP CONSTRAINT IF EXISTS finance_cr_mensalidade_meio_check;

ALTER TABLE public.finance_contas_receber
  ADD CONSTRAINT finance_cr_mensalidade_meio_check
    CHECK (
      tipo <> 'mensalidade'
      OR meio_pagamento IS NULL
      OR meio_pagamento IN (
        'stripe'::public.finance_meio_pagamento_enum,
        'cartao'::public.finance_meio_pagamento_enum
      )
    );

-- Primeiro vencimento: dia no mês de início; se já passou, mês subsequente
CREATE OR REPLACE FUNCTION public.fn_finance_primeiro_vencimento_contrato(
  p_data_inicio date,
  p_dia_vencimento smallint DEFAULT NULL
)
RETURNS date
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_venc date;
BEGIN
  v_venc := public.fn_finance_vencimento_no_mes(p_data_inicio, 0, p_dia_vencimento);

  IF v_venc < CURRENT_DATE THEN
    v_venc := public.fn_finance_vencimento_no_mes(p_data_inicio, 1, p_dia_vencimento);
  END IF;

  RETURN v_venc;
END;
$$;

-- sp_finance_criar_conta_receber: mensalidade aceita cartão
CREATE OR REPLACE FUNCTION public.sp_finance_criar_conta_receber(
  p_tipo text,
  p_valor_total numeric(12, 2),
  p_vencimento date,
  p_empresa_id uuid DEFAULT NULL,
  p_descricao text DEFAULT NULL,
  p_competencia date DEFAULT NULL,
  p_origem text DEFAULT 'manual',
  p_meio_pagamento public.finance_meio_pagamento_enum DEFAULT NULL,
  p_meio_pagamento_detalhe text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_parcelas_total integer DEFAULT 1,
  p_contrato_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa_id uuid;
  v_conta_id uuid;
  v_primeira_conta_id uuid;
  v_status text;
  v_meio public.finance_meio_pagamento_enum;
  v_parcelas integer;
  v_grupo_id uuid;
  v_i integer;
  v_valor_parcela numeric(12, 2);
  v_valor_contrato numeric(12, 2);
  v_vencimento date;
  v_competencia date;
  v_descricao text;
  v_doc_base text;
  v_numero_doc text;
  v_soma_parcelas numeric(12, 2);
  v_valor_base numeric(12, 2);
  v_meta jsonb;
BEGIN
  v_empresa_id := public.fn_finance_resolve_empresa_id(p_empresa_id);

  IF p_tipo NOT IN ('setup', 'mensalidade', 'extra') THEN
    RAISE EXCEPTION 'tipo inválido: %', p_tipo;
  END IF;

  IF p_origem NOT IN ('manual', 'stripe', 'ajuste', 'contrato') THEN
    RAISE EXCEPTION 'origem inválida: %', p_origem;
  END IF;

  IF p_valor_total IS NULL OR p_valor_total <= 0 THEN
    RAISE EXCEPTION 'valor_total deve ser maior que zero';
  END IF;

  IF p_vencimento IS NULL THEN
    RAISE EXCEPTION 'vencimento é obrigatório';
  END IF;

  v_parcelas := COALESCE(p_parcelas_total, 1);
  IF v_parcelas < 1 OR v_parcelas > 120 THEN
    RAISE EXCEPTION 'parcelas_total inválido: %', v_parcelas;
  END IF;

  v_meio := p_meio_pagamento;
  IF p_tipo = 'mensalidade' AND v_meio IS NOT NULL
     AND v_meio NOT IN ('stripe'::public.finance_meio_pagamento_enum, 'cartao'::public.finance_meio_pagamento_enum) THEN
    RAISE EXCEPTION 'mensalidade aceita meio_pagamento cartao, stripe ou null';
  END IF;

  v_grupo_id := CASE WHEN v_parcelas > 1 THEN gen_random_uuid() ELSE NULL END;
  v_doc_base :=
    'DOC-' || to_char(extract(epoch from clock_timestamp())::bigint, 'FM999999999999')
    || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

  IF p_tipo = 'mensalidade' THEN
    v_valor_contrato := round(p_valor_total * v_parcelas, 2);
    v_valor_base := p_valor_total;
  ELSE
    v_valor_contrato := p_valor_total;
    v_valor_base := round(p_valor_total / v_parcelas, 2);
  END IF;

  v_soma_parcelas := 0;

  FOR v_i IN 1..v_parcelas LOOP
    IF p_tipo = 'mensalidade' THEN
      v_valor_parcela := v_valor_base;
    ELSIF v_i < v_parcelas THEN
      v_valor_parcela := v_valor_base;
      v_soma_parcelas := v_soma_parcelas + v_valor_parcela;
    ELSE
      v_valor_parcela := round(v_valor_contrato - v_soma_parcelas, 2);
    END IF;

    v_vencimento := (p_vencimento + ((v_i - 1) || ' months')::interval)::date;

    IF p_competencia IS NOT NULL THEN
      v_competencia := (p_competencia + ((v_i - 1) || ' months')::interval)::date;
    ELSIF p_tipo = 'mensalidade' THEN
      v_competencia := v_vencimento;
    ELSE
      v_competencia := p_competencia;
    END IF;

    IF v_parcelas > 1 THEN
      v_descricao := trim(both from coalesce(p_descricao, ''));
      IF v_descricao = '' THEN
        v_descricao := initcap(p_tipo) || ' — parcela ' || v_i || '/' || v_parcelas;
      ELSE
        v_descricao := v_descricao || ' (Parcela ' || v_i || '/' || v_parcelas || ')';
      END IF;
    ELSE
      v_descricao := p_descricao;
    END IF;

    v_status := public.fn_finance_status_inicial(v_vencimento);
    v_meta := COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'parcelamento', jsonb_build_object('grupo_id', v_grupo_id, 'parcela', v_i, 'total', v_parcelas)
    );
    IF p_contrato_id IS NOT NULL THEN
      v_meta := v_meta || jsonb_build_object('contrato_id', p_contrato_id);
    END IF;

    v_numero_doc := CASE
      WHEN v_parcelas > 1 THEN v_doc_base || '-' || lpad(v_i::text, 2, '0') || '/' || v_parcelas
      ELSE v_doc_base
    END;

    INSERT INTO public.finance_contas_receber (
      empresa_id, tipo, origem, descricao, competencia, valor_total, status, vencimento,
      meio_pagamento, meio_pagamento_detalhe, metadata,
      grupo_parcelamento_id, parcela_numero, parcelas_total, valor_contrato_original,
      numero_documento, contrato_id
    ) VALUES (
      v_empresa_id, p_tipo, p_origem, v_descricao, v_competencia, v_valor_parcela, v_status, v_vencimento,
      v_meio, p_meio_pagamento_detalhe, v_meta,
      v_grupo_id, v_i, v_parcelas, v_valor_contrato,
      v_numero_doc,
      p_contrato_id
    )
    RETURNING id INTO v_conta_id;

    IF v_i = 1 THEN v_primeira_conta_id := v_conta_id; END IF;
  END LOOP;

  RETURN v_primeira_conta_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sp_finance_gerar_contas_do_contrato(
  p_contrato_id uuid,
  p_forcar boolean DEFAULT false,
  p_mensalidades integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_c public.finance_contratos;
  v_extra record;
  v_meses integer;
  v_i integer;
  v_venc date;
  v_comp date;
  v_desc text;
  v_qtd_setup integer := 0;
  v_qtd_mensal integer := 0;
  v_qtd_extra integer := 0;
  v_total integer := 0;
  v_existentes integer;
  v_primeira uuid;
  v_ref text;
  v_primeiro_venc date;
BEGIN
  SELECT * INTO v_c
  FROM public.finance_contratos c
  WHERE c.id = p_contrato_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato não encontrado: %', p_contrato_id;
  END IF;

  PERFORM public.fn_finance_require_empresa_access(v_c.empresa_id);

  IF v_c.status = 'cancelado' THEN
    RAISE EXCEPTION 'Não é possível gerar contas de contrato cancelado';
  END IF;

  SELECT COUNT(*) INTO v_existentes
  FROM public.finance_contas_receber cr
  WHERE cr.contrato_id = p_contrato_id
    AND cr.status <> 'cancelada';

  IF v_existentes > 0 AND NOT COALESCE(p_forcar, false) THEN
    RAISE EXCEPTION 'Este contrato já possui % conta(s) a receber. Use p_forcar=true para gerar novamente.', v_existentes;
  END IF;

  v_ref := COALESCE(v_c.numero_contrato, v_c.id::text);
  v_meses := COALESCE(
    NULLIF(p_mensalidades, 0),
    v_c.mensalidades_total,
    public.fn_finance_meses_vigencia(v_c.data_inicio, v_c.data_fim)
  );
  v_meses := LEAST(GREATEST(v_meses, 0), 120);

  v_primeiro_venc := public.fn_finance_primeiro_vencimento_contrato(
    v_c.data_inicio,
    v_c.dia_vencimento_mensal
  );

  IF COALESCE(v_c.valor_setup, 0) > 0 THEN
    IF v_c.meio_pagamento_setup IS NULL THEN
      RAISE EXCEPTION 'Informe o meio de pagamento do setup no contrato antes de gerar as contas.';
    END IF;

    v_desc := 'Setup — ' || COALESCE(v_c.titulo, 'Contrato') || ' (' || v_ref || ')';
    PERFORM public.sp_finance_criar_conta_receber(
      p_tipo := 'setup',
      p_valor_total := v_c.valor_setup,
      p_vencimento := v_primeiro_venc,
      p_empresa_id := v_c.empresa_id,
      p_descricao := v_desc,
      p_competencia := v_primeiro_venc,
      p_origem := 'contrato',
      p_meio_pagamento := v_c.meio_pagamento_setup,
      p_parcelas_total := GREATEST(v_c.setup_parcelas, 1),
      p_contrato_id := p_contrato_id,
      p_metadata := jsonb_build_object('gerado_de', 'contrato', 'contrato_id', p_contrato_id)
    );
    v_qtd_setup := GREATEST(v_c.setup_parcelas, 1);
    v_total := v_total + v_qtd_setup;
  END IF;

  IF COALESCE(v_c.valor_mensalidade, 0) > 0 AND v_meses > 0 THEN
    FOR v_i IN 0..(v_meses - 1) LOOP
      v_venc := (v_primeiro_venc + (v_i || ' months')::interval)::date;
      v_comp := v_venc;
      v_desc := 'Mensalidade — ' || COALESCE(v_c.titulo, 'Contrato') || ' (' || v_ref || ')';
      PERFORM public.sp_finance_criar_conta_receber(
        p_tipo := 'mensalidade',
        p_valor_total := v_c.valor_mensalidade,
        p_vencimento := v_venc,
        p_empresa_id := v_c.empresa_id,
        p_descricao := v_desc,
        p_competencia := v_comp,
        p_origem := 'contrato',
        p_meio_pagamento := 'cartao'::public.finance_meio_pagamento_enum,
        p_parcelas_total := 1,
        p_contrato_id := p_contrato_id,
        p_metadata := jsonb_build_object('gerado_de', 'contrato', 'mes_offset', v_i)
      );
      v_qtd_mensal := v_qtd_mensal + 1;
      v_total := v_total + 1;
    END LOOP;
  END IF;

  FOR v_extra IN
    SELECT e.*
    FROM public.finance_contrato_servicos_extra e
    WHERE e.contrato_id = p_contrato_id
    ORDER BY e.created_at
  LOOP
    IF COALESCE(v_extra.valor, 0) <= 0 THEN
      CONTINUE;
    END IF;

    IF v_extra.recorrente_mensal THEN
      FOR v_i IN 0..(v_meses - 1) LOOP
        v_venc := (v_primeiro_venc + (v_i || ' months')::interval)::date;
        v_desc := 'Extra — ' || v_extra.descricao || ' (' || v_ref || ')';
        PERFORM public.sp_finance_criar_conta_receber(
          p_tipo := 'extra',
          p_valor_total := v_extra.valor,
          p_vencimento := v_venc,
          p_empresa_id := v_c.empresa_id,
          p_descricao := v_desc,
          p_competencia := v_venc,
          p_origem := 'contrato',
          p_parcelas_total := 1,
          p_contrato_id := p_contrato_id,
          p_metadata := jsonb_build_object('servico_extra_id', v_extra.id, 'recorrente', true)
        );
        v_qtd_extra := v_qtd_extra + 1;
        v_total := v_total + 1;
      END LOOP;
    ELSE
      v_desc := 'Extra — ' || v_extra.descricao || ' (' || v_ref || ')';
      PERFORM public.sp_finance_criar_conta_receber(
        p_tipo := 'extra',
        p_valor_total := v_extra.valor,
        p_vencimento := v_primeiro_venc,
        p_empresa_id := v_c.empresa_id,
        p_descricao := v_desc,
        p_competencia := v_primeiro_venc,
        p_origem := 'contrato',
        p_parcelas_total := GREATEST(v_extra.parcelas, 1),
        p_contrato_id := p_contrato_id,
        p_metadata := jsonb_build_object('servico_extra_id', v_extra.id, 'recorrente', false)
      );
      v_qtd_extra := v_qtd_extra + GREATEST(v_extra.parcelas, 1);
      v_total := v_total + GREATEST(v_extra.parcelas, 1);
    END IF;
  END LOOP;

  IF v_total = 0 THEN
    RAISE EXCEPTION 'Nenhuma conta a gerar: contrato sem valores de setup, mensalidade ou extras';
  END IF;

  UPDATE public.finance_contratos
  SET
    contas_ar_geradas_em = now(),
    contas_ar_geradas_qtd = contas_ar_geradas_qtd + v_total,
    status = CASE WHEN status = 'rascunho' THEN 'ativo' ELSE status END,
    updated_at = now()
  WHERE id = p_contrato_id;

  SELECT cr.id INTO v_primeira
  FROM public.finance_contas_receber cr
  WHERE cr.contrato_id = p_contrato_id
  ORDER BY cr.vencimento ASC, cr.created_at ASC
  LIMIT 1;

  RETURN jsonb_build_object(
    'contrato_id', p_contrato_id,
    'setup', v_qtd_setup,
    'mensalidades', v_qtd_mensal,
    'extras', v_qtd_extra,
    'total', v_total,
    'meses_vigencia', v_meses,
    'primeiro_vencimento', v_primeiro_venc,
    'primeira_conta_id', v_primeira
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_finance_primeiro_vencimento_contrato(date, smallint) TO authenticated;

COMMIT;


-- ============================================================================
-- BUNDLE: finance_meses_vigencia_fix
-- Correção contagem de meses de vigência (12 vs 13 mensalidades)
-- Arquivo: supabase/migrations/202606201200_finance_meses_vigencia_fix.sql
-- ============================================================================
-- Corrige contagem de mensalidades: vigência de 12 meses gerava 13 parcelas (+1 indevido)

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_finance_meses_vigencia(
  p_inicio date,
  p_fim date
)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_meses integer;
BEGIN
  IF p_fim IS NULL THEN
    RETURN 12;
  END IF;

  IF p_fim < p_inicio THEN
    RETURN 0;
  END IF;

  v_meses :=
    (EXTRACT(year FROM p_fim)::integer - EXTRACT(year FROM p_inicio)::integer) * 12
    + (EXTRACT(month FROM p_fim)::integer - EXTRACT(month FROM p_inicio)::integer);

  -- Período dentro do mesmo mês ou parcial: pelo menos 1 mensalidade
  IF v_meses <= 0 THEN
    v_meses := 1;
  END IF;

  RETURN LEAST(GREATEST(v_meses, 0), 120);
END;
$$;

COMMIT;


-- ============================================================================
-- BUNDLE: finance_contrato_limite_usuarios
-- Limite de usuários autorizados no contrato (OS/PDF)
-- Arquivo: supabase/migrations/202606211200_finance_contrato_limite_usuarios.sql
-- ============================================================================
-- Limite de usuários autorizados no contrato comercial (quadro-resumo da OS / PDF)

BEGIN;

ALTER TABLE public.finance_contratos
  ADD COLUMN IF NOT EXISTS limite_usuarios smallint;

ALTER TABLE public.finance_contratos
  DROP CONSTRAINT IF EXISTS finance_contratos_limite_usuarios_check;

ALTER TABLE public.finance_contratos
  ADD CONSTRAINT finance_contratos_limite_usuarios_check
  CHECK (limite_usuarios IS NULL OR (limite_usuarios >= 1 AND limite_usuarios <= 9999));

COMMENT ON COLUMN public.finance_contratos.limite_usuarios IS
  'Limite de usuários autorizados na Plataforma (refletido na OS/PDF).';

COMMIT;


-- ============================================================================
-- BUNDLE: finance_contrato_os_testemunhas
-- Número OS automático + testemunhas no contrato (MSA/PDF)
-- Arquivo: supabase/migrations/202606211400_finance_contrato_os_testemunhas.sql
-- ============================================================================
-- Número automático da OS + testemunhas do contrato (MSA/PDF)

BEGIN;

ALTER TABLE public.finance_contratos
  ADD COLUMN IF NOT EXISTS numero_os text,
  ADD COLUMN IF NOT EXISTS testemunha_1_nome text,
  ADD COLUMN IF NOT EXISTS testemunha_1_cpf text,
  ADD COLUMN IF NOT EXISTS testemunha_2_nome text,
  ADD COLUMN IF NOT EXISTS testemunha_2_cpf text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_contratos_numero_os_empresa
  ON public.finance_contratos (empresa_id, numero_os)
  WHERE numero_os IS NOT NULL;

COMMENT ON COLUMN public.finance_contratos.numero_os IS
  'Número da Ordem de Serviço (auto OS-AAAA-NNNN por empresa).';
COMMENT ON COLUMN public.finance_contratos.testemunha_1_nome IS 'Testemunha 1 — nome (MSA/PDF).';
COMMENT ON COLUMN public.finance_contratos.testemunha_1_cpf IS 'Testemunha 1 — CPF (MSA/PDF).';
COMMENT ON COLUMN public.finance_contratos.testemunha_2_nome IS 'Testemunha 2 — nome (MSA/PDF).';
COMMENT ON COLUMN public.finance_contratos.testemunha_2_cpf IS 'Testemunha 2 — CPF (MSA/PDF).';

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

  IF NEW.numero_os IS NULL OR btrim(NEW.numero_os) = '' THEN
    NEW.numero_os := 'OS-' || to_char(now(), 'YYYY') || '-' || lpad(
      (SELECT COUNT(*) + 1 FROM public.finance_contratos c WHERE c.empresa_id = NEW.empresa_id)::text,
      4, '0'
    );
  END IF;

  RETURN NEW;
END;
$$;

UPDATE public.finance_contratos c
SET numero_os = sub.numero_os
FROM (
  SELECT id,
    'OS-' || to_char(created_at, 'YYYY') || '-' || lpad(
      row_number() OVER (PARTITION BY empresa_id ORDER BY created_at)::text,
      4, '0'
    ) AS numero_os
  FROM public.finance_contratos
  WHERE numero_os IS NULL OR btrim(numero_os) = ''
) sub
WHERE c.id = sub.id;

COMMIT;

-- ============================================================================
-- FIM DO BUNDLE
-- ============================================================================
