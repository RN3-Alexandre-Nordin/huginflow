-- Troca de senha obrigatória no primeiro acesso (ou após reset pelo admin)
ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.usuarios.must_change_password IS
  'Quando true, o usuário deve alterar a senha antes de acessar o cockpit.';
