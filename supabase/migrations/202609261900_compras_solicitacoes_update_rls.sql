-- Fix: registrar solicitação precisa UPDATE (status rascunho → registrada).
-- Sem esta policy o PostgREST atualiza 0 linhas sem erro e a listagem
-- (que oculta rascunhos) fica vazia.

DROP POLICY IF EXISTS com_solicitacoes_update ON public.com_solicitacoes;
CREATE POLICY com_solicitacoes_update ON public.com_solicitacoes
FOR UPDATE TO authenticated
USING (
  (
    public.current_user_is_superadmin()
    OR public.check_permission('compras_solicitacoes', 'create')
    OR public.check_permission('compras_solicitacoes', 'edit')
  )
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = com_solicitacoes.empresa_id)
  )
)
WITH CHECK (
  (
    public.current_user_is_superadmin()
    OR public.check_permission('compras_solicitacoes', 'create')
    OR public.check_permission('compras_solicitacoes', 'edit')
  )
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = com_solicitacoes.empresa_id)
  )
);
