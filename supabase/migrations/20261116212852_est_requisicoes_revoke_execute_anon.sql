-- Endurece EXECUTE do Pacote 4 sem recriar funções, dados ou RLS.
-- anon perde chamada direta. authenticated e service_role permanecem
-- nas funções de API e nos triggers, para o UPDATE que dispara o trigger
-- continuar autorizado.
-- Versão aplicada no dev: 20261116212852 (posterior a 20261116200100).

REVOKE EXECUTE ON FUNCTION public.est_criar_requisicao(
  uuid, uuid, uuid, uuid, text, text, text, text, text, text, jsonb
) FROM PUBLIC, anon;

REVOKE EXECUTE ON FUNCTION public.est_transicionar_requisicao(uuid, uuid, text)
  FROM PUBLIC, anon;

REVOKE EXECUTE ON FUNCTION public.est_atender_requisicao(uuid, uuid, jsonb)
  FROM PUBLIC, anon;

REVOKE EXECUTE ON FUNCTION public.est_requisicoes_validar_workflow_card()
  FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.est_requisicoes_bloquear_status_direto()
  FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.est_requisicoes_bloquear_auditoria_direta()
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.est_requisicoes_bloquear_status_direto()
  TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.est_requisicoes_bloquear_auditoria_direta()
  TO authenticated, service_role;
