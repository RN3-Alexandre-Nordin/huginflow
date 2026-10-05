-- Divergência calculada na conferência. Substitui o texto livre.

ALTER TABLE public.com_recebimento_itens
  ADD COLUMN IF NOT EXISTS divergencia_quantidade numeric(14, 4),
  ADD COLUMN IF NOT EXISTS divergencia_preco numeric(14, 4);

ALTER TABLE public.com_recebimento_itens
  DROP COLUMN IF EXISTS divergencia;

ALTER TABLE public.com_caixa_itens
  DROP COLUMN IF EXISTS divergencia;

COMMENT ON COLUMN public.com_recebimento_itens.divergencia_quantidade IS
  'Quantidade recebida menos a quantidade do pedido. Negativo é falta; positivo é sobra.';
COMMENT ON COLUMN public.com_recebimento_itens.divergencia_preco IS
  'Preço unitário da nota menos o preço unitário do pedido. Nulo quando a entrada não informa preço de nota.';
