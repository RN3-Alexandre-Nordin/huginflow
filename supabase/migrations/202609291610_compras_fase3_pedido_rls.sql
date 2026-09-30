-- Fase 3: reabrir alçada ao editar valor; conferência atualiza o status do pedido.

DROP POLICY IF EXISTS com_pedidos_update ON public.com_pedidos;
CREATE POLICY com_pedidos_update ON public.com_pedidos
FOR UPDATE TO authenticated
USING (
  (
    public.check_permission('compras_pedidos', 'edit')
    OR public.check_permission('compras_aprovacao', 'edit')
    OR public.check_permission('compras_conferencia', 'create')
    OR public.check_permission('compras_conferencia', 'edit')
  )
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = com_pedidos.empresa_id)
  )
)
WITH CHECK (
  (
    public.check_permission('compras_pedidos', 'edit')
    OR public.check_permission('compras_aprovacao', 'edit')
    OR public.check_permission('compras_conferencia', 'create')
    OR public.check_permission('compras_conferencia', 'edit')
  )
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = com_pedidos.empresa_id)
  )
);

DROP POLICY IF EXISTS com_pedido_aprovacoes_delete ON public.com_pedido_aprovacoes;
CREATE POLICY com_pedido_aprovacoes_delete ON public.com_pedido_aprovacoes
FOR DELETE TO authenticated
USING (
  public.check_permission('compras_pedidos', 'edit')
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = com_pedido_aprovacoes.empresa_id)
  )
);

GRANT SELECT, INSERT ON public.com_recebimentos, public.com_recebimento_itens
TO authenticated, service_role;
