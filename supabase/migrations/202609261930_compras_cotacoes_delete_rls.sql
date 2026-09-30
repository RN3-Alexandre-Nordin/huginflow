-- DELETE em cotações (só não confirmadas, via app).

DROP POLICY IF EXISTS com_cotacoes_delete ON public.com_cotacoes;
CREATE POLICY com_cotacoes_delete ON public.com_cotacoes
FOR DELETE TO authenticated
USING (
  (
    public.current_user_is_superadmin()
    OR public.check_permission('compras_cotacoes', 'delete')
  )
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = com_cotacoes.empresa_id)
  )
);
