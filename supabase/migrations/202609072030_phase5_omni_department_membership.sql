-- Operador precisa ler somente a própria associação para a ACL do Omnichannel.
-- O departamento permanece obrigatoriamente no mesmo tenant do perfil autenticado.

DROP POLICY IF EXISTS usuarios_departamentos_select_self
  ON public.usuarios_departamentos;

CREATE POLICY usuarios_departamentos_select_self
  ON public.usuarios_departamentos
  FOR SELECT
  TO authenticated
  USING (
    usuario_id = (
      SELECT u.id
      FROM public.usuarios u
      WHERE u.auth_user_id = auth.uid()
        AND u.ativo = true
      LIMIT 1
    )
    AND departamento_id IN (
      SELECT d.id
      FROM public.departamentos d
      WHERE d.empresa_id = public.current_user_empresa_id()
    )
  );
