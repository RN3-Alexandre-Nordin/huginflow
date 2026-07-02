-- RAG: leitura de chunks da própria empresa (simulador, WhatsApp, match_knowledge_base)
DROP POLICY IF EXISTS "Usuários podem visualizar a base de conhecimento da sua empresa" ON knowledge_base;

CREATE POLICY "Usuários podem visualizar a base de conhecimento da sua empresa"
ON knowledge_base FOR SELECT
TO public
USING (
  EXISTS (
    SELECT 1
    FROM usuarios
    WHERE usuarios.auth_user_id = auth.uid()
      AND usuarios.empresa_id = knowledge_base.organization_id
  )
);
