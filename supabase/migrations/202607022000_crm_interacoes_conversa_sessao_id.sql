-- crm_interacoes.conversa_id armazena sessao_id (thread), não crm_conversas.id
ALTER TABLE public.crm_interacoes
  DROP CONSTRAINT IF EXISTS crm_interacoes_conversa_id_fkey;

COMMENT ON COLUMN public.crm_interacoes.conversa_id IS
  'ID do thread (crm_conversas.sessao_id). Sem FK — várias linhas compartilham o mesmo sessao_id.';
