-- Todas as RPCs públicas de Analytics passam por este resolver.
-- O backend usa a mesma matriz dinâmica da UI antes de resolver o tenant.

CREATE OR REPLACE FUNCTION public.fn_analytics_resolve_empresa_id(
  p_empresa_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.check_permission('relatorios', 'view') THEN
    RAISE EXCEPTION 'Sem permissão para visualizar relatórios'
      USING ERRCODE = '42501';
  END IF;

  RETURN public.fn_finance_resolve_empresa_id(p_empresa_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_analytics_resolve_empresa_id(uuid)
  FROM PUBLIC, anon, authenticated;
