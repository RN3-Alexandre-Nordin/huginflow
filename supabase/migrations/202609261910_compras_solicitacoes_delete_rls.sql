-- DELETE em solicitações (só via app quando não há cotação).

DROP POLICY IF EXISTS com_solicitacoes_delete ON public.com_solicitacoes;
CREATE POLICY com_solicitacoes_delete ON public.com_solicitacoes
FOR DELETE TO authenticated
USING (
  (
    public.current_user_is_superadmin()
    OR public.check_permission('compras_solicitacoes', 'delete')
  )
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = com_solicitacoes.empresa_id)
  )
);
