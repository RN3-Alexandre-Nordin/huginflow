-- Hugin Flow prod — must_change_password + exceção Monte Sinai (treinamento)
-- Projeto: zmypzexefjbovuknjlid
-- SQL Editor: https://supabase.com/dashboard/project/zmypzexefjbovuknjlid/sql/new

ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.usuarios.must_change_password IS
  'Quando true, o usuário deve alterar a senha antes de acessar o cockpit.';

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('202608281200_usuarios_must_change_password', 'usuarios_must_change_password')
ON CONFLICT (version) DO NOTHING;

UPDATE public.usuarios
SET must_change_password = false
WHERE lower(email) IN (
  'vendedor@montesinaiatacado.com.br',
  'admin@montesinaiatacado.com.br',
  'logistica@montesinaiatacado.com.br',
  'financeiro@montesinaiatacado.com.br'
);
