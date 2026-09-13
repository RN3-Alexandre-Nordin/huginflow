-- ==============================================================================
-- Migration: 202609121100_estoque_rpcs_movimento_e_batch.sql
-- Descrição: RPCs atômicas do Módulo Estoque
--   1. est_registrar_movimento_atomico: REGRA DE OURO (Cardex + Saldo na MESMA transação)
--   2. est_reconstruir_saldos_from_cardex: Batch de reconciliação a partir do Cardex
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. RPC: Registrar Movimento Atômico (Cardex + Atualização de Saldo)
-- ------------------------------------------------------------------------------
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
  p_permitir_saldo_negativo boolean DEFAULT FALSE
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
BEGIN
  -- 1. Validação de segurança e tenant
  IF auth.role() = 'authenticated' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.auth_user_id = v_user_auth_id
        AND (u.role_global = 'superadmin' OR u.empresa_id = p_empresa_id)
        AND COALESCE(u.ativo, true)
    ) THEN
      RAISE EXCEPTION 'ACESSO_NEGADO: Usuário não tem permissão para operar no tenant informado.';
    END IF;

    -- Se usuario_id não veio explicitamente, resolve do auth_user_id
    IF v_usuario_resolved_id IS NULL THEN
      SELECT u.id INTO v_usuario_resolved_id
      FROM public.usuarios u
      WHERE u.auth_user_id = v_user_auth_id
      LIMIT 1;
    END IF;
  END IF;

  -- 2. Validações de parâmetros
  IF p_empresa_id IS NULL OR p_sku_id IS NULL OR p_local_id IS NULL THEN
    RAISE EXCEPTION 'PARAMETROS_OBRIGATORIOS: empresa_id, sku_id e local_id são obrigatórios.';
  END IF;

  IF p_quantidade IS NULL OR p_quantidade <= 0 THEN
    RAISE EXCEPTION 'QUANTIDADE_INVALIDA: A quantidade movimentada deve ser maior que zero (% informado).', p_quantidade;
  END IF;

  IF p_tipo NOT IN ('entrada', 'saida', 'transferencia', 'ajuste', 'remessa_saida', 'remessa_retorno') THEN
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

  IF (p_tipo = 'remessa_saida' OR p_tipo = 'remessa_retorno') AND p_pessoa_id IS NULL THEN
    RAISE EXCEPTION 'PESSOA_OBRIGATORIA: Remessa a terceiros exige identificação da pessoa/terceiro (pessoa_id).';
  END IF;

  -- 3. Execução das mutações de saldo conforme o tipo de movimentação
  CASE p_tipo
    -- ENTRADA: aumenta o saldo no local de destino
    WHEN 'entrada' THEN
      INSERT INTO public.est_saldos (empresa_id, sku_id, local_id, quantidade, updated_at)
      VALUES (p_empresa_id, p_sku_id, p_local_id, p_quantidade, now())
      ON CONFLICT (empresa_id, sku_id, local_id)
      DO UPDATE SET
        quantidade = est_saldos.quantidade + EXCLUDED.quantidade,
        updated_at = now();

    -- SAÍDA (retirada manual ou atendimento de requisição): reduz do local_id
    -- UPDATE (não INSERT negativo): CHECK quantidade >= 0 é avaliado no INSERT antes do ON CONFLICT
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

    -- AJUSTE: positivo ou negativo
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

    -- TRANSFERÊNCIA: reduz da origem e aumenta no destino
    -- UPDATE na origem (não INSERT negativo): CHECK quantidade >= 0 é avaliado no INSERT antes do ON CONFLICT
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

      -- Adiciona no destino
      INSERT INTO public.est_saldos (empresa_id, sku_id, local_id, quantidade, updated_at)
      VALUES (p_empresa_id, p_sku_id, p_local_destino_id, p_quantidade, now())
      ON CONFLICT (empresa_id, sku_id, local_id)
      DO UPDATE SET
        quantidade = est_saldos.quantidade + EXCLUDED.quantidade,
        updated_at = now();

    -- REMESSA SAÍDA: sai do local físico da empresa e entra em poder do terceiro
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

      -- Adiciona no saldo em poder do terceiro
      INSERT INTO public.est_saldos_poder_terceiros (empresa_id, pessoa_id, sku_id, quantidade, updated_at)
      VALUES (p_empresa_id, p_pessoa_id, p_sku_id, p_quantidade, now())
      ON CONFLICT (empresa_id, pessoa_id, sku_id)
      DO UPDATE SET
        quantidade = est_saldos_poder_terceiros.quantidade + EXCLUDED.quantidade,
        updated_at = now();

    -- REMESSA RETORNO: sai do poder do terceiro e volta para o local físico da empresa
    WHEN 'remessa_retorno' THEN
      SELECT COALESCE(t.quantidade, 0) INTO v_saldo_terceiro
      FROM public.est_saldos_poder_terceiros t
      WHERE t.empresa_id = p_empresa_id
        AND t.pessoa_id = p_pessoa_id
        AND t.sku_id = p_sku_id
      FOR UPDATE;

      IF v_saldo_terceiro < p_quantidade THEN
        RAISE EXCEPTION 'SALDO_TERCEIRO_INSUFICIENTE: Quantidade em poder do terceiro (%) é menor que o retorno de %.',
          v_saldo_terceiro, p_quantidade;
      END IF;

      -- Subtrai de poder do terceiro
      UPDATE public.est_saldos_poder_terceiros
      SET quantidade = quantidade - p_quantidade,
          updated_at = now()
      WHERE empresa_id = p_empresa_id
        AND pessoa_id = p_pessoa_id
        AND sku_id = p_sku_id;

      -- Devolve ao local da empresa
      INSERT INTO public.est_saldos (empresa_id, sku_id, local_id, quantidade, updated_at)
      VALUES (p_empresa_id, p_sku_id, p_local_id, p_quantidade, now())
      ON CONFLICT (empresa_id, sku_id, local_id)
      DO UPDATE SET
        quantidade = est_saldos.quantidade + EXCLUDED.quantidade,
        updated_at = now();
  END CASE;

  -- 4. Gravação no Cardex (est_movimentos)
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
    movimento_em
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
    now()
  )
  RETURNING id INTO v_movimento_id;

  RETURN jsonb_build_object(
    'success', true,
    'movimento_id', v_movimento_id,
    'empresa_id', p_empresa_id,
    'sku_id', p_sku_id,
    'local_id', p_local_id,
    'local_destino_id', p_local_destino_id,
    'quantidade', p_quantidade,
    'tipo', p_tipo
  );
END;
$$;

REVOKE ALL ON FUNCTION public.est_registrar_movimento_atomico(
  uuid, text, uuid, uuid, numeric, uuid, text, uuid, text,
  uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, uuid, boolean
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.est_registrar_movimento_atomico(
  uuid, text, uuid, uuid, numeric, uuid, text, uuid, text,
  uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, uuid, boolean
) TO authenticated, service_role;


-- ------------------------------------------------------------------------------
-- 2. RPC: Reconstruir Saldos a partir do Cardex (Batch Atômico)
-- ------------------------------------------------------------------------------
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
  -- 1. Validação de segurança e tenant
  IF auth.role() = 'authenticated' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.auth_user_id = v_user_auth_id
        AND (u.role_global = 'superadmin' OR u.empresa_id = p_empresa_id)
        AND COALESCE(u.ativo, true)
    ) THEN
      RAISE EXCEPTION 'ACESSO_NEGADO: Usuário não tem permissão para operar no tenant informado.';
    END IF;

    -- Permissão de configuração / administração de estoque
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

  -- 2. Contar movimentos no escopo
  SELECT COUNT(*) INTO v_movimentos_count
  FROM public.est_movimentos
  WHERE empresa_id = p_empresa_id
    AND (p_sku_id IS NULL OR sku_id = p_sku_id)
    AND (p_local_id IS NULL OR local_id = p_local_id OR local_destino_id = p_local_id);

  -- 3. Limpar saldos atuais no escopo
  DELETE FROM public.est_saldos
  WHERE empresa_id = p_empresa_id
    AND (p_sku_id IS NULL OR sku_id = p_sku_id)
    AND (p_local_id IS NULL OR local_id = p_local_id);

  IF p_local_id IS NULL THEN
    DELETE FROM public.est_saldos_poder_terceiros
    WHERE empresa_id = p_empresa_id
      AND (p_sku_id IS NULL OR sku_id = p_sku_id);
  END IF;

  -- 4. Reconstruir est_saldos agregando do Cardex
  WITH deltas AS (
    -- Movimentações no local_id principal
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

    -- Entrada no destino em transferências
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

  -- 5. Reconstruir est_saldos_poder_terceiros se escopo não limitou local
  IF p_local_id IS NULL THEN
    WITH deltas_terceiros AS (
      SELECT
        m.empresa_id,
        m.pessoa_id,
        m.sku_id,
        SUM(
          CASE
            WHEN m.tipo = 'remessa_saida' THEN m.quantidade
            WHEN m.tipo = 'remessa_retorno' THEN -m.quantidade
            ELSE 0
          END
        ) AS saldo_terceiro_final
      FROM public.est_movimentos m
      WHERE m.empresa_id = p_empresa_id
        AND m.pessoa_id IS NOT NULL
        AND (p_sku_id IS NULL OR m.sku_id = p_sku_id)
      GROUP BY m.empresa_id, m.pessoa_id, m.sku_id
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
    'filtro_sku_id', p_sku_id,
    'filtro_local_id', p_local_id,
    'movimentos_processados', v_movimentos_count,
    'saldos_locais_registrados', v_saldos_inseridos,
    'saldos_terceiros_registrados', v_terceiros_inseridos,
    'reconstruido_em', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.est_reconstruir_saldos_from_cardex(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.est_reconstruir_saldos_from_cardex(uuid, uuid, uuid) TO authenticated, service_role;
