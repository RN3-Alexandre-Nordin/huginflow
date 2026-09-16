-- Famílias de SKU (agrupamento comercial/operacional por tenant)

CREATE TABLE IF NOT EXISTS public.cad_sku_familias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas (id) ON DELETE CASCADE,
  codigo text NOT NULL,
  nome text NOT NULL,
  descricao text,
  ordem integer NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cad_sku_familias_empresa_codigo_uq UNIQUE (empresa_id, codigo)
);

COMMENT ON TABLE public.cad_sku_familias IS
  'Famílias/categorias de SKU por empresa (ex.: Cervejas, Destilados). Usado em filtros e relatórios.';

CREATE INDEX IF NOT EXISTS idx_cad_sku_familias_empresa_ativo
  ON public.cad_sku_familias (empresa_id, ativo);

ALTER TABLE public.cad_skus
  ADD COLUMN IF NOT EXISTS familia_id uuid REFERENCES public.cad_sku_familias (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cad_skus_empresa_familia
  ON public.cad_skus (empresa_id, familia_id);

COMMENT ON COLUMN public.cad_skus.familia_id IS
  'Família do SKU (cad_sku_familias). Opcional.';

ALTER TABLE public.cad_sku_familias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cad_sku_familias_select ON public.cad_sku_familias;
CREATE POLICY cad_sku_familias_select ON public.cad_sku_familias
FOR SELECT TO authenticated
USING (
  public.check_permission('skus', 'view')
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = cad_sku_familias.empresa_id)
  )
);

DROP POLICY IF EXISTS cad_sku_familias_insert ON public.cad_sku_familias;
CREATE POLICY cad_sku_familias_insert ON public.cad_sku_familias
FOR INSERT TO authenticated
WITH CHECK (
  public.check_permission('skus', 'create')
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = cad_sku_familias.empresa_id)
  )
);

DROP POLICY IF EXISTS cad_sku_familias_update ON public.cad_sku_familias;
CREATE POLICY cad_sku_familias_update ON public.cad_sku_familias
FOR UPDATE TO authenticated
USING (
  public.check_permission('skus', 'edit')
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = cad_sku_familias.empresa_id)
  )
)
WITH CHECK (
  public.check_permission('skus', 'edit')
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = cad_sku_familias.empresa_id)
  )
);

DROP POLICY IF EXISTS cad_sku_familias_delete ON public.cad_sku_familias;
CREATE POLICY cad_sku_familias_delete ON public.cad_sku_familias
FOR DELETE TO authenticated
USING (
  public.check_permission('skus', 'delete')
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = cad_sku_familias.empresa_id)
  )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cad_sku_familias TO authenticated;
