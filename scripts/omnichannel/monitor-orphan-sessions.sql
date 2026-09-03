-- Monitor: cards com conversa_id órfã (interações sem crm_conversas / thread)
-- Rodar por empresa; não altera dados.

SELECT
  c.empresa_id,
  c.id AS card_id,
  c.titulo,
  c.conversa_id,
  (SELECT count(*) FROM crm_interacoes i
    WHERE i.conversa_id::text = c.conversa_id
      AND i.empresa_id = c.empresa_id) AS interacoes,
  (SELECT count(*) FROM crm_conversas cv
    WHERE cv.sessao_id::text = c.conversa_id
      AND cv.empresa_id = c.empresa_id) AS conversas,
  (SELECT count(*) FROM crm_chat_threads t
    WHERE t.id::text = c.conversa_id
      AND t.empresa_id = c.empresa_id) AS threads
FROM crm_cards c
WHERE c.conversa_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM crm_interacoes i
    WHERE i.conversa_id::text = c.conversa_id
      AND i.empresa_id = c.empresa_id
  )
  AND NOT EXISTS (
    SELECT 1 FROM crm_conversas cv
    WHERE cv.sessao_id::text = c.conversa_id
      AND cv.empresa_id = c.empresa_id
  )
  AND NOT EXISTS (
    SELECT 1 FROM crm_chat_threads t
    WHERE t.id::text = c.conversa_id
      AND t.empresa_id = c.empresa_id
  )
ORDER BY c.updated_at DESC;
