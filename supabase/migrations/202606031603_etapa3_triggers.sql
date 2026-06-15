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
