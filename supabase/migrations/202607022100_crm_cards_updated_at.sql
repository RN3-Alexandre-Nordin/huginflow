-- Dashboard gestor: data de última alteração do card (vendas concluídas no período)
ALTER TABLE public.crm_cards
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

UPDATE public.crm_cards
SET updated_at = COALESCE(stage_entered_at, created_at, now())
WHERE updated_at IS NULL;

ALTER TABLE public.crm_cards
  ALTER COLUMN updated_at SET DEFAULT now();

CREATE OR REPLACE FUNCTION public.crm_cards_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_cards_set_updated_at ON public.crm_cards;
CREATE TRIGGER crm_cards_set_updated_at
  BEFORE UPDATE ON public.crm_cards
  FOR EACH ROW
  EXECUTE FUNCTION public.crm_cards_set_updated_at();
