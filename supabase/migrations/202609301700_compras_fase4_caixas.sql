-- Fase 4: conferência por caixa. Desligada por padrão. Número cancelado não reabre.

ALTER TABLE public.com_config
  ADD COLUMN IF NOT EXISTS recebimento_por_caixa boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS caixa_proximo integer NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.com_config.recebimento_por_caixa IS
  'Se verdadeiro, a conferência do pedido é por caixa. Desligado, a fase não aparece.';

COMMENT ON COLUMN public.com_config.caixa_proximo IS
  'Próximo número de caixa. Só sobe. Cancelar uma caixa não devolve o número.';

CREATE TABLE IF NOT EXISTS public.com_caixas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas (id) ON DELETE CASCADE,
  pedido_id uuid NOT NULL REFERENCES public.com_pedidos (id) ON DELETE CASCADE,
  numero integer NOT NULL CHECK (numero > 0),
  codigo text NOT NULL,
  status text NOT NULL DEFAULT 'aberta'
    CHECK (status IN ('aberta', 'lida', 'cancelada')),
  recebimento_id uuid NULL REFERENCES public.com_recebimentos (id) ON DELETE SET NULL,
  criado_usuario_id uuid NULL REFERENCES public.usuarios (id) ON DELETE SET NULL,
  lida_em timestamptz NULL,
  cancelada_em timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT com_caixas_empresa_numero_uq UNIQUE (empresa_id, numero),
  CONSTRAINT com_caixas_empresa_codigo_uq UNIQUE (empresa_id, codigo)
);

CREATE INDEX IF NOT EXISTS idx_com_caixas_pedido
  ON public.com_caixas (empresa_id, pedido_id, numero);

CREATE TABLE IF NOT EXISTS public.com_caixa_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas (id) ON DELETE CASCADE,
  caixa_id uuid NOT NULL REFERENCES public.com_caixas (id) ON DELETE CASCADE,
  pedido_item_id uuid NOT NULL REFERENCES public.com_pedido_itens (id) ON DELETE RESTRICT,
  quantidade numeric(14, 4) NOT NULL CHECK (quantidade > 0),
  divergencia text NULL
);

CREATE INDEX IF NOT EXISTS idx_com_caixa_itens_caixa
  ON public.com_caixa_itens (empresa_id, caixa_id);

ALTER TABLE public.com_caixas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.com_caixa_itens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS com_caixas_select ON public.com_caixas;
CREATE POLICY com_caixas_select ON public.com_caixas
FOR SELECT TO authenticated
USING (
  empresa_id = public.current_user_empresa_id()
  AND (
    public.current_user_is_superadmin()
    OR public.check_permission('compras_conferencia', 'view')
    OR public.check_permission('compras_pedidos', 'view')
  )
);

DROP POLICY IF EXISTS com_caixas_update ON public.com_caixas;
CREATE POLICY com_caixas_update ON public.com_caixas
FOR UPDATE TO authenticated
USING (
  empresa_id = public.current_user_empresa_id()
  AND (
    public.current_user_is_superadmin()
    OR public.check_permission('compras_conferencia', 'create')
    OR public.check_permission('compras_conferencia', 'edit')
  )
)
WITH CHECK (
  empresa_id = public.current_user_empresa_id()
);

DROP POLICY IF EXISTS com_caixa_itens_select ON public.com_caixa_itens;
CREATE POLICY com_caixa_itens_select ON public.com_caixa_itens
FOR SELECT TO authenticated
USING (
  empresa_id = public.current_user_empresa_id()
  AND (
    public.current_user_is_superadmin()
    OR public.check_permission('compras_conferencia', 'view')
    OR public.check_permission('compras_pedidos', 'view')
  )
);

DROP POLICY IF EXISTS com_caixa_itens_insert ON public.com_caixa_itens;
CREATE POLICY com_caixa_itens_insert ON public.com_caixa_itens
FOR INSERT TO authenticated
WITH CHECK (
  empresa_id = public.current_user_empresa_id()
  AND (
    public.current_user_is_superadmin()
    OR public.check_permission('compras_conferencia', 'create')
    OR public.check_permission('compras_conferencia', 'edit')
  )
);

GRANT SELECT, UPDATE ON public.com_caixas TO authenticated, service_role;
GRANT SELECT, INSERT ON public.com_caixa_itens TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.com_abrir_caixa(p_pedido uuid)
RETURNS public.com_caixas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa uuid;
  v_usuario uuid;
  v_status text;
  v_n integer;
  v_row public.com_caixas;
BEGIN
  v_empresa := public.current_user_empresa_id();
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Sessão sem empresa';
  END IF;
  IF NOT (
    public.current_user_is_superadmin()
    OR public.check_permission('compras_conferencia', 'create')
    OR public.check_permission('compras_conferencia', 'edit')
  ) THEN
    RAISE EXCEPTION 'Sem permissão para abrir caixa';
  END IF;

  SELECT status INTO v_status
  FROM public.com_pedidos
  WHERE id = p_pedido AND empresa_id = v_empresa;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Pedido não encontrado';
  END IF;
  IF v_status NOT IN ('aprovado', 'recebido_parcial') THEN
    RAISE EXCEPTION 'Pedido não está para conferência';
  END IF;

  UPDATE public.com_config
  SET caixa_proximo = caixa_proximo + 1
  WHERE empresa_id = v_empresa
    AND recebimento_por_caixa
  RETURNING caixa_proximo - 1 INTO v_n;

  IF v_n IS NULL THEN
    RAISE EXCEPTION 'Conferência por caixa está desligada';
  END IF;

  SELECT id INTO v_usuario
  FROM public.usuarios
  WHERE auth_user_id = auth.uid()
  LIMIT 1;

  INSERT INTO public.com_caixas (
    empresa_id, pedido_id, numero, codigo, status, criado_usuario_id
  ) VALUES (
    v_empresa,
    p_pedido,
    v_n,
    'CX-' || lpad(v_n::text, 6, '0'),
    'aberta',
    v_usuario
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.com_abrir_caixa(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.com_abrir_caixa(uuid) TO authenticated, service_role;
