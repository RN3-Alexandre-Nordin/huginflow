-- Percentual de discrepância do valor da nota contra o pedido.
-- Dentro do limite, a confirmação segue. Acima, a nota fica suspensa e o recebimento não entra.

ALTER TABLE public.com_config
  ADD COLUMN IF NOT EXISTS discrepancia_valor_pct numeric(6, 2) NULL,
  ADD COLUMN IF NOT EXISTS discrepancia_grupo_id uuid NULL REFERENCES public.grupos_acesso (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.com_config.discrepancia_valor_pct IS
  'Limite percentual da diferença entre o valor da nota e o valor do pedido. Nulo desliga a trava.';
COMMENT ON COLUMN public.com_config.discrepancia_grupo_id IS
  'Grupo que aprova a nota suspensa por discrepância de valor.';

ALTER TABLE public.com_notas
  ADD COLUMN IF NOT EXISTS discrepancia_pct numeric(8, 4) NULL,
  ADD COLUMN IF NOT EXISTS valor_pedido numeric(14, 2) NULL,
  ADD COLUMN IF NOT EXISTS suspensa_em timestamptz NULL;

COMMENT ON COLUMN public.com_notas.discrepancia_pct IS
  'Percentual apurado na suspensão. Nulo quando não houve base de comparação numérica.';
COMMENT ON COLUMN public.com_notas.valor_pedido IS
  'Soma quantidade da nota × preço do pedido, gravada na suspensão.';

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'com_notas'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.com_notas DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.com_notas
  ADD CONSTRAINT com_notas_status_check
  CHECK (status IN ('rascunho', 'suspensa', 'confirmada', 'cancelada'));

DROP POLICY IF EXISTS com_config_select ON public.com_config;
CREATE POLICY com_config_select ON public.com_config
FOR SELECT TO authenticated
USING (
  (
    public.check_permission('compras', 'view')
    OR public.check_permission('compras_config', 'view')
    OR public.check_permission('compras_notas', 'view')
    OR public.check_permission('compras_notas', 'create')
    OR public.check_permission('compras_notas', 'edit')
  )
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = com_config.empresa_id)
  )
);
