-- Auto-atender requisições importadas por planilha (receber + baixa)

ALTER TABLE public.est_config
  ADD COLUMN IF NOT EXISTS req_planilha_auto_atender boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.est_config.req_planilha_auto_atender IS
  'Se true, import de planilha cria a requisição já aprovada e tenta baixar estoque (parcial se faltar saldo). Se false, apenas recebe e aguarda atendimento manual.';
