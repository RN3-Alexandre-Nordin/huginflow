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
