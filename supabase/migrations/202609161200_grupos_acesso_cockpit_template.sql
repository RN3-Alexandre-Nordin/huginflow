-- Templates de cockpit prontos por grupo (PME: sem builder de KPI).
-- Valores: auto | atendente_omni | operador_estoque

ALTER TABLE public.grupos_acesso
  ADD COLUMN IF NOT EXISTS cockpit_template text NOT NULL DEFAULT 'auto';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'grupos_acesso_cockpit_template_check'
  ) THEN
    ALTER TABLE public.grupos_acesso
      ADD CONSTRAINT grupos_acesso_cockpit_template_check
      CHECK (cockpit_template IN ('auto', 'atendente_omni', 'operador_estoque'));
  END IF;
END $$;

COMMENT ON COLUMN public.grupos_acesso.cockpit_template IS
  'Template de home do cockpit: auto (resolve por addon/RBAC), atendente_omni, operador_estoque.';
