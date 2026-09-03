-- Analytics BI — Step 3: colunas CRM para relatórios (aditivo)

ALTER TABLE public.crm_cards
  ADD COLUMN IF NOT EXISTS finalizado_em timestamptz;

COMMENT ON COLUMN public.crm_cards.finalizado_em IS
  'Analytics: timestamp explícito de fechamento do card (distinto de updated_at)';

UPDATE public.crm_cards
SET finalizado_em = updated_at
WHERE finalizado = true
  AND finalizado_em IS NULL
  AND updated_at IS NOT NULL;

ALTER TABLE public.pipeline_stages
  ADD COLUMN IF NOT EXISTS probabilidade_fechamento numeric(5, 2);

COMMENT ON COLUMN public.pipeline_stages.probabilidade_fechamento IS
  'Analytics: probabilidade 0–100 para pipeline weighted forecast';

ALTER TABLE public.crm_cards_history
  ADD COLUMN IF NOT EXISTS empresa_id uuid REFERENCES public.empresas(id) ON DELETE CASCADE;

UPDATE public.crm_cards_history h
SET empresa_id = c.empresa_id
FROM public.crm_cards c
WHERE c.id = h.card_id
  AND h.empresa_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_crm_cards_history_empresa_created
  ON public.crm_cards_history (empresa_id, created_at DESC)
  WHERE empresa_id IS NOT NULL;
