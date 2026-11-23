-- DELETE direto em est_requisicoes apaga cabeçalho, itens (ON DELETE CASCADE)
-- e desvincula movimentos (ON DELETE SET NULL). DELETE direto em
-- est_requisicao_itens apaga a linha sem baixa. Revoga os dois de authenticated.
-- service_role permanece para manutenção. A policy de 202609121000 não é ampliada.

REVOKE DELETE ON TABLE public.est_requisicoes FROM authenticated;
REVOKE DELETE ON TABLE public.est_requisicao_itens FROM authenticated;
