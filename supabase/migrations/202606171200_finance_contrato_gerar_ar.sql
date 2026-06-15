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
