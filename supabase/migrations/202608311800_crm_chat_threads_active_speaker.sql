-- Sessões por departamento: threads de assunto + falante ativo por telefone/canal.
-- Ver docs/planejamento-sessoes-por-departamento.md

CREATE TABLE IF NOT EXISTS public.crm_chat_threads (
  id uuid PRIMARY KEY,
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  canal_id uuid NOT NULL REFERENCES public.crm_canais(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  lead_id uuid REFERENCES public.crm_leads(id) ON DELETE SET NULL,
  card_id uuid REFERENCES public.crm_cards(id) ON DELETE SET NULL,
  departamento_id uuid REFERENCES public.departamentos(id) ON DELETE SET NULL,
  pipeline_id uuid REFERENCES public.pipelines(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'ai',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_chat_threads_phone
  ON public.crm_chat_threads (empresa_id, canal_id, external_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_chat_threads_card
  ON public.crm_chat_threads (card_id)
  WHERE card_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_chat_threads_open_card
  ON public.crm_chat_threads (card_id)
  WHERE card_id IS NOT NULL AND status IS DISTINCT FROM 'closed';

CREATE TABLE IF NOT EXISTS public.crm_phone_active_speaker (
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  canal_id uuid NOT NULL REFERENCES public.crm_canais(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  active_sessao_id uuid NOT NULL REFERENCES public.crm_chat_threads(id) ON DELETE CASCADE,
  active_departamento_id uuid REFERENCES public.departamentos(id) ON DELETE SET NULL,
  activated_at timestamptz NOT NULL DEFAULT now(),
  activated_by uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  reason text,
  PRIMARY KEY (empresa_id, canal_id, external_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_phone_active_speaker_sessao
  ON public.crm_phone_active_speaker (active_sessao_id);

ALTER TABLE public.crm_chat_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_phone_active_speaker ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm_chat_threads_empresa" ON public.crm_chat_threads;
CREATE POLICY "crm_chat_threads_empresa" ON public.crm_chat_threads
  FOR ALL USING (
    empresa_id = (SELECT empresa_id FROM public.usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
    OR EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.role_global = 'superadmin'
    )
  )
  WITH CHECK (
    empresa_id = (SELECT empresa_id FROM public.usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
    OR EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.role_global = 'superadmin'
    )
  );

DROP POLICY IF EXISTS "crm_phone_active_speaker_empresa" ON public.crm_phone_active_speaker;
CREATE POLICY "crm_phone_active_speaker_empresa" ON public.crm_phone_active_speaker
  FOR ALL USING (
    empresa_id = (SELECT empresa_id FROM public.usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
    OR EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.role_global = 'superadmin'
    )
  )
  WITH CHECK (
    empresa_id = (SELECT empresa_id FROM public.usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
    OR EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.role_global = 'superadmin'
    )
  );

-- Backfill: uma thread por (canal, telefone) a partir da sessão mais recente
INSERT INTO public.crm_chat_threads (
  id, empresa_id, canal_id, external_id, lead_id, status, created_at, updated_at
)
SELECT DISTINCT ON (c.canal_id, c.external_id)
  c.sessao_id,
  c.empresa_id,
  c.canal_id,
  c.external_id,
  c.lead_id,
  COALESCE(c.status, 'ai'),
  c.created_at,
  COALESCE(c.updated_at, c.created_at)
FROM public.crm_conversas c
WHERE c.sessao_id IS NOT NULL
  AND c.canal_id IS NOT NULL
  AND c.external_id IS NOT NULL
ORDER BY c.canal_id, c.external_id, c.created_at DESC
ON CONFLICT (id) DO NOTHING;

-- Ligar card / pipeline / departamento quando card.conversa_id = thread
UPDATE public.crm_chat_threads t
SET
  card_id = c.id,
  pipeline_id = c.pipeline_id,
  departamento_id = p.departamento_id,
  updated_at = now()
FROM public.crm_cards c
LEFT JOIN public.pipelines p ON p.id = c.pipeline_id
WHERE c.conversa_id IS NOT NULL
  AND c.conversa_id ~ '^[0-9a-fA-F-]{36}$'
  AND c.conversa_id::uuid = t.id
  AND t.card_id IS NULL;

-- Falante ativo = thread backfillada
INSERT INTO public.crm_phone_active_speaker (
  empresa_id, canal_id, external_id, active_sessao_id, active_departamento_id, activated_at, reason
)
SELECT
  t.empresa_id,
  t.canal_id,
  t.external_id,
  t.id,
  t.departamento_id,
  now(),
  'backfill'
FROM public.crm_chat_threads t
ON CONFLICT (empresa_id, canal_id, external_id) DO NOTHING;

COMMENT ON TABLE public.crm_chat_threads IS 'Thread de assunto WhatsApp (sessao_id) amarrada a card/departamento';
COMMENT ON TABLE public.crm_phone_active_speaker IS 'Qual sessão conduz o diálogo agora por telefone+canal';
