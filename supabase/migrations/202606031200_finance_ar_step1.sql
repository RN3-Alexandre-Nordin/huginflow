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
