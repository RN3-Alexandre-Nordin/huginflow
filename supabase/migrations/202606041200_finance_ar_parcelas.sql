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
