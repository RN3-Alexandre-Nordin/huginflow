-- Uma linha em crm_conversas por mensagem (recebida ou enviada).
-- sessao_id agrupa o thread para o chat omnichannel.

ALTER TABLE public.crm_conversas
  ADD COLUMN IF NOT EXISTS sessao_id uuid,
  ADD COLUMN IF NOT EXISTS role text,
  ADD COLUMN IF NOT EXISTS content text,
  ADD COLUMN IF NOT EXISTS direcao text;

UPDATE public.crm_conversas
SET
  sessao_id = id,
  content = COALESCE(content, last_message),
  role = COALESCE(role, 'legacy'),
  direcao = COALESCE(direcao, 'inbound')
WHERE sessao_id IS NULL;

ALTER TABLE public.crm_conversas
  ALTER COLUMN sessao_id SET NOT NULL;

ALTER TABLE public.crm_conversas
  DROP CONSTRAINT IF EXISTS crm_conversas_canal_id_external_id_key;

CREATE INDEX IF NOT EXISTS crm_conversas_sessao_created_idx
  ON public.crm_conversas (sessao_id, created_at);

CREATE INDEX IF NOT EXISTS crm_conversas_canal_external_created_idx
  ON public.crm_conversas (canal_id, external_id, created_at DESC);
