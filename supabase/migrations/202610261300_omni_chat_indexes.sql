-- Omni: a lista de conversas ordena por created_at dentro da empresa, e a checagem de
-- acesso do operador busca cards por conversa_id. Sem estes índices, cada operador com o
-- chat aberto fazia varredura sequencial a cada mensagem recebida.

CREATE INDEX IF NOT EXISTS idx_crm_conversas_empresa_created
  ON public.crm_conversas (empresa_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_cards_empresa_conversa
  ON public.crm_cards (empresa_id, conversa_id)
  WHERE conversa_id IS NOT NULL;
