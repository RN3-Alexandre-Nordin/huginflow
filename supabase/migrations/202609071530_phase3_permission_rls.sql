-- Fase 3: RBAC por ação no banco e isolamento estrito de canais/roteamento.

CREATE OR REPLACE FUNCTION public.check_permission(slug text, action text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    (
      SELECT
        u.role_global IN ('superadmin', 'admin')
        OR COALESCE(g.is_admin, false)
        OR COALESCE((g.permissoes -> slug) ? action, false)
      FROM public.usuarios u
      LEFT JOIN public.grupos_acesso g
        ON g.id = u.grupo_id
       AND g.empresa_id = u.empresa_id
      WHERE u.auth_user_id = auth.uid()
        AND COALESCE(u.ativo, true)
      LIMIT 1
    ),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.check_permission(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_permission(text, text) TO authenticated, service_role;

DO $$
DECLARE
  policy_row record;
BEGIN
  FOR policy_row IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('crm_leads', 'crm_canais', 'crm_canais_roteamento')
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I.%I',
      policy_row.policyname,
      policy_row.schemaname,
      policy_row.tablename
    );
  END LOOP;
END
$$;

ALTER TABLE public.crm_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_canais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_canais_roteamento ENABLE ROW LEVEL SECURITY;

CREATE POLICY crm_leads_select ON public.crm_leads
FOR SELECT TO authenticated
USING (
  public.check_permission('leads', 'view')
  AND EXISTS (
    SELECT 1
    FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = crm_leads.empresa_id)
  )
);

CREATE POLICY crm_leads_insert ON public.crm_leads
FOR INSERT TO authenticated
WITH CHECK (
  public.check_permission('leads', 'create')
  AND EXISTS (
    SELECT 1
    FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = crm_leads.empresa_id)
  )
);

CREATE POLICY crm_leads_update ON public.crm_leads
FOR UPDATE TO authenticated
USING (
  public.check_permission('leads', 'edit')
  AND EXISTS (
    SELECT 1
    FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = crm_leads.empresa_id)
  )
)
WITH CHECK (
  public.check_permission('leads', 'edit')
  AND EXISTS (
    SELECT 1
    FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = crm_leads.empresa_id)
  )
);

CREATE POLICY crm_leads_delete ON public.crm_leads
FOR DELETE TO authenticated
USING (
  public.check_permission('leads', 'delete')
  AND EXISTS (
    SELECT 1
    FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = crm_leads.empresa_id)
  )
);

CREATE POLICY crm_canais_select ON public.crm_canais
FOR SELECT TO authenticated
USING (
  public.check_permission('canais', 'view')
  AND EXISTS (
    SELECT 1
    FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = crm_canais.empresa_id)
  )
);

CREATE POLICY crm_canais_insert ON public.crm_canais
FOR INSERT TO authenticated
WITH CHECK (
  public.check_permission('canais', 'create')
  AND EXISTS (
    SELECT 1
    FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = crm_canais.empresa_id)
  )
);

CREATE POLICY crm_canais_update ON public.crm_canais
FOR UPDATE TO authenticated
USING (
  public.check_permission('canais', 'edit')
  AND EXISTS (
    SELECT 1
    FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = crm_canais.empresa_id)
  )
)
WITH CHECK (
  public.check_permission('canais', 'edit')
  AND EXISTS (
    SELECT 1
    FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = crm_canais.empresa_id)
  )
);

CREATE POLICY crm_canais_delete ON public.crm_canais
FOR DELETE TO authenticated
USING (
  public.check_permission('canais', 'delete')
  AND EXISTS (
    SELECT 1
    FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = crm_canais.empresa_id)
  )
);

CREATE POLICY crm_canais_roteamento_select ON public.crm_canais_roteamento
FOR SELECT TO authenticated
USING (
  public.check_permission('canais', 'view')
  AND EXISTS (
    SELECT 1
    FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = crm_canais_roteamento.org_id)
  )
  AND EXISTS (
    SELECT 1 FROM public.crm_canais c
    WHERE c.id = crm_canais_roteamento.canal_id
      AND c.empresa_id = crm_canais_roteamento.org_id
  )
);

CREATE POLICY crm_canais_roteamento_insert ON public.crm_canais_roteamento
FOR INSERT TO authenticated
WITH CHECK (
  public.check_permission('canais', 'create')
  AND EXISTS (
    SELECT 1
    FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = crm_canais_roteamento.org_id)
  )
  AND EXISTS (
    SELECT 1 FROM public.crm_canais c
    WHERE c.id = crm_canais_roteamento.canal_id
      AND c.empresa_id = crm_canais_roteamento.org_id
  )
  AND EXISTS (
    SELECT 1
    FROM public.pipelines p
    JOIN public.pipeline_stages s ON s.pipeline_id = p.id
    WHERE p.id = crm_canais_roteamento.pipeline_id
      AND p.empresa_id = crm_canais_roteamento.org_id
      AND s.id = crm_canais_roteamento.stage_id
  )
);

CREATE POLICY crm_canais_roteamento_update ON public.crm_canais_roteamento
FOR UPDATE TO authenticated
USING (
  public.check_permission('canais', 'edit')
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = crm_canais_roteamento.org_id)
  )
)
WITH CHECK (
  public.check_permission('canais', 'edit')
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = crm_canais_roteamento.org_id)
  )
  AND EXISTS (
    SELECT 1 FROM public.crm_canais c
    WHERE c.id = crm_canais_roteamento.canal_id
      AND c.empresa_id = crm_canais_roteamento.org_id
  )
  AND EXISTS (
    SELECT 1
    FROM public.pipelines p
    JOIN public.pipeline_stages s ON s.pipeline_id = p.id
    WHERE p.id = crm_canais_roteamento.pipeline_id
      AND p.empresa_id = crm_canais_roteamento.org_id
      AND s.id = crm_canais_roteamento.stage_id
  )
);

CREATE POLICY crm_canais_roteamento_delete ON public.crm_canais_roteamento
FOR DELETE TO authenticated
USING (
  public.check_permission('canais', 'delete')
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = crm_canais_roteamento.org_id)
  )
);
