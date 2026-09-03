-- Analytics BI — Step 1: índices para agregações (dev-safe, aditivo)

CREATE INDEX IF NOT EXISTS idx_crm_interacoes_empresa_created
  ON public.crm_interacoes (empresa_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_interacoes_sessao_created
  ON public.crm_interacoes (conversa_id, created_at)
  WHERE conversa_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_interacoes_empresa_role_created
  ON public.crm_interacoes (empresa_id, role, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_conversas_empresa_sessao_created
  ON public.crm_conversas (empresa_id, sessao_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_conversas_empresa_status_created
  ON public.crm_conversas (empresa_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_chat_threads_empresa_status_updated
  ON public.crm_chat_threads (empresa_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_chat_threads_empresa_depto_created
  ON public.crm_chat_threads (empresa_id, departamento_id, created_at DESC)
  WHERE departamento_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_cards_empresa_finalizado_updated
  ON public.crm_cards (empresa_id, finalizado, updated_at DESC);
