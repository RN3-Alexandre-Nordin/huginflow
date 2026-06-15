-- =============================================================================
-- Etapa 3/3 — Helpers de contexto, totais e outbox enqueue
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Contexto do caller (JWT quando existir; fallback usuarios — ver nota)
-- Nota: Ragnar hoje NÃO injeta empresa_id no JWT por padrão; fallback via usuarios.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_empresa_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    NULLIF(auth.jwt() ->> 'empresa_id', '')::uuid,
    public.fn_current_user_empresa_id()
  );
$$;

COMMENT ON FUNCTION public.current_empresa_id() IS
  'Tenant ativo: claim JWT empresa_id ou usuarios.empresa_id (auth.uid()).';

CREATE OR REPLACE FUNCTION public.current_usuario_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    NULLIF(auth.jwt() ->> 'usuario_id', '')::uuid,
    (
      SELECT u.id
      FROM public.usuarios u
      WHERE u.auth_user_id = auth.uid()
      LIMIT 1
    ),
    auth.uid()
  );
$$;

COMMENT ON FUNCTION public.current_usuario_id() IS
  'Perfil usuarios.id: claim JWT usuario_id ou lookup por auth.uid().';

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    NULLIF(auth.jwt() ->> 'is_admin', '')::boolean,
    EXISTS (
      SELECT 1
      FROM public.usuarios u
      LEFT JOIN public.grupos_acesso g ON g.id = u.grupo_id
      WHERE u.auth_user_id = auth.uid()
        AND (
          u.role_global IN ('superadmin', 'admin')
          OR COALESCE(g.is_admin, false) = true
        )
    ),
    false
  );
$$;

COMMENT ON FUNCTION public.is_admin() IS
  'Admin do tenant ou superadmin; claim JWT is_admin ou role/grupo.';

-- ---------------------------------------------------------------------------
-- Soma de baixas por conta (coluna valor — Etapa 1)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_total_baixas(p_conta_id uuid)
RETURNS numeric(12, 2)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(b.valor), 0)::numeric(12, 2)
  FROM public.finance_contas_receber_baixas b
  WHERE b.conta_receber_id = p_conta_id;
$$;

COMMENT ON FUNCTION public.fn_total_baixas(uuid) IS
  'Total pago (soma das baixas) de uma conta a receber.';

COMMIT;
