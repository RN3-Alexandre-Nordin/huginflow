-- Controla solicitação já convertida em pedido(s) via cotação.

ALTER TABLE public.com_solicitacoes
  DROP CONSTRAINT IF EXISTS com_solicitacoes_status_check;

ALTER TABLE public.com_solicitacoes
  ADD CONSTRAINT com_solicitacoes_status_check
  CHECK (status IN ('rascunho', 'registrada', 'atendida', 'cancelada'));

COMMENT ON COLUMN public.com_solicitacoes.status IS
  'rascunho | registrada (aberta p/ cotação) | atendida (já gerou pedido) | cancelada';

-- Backfill: solicitações com cotação confirmada e pedido vinculado.
UPDATE public.com_solicitacoes s
SET status = 'atendida'
WHERE s.status = 'registrada'
  AND EXISTS (
    SELECT 1
    FROM public.com_cotacoes c
    JOIN public.com_pedidos p ON p.cotacao_id = c.id AND p.empresa_id = c.empresa_id
    WHERE c.solicitacao_id = s.id
      AND c.empresa_id = s.empresa_id
      AND c.status = 'confirmada'
      AND p.status <> 'rascunho'
  );
