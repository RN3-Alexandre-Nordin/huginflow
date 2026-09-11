-- Conversões de UM: sku_id NULL = regra genérica da empresa; preenchido = específica do SKU.
-- Evita cadastrar ML→L = 1000 em todo item.

ALTER TABLE public.cad_sku_unidade_conversao
  ALTER COLUMN sku_id DROP NOT NULL;

ALTER TABLE public.cad_sku_unidade_conversao
  DROP CONSTRAINT IF EXISTS cad_sku_um_conv_par_uq;

-- Genérica: um par origem/destino por empresa
CREATE UNIQUE INDEX IF NOT EXISTS cad_sku_um_conv_generica_uq
  ON public.cad_sku_unidade_conversao (empresa_id, upper(unidade_origem), upper(unidade_destino))
  WHERE sku_id IS NULL;

-- Específica: um par por SKU
CREATE UNIQUE INDEX IF NOT EXISTS cad_sku_um_conv_especifica_uq
  ON public.cad_sku_unidade_conversao (empresa_id, sku_id, upper(unidade_origem), upper(unidade_destino))
  WHERE sku_id IS NOT NULL;

COMMENT ON COLUMN public.cad_sku_unidade_conversao.sku_id IS
  'NULL = conversão genérica da empresa (ex.: ML→L=1000). Preenchido = override do SKU.';

COMMENT ON TABLE public.cad_sku_unidade_conversao IS
  'Fator: 1 origem = fator × destino. Genérica (sku_id nulo) ou específica por SKU.';
