-- Ativo: centro de custo = departamento (lista única enxuta).
-- Locais de estoque ficam para o módulo Estoque (não criar agora).

ALTER TABLE public.cad_ativos
  ADD COLUMN IF NOT EXISTS departamento_id uuid
    REFERENCES public.departamentos (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.cad_ativos.departamento_id IS
  'Centro de custo / área organizacional (= departamentos). Não renomear tabela departamentos.';

-- Remove texto livre (substituído pelo vínculo)
ALTER TABLE public.cad_ativos
  DROP COLUMN IF EXISTS centro_custo;

CREATE INDEX IF NOT EXISTS idx_cad_ativos_departamento
  ON public.cad_ativos (departamento_id)
  WHERE departamento_id IS NOT NULL;
