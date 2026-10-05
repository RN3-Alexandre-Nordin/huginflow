-- Preço unitário da nota informado na conferência manual. Não altera o preço do pedido.

ALTER TABLE public.com_recebimento_itens
  ADD COLUMN IF NOT EXISTS preco_nota numeric(14, 4);

COMMENT ON COLUMN public.com_recebimento_itens.preco_nota IS
  'Preço unitário da nota digitado na conferência. O total da linha é quantidade recebida vezes este valor.';
