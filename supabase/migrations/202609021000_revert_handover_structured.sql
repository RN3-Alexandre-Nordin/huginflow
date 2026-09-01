-- Reverte handover estruturado (motivos/checklists JSONB).
-- Encaminhamento passa a usar apenas crm_cards.observacao com resumo IA editável.

DROP INDEX IF EXISTS public.idx_crm_cards_handover_ja_feito_gin;
DROP INDEX IF EXISTS public.idx_crm_cards_handover_pendencias_gin;

ALTER TABLE public.crm_cards
  DROP COLUMN IF EXISTS handover_ja_feito,
  DROP COLUMN IF EXISTS handover_pendencias;

ALTER TABLE public.empresas
  DROP COLUMN IF EXISTS crm_handover_config;
