-- Fase 7: pré-título da nota confirmada e funis que só espelham o pedido.
-- Não cria título a pagar e não lê o card para decidir saldo, nota ou pré-título.

CREATE TABLE IF NOT EXISTS public.com_pre_titulos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas (id) ON DELETE CASCADE,
  nota_id uuid NOT NULL REFERENCES public.com_notas (id) ON DELETE RESTRICT,
  pedido_id uuid NOT NULL REFERENCES public.com_pedidos (id) ON DELETE RESTRICT,
  fornecedor_id uuid NOT NULL REFERENCES public.crm_leads (id) ON DELETE RESTRICT,
  numero text NOT NULL,
  tipo text NOT NULL,
  valor numeric(14, 2) NOT NULL DEFAULT 0,
  vencimento date,
  status text NOT NULL DEFAULT 'aguardando_ap',
  dispensado_em timestamptz,
  dispensado_usuario_id uuid NULL REFERENCES public.usuarios (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT com_pre_titulos_status_check CHECK (status IN ('aguardando_ap', 'gerado', 'dispensado')),
  CONSTRAINT com_pre_titulos_nota_uq UNIQUE (nota_id),
  CONSTRAINT com_pre_titulos_empresa_numero_uq UNIQUE (empresa_id, numero)
);

CREATE INDEX IF NOT EXISTS com_pre_titulos_empresa_status_idx
  ON public.com_pre_titulos (empresa_id, status, vencimento);

COMMENT ON TABLE public.com_pre_titulos IS
  'Pré-título da nota confirmada. Não é título a pagar. Status gerado fica para o contas a pagar futuro.';

ALTER TABLE public.com_pedidos
  ADD COLUMN IF NOT EXISTS card_aprovacao_id uuid NULL REFERENCES public.crm_cards (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS card_recebimento_id uuid NULL REFERENCES public.crm_cards (id) ON DELETE SET NULL;

ALTER TABLE public.com_pre_titulos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS com_pre_titulos_select ON public.com_pre_titulos;
CREATE POLICY com_pre_titulos_select ON public.com_pre_titulos
FOR SELECT TO authenticated
USING (
  empresa_id = public.current_user_empresa_id()
  AND (
    public.current_user_is_superadmin()
    OR public.check_permission('compras_exportacao', 'view')
    OR public.check_permission('compras_notas', 'view')
  )
);

DROP POLICY IF EXISTS com_pre_titulos_update ON public.com_pre_titulos;
CREATE POLICY com_pre_titulos_update ON public.com_pre_titulos
FOR UPDATE TO authenticated
USING (
  empresa_id = public.current_user_empresa_id()
  AND status = 'aguardando_ap'
  AND (
    public.current_user_is_superadmin()
    OR public.check_permission('compras_exportacao', 'edit')
  )
)
WITH CHECK (
  empresa_id = public.current_user_empresa_id()
  AND status IN ('aguardando_ap', 'dispensado')
);

GRANT SELECT, UPDATE ON public.com_pre_titulos TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.com_garantir_funil_compras(
  p_empresa uuid,
  p_chave text,
  p_nome text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id
  FROM public.pipelines
  WHERE empresa_id = p_empresa AND descricao = p_chave
  LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO public.pipelines (empresa_id, nome, descricao, ativo)
    VALUES (p_empresa, p_nome, p_chave, true)
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.com_garantir_etapa_compras(
  p_pipeline uuid,
  p_nome text,
  p_ordem integer,
  p_cor text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id
  FROM public.pipeline_stages
  WHERE pipeline_id = p_pipeline AND nome = p_nome
  LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO public.pipeline_stages (pipeline_id, nome, ordem, cor)
    VALUES (p_pipeline, p_nome, p_ordem, p_cor)
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.com_liberar_funil_grupos(p_empresa uuid, p_pipeline uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.pipeline_grupo_acesso (pipeline_id, grupo_id)
  SELECT p_pipeline, g.id
  FROM public.grupos_acesso g
  WHERE g.empresa_id = p_empresa
    AND NOT EXISTS (
      SELECT 1 FROM public.pipeline_grupo_acesso a
      WHERE a.pipeline_id = p_pipeline AND a.grupo_id = g.id
    );

  INSERT INTO public.pipeline_stage_grupo_acesso (stage_id, grupo_id)
  SELECT s.id, g.id
  FROM public.pipeline_stages s
  JOIN public.grupos_acesso g ON g.empresa_id = p_empresa
  WHERE s.pipeline_id = p_pipeline
    AND NOT EXISTS (
      SELECT 1 FROM public.pipeline_stage_grupo_acesso a
      WHERE a.stage_id = s.id AND a.grupo_id = g.id
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.com_espelhar_funil_pedido(p_pedido_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa uuid;
  v_numero text;
  v_status text;
  v_valor numeric;
  v_fornecedor uuid;
  v_fornecedor_nome text;
  v_funil uuid;
  v_etapa text;
  v_stage uuid;
  v_card uuid;
  v_divergente boolean;
BEGIN
  SELECT empresa_id, numero, status, valor_total, fornecedor_id
    INTO v_empresa, v_numero, v_status, v_valor, v_fornecedor
  FROM public.com_pedidos
  WHERE id = p_pedido_id;

  IF v_empresa IS NULL THEN
    RETURN;
  END IF;
  IF v_empresa IS DISTINCT FROM public.current_user_empresa_id()
     AND NOT public.current_user_is_superadmin() THEN
    RETURN;
  END IF;

  SELECT nome INTO v_fornecedor_nome
  FROM public.crm_leads
  WHERE id = v_fornecedor AND empresa_id = v_empresa;

  v_funil := public.com_garantir_funil_compras(v_empresa, 'hugin:compras:aprovacao', 'Compras — Aprovação');
  PERFORM public.com_garantir_etapa_compras(v_funil, 'Aguardando', 1, '#f59e0b');
  PERFORM public.com_garantir_etapa_compras(v_funil, 'Aprovada', 2, '#22c55e');
  PERFORM public.com_garantir_etapa_compras(v_funil, 'Recusada', 3, '#ef4444');
  PERFORM public.com_liberar_funil_grupos(v_empresa, v_funil);

  v_etapa := CASE v_status
    WHEN 'aguardando_aprovacao' THEN 'Aguardando'
    WHEN 'recusado' THEN 'Recusada'
    WHEN 'aprovado' THEN 'Aprovada'
    WHEN 'recebido_parcial' THEN 'Aprovada'
    WHEN 'recebido' THEN 'Aprovada'
    ELSE NULL
  END;

  SELECT card_aprovacao_id INTO v_card FROM public.com_pedidos WHERE id = p_pedido_id;
  IF v_etapa IS NOT NULL THEN
    SELECT id INTO v_stage FROM public.pipeline_stages
    WHERE pipeline_id = v_funil AND nome = v_etapa LIMIT 1;
    IF v_card IS NULL THEN
      INSERT INTO public.crm_cards (
        empresa_id, pipeline_id, stage_id, titulo, descricao, valor, lead_id, cliente_nome, finalizado, metadados
      ) VALUES (
        v_empresa, v_funil, v_stage,
        'Pedido ' || v_numero,
        'Espelho do pedido. Arrastar este card não altera o documento.',
        COALESCE(v_valor, 0), v_fornecedor, v_fornecedor_nome, false,
        jsonb_build_object('origem', 'compras', 'pedido_id', p_pedido_id, 'espelho', 'aprovacao')
      )
      RETURNING id INTO v_card;
      UPDATE public.com_pedidos SET card_aprovacao_id = v_card WHERE id = p_pedido_id AND empresa_id = v_empresa;
    ELSE
      UPDATE public.crm_cards
      SET stage_id = v_stage,
          titulo = 'Pedido ' || v_numero,
          valor = COALESCE(v_valor, 0),
          cliente_nome = v_fornecedor_nome,
          lead_id = v_fornecedor,
          finalizado = false,
          updated_at = now(),
          stage_entered_at = CASE WHEN stage_id IS DISTINCT FROM v_stage THEN now() ELSE stage_entered_at END
      WHERE id = v_card AND empresa_id = v_empresa;
    END IF;
  ELSIF v_card IS NOT NULL THEN
    UPDATE public.crm_cards
    SET finalizado = true, updated_at = now()
    WHERE id = v_card AND empresa_id = v_empresa;
  END IF;

  v_funil := public.com_garantir_funil_compras(v_empresa, 'hugin:compras:recebimento', 'Compras — Recebimento');
  PERFORM public.com_garantir_etapa_compras(v_funil, 'A chegar', 1, '#2BAADF');
  PERFORM public.com_garantir_etapa_compras(v_funil, 'Em conferência', 2, '#a78bfa');
  PERFORM public.com_garantir_etapa_compras(v_funil, 'Divergente', 3, '#f59e0b');
  PERFORM public.com_garantir_etapa_compras(v_funil, 'Conferido', 4, '#22c55e');
  PERFORM public.com_liberar_funil_grupos(v_empresa, v_funil);

  SELECT EXISTS (
    SELECT 1
    FROM public.com_recebimento_itens ri
    JOIN public.com_pedido_itens pi ON pi.id = ri.pedido_item_id AND pi.empresa_id = v_empresa
    WHERE pi.pedido_id = p_pedido_id
      AND ri.empresa_id = v_empresa
      AND (COALESCE(ri.divergencia_quantidade, 0) <> 0 OR COALESCE(ri.divergencia_preco, 0) <> 0)
  ) INTO v_divergente;

  v_etapa := CASE
    WHEN v_status = 'aprovado' THEN 'A chegar'
    WHEN v_status IN ('recebido_parcial', 'recebido') AND v_divergente THEN 'Divergente'
    WHEN v_status = 'recebido_parcial' THEN 'Em conferência'
    WHEN v_status = 'recebido' THEN 'Conferido'
    ELSE NULL
  END;
  SELECT card_recebimento_id INTO v_card FROM public.com_pedidos WHERE id = p_pedido_id;
  IF v_etapa IS NOT NULL THEN
    SELECT id INTO v_stage FROM public.pipeline_stages
    WHERE pipeline_id = v_funil AND nome = v_etapa LIMIT 1;
    IF v_card IS NULL THEN
      INSERT INTO public.crm_cards (
        empresa_id, pipeline_id, stage_id, titulo, descricao, valor, lead_id, cliente_nome, finalizado, metadados
      ) VALUES (
        v_empresa, v_funil, v_stage,
        'Recebimento ' || v_numero,
        'Espelho do recebimento. Arrastar este card não altera o pedido.',
        COALESCE(v_valor, 0), v_fornecedor, v_fornecedor_nome, false,
        jsonb_build_object('origem', 'compras', 'pedido_id', p_pedido_id, 'espelho', 'recebimento')
      )
      RETURNING id INTO v_card;
      UPDATE public.com_pedidos SET card_recebimento_id = v_card WHERE id = p_pedido_id AND empresa_id = v_empresa;
    ELSE
      UPDATE public.crm_cards
      SET stage_id = v_stage,
          titulo = 'Recebimento ' || v_numero,
          valor = COALESCE(v_valor, 0),
          cliente_nome = v_fornecedor_nome,
          lead_id = v_fornecedor,
          finalizado = false,
          updated_at = now(),
          stage_entered_at = CASE WHEN stage_id IS DISTINCT FROM v_stage THEN now() ELSE stage_entered_at END
      WHERE id = v_card AND empresa_id = v_empresa;
    END IF;
  ELSIF v_card IS NOT NULL THEN
    UPDATE public.crm_cards
    SET finalizado = true, updated_at = now()
    WHERE id = v_card AND empresa_id = v_empresa;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.com_gravar_pre_titulo(p_nota_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa uuid;
  v_nota record;
  v_tipo text;
  v_numero text;
  v_prefixo text;
  v_seq integer;
  v_id uuid;
BEGIN
  IF NOT (
    public.current_user_is_superadmin()
    OR public.check_permission('compras_notas', 'edit')
    OR public.check_permission('compras_exportacao', 'view')
  ) THEN
    RAISE EXCEPTION 'Sem permissão para gravar o pré-título.';
  END IF;

  SELECT id INTO v_id FROM public.com_pre_titulos WHERE nota_id = p_nota_id;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  SELECT n.empresa_id, n.pedido_id, n.fornecedor_id, n.valor_total, n.vencimento, n.status
    INTO v_nota
  FROM public.com_notas n
  WHERE n.id = p_nota_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nota não encontrada.';
  END IF;
  v_empresa := public.current_user_empresa_id();
  IF v_nota.empresa_id IS DISTINCT FROM v_empresa AND NOT public.current_user_is_superadmin() THEN
    RAISE EXCEPTION 'Nota de outra empresa.';
  END IF;
  v_empresa := v_nota.empresa_id;
  IF v_nota.status IS DISTINCT FROM 'confirmada' THEN
    RAISE EXCEPTION 'Só a nota confirmada gera pré-título.';
  END IF;

  SELECT tipo INTO v_tipo FROM public.com_pedidos
  WHERE id = v_nota.pedido_id AND empresa_id = v_empresa;

  v_prefixo := 'PT-' || to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYYMMDD') || '-';
  SELECT count(*) + 1 INTO v_seq
  FROM public.com_pre_titulos
  WHERE empresa_id = v_empresa AND numero LIKE v_prefixo || '%';
  v_numero := v_prefixo || lpad(v_seq::text, 4, '0');

  INSERT INTO public.com_pre_titulos (
    empresa_id, nota_id, pedido_id, fornecedor_id, numero, tipo, valor, vencimento, status
  ) VALUES (
    v_empresa, p_nota_id, v_nota.pedido_id, v_nota.fornecedor_id, v_numero,
    COALESCE(v_tipo, 'produtivo'), COALESCE(v_nota.valor_total, 0), v_nota.vencimento, 'aguardando_ap'
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.com_gravar_pre_titulos_pendentes(p_limite integer DEFAULT 100)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa uuid;
  v_nota uuid;
  v_qtd integer := 0;
BEGIN
  IF NOT (
    public.current_user_is_superadmin()
    OR public.check_permission('compras_exportacao', 'view')
    OR public.check_permission('compras_notas', 'edit')
  ) THEN
    RAISE EXCEPTION 'Sem permissão.';
  END IF;
  v_empresa := public.current_user_empresa_id();
  IF v_empresa IS NULL THEN
    RETURN 0;
  END IF;
  FOR v_nota IN
    SELECT n.id
    FROM public.com_notas n
    WHERE n.empresa_id = v_empresa
      AND n.status = 'confirmada'
      AND NOT EXISTS (SELECT 1 FROM public.com_pre_titulos p WHERE p.nota_id = n.id)
    ORDER BY n.confirmada_em NULLS LAST
    LIMIT GREATEST(1, LEAST(COALESCE(p_limite, 100), 200))
  LOOP
    PERFORM public.com_gravar_pre_titulo(v_nota);
    v_qtd := v_qtd + 1;
  END LOOP;
  RETURN v_qtd;
END;
$$;

REVOKE ALL ON FUNCTION public.com_garantir_funil_compras(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.com_garantir_etapa_compras(uuid, text, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.com_liberar_funil_grupos(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.com_espelhar_funil_pedido(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.com_gravar_pre_titulo(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.com_gravar_pre_titulos_pendentes(integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.com_espelhar_funil_pedido(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.com_gravar_pre_titulo(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.com_gravar_pre_titulos_pendentes(integer) TO authenticated, service_role;
