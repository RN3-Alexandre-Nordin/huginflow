-- Analytics BI — Step 2: métricas de SLA por thread (colunas nullable, sem triggers)

ALTER TABLE public.crm_chat_threads
  ADD COLUMN IF NOT EXISTS opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS first_response_at timestamptz,
  ADD COLUMN IF NOT EXISTS first_response_role text,
  ADD COLUMN IF NOT EXISTS first_response_usuario_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_by_usuario_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS handover_at timestamptz,
  ADD COLUMN IF NOT EXISTS handover_reason text,
  ADD COLUMN IF NOT EXISTS message_count_inbound integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS message_count_outbound integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reopened_at timestamptz;

UPDATE public.crm_chat_threads
SET opened_at = created_at
WHERE opened_at IS NULL;

ALTER TABLE public.crm_chat_threads
  ALTER COLUMN opened_at SET DEFAULT now();

COMMENT ON COLUMN public.crm_chat_threads.opened_at IS 'Analytics: abertura da thread (default created_at)';
COMMENT ON COLUMN public.crm_chat_threads.first_response_at IS 'Analytics: 1ª resposta outbound (IA ou humano)';
COMMENT ON COLUMN public.crm_chat_threads.handover_at IS 'Analytics: transbordo IA → humano';
