-- Isolamento por tenant em crm_leads (gestor/operador só vê a própria empresa)
DROP POLICY IF EXISTS "Select crm_leads" ON public.crm_leads;
DROP POLICY IF EXISTS "Insert crm_leads" ON public.crm_leads;
DROP POLICY IF EXISTS "Update crm_leads" ON public.crm_leads;
DROP POLICY IF EXISTS "Delete crm_leads" ON public.crm_leads;

CREATE POLICY "Select crm_leads"
ON public.crm_leads FOR SELECT
TO public
USING (
  EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = crm_leads.empresa_id)
  )
);

CREATE POLICY "Insert crm_leads"
ON public.crm_leads FOR INSERT
TO public
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = crm_leads.empresa_id)
  )
);

CREATE POLICY "Update crm_leads"
ON public.crm_leads FOR UPDATE
TO public
USING (
  EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = crm_leads.empresa_id)
  )
);

CREATE POLICY "Delete crm_leads"
ON public.crm_leads FOR DELETE
TO public
USING (
  EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = crm_leads.empresa_id)
  )
);
