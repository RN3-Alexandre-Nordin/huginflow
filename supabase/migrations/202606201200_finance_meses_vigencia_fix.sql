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
