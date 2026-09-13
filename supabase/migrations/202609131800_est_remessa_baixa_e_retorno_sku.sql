-- Remessa: baixa definitiva + retorno com SKU diferente (industrialização)
-- 1) quantidade_baixada no item
-- 2) tipo remessa_baixa no Cardex
-- 3) sku_poder_id / quantidade_poder para retorno transformado
-- 4) RPC est_registrar_movimento_atomico + rebuild

ALTER TABLE public.est_remessa_itens
  ADD COLUMN IF NOT EXISTS quantidade_baixada numeric(18,4) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.est_remessa_itens.quantidade_baixada IS
  'Qtd liquidada sem retorno físico (consignação vendida, perda, etc.). em_poder = enviada - retornada - baixada.';

ALTER TABLE public.est_remessa_itens
  DROP CONSTRAINT IF EXISTS est_remessa_itens_baixada_check;

ALTER TABLE public.est_remessa_itens
  ADD CONSTRAINT est_remessa_itens_baixada_check
  CHECK (quantidade_baixada >= 0 AND quantidade_retornada + quantidade_baixada <= quantidade_enviada + 0.0001);

ALTER TABLE public.est_movimentos
  ADD COLUMN IF NOT EXISTS sku_poder_id uuid REFERENCES public.cad_skus (id) ON DELETE RESTRICT;

ALTER TABLE public.est_movimentos
  ADD COLUMN IF NOT EXISTS quantidade_poder numeric(18,4);

COMMENT ON COLUMN public.est_movimentos.sku_poder_id IS
  'SKU debitado em poder de terceiros quando distinto do sku_id (retorno industrializado).';
COMMENT ON COLUMN public.est_movimentos.quantidade_poder IS
  'Qtd debitada em poder de terceiros quando distinta de quantidade (retorno com transformação).';

ALTER TABLE public.est_movimentos DROP CONSTRAINT IF EXISTS est_movimentos_tipo_check;
ALTER TABLE public.est_movimentos
  ADD CONSTRAINT est_movimentos_tipo_check
  CHECK (tipo IN (
    'entrada', 'saida', 'transferencia', 'ajuste',
    'remessa_saida', 'remessa_retorno', 'remessa_baixa'
  ));

-- --------------------------------------------------------------------------
-- RPC movimento atômico
-- --------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.est_registrar_movimento_atomico(
  uuid, text, uuid, uuid, numeric, uuid, text, uuid, text,
  uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, uuid, boolean
);

CREATE OR REPLACE FUNCTION public.est_registrar_movimento_atomico(
  p_empresa_id uuid,
  p_tipo text,
  p_sku_id uuid,
  p_local_id uuid,
  p_quantidade numeric,
  p_local_destino_id uuid DEFAULT NULL,
  p_documento text DEFAULT NULL,
  p_pessoa_id uuid DEFAULT NULL,
  p_origem text DEFAULT NULL,
  p_lote_entrada_id uuid DEFAULT NULL,
  p_lote_retirada_id uuid DEFAULT NULL,
  p_lote_ajuste_id uuid DEFAULT NULL,
  p_lote_remessa_id uuid DEFAULT NULL,
  p_remessa_item_id uuid DEFAULT NULL,
  p_requisicao_id uuid DEFAULT NULL,
  p_ajuste_sinal text DEFAULT NULL,
  p_motivo_codigo text DEFAULT NULL,
  p_motivo text DEFAULT NULL,
  p_usuario_id uuid DEFAULT NULL,
  p_permitir_saldo_negativo boolean DEFAULT FALSE,
  p_sku_poder_id uuid DEFAULT NULL,
  p_quantidade_poder numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_auth_id uuid := auth.uid();
  v_usuario_resolved_id uuid := p_usuario_id;
  v_saldo_atual numeric := 0;
  v_saldo_terceiro numeric := 0;
  v_movimento_id uuid;
  v_sku_poder uuid;
  v_qtd_poder numeric;
BEGIN
  IF auth.role() = 'authenticated' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.auth_user_id = v_user_auth_id
        AND (u.role_global = 'superadmin' OR u.empresa_id = p_empresa_id)
        AND COALESCE(u.ativo, true)
    ) THEN
      RAISE EXCEPTION 'ACESSO_NEGADO: Usuário não tem permissão para operar no tenant informado.';
    END IF;

    IF v_usuario_resolved_id IS NULL THEN
      SELECT u.id INTO v_usuario_resolved_id
      FROM public.usuarios u
      WHERE u.auth_user_id = v_user_auth_id
      LIMIT 1;
    END IF;
  END IF;

  IF p_empresa_id IS NULL OR p_sku_id IS NULL THEN
    RAISE EXCEPTION 'PARAMETROS_OBRIGATORIOS: empresa_id e sku_id são obrigatórios.';
  END IF;

  -- remessa_baixa não altera saldo local, mas local_id continua NOT NULL no cardex (referência)
  IF p_tipo <> 'remessa_baixa' AND p_local_id IS NULL THEN
    RAISE EXCEPTION 'PARAMETROS_OBRIGATORIOS: local_id é obrigatório para o tipo %.', p_tipo;
  END IF;

  IF p_tipo = 'remessa_baixa' AND p_local_id IS NULL THEN
    RAISE EXCEPTION 'PARAMETROS_OBRIGATORIOS: remessa_baixa exige local_id de referência (origem do item).';
  END IF;

  IF p_quantidade IS NULL OR p_quantidade <= 0 THEN
    RAISE EXCEPTION 'QUANTIDADE_INVALIDA: A quantidade movimentada deve ser maior que zero (% informado).', p_quantidade;
  END IF;

  IF p_tipo NOT IN (
    'entrada', 'saida', 'transferencia', 'ajuste',
    'remessa_saida', 'remessa_retorno', 'remessa_baixa'
  ) THEN
    RAISE EXCEPTION 'TIPO_INVALIDO: Tipo de movimentação "%" é inválido.', p_tipo;
  END IF;

  IF p_tipo = 'transferencia' THEN
    IF p_local_destino_id IS NULL THEN
      RAISE EXCEPTION 'LOCAL_DESTINO_OBRIGATORIO: Transferência exige local_destino_id.';
    END IF;
    IF p_local_id = p_local_destino_id THEN
      RAISE EXCEPTION 'LOCAIS_IDENTICOS: Local de origem e destino da transferência devem ser diferentes.';
    END IF;
  END IF;

  IF p_tipo = 'ajuste' AND (p_ajuste_sinal IS NULL OR p_ajuste_sinal NOT IN ('positivo', 'negativo')) THEN
    RAISE EXCEPTION 'SINAL_AJUSTE_OBRIGATORIO: Ajuste de estoque exige sinal "positivo" ou "negativo".';
  END IF;

  IF p_tipo IN ('remessa_saida', 'remessa_retorno', 'remessa_baixa') AND p_pessoa_id IS NULL THEN
    RAISE EXCEPTION 'PESSOA_OBRIGATORIA: Remessa a terceiros exige identificação da pessoa/terceiro (pessoa_id).';
  END IF;

  v_sku_poder := COALESCE(p_sku_poder_id, p_sku_id);
  v_qtd_poder := COALESCE(p_quantidade_poder, p_quantidade);

  IF p_tipo = 'remessa_retorno' THEN
    IF v_qtd_poder IS NULL OR v_qtd_poder <= 0 THEN
      RAISE EXCEPTION 'QUANTIDADE_INVALIDA: quantidade_poder do retorno deve ser maior que zero.';
    END IF;
    -- Mesmo SKU: poder e entrada locais 1:1
    IF v_sku_poder = p_sku_id AND v_qtd_poder <> p_quantidade THEN
      RAISE EXCEPTION 'QUANTIDADE_INVALIDA: No retorno do mesmo SKU, quantidade e quantidade_poder devem ser iguais.';
    END IF;
  END IF;

  CASE p_tipo
    WHEN 'entrada' THEN
      INSERT INTO public.est_saldos (empresa_id, sku_id, local_id, quantidade, updated_at)
      VALUES (p_empresa_id, p_sku_id, p_local_id, p_quantidade, now())
      ON CONFLICT (empresa_id, sku_id, local_id)
      DO UPDATE SET
        quantidade = est_saldos.quantidade + EXCLUDED.quantidade,
        updated_at = now();

    WHEN 'saida' THEN
      SELECT s.quantidade INTO v_saldo_atual
      FROM public.est_saldos s
      WHERE s.empresa_id = p_empresa_id
        AND s.sku_id = p_sku_id
        AND s.local_id = p_local_id
      FOR UPDATE;
      v_saldo_atual := COALESCE(v_saldo_atual, 0);

      IF v_saldo_atual < p_quantidade AND NOT p_permitir_saldo_negativo THEN
        RAISE EXCEPTION 'SALDO_INSUFICIENTE: Saldo disponível (%) é insuficiente para saída de % no local informado.',
          v_saldo_atual, p_quantidade;
      END IF;

      UPDATE public.est_saldos
      SET quantidade = quantidade - p_quantidade,
          updated_at = now()
      WHERE empresa_id = p_empresa_id
        AND sku_id = p_sku_id
        AND local_id = p_local_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'SALDO_INSUFICIENTE: Não há posição de saldo no local informado para saída de %.',
          p_quantidade;
      END IF;

    WHEN 'ajuste' THEN
      IF p_ajuste_sinal = 'positivo' THEN
        INSERT INTO public.est_saldos (empresa_id, sku_id, local_id, quantidade, updated_at)
        VALUES (p_empresa_id, p_sku_id, p_local_id, p_quantidade, now())
        ON CONFLICT (empresa_id, sku_id, local_id)
        DO UPDATE SET
          quantidade = est_saldos.quantidade + EXCLUDED.quantidade,
          updated_at = now();
      ELSE
        SELECT s.quantidade INTO v_saldo_atual
        FROM public.est_saldos s
        WHERE s.empresa_id = p_empresa_id
          AND s.sku_id = p_sku_id
          AND s.local_id = p_local_id
        FOR UPDATE;
        v_saldo_atual := COALESCE(v_saldo_atual, 0);

        IF v_saldo_atual < p_quantidade AND NOT p_permitir_saldo_negativo THEN
          RAISE EXCEPTION 'SALDO_INSUFICIENTE: Saldo disponível (%) insuficiente para ajuste negativo de %.',
            v_saldo_atual, p_quantidade;
        END IF;

        UPDATE public.est_saldos
        SET quantidade = quantidade - p_quantidade,
            updated_at = now()
        WHERE empresa_id = p_empresa_id
          AND sku_id = p_sku_id
          AND local_id = p_local_id;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'SALDO_INSUFICIENTE: Não há posição de saldo no local informado para ajuste negativo de %.',
            p_quantidade;
        END IF;
      END IF;

    WHEN 'transferencia' THEN
      SELECT s.quantidade INTO v_saldo_atual
      FROM public.est_saldos s
      WHERE s.empresa_id = p_empresa_id
        AND s.sku_id = p_sku_id
        AND s.local_id = p_local_id
      FOR UPDATE;
      v_saldo_atual := COALESCE(v_saldo_atual, 0);

      IF v_saldo_atual < p_quantidade AND NOT p_permitir_saldo_negativo THEN
        RAISE EXCEPTION 'SALDO_INSUFICIENTE: Saldo de origem (%) insuficiente para transferir %.',
          v_saldo_atual, p_quantidade;
      END IF;

      UPDATE public.est_saldos
      SET quantidade = quantidade - p_quantidade,
          updated_at = now()
      WHERE empresa_id = p_empresa_id
        AND sku_id = p_sku_id
        AND local_id = p_local_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'SALDO_INSUFICIENTE: Não há posição de saldo na origem para transferir %.',
          p_quantidade;
      END IF;

      INSERT INTO public.est_saldos (empresa_id, sku_id, local_id, quantidade, updated_at)
      VALUES (p_empresa_id, p_sku_id, p_local_destino_id, p_quantidade, now())
      ON CONFLICT (empresa_id, sku_id, local_id)
      DO UPDATE SET
        quantidade = est_saldos.quantidade + EXCLUDED.quantidade,
        updated_at = now();

    WHEN 'remessa_saida' THEN
      SELECT s.quantidade INTO v_saldo_atual
      FROM public.est_saldos s
      WHERE s.empresa_id = p_empresa_id
        AND s.sku_id = p_sku_id
        AND s.local_id = p_local_id
      FOR UPDATE;
      v_saldo_atual := COALESCE(v_saldo_atual, 0);

      IF v_saldo_atual < p_quantidade AND NOT p_permitir_saldo_negativo THEN
        RAISE EXCEPTION 'SALDO_INSUFICIENTE: Saldo no local de origem (%) insuficiente para envio de remessa de %.',
          v_saldo_atual, p_quantidade;
      END IF;

      UPDATE public.est_saldos
      SET quantidade = quantidade - p_quantidade,
          updated_at = now()
      WHERE empresa_id = p_empresa_id
        AND sku_id = p_sku_id
        AND local_id = p_local_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'SALDO_INSUFICIENTE: Não há posição de saldo no local informado para remessa de %.',
          p_quantidade;
      END IF;

      INSERT INTO public.est_saldos_poder_terceiros (empresa_id, pessoa_id, sku_id, quantidade, updated_at)
      VALUES (p_empresa_id, p_pessoa_id, p_sku_id, p_quantidade, now())
      ON CONFLICT (empresa_id, pessoa_id, sku_id)
      DO UPDATE SET
        quantidade = est_saldos_poder_terceiros.quantidade + EXCLUDED.quantidade,
        updated_at = now();

    WHEN 'remessa_retorno' THEN
      -- Debita poder no SKU original (pode diferir do SKU que entra no local)
      SELECT t.quantidade INTO v_saldo_terceiro
      FROM public.est_saldos_poder_terceiros t
      WHERE t.empresa_id = p_empresa_id
        AND t.pessoa_id = p_pessoa_id
        AND t.sku_id = v_sku_poder
      FOR UPDATE;
      v_saldo_terceiro := COALESCE(v_saldo_terceiro, 0);

      IF v_saldo_terceiro < v_qtd_poder THEN
        RAISE EXCEPTION 'SALDO_TERCEIRO_INSUFICIENTE: Quantidade em poder do terceiro (%) é menor que o retorno de %.',
          v_saldo_terceiro, v_qtd_poder;
      END IF;

      UPDATE public.est_saldos_poder_terceiros
      SET quantidade = quantidade - v_qtd_poder,
          updated_at = now()
      WHERE empresa_id = p_empresa_id
        AND pessoa_id = p_pessoa_id
        AND sku_id = v_sku_poder;

      -- Credita local no SKU de volta (p_sku_id / p_quantidade)
      INSERT INTO public.est_saldos (empresa_id, sku_id, local_id, quantidade, updated_at)
      VALUES (p_empresa_id, p_sku_id, p_local_id, p_quantidade, now())
      ON CONFLICT (empresa_id, sku_id, local_id)
      DO UPDATE SET
        quantidade = est_saldos.quantidade + EXCLUDED.quantidade,
        updated_at = now();

    WHEN 'remessa_baixa' THEN
      -- Sai do poder de terceiros sem entrar no estoque próprio
      SELECT t.quantidade INTO v_saldo_terceiro
      FROM public.est_saldos_poder_terceiros t
      WHERE t.empresa_id = p_empresa_id
        AND t.pessoa_id = p_pessoa_id
        AND t.sku_id = p_sku_id
      FOR UPDATE;
      v_saldo_terceiro := COALESCE(v_saldo_terceiro, 0);

      IF v_saldo_terceiro < p_quantidade THEN
        RAISE EXCEPTION 'SALDO_TERCEIRO_INSUFICIENTE: Quantidade em poder do terceiro (%) é menor que a baixa de %.',
          v_saldo_terceiro, p_quantidade;
      END IF;

      UPDATE public.est_saldos_poder_terceiros
      SET quantidade = quantidade - p_quantidade,
          updated_at = now()
      WHERE empresa_id = p_empresa_id
        AND pessoa_id = p_pessoa_id
        AND sku_id = p_sku_id;
  END CASE;

  INSERT INTO public.est_movimentos (
    empresa_id,
    tipo,
    sku_id,
    local_id,
    local_destino_id,
    quantidade,
    documento,
    pessoa_id,
    origem,
    lote_entrada_id,
    lote_retirada_id,
    lote_ajuste_id,
    lote_remessa_id,
    remessa_item_id,
    requisicao_id,
    ajuste_sinal,
    motivo_codigo,
    motivo,
    usuario_id,
    movimento_em,
    sku_poder_id,
    quantidade_poder
  ) VALUES (
    p_empresa_id,
    p_tipo,
    p_sku_id,
    p_local_id,
    p_local_destino_id,
    p_quantidade,
    p_documento,
    p_pessoa_id,
    p_origem,
    p_lote_entrada_id,
    p_lote_retirada_id,
    p_lote_ajuste_id,
    p_lote_remessa_id,
    p_remessa_item_id,
    p_requisicao_id,
    p_ajuste_sinal,
    p_motivo_codigo,
    p_motivo,
    v_usuario_resolved_id,
    now(),
    CASE
      WHEN p_tipo = 'remessa_retorno' AND (v_sku_poder IS DISTINCT FROM p_sku_id OR v_qtd_poder IS DISTINCT FROM p_quantidade)
        THEN v_sku_poder
      ELSE NULL
    END,
    CASE
      WHEN p_tipo = 'remessa_retorno' AND (v_sku_poder IS DISTINCT FROM p_sku_id OR v_qtd_poder IS DISTINCT FROM p_quantidade)
        THEN v_qtd_poder
      ELSE NULL
    END
  )
  RETURNING id INTO v_movimento_id;

  RETURN jsonb_build_object(
    'success', true,
    'movimento_id', v_movimento_id,
    'empresa_id', p_empresa_id,
    'sku_id', p_sku_id,
    'sku_poder_id', v_sku_poder,
    'local_id', p_local_id,
    'local_destino_id', p_local_destino_id,
    'quantidade', p_quantidade,
    'quantidade_poder', v_qtd_poder,
    'tipo', p_tipo
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.est_registrar_movimento_atomico(
  uuid, text, uuid, uuid, numeric, uuid, text, uuid, text,
  uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, uuid, boolean,
  uuid, numeric
) TO authenticated, service_role;

-- --------------------------------------------------------------------------
-- Rebuild: remessa_baixa no poder; retorno transformado usa sku_poder_id
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.est_reconstruir_saldos_from_cardex(
  p_empresa_id uuid,
  p_sku_id uuid DEFAULT NULL,
  p_local_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_auth_id uuid := auth.uid();
  v_movimentos_count int := 0;
  v_saldos_inseridos int := 0;
  v_terceiros_inseridos int := 0;
BEGIN
  IF auth.role() = 'authenticated' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.auth_user_id = v_user_auth_id
        AND (u.role_global = 'superadmin' OR u.empresa_id = p_empresa_id)
        AND COALESCE(u.ativo, true)
    ) THEN
      RAISE EXCEPTION 'ACESSO_NEGADO: Usuário não tem permissão para operar no tenant informado.';
    END IF;

    IF NOT (
      public.check_permission('estoque_config', 'edit') OR
      public.check_permission('estoque', 'edit') OR
      public.check_permission('estoque_config', 'create') OR
      public.check_permission('estoque', 'create')
    ) THEN
      RAISE EXCEPTION 'ACESSO_NEGADO: Exige permissão de edição em estoque/configuração.';
    END IF;
  END IF;

  IF p_empresa_id IS NULL THEN
    RAISE EXCEPTION 'PARAMETRO_OBRIGATORIO: empresa_id é obrigatório para reconstrução de saldos.';
  END IF;

  SELECT COUNT(*) INTO v_movimentos_count
  FROM public.est_movimentos
  WHERE empresa_id = p_empresa_id
    AND (p_sku_id IS NULL OR sku_id = p_sku_id OR sku_poder_id = p_sku_id)
    AND (p_local_id IS NULL OR local_id = p_local_id OR local_destino_id = p_local_id);

  DELETE FROM public.est_saldos
  WHERE empresa_id = p_empresa_id
    AND (p_sku_id IS NULL OR sku_id = p_sku_id)
    AND (p_local_id IS NULL OR local_id = p_local_id);

  IF p_local_id IS NULL THEN
    DELETE FROM public.est_saldos_poder_terceiros
    WHERE empresa_id = p_empresa_id
      AND (p_sku_id IS NULL OR sku_id = p_sku_id);
  END IF;

  WITH deltas AS (
    SELECT
      m.empresa_id,
      m.sku_id,
      m.local_id,
      SUM(
        CASE
          WHEN m.tipo IN ('entrada', 'remessa_retorno') THEN m.quantidade
          WHEN m.tipo = 'ajuste' AND m.ajuste_sinal = 'positivo' THEN m.quantidade
          WHEN m.tipo IN ('saida', 'remessa_saida') THEN -m.quantidade
          WHEN m.tipo = 'ajuste' AND m.ajuste_sinal = 'negativo' THEN -m.quantidade
          WHEN m.tipo = 'transferencia' THEN -m.quantidade
          ELSE 0
        END
      ) AS delta
    FROM public.est_movimentos m
    WHERE m.empresa_id = p_empresa_id
      AND (p_sku_id IS NULL OR m.sku_id = p_sku_id)
      AND (p_local_id IS NULL OR m.local_id = p_local_id)
    GROUP BY m.empresa_id, m.sku_id, m.local_id

    UNION ALL

    SELECT
      m.empresa_id,
      m.sku_id,
      m.local_destino_id AS local_id,
      SUM(m.quantidade) AS delta
    FROM public.est_movimentos m
    WHERE m.empresa_id = p_empresa_id
      AND m.tipo = 'transferencia'
      AND m.local_destino_id IS NOT NULL
      AND (p_sku_id IS NULL OR m.sku_id = p_sku_id)
      AND (p_local_id IS NULL OR m.local_destino_id = p_local_id)
    GROUP BY m.empresa_id, m.sku_id, m.local_destino_id
  ),
  totais AS (
    SELECT
      d.empresa_id,
      d.sku_id,
      d.local_id,
      SUM(d.delta) AS saldo_final
    FROM deltas d
    GROUP BY d.empresa_id, d.sku_id, d.local_id
  )
  INSERT INTO public.est_saldos (empresa_id, sku_id, local_id, quantidade, updated_at)
  SELECT
    t.empresa_id,
    t.sku_id,
    t.local_id,
    t.saldo_final,
    now()
  FROM totais t
  WHERE t.saldo_final <> 0;

  GET DIAGNOSTICS v_saldos_inseridos = ROW_COUNT;

  IF p_local_id IS NULL THEN
    WITH deltas_terceiros AS (
      SELECT
        m.empresa_id,
        m.pessoa_id,
        COALESCE(m.sku_poder_id, m.sku_id) AS sku_id,
        SUM(
          CASE
            WHEN m.tipo = 'remessa_saida' THEN m.quantidade
            WHEN m.tipo = 'remessa_retorno' THEN -COALESCE(m.quantidade_poder, m.quantidade)
            WHEN m.tipo = 'remessa_baixa' THEN -m.quantidade
            ELSE 0
          END
        ) AS saldo_terceiro_final
      FROM public.est_movimentos m
      WHERE m.empresa_id = p_empresa_id
        AND m.pessoa_id IS NOT NULL
        AND (
          p_sku_id IS NULL
          OR m.sku_id = p_sku_id
          OR m.sku_poder_id = p_sku_id
        )
      GROUP BY m.empresa_id, m.pessoa_id, COALESCE(m.sku_poder_id, m.sku_id)
    )
    INSERT INTO public.est_saldos_poder_terceiros (empresa_id, pessoa_id, sku_id, quantidade, updated_at)
    SELECT
      dt.empresa_id,
      dt.pessoa_id,
      dt.sku_id,
      dt.saldo_terceiro_final,
      now()
    FROM deltas_terceiros dt
    WHERE dt.saldo_terceiro_final <> 0;

    GET DIAGNOSTICS v_terceiros_inseridos = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'empresa_id', p_empresa_id,
    'movimentos', v_movimentos_count,
    'saldos', v_saldos_inseridos,
    'terceiros', v_terceiros_inseridos
  );
END;
$$;
