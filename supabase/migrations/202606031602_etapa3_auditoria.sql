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
