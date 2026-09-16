-- Remessa dual Cardex: próprio ↔ local TERCEIROS + poder analítico (pessoa + lote)
-- Tipos novos: remessa_entrada_terceiros, remessa_saida_terceiros
-- poder: remessa_id (lote) + pessoa

-- --------------------------------------------------------------------------
-- 1) Schema poder + tipos
-- --------------------------------------------------------------------------
ALTER TABLE public.est_saldos_poder_terceiros
  ADD COLUMN IF NOT EXISTS remessa_id uuid REFERENCES public.est_remessa_lotes (id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.est_saldos_poder_terceiros.remessa_id IS
  'Lote de remessa que originou a posição em poder do terceiro.';

-- Backfill remessa_id a partir do último envio
UPDATE public.est_saldos_poder_terceiros p
SET remessa_id = sub.lote_remessa_id
FROM (
  SELECT DISTINCT ON (m.empresa_id, m.pessoa_id, COALESCE(m.sku_poder_id, m.sku_id))
    m.empresa_id,
    m.pessoa_id,
    COALESCE(m.sku_poder_id, m.sku_id) AS sku_id,
    m.lote_remessa_id
  FROM public.est_movimentos m
  WHERE m.tipo = 'remessa_saida'
    AND m.lote_remessa_id IS NOT NULL
    AND m.pessoa_id IS NOT NULL
  ORDER BY m.empresa_id, m.pessoa_id, COALESCE(m.sku_poder_id, m.sku_id), m.created_at DESC
) sub
WHERE p.remessa_id IS NULL
  AND p.empresa_id = sub.empresa_id
  AND p.pessoa_id = sub.pessoa_id
  AND p.sku_id = sub.sku_id;

ALTER TABLE public.est_saldos_poder_terceiros
  DROP CONSTRAINT IF EXISTS est_saldos_terceiros_empresa_pessoa_sku_uq;

DELETE FROM public.est_saldos_poder_terceiros WHERE remessa_id IS NULL AND quantidade = 0;

-- Linhas órfãs sem remessa: tenta amarrar; se falhar, remove zeradas já feito
-- Mantém nullable só se ainda houver legado sem match (não deve após backfill)

CREATE UNIQUE INDEX IF NOT EXISTS uq_est_saldos_poder_empresa_pessoa_sku_remessa
  ON public.est_saldos_poder_terceiros (empresa_id, pessoa_id, sku_id, remessa_id);

CREATE INDEX IF NOT EXISTS idx_est_saldos_poder_remessa
  ON public.est_saldos_poder_terceiros (remessa_id);

ALTER TABLE public.est_movimentos DROP CONSTRAINT IF EXISTS est_movimentos_tipo_check;
ALTER TABLE public.est_movimentos
  ADD CONSTRAINT est_movimentos_tipo_check
  CHECK (tipo IN (
    'entrada', 'saida', 'transferencia', 'ajuste',
    'remessa_saida', 'remessa_entrada_terceiros', 'remessa_saida_terceiros',
    'remessa_retorno', 'remessa_baixa'
  ));

-- --------------------------------------------------------------------------
-- 2) RPC dual
-- --------------------------------------------------------------------------
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
  v_movimento_par_id uuid;
  v_sku_poder uuid;
  v_qtd_poder numeric;
  v_local_terceiros uuid;
  v_locais jsonb;
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

  IF p_local_id IS NULL THEN
    RAISE EXCEPTION 'PARAMETROS_OBRIGATORIOS: local_id é obrigatório para o tipo %.', p_tipo;
  END IF;

  IF p_quantidade IS NULL OR p_quantidade <= 0 THEN
    RAISE EXCEPTION 'QUANTIDADE_INVALIDA: A quantidade movimentada deve ser maior que zero (% informado).', p_quantidade;
  END IF;

  IF p_tipo NOT IN (
    'entrada', 'saida', 'transferencia', 'ajuste',
    'remessa_saida', 'remessa_entrada_terceiros', 'remessa_saida_terceiros',
    'remessa_retorno', 'remessa_baixa'
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

  IF p_tipo IN (
    'remessa_saida', 'remessa_entrada_terceiros', 'remessa_saida_terceiros',
    'remessa_retorno', 'remessa_baixa'
  ) AND p_pessoa_id IS NULL THEN
    RAISE EXCEPTION 'PESSOA_OBRIGATORIA: Remessa a terceiros exige pessoa_id.';
  END IF;

  IF p_tipo IN ('remessa_saida', 'remessa_retorno', 'remessa_baixa') AND p_lote_remessa_id IS NULL THEN
    RAISE EXCEPTION 'REMESSA_OBRIGATORIA: lote_remessa_id é obrigatório para %.', p_tipo;
  END IF;

  v_sku_poder := COALESCE(p_sku_poder_id, p_sku_id);
  v_qtd_poder := COALESCE(p_quantidade_poder, p_quantidade);

  IF p_tipo = 'remessa_retorno' THEN
    IF v_qtd_poder IS NULL OR v_qtd_poder <= 0 THEN
      RAISE EXCEPTION 'QUANTIDADE_INVALIDA: quantidade_poder do retorno deve ser maior que zero.';
    END IF;
  END IF;

  IF p_tipo IN ('remessa_saida', 'remessa_retorno', 'remessa_baixa') THEN
    v_locais := public.est_garantir_locais_padrao(p_empresa_id);
    v_local_terceiros := (v_locais->>'terceiros_id')::uuid;
    IF v_local_terceiros IS NULL THEN
      RAISE EXCEPTION 'LOCAL_TERCEIROS_AUSENTE: Não foi possível garantir o local TERCEIROS.';
    END IF;
  END IF;

  CASE p_tipo
    WHEN 'entrada' THEN
      INSERT INTO public.est_saldos (empresa_id, sku_id, local_id, quantidade, updated_at)
      VALUES (p_empresa_id, p_sku_id, p_local_id, p_quantidade, now())
      ON CONFLICT (empresa_id, sku_id, local_id)
      DO UPDATE SET quantidade = est_saldos.quantidade + EXCLUDED.quantidade, updated_at = now();

    WHEN 'saida' THEN
      SELECT s.quantidade INTO v_saldo_atual FROM public.est_saldos s
      WHERE s.empresa_id = p_empresa_id AND s.sku_id = p_sku_id AND s.local_id = p_local_id
      FOR UPDATE;
      v_saldo_atual := COALESCE(v_saldo_atual, 0);
      IF v_saldo_atual < p_quantidade AND NOT p_permitir_saldo_negativo THEN
        RAISE EXCEPTION 'SALDO_INSUFICIENTE: Saldo disponível (%) é insuficiente para saída de %.', v_saldo_atual, p_quantidade;
      END IF;
      UPDATE public.est_saldos SET quantidade = quantidade - p_quantidade, updated_at = now()
      WHERE empresa_id = p_empresa_id AND sku_id = p_sku_id AND local_id = p_local_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'SALDO_INSUFICIENTE: Não há posição de saldo no local informado para saída de %.', p_quantidade;
      END IF;

    WHEN 'ajuste' THEN
      IF p_ajuste_sinal = 'positivo' THEN
        INSERT INTO public.est_saldos (empresa_id, sku_id, local_id, quantidade, updated_at)
        VALUES (p_empresa_id, p_sku_id, p_local_id, p_quantidade, now())
        ON CONFLICT (empresa_id, sku_id, local_id)
        DO UPDATE SET quantidade = est_saldos.quantidade + EXCLUDED.quantidade, updated_at = now();
      ELSE
        SELECT s.quantidade INTO v_saldo_atual FROM public.est_saldos s
        WHERE s.empresa_id = p_empresa_id AND s.sku_id = p_sku_id AND s.local_id = p_local_id FOR UPDATE;
        v_saldo_atual := COALESCE(v_saldo_atual, 0);
        IF v_saldo_atual < p_quantidade AND NOT p_permitir_saldo_negativo THEN
          RAISE EXCEPTION 'SALDO_INSUFICIENTE: Saldo disponível (%) insuficiente para ajuste negativo de %.', v_saldo_atual, p_quantidade;
        END IF;
        UPDATE public.est_saldos SET quantidade = quantidade - p_quantidade, updated_at = now()
        WHERE empresa_id = p_empresa_id AND sku_id = p_sku_id AND local_id = p_local_id;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'SALDO_INSUFICIENTE: Não há posição de saldo no local informado para ajuste negativo de %.', p_quantidade;
        END IF;
      END IF;

    WHEN 'transferencia' THEN
      SELECT s.quantidade INTO v_saldo_atual FROM public.est_saldos s
      WHERE s.empresa_id = p_empresa_id AND s.sku_id = p_sku_id AND s.local_id = p_local_id FOR UPDATE;
      v_saldo_atual := COALESCE(v_saldo_atual, 0);
      IF v_saldo_atual < p_quantidade AND NOT p_permitir_saldo_negativo THEN
        RAISE EXCEPTION 'SALDO_INSUFICIENTE: Saldo de origem (%) insuficiente para transferir %.', v_saldo_atual, p_quantidade;
      END IF;
      UPDATE public.est_saldos SET quantidade = quantidade - p_quantidade, updated_at = now()
      WHERE empresa_id = p_empresa_id AND sku_id = p_sku_id AND local_id = p_local_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'SALDO_INSUFICIENTE: Não há posição de saldo na origem para transferir %.', p_quantidade;
      END IF;
      INSERT INTO public.est_saldos (empresa_id, sku_id, local_id, quantidade, updated_at)
      VALUES (p_empresa_id, p_sku_id, p_local_destino_id, p_quantidade, now())
      ON CONFLICT (empresa_id, sku_id, local_id)
      DO UPDATE SET quantidade = est_saldos.quantidade + EXCLUDED.quantidade, updated_at = now();

    WHEN 'remessa_saida' THEN
      -- 1) Sai do local próprio
      SELECT s.quantidade INTO v_saldo_atual FROM public.est_saldos s
      WHERE s.empresa_id = p_empresa_id AND s.sku_id = p_sku_id AND s.local_id = p_local_id FOR UPDATE;
      v_saldo_atual := COALESCE(v_saldo_atual, 0);
      IF v_saldo_atual < p_quantidade AND NOT p_permitir_saldo_negativo THEN
        RAISE EXCEPTION 'SALDO_INSUFICIENTE: Saldo no local de origem (%) insuficiente para envio de remessa de %.', v_saldo_atual, p_quantidade;
      END IF;
      UPDATE public.est_saldos SET quantidade = quantidade - p_quantidade, updated_at = now()
      WHERE empresa_id = p_empresa_id AND sku_id = p_sku_id AND local_id = p_local_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'SALDO_INSUFICIENTE: Não há posição de saldo no local informado para remessa de %.', p_quantidade;
      END IF;

      -- 2) Entra no local TERCEIROS
      INSERT INTO public.est_saldos (empresa_id, sku_id, local_id, quantidade, updated_at)
      VALUES (p_empresa_id, p_sku_id, v_local_terceiros, p_quantidade, now())
      ON CONFLICT (empresa_id, sku_id, local_id)
      DO UPDATE SET quantidade = est_saldos.quantidade + EXCLUDED.quantidade, updated_at = now();

      -- 3) Analítico: pessoa + lote
      INSERT INTO public.est_saldos_poder_terceiros (
        empresa_id, pessoa_id, sku_id, remessa_id, quantidade, updated_at
      ) VALUES (
        p_empresa_id, p_pessoa_id, p_sku_id, p_lote_remessa_id, p_quantidade, now()
      )
      ON CONFLICT (empresa_id, pessoa_id, sku_id, remessa_id)
      DO UPDATE SET
        quantidade = est_saldos_poder_terceiros.quantidade + EXCLUDED.quantidade,
        updated_at = now();

      INSERT INTO public.est_movimentos (
        empresa_id, tipo, sku_id, local_id, quantidade, documento, pessoa_id, origem,
        lote_remessa_id, remessa_item_id, motivo_codigo, motivo, usuario_id, movimento_em
      ) VALUES (
        p_empresa_id, 'remessa_saida', p_sku_id, p_local_id, p_quantidade, p_documento, p_pessoa_id, COALESCE(p_origem, 'remessa'),
        p_lote_remessa_id, p_remessa_item_id, p_motivo_codigo, p_motivo, v_usuario_resolved_id, now()
      ) RETURNING id INTO v_movimento_id;

      INSERT INTO public.est_movimentos (
        empresa_id, tipo, sku_id, local_id, quantidade, documento, pessoa_id, origem,
        lote_remessa_id, remessa_item_id, motivo_codigo, motivo, usuario_id, movimento_em
      ) VALUES (
        p_empresa_id, 'remessa_entrada_terceiros', p_sku_id, v_local_terceiros, p_quantidade, p_documento, p_pessoa_id, COALESCE(p_origem, 'remessa'),
        p_lote_remessa_id, p_remessa_item_id, p_motivo_codigo,
        COALESCE(p_motivo, 'Entrada em poder de terceiros'), v_usuario_resolved_id, now()
      ) RETURNING id INTO v_movimento_par_id;

      RETURN jsonb_build_object(
        'success', true, 'movimento_id', v_movimento_id, 'movimento_par_id', v_movimento_par_id,
        'empresa_id', p_empresa_id, 'sku_id', p_sku_id, 'local_id', p_local_id,
        'local_terceiros_id', v_local_terceiros, 'quantidade', p_quantidade, 'tipo', p_tipo
      );

    WHEN 'remessa_retorno' THEN
      -- Sai de TERCEIROS (SKU enviado / qtd poder)
      SELECT s.quantidade INTO v_saldo_atual FROM public.est_saldos s
      WHERE s.empresa_id = p_empresa_id AND s.sku_id = v_sku_poder AND s.local_id = v_local_terceiros
      FOR UPDATE;
      v_saldo_atual := COALESCE(v_saldo_atual, 0);
      IF v_saldo_atual < v_qtd_poder AND NOT p_permitir_saldo_negativo THEN
        RAISE EXCEPTION 'SALDO_INSUFICIENTE: Saldo em TERCEIROS (%) insuficiente para retorno de %.', v_saldo_atual, v_qtd_poder;
      END IF;
      UPDATE public.est_saldos SET quantidade = quantidade - v_qtd_poder, updated_at = now()
      WHERE empresa_id = p_empresa_id AND sku_id = v_sku_poder AND local_id = v_local_terceiros;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'SALDO_INSUFICIENTE: Sem posição em TERCEIROS para retorno de %.', v_qtd_poder;
      END IF;

      SELECT t.quantidade INTO v_saldo_terceiro FROM public.est_saldos_poder_terceiros t
      WHERE t.empresa_id = p_empresa_id AND t.pessoa_id = p_pessoa_id
        AND t.sku_id = v_sku_poder AND t.remessa_id = p_lote_remessa_id
      FOR UPDATE;
      v_saldo_terceiro := COALESCE(v_saldo_terceiro, 0);
      IF v_saldo_terceiro < v_qtd_poder THEN
        RAISE EXCEPTION 'SALDO_TERCEIRO_INSUFICIENTE: Poder do lote (%) < retorno %.', v_saldo_terceiro, v_qtd_poder;
      END IF;
      UPDATE public.est_saldos_poder_terceiros
      SET quantidade = quantidade - v_qtd_poder, updated_at = now()
      WHERE empresa_id = p_empresa_id AND pessoa_id = p_pessoa_id
        AND sku_id = v_sku_poder AND remessa_id = p_lote_remessa_id;

      -- Entra no local de destino (SKU que volta)
      INSERT INTO public.est_saldos (empresa_id, sku_id, local_id, quantidade, updated_at)
      VALUES (p_empresa_id, p_sku_id, p_local_id, p_quantidade, now())
      ON CONFLICT (empresa_id, sku_id, local_id)
      DO UPDATE SET quantidade = est_saldos.quantidade + EXCLUDED.quantidade, updated_at = now();

      INSERT INTO public.est_movimentos (
        empresa_id, tipo, sku_id, local_id, quantidade, documento, pessoa_id, origem,
        lote_remessa_id, remessa_item_id, motivo, usuario_id, movimento_em,
        sku_poder_id, quantidade_poder
      ) VALUES (
        p_empresa_id, 'remessa_saida_terceiros', v_sku_poder, v_local_terceiros, v_qtd_poder,
        p_documento, p_pessoa_id, COALESCE(p_origem, 'remessa'),
        p_lote_remessa_id, p_remessa_item_id,
        'Saída de TERCEIROS (retorno remessa)', v_usuario_resolved_id, now(),
        CASE WHEN v_sku_poder IS DISTINCT FROM p_sku_id THEN v_sku_poder ELSE NULL END,
        CASE WHEN v_qtd_poder IS DISTINCT FROM p_quantidade THEN v_qtd_poder ELSE NULL END
      ) RETURNING id INTO v_movimento_par_id;

      INSERT INTO public.est_movimentos (
        empresa_id, tipo, sku_id, local_id, quantidade, documento, pessoa_id, origem,
        lote_remessa_id, remessa_item_id, motivo, usuario_id, movimento_em,
        sku_poder_id, quantidade_poder
      ) VALUES (
        p_empresa_id, 'remessa_retorno', p_sku_id, p_local_id, p_quantidade,
        p_documento, p_pessoa_id, COALESCE(p_origem, 'remessa'),
        p_lote_remessa_id, p_remessa_item_id, p_motivo, v_usuario_resolved_id, now(),
        CASE WHEN v_sku_poder IS DISTINCT FROM p_sku_id OR v_qtd_poder IS DISTINCT FROM p_quantidade THEN v_sku_poder ELSE NULL END,
        CASE WHEN v_sku_poder IS DISTINCT FROM p_sku_id OR v_qtd_poder IS DISTINCT FROM p_quantidade THEN v_qtd_poder ELSE NULL END
      ) RETURNING id INTO v_movimento_id;

      RETURN jsonb_build_object(
        'success', true, 'movimento_id', v_movimento_id, 'movimento_par_id', v_movimento_par_id,
        'empresa_id', p_empresa_id, 'sku_id', p_sku_id, 'sku_poder_id', v_sku_poder,
        'local_id', p_local_id, 'local_terceiros_id', v_local_terceiros,
        'quantidade', p_quantidade, 'quantidade_poder', v_qtd_poder, 'tipo', p_tipo
      );

    WHEN 'remessa_baixa' THEN
      SELECT s.quantidade INTO v_saldo_atual FROM public.est_saldos s
      WHERE s.empresa_id = p_empresa_id AND s.sku_id = p_sku_id AND s.local_id = v_local_terceiros
      FOR UPDATE;
      v_saldo_atual := COALESCE(v_saldo_atual, 0);
      IF v_saldo_atual < p_quantidade AND NOT p_permitir_saldo_negativo THEN
        RAISE EXCEPTION 'SALDO_INSUFICIENTE: Saldo em TERCEIROS (%) insuficiente para baixa de %.', v_saldo_atual, p_quantidade;
      END IF;
      UPDATE public.est_saldos SET quantidade = quantidade - p_quantidade, updated_at = now()
      WHERE empresa_id = p_empresa_id AND sku_id = p_sku_id AND local_id = v_local_terceiros;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'SALDO_INSUFICIENTE: Sem posição em TERCEIROS para baixa de %.', p_quantidade;
      END IF;

      SELECT t.quantidade INTO v_saldo_terceiro FROM public.est_saldos_poder_terceiros t
      WHERE t.empresa_id = p_empresa_id AND t.pessoa_id = p_pessoa_id
        AND t.sku_id = p_sku_id AND t.remessa_id = p_lote_remessa_id
      FOR UPDATE;
      v_saldo_terceiro := COALESCE(v_saldo_terceiro, 0);
      IF v_saldo_terceiro < p_quantidade THEN
        RAISE EXCEPTION 'SALDO_TERCEIRO_INSUFICIENTE: Poder do lote (%) < baixa %.', v_saldo_terceiro, p_quantidade;
      END IF;
      UPDATE public.est_saldos_poder_terceiros
      SET quantidade = quantidade - p_quantidade, updated_at = now()
      WHERE empresa_id = p_empresa_id AND pessoa_id = p_pessoa_id
        AND sku_id = p_sku_id AND remessa_id = p_lote_remessa_id;

      INSERT INTO public.est_movimentos (
        empresa_id, tipo, sku_id, local_id, quantidade, documento, pessoa_id, origem,
        lote_remessa_id, remessa_item_id, motivo_codigo, motivo, usuario_id, movimento_em
      ) VALUES (
        p_empresa_id, 'remessa_baixa', p_sku_id, v_local_terceiros, p_quantidade,
        p_documento, p_pessoa_id, COALESCE(p_origem, 'remessa'),
        p_lote_remessa_id, p_remessa_item_id, p_motivo_codigo, p_motivo, v_usuario_resolved_id, now()
      ) RETURNING id INTO v_movimento_id;

      RETURN jsonb_build_object(
        'success', true, 'movimento_id', v_movimento_id,
        'empresa_id', p_empresa_id, 'sku_id', p_sku_id,
        'local_id', v_local_terceiros, 'quantidade', p_quantidade, 'tipo', p_tipo
      );

    ELSE
      RAISE EXCEPTION 'TIPO_INVALIDO: %', p_tipo;
  END CASE;

  -- Tipos simples (entrada/saida/ajuste/transferencia) — 1 movimento
  INSERT INTO public.est_movimentos (
    empresa_id, tipo, sku_id, local_id, local_destino_id, quantidade, documento, pessoa_id, origem,
    lote_entrada_id, lote_retirada_id, lote_ajuste_id, lote_remessa_id, remessa_item_id, requisicao_id,
    ajuste_sinal, motivo_codigo, motivo, usuario_id, movimento_em
  ) VALUES (
    p_empresa_id, p_tipo, p_sku_id, p_local_id, p_local_destino_id, p_quantidade, p_documento, p_pessoa_id, p_origem,
    p_lote_entrada_id, p_lote_retirada_id, p_lote_ajuste_id, p_lote_remessa_id, p_remessa_item_id, p_requisicao_id,
    p_ajuste_sinal, p_motivo_codigo, p_motivo, v_usuario_resolved_id, now()
  ) RETURNING id INTO v_movimento_id;

  RETURN jsonb_build_object(
    'success', true, 'movimento_id', v_movimento_id,
    'empresa_id', p_empresa_id, 'sku_id', p_sku_id,
    'local_id', p_local_id, 'local_destino_id', p_local_destino_id,
    'quantidade', p_quantidade, 'tipo', p_tipo
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.est_registrar_movimento_atomico(
  uuid, text, uuid, uuid, numeric, uuid, text, uuid, text,
  uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, uuid, boolean,
  uuid, numeric
) TO authenticated, service_role;

-- --------------------------------------------------------------------------
-- 3) Rebuild a partir do Cardex (est_saldos + poder por lote)
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
  END IF;

  IF p_empresa_id IS NULL THEN
    RAISE EXCEPTION 'PARAMETRO_OBRIGATORIO: empresa_id é obrigatório para reconstrução de saldos.';
  END IF;

  PERFORM public.est_garantir_locais_padrao(p_empresa_id);

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
    SELECT m.empresa_id, m.sku_id, m.local_id,
      SUM(CASE
          WHEN m.tipo IN ('entrada', 'remessa_retorno', 'remessa_entrada_terceiros') THEN m.quantidade
          WHEN m.tipo = 'ajuste' AND m.ajuste_sinal = 'positivo' THEN m.quantidade
          WHEN m.tipo IN ('saida', 'remessa_saida', 'remessa_saida_terceiros', 'remessa_baixa') THEN -m.quantidade
          WHEN m.tipo = 'ajuste' AND m.ajuste_sinal = 'negativo' THEN -m.quantidade
          WHEN m.tipo = 'transferencia' THEN -m.quantidade
          ELSE 0 END) AS delta
    FROM public.est_movimentos m
    WHERE m.empresa_id = p_empresa_id
      AND (p_sku_id IS NULL OR m.sku_id = p_sku_id)
      AND (p_local_id IS NULL OR m.local_id = p_local_id)
    GROUP BY m.empresa_id, m.sku_id, m.local_id
    UNION ALL
    SELECT m.empresa_id, m.sku_id, m.local_destino_id AS local_id, SUM(m.quantidade) AS delta
    FROM public.est_movimentos m
    WHERE m.empresa_id = p_empresa_id AND m.tipo = 'transferencia' AND m.local_destino_id IS NOT NULL
      AND (p_sku_id IS NULL OR m.sku_id = p_sku_id)
      AND (p_local_id IS NULL OR m.local_destino_id = p_local_id)
    GROUP BY m.empresa_id, m.sku_id, m.local_destino_id
  ),
  totais AS (
    SELECT d.empresa_id, d.sku_id, d.local_id, SUM(d.delta) AS saldo_final
    FROM deltas d GROUP BY d.empresa_id, d.sku_id, d.local_id
  )
  INSERT INTO public.est_saldos (empresa_id, sku_id, local_id, quantidade, updated_at)
  SELECT t.empresa_id, t.sku_id, t.local_id, t.saldo_final, now()
  FROM totais t WHERE t.saldo_final <> 0 AND t.local_id IS NOT NULL;

  GET DIAGNOSTICS v_saldos_inseridos = ROW_COUNT;

  IF p_local_id IS NULL THEN
    WITH deltas_terceiros AS (
      SELECT m.empresa_id, m.pessoa_id, m.sku_id, m.lote_remessa_id AS remessa_id,
        SUM(CASE
            WHEN m.tipo = 'remessa_entrada_terceiros' THEN m.quantidade
            WHEN m.tipo IN ('remessa_saida_terceiros', 'remessa_baixa') THEN -m.quantidade
            -- legado pré-dual: remessa_saida sofria como +poder; remessa_retorno como -poder
            WHEN m.tipo = 'remessa_saida' AND NOT EXISTS (
              SELECT 1 FROM public.est_movimentos x
              WHERE x.lote_remessa_id = m.lote_remessa_id AND x.remessa_item_id IS NOT DISTINCT FROM m.remessa_item_id
                AND x.tipo = 'remessa_entrada_terceiros'
            ) THEN m.quantidade
            WHEN m.tipo = 'remessa_retorno' AND NOT EXISTS (
              SELECT 1 FROM public.est_movimentos x
              WHERE x.lote_remessa_id = m.lote_remessa_id AND x.remessa_item_id IS NOT DISTINCT FROM m.remessa_item_id
                AND x.tipo = 'remessa_saida_terceiros'
            ) THEN -COALESCE(m.quantidade_poder, m.quantidade)
            ELSE 0 END) AS saldo_terceiro_final
      FROM public.est_movimentos m
      WHERE m.empresa_id = p_empresa_id AND m.pessoa_id IS NOT NULL AND m.lote_remessa_id IS NOT NULL
        AND (p_sku_id IS NULL OR m.sku_id = p_sku_id OR m.sku_poder_id = p_sku_id)
      GROUP BY m.empresa_id, m.pessoa_id, m.sku_id, m.lote_remessa_id
    )
    INSERT INTO public.est_saldos_poder_terceiros (empresa_id, pessoa_id, sku_id, remessa_id, quantidade, updated_at)
    SELECT dt.empresa_id, dt.pessoa_id, dt.sku_id, dt.remessa_id, dt.saldo_terceiro_final, now()
    FROM deltas_terceiros dt WHERE dt.saldo_terceiro_final <> 0 AND dt.remessa_id IS NOT NULL;

    GET DIAGNOSTICS v_terceiros_inseridos = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'success', true, 'empresa_id', p_empresa_id,
    'movimentos', v_movimentos_count, 'saldos', v_saldos_inseridos, 'terceiros', v_terceiros_inseridos
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.est_reconstruir_saldos_from_cardex(uuid, uuid, uuid)
  TO authenticated, service_role;

-- --------------------------------------------------------------------------
-- 4) Backfill: dualizar envios legados + debitar TERCEIROS em baixa/retorno
-- --------------------------------------------------------------------------
DO $$
DECLARE
  r record;
  v_terceiros uuid;
  v_locais jsonb;
  v_emp uuid;
BEGIN
  FOR v_emp IN SELECT DISTINCT empresa_id FROM public.est_movimentos WHERE tipo LIKE 'remessa%' LOOP
    v_locais := public.est_garantir_locais_padrao(v_emp);
    v_terceiros := (v_locais->>'terceiros_id')::uuid;

    -- Companion entrada TERCEIROS para cada remessa_saida sem par
    FOR r IN
      SELECT m.*
      FROM public.est_movimentos m
      WHERE m.empresa_id = v_emp
        AND m.tipo = 'remessa_saida'
        AND NOT EXISTS (
          SELECT 1 FROM public.est_movimentos x
          WHERE x.empresa_id = m.empresa_id
            AND x.tipo = 'remessa_entrada_terceiros'
            AND x.lote_remessa_id IS NOT DISTINCT FROM m.lote_remessa_id
            AND x.remessa_item_id IS NOT DISTINCT FROM m.remessa_item_id
            AND x.sku_id = m.sku_id
            AND abs(extract(epoch from (x.movimento_em - m.movimento_em))) < 5
        )
    LOOP
      INSERT INTO public.est_movimentos (
        empresa_id, tipo, sku_id, local_id, quantidade, documento, pessoa_id, origem,
        lote_remessa_id, remessa_item_id, motivo_codigo, motivo, usuario_id, movimento_em, created_at
      ) VALUES (
        r.empresa_id, 'remessa_entrada_terceiros', r.sku_id, v_terceiros, r.quantidade, r.documento, r.pessoa_id, r.origem,
        r.lote_remessa_id, r.remessa_item_id, r.motivo_codigo,
        COALESCE(r.motivo, 'Entrada em poder de terceiros (backfill)'),
        r.usuario_id, r.movimento_em + interval '1 second', r.created_at + interval '1 second'
      );

      INSERT INTO public.est_saldos (empresa_id, sku_id, local_id, quantidade, updated_at)
      VALUES (r.empresa_id, r.sku_id, v_terceiros, r.quantidade, now())
      ON CONFLICT (empresa_id, sku_id, local_id)
      DO UPDATE SET quantidade = est_saldos.quantidade + EXCLUDED.quantidade, updated_at = now();
    END LOOP;

    -- Baixas: debitar TERCEIROS (antes só mexiam no analítico)
    FOR r IN
      SELECT m.* FROM public.est_movimentos m
      WHERE m.empresa_id = v_emp AND m.tipo = 'remessa_baixa'
        AND m.local_id IS DISTINCT FROM v_terceiros
    LOOP
      UPDATE public.est_movimentos SET local_id = v_terceiros WHERE id = r.id;

      UPDATE public.est_saldos SET quantidade = GREATEST(0, quantidade - r.quantidade), updated_at = now()
      WHERE empresa_id = r.empresa_id AND sku_id = r.sku_id AND local_id = v_terceiros;

      IF NOT FOUND THEN
        -- se ainda não havia posição (backfill entrada não rodou), cria zerando via entrada implícita já feita
        NULL;
      END IF;
    END LOOP;

    -- Retornos: companion saída TERCEIROS
    FOR r IN
      SELECT m.* FROM public.est_movimentos m
      WHERE m.empresa_id = v_emp AND m.tipo = 'remessa_retorno'
        AND NOT EXISTS (
          SELECT 1 FROM public.est_movimentos x
          WHERE x.empresa_id = m.empresa_id
            AND x.tipo = 'remessa_saida_terceiros'
            AND x.lote_remessa_id IS NOT DISTINCT FROM m.lote_remessa_id
            AND x.remessa_item_id IS NOT DISTINCT FROM m.remessa_item_id
        )
    LOOP
      INSERT INTO public.est_movimentos (
        empresa_id, tipo, sku_id, local_id, quantidade, documento, pessoa_id, origem,
        lote_remessa_id, remessa_item_id, motivo, usuario_id, movimento_em, created_at,
        sku_poder_id, quantidade_poder
      ) VALUES (
        r.empresa_id, 'remessa_saida_terceiros',
        COALESCE(r.sku_poder_id, r.sku_id), v_terceiros,
        COALESCE(r.quantidade_poder, r.quantidade),
        r.documento, r.pessoa_id, r.origem,
        r.lote_remessa_id, r.remessa_item_id,
        'Saída de TERCEIROS (retorno — backfill)', r.usuario_id,
        r.movimento_em - interval '1 second', r.created_at - interval '1 second',
        r.sku_poder_id, r.quantidade_poder
      );

      UPDATE public.est_saldos
      SET quantidade = GREATEST(0, quantidade - COALESCE(r.quantidade_poder, r.quantidade)), updated_at = now()
      WHERE empresa_id = r.empresa_id
        AND sku_id = COALESCE(r.sku_poder_id, r.sku_id)
        AND local_id = v_terceiros;
    END LOOP;
  END LOOP;
END;
$$;
