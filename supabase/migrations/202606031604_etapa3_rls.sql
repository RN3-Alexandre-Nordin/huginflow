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
