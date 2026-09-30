-- Solicitante/comprador como Pessoa (funcionário) + suporte a seleção na UI.

ALTER TABLE public.com_solicitacoes
  ADD COLUMN IF NOT EXISTS solicitante_pessoa_id uuid NULL
    REFERENCES public.crm_leads (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_com_solicitacoes_solicitante_pessoa
  ON public.com_solicitacoes (empresa_id, solicitante_pessoa_id);

ALTER TABLE public.com_pedidos
  ADD COLUMN IF NOT EXISTS comprador_pessoa_id uuid NULL
    REFERENCES public.crm_leads (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_com_pedidos_comprador_pessoa
  ON public.com_pedidos (empresa_id, comprador_pessoa_id);

COMMENT ON COLUMN public.com_solicitacoes.solicitante_pessoa_id IS
  'Funcionário (crm_leads papel funcionario) que solicita a compra.';
COMMENT ON COLUMN public.com_pedidos.comprador_pessoa_id IS
  'Funcionário (crm_leads papel funcionario) responsável pelo pedido.';
