-- Remessa multi-local: local de saída por item + observação no lote
ALTER TABLE public.est_remessa_itens
  ADD COLUMN IF NOT EXISTS local_origem_id uuid REFERENCES public.cad_locais_estoque (id) ON DELETE RESTRICT;

UPDATE public.est_remessa_itens i
SET local_origem_id = l.local_origem_id
FROM public.est_remessa_lotes l
WHERE i.remessa_id = l.id
  AND i.local_origem_id IS NULL;

ALTER TABLE public.est_remessa_itens
  ALTER COLUMN local_origem_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_est_remessa_itens_local
  ON public.est_remessa_itens (empresa_id, local_origem_id);

ALTER TABLE public.est_remessa_lotes
  ADD COLUMN IF NOT EXISTS observacao text;

COMMENT ON COLUMN public.est_remessa_itens.local_origem_id IS
  'Local próprio de saída desta linha (pode diferir entre itens do mesmo lote).';
COMMENT ON COLUMN public.est_remessa_lotes.observacao IS
  'Observação geral do lote de remessa (não por item).';
