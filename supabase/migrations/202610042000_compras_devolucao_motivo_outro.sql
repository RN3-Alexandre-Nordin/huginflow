-- Motivo extra da devolução ao fornecedor: outro.

ALTER TABLE public.com_devolucao_itens
  DROP CONSTRAINT IF EXISTS com_devolucao_itens_motivo_check;

ALTER TABLE public.com_devolucao_itens
  ADD CONSTRAINT com_devolucao_itens_motivo_check
  CHECK (motivo IN ('trocado', 'avaria', 'outro'));
