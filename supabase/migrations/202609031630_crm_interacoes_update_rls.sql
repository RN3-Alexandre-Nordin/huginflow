-- crm_interacoes tinha SELECT + INSERT por empresa, mas sem UPDATE.
-- Apagar no WhatsApp não gravava metadata.deleted (0 linhas, sem erro).

DROP POLICY IF EXISTS "Empresas e seus usuários podem atualizar interações" ON public.crm_interacoes;

CREATE POLICY "Empresas e seus usuários podem atualizar interações"
  ON public.crm_interacoes
  FOR UPDATE
  USING (
    empresa_id IN (
      SELECT usuarios.empresa_id
      FROM public.usuarios
      WHERE usuarios.auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    empresa_id IN (
      SELECT usuarios.empresa_id
      FROM public.usuarios
      WHERE usuarios.auth_user_id = auth.uid()
    )
  );
