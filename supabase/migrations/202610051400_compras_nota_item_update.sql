-- A confirmação da nota grava o frete rateado na linha.
-- Sem política de UPDATE o Postgres devolve sucesso e não altera a linha.

GRANT UPDATE ON public.com_nota_itens TO authenticated, service_role;

DROP POLICY IF EXISTS com_nota_itens_update ON public.com_nota_itens;
CREATE POLICY com_nota_itens_update ON public.com_nota_itens
FOR UPDATE TO authenticated
USING (
  empresa_id = public.current_user_empresa_id()
  AND (
    public.current_user_is_superadmin()
    OR public.check_permission('compras_notas', 'edit')
    OR public.check_permission('compras_notas', 'create')
  )
)
WITH CHECK (
  empresa_id = public.current_user_empresa_id()
  AND (
    public.current_user_is_superadmin()
    OR public.check_permission('compras_notas', 'edit')
    OR public.check_permission('compras_notas', 'create')
  )
);
