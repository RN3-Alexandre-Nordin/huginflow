-- Excluir um usuário não pode ser barrado pelas interações que ele registrou.
-- O histórico fica, sem autor (user_id NULL). DEV já estava assim; PROD bloqueava a exclusão.

ALTER TABLE public.crm_interacoes
  DROP CONSTRAINT IF EXISTS crm_interacoes_user_id_fkey;

ALTER TABLE public.crm_interacoes
  ADD CONSTRAINT crm_interacoes_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.usuarios (id) ON DELETE SET NULL;
