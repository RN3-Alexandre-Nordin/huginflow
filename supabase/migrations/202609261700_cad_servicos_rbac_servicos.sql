-- Alinha RLS do catálogo de serviços ao slug RBAC genérico `servicos`.

DROP POLICY IF EXISTS cad_servicos_select ON public.cad_servicos;
CREATE POLICY cad_servicos_select ON public.cad_servicos
  FOR SELECT TO authenticated
  USING (
    empresa_id = public.current_user_empresa_id()
    AND (
      public.current_user_is_superadmin()
      OR public.check_permission('servicos', 'view')
      OR public.check_permission('compras', 'view')
      OR public.check_permission('compras_solicitacoes', 'view')
      OR public.check_permission('compras_pedidos', 'view')
    )
  );

DROP POLICY IF EXISTS cad_servicos_insert ON public.cad_servicos;
CREATE POLICY cad_servicos_insert ON public.cad_servicos
  FOR INSERT TO authenticated
  WITH CHECK (
    empresa_id = public.current_user_empresa_id()
    AND (
      public.current_user_is_superadmin()
      OR public.check_permission('servicos', 'create')
    )
  );

DROP POLICY IF EXISTS cad_servicos_update ON public.cad_servicos;
CREATE POLICY cad_servicos_update ON public.cad_servicos
  FOR UPDATE TO authenticated
  USING (
    empresa_id = public.current_user_empresa_id()
    AND (
      public.current_user_is_superadmin()
      OR public.check_permission('servicos', 'edit')
    )
  )
  WITH CHECK (
    empresa_id = public.current_user_empresa_id()
    AND (
      public.current_user_is_superadmin()
      OR public.check_permission('servicos', 'edit')
    )
  );

DROP POLICY IF EXISTS cad_servicos_delete ON public.cad_servicos;
CREATE POLICY cad_servicos_delete ON public.cad_servicos
  FOR DELETE TO authenticated
  USING (
    empresa_id = public.current_user_empresa_id()
    AND (
      public.current_user_is_superadmin()
      OR public.check_permission('servicos', 'delete')
    )
  );

COMMENT ON TABLE public.cad_servicos IS
  'Catálogo mestre de serviços (compra e, no futuro, venda). Isolado por empresa_id.';
