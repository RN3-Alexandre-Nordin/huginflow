-- ==============================================================================
-- Fix: est_registrar_movimento_atomico — decremento de saldo sem INSERT negativo
--
-- Causa: INSERT INTO est_saldos (... quantidade = -p_qtd ...) ON CONFLICT DO UPDATE
-- falha no CHECK (quantidade >= 0) ANTES do upsert, mesmo com linha existente.
-- Afeta: transferencia, saida, ajuste negativo, remessa_saida.
-- ==============================================================================

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

      -- UPDATE (não INSERT negativo): CHECK quantidade >= 0 é avaliado no INSERT antes do ON CONFLICT
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
      SELECT t.quantidade INTO v_saldo_terceiro
      FROM public.est_saldos_poder_terceiros t
      WHERE t.empresa_id = p_empresa_id
        AND t.pessoa_id = p_pessoa_id
        AND t.sku_id = p_sku_id
      FOR UPDATE;
      v_saldo_terceiro := COALESCE(v_saldo_terceiro, 0);

      IF v_saldo_terceiro < p_quantidade THEN
        RAISE EXCEPTION 'SALDO_TERCEIRO_INSUFICIENTE: Quantidade em poder do terceiro (%) é menor que o retorno de %.',
          v_saldo_terceiro, p_quantidade;
      END IF;

      UPDATE public.est_saldos_poder_terceiros
      SET quantidade = quantidade - p_quantidade,
          updated_at = now()
      WHERE empresa_id = p_empresa_id
        AND pessoa_id = p_pessoa_id
        AND sku_id = p_sku_id;

      INSERT INTO public.est_saldos (empresa_id, sku_id, local_id, quantidade, updated_at)
      VALUES (p_empresa_id, p_sku_id, p_local_id, p_quantidade, now())
      ON CONFLICT (empresa_id, sku_id, local_id)
      DO UPDATE SET
        quantidade = est_saldos.quantidade + EXCLUDED.quantidade,
        updated_at = now();
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
