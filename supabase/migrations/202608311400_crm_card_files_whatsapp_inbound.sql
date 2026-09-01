-- Anexos inbound WhatsApp: origem, idempotência e vínculo com interação.

ALTER TABLE public.crm_card_files
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS interacao_id uuid,
  ADD COLUMN IF NOT EXISTS provider_message_id text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_card_files_provider_message
  ON public.crm_card_files (empresa_id, provider_message_id)
  WHERE provider_message_id IS NOT NULL;

COMMENT ON COLUMN public.crm_card_files.source IS 'manual | whatsapp_inbound';
