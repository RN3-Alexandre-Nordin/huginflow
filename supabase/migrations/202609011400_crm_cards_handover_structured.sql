-- Handover estruturado: blocos pesquisáveis para relatórios (checks + nota + search_text).
ALTER TABLE public.crm_cards
  ADD COLUMN IF NOT EXISTS handover_ja_feito JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS handover_pendencias JSONB DEFAULT NULL;

COMMENT ON COLUMN public.crm_cards.handover_ja_feito IS
  'Handover: { checks: string[], nota: string, search_text: string } — o que já foi feito.';

COMMENT ON COLUMN public.crm_cards.handover_pendencias IS
  'Handover: { checks: string[], nota: string, search_text: string } — pendências para o próximo operador.';

CREATE INDEX IF NOT EXISTS idx_crm_cards_handover_ja_feito_gin
  ON public.crm_cards USING gin (handover_ja_feito jsonb_path_ops);

CREATE INDEX IF NOT EXISTS idx_crm_cards_handover_pendencias_gin
  ON public.crm_cards USING gin (handover_pendencias jsonb_path_ops);
