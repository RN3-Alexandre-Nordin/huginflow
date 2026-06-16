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
