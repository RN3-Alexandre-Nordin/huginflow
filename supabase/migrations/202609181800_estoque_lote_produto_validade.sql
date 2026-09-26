-- Estoque: lote produto + validade (kernel)
-- Grão dual: SKU sem controla_lote = sku×local; com flag = sku×local×lote_produto
-- FEFO sugerido no app; RPC exige coerência controla_lote × lote_produto_id

-- ---------------------------------------------------------------------------
-- 1) Flags no SKU
-- ---------------------------------------------------------------------------
ALTER TABLE public.cad_skus
  ADD COLUMN IF NOT EXISTS controla_lote boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS exige_validade boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.cad_skus.controla_lote IS
  'Se true, movimentos e saldos exigem lote_produto_id (batch + validade).';
COMMENT ON COLUMN public.cad_skus.exige_validade IS
  'Se controla_lote e true, data_validade obrigatória ao criar/usar lote.';

-- ---------------------------------------------------------------------------
-- 2) Mestre de lote de produto
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.est_lotes_produto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas (id) ON DELETE CASCADE,
  sku_id uuid NOT NULL REFERENCES public.cad_skus (id) ON DELETE RESTRICT,
  numero_lote text NOT NULL,
  data_validade date NULL,
  data_fabricacao date NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT est_lotes_produto_numero_chk CHECK (length(trim(numero_lote)) > 0),
  CONSTRAINT est_lotes_produto_empresa_sku_numero_uq UNIQUE (empresa_id, sku_id, numero_lote)
);

CREATE INDEX IF NOT EXISTS idx_est_lotes_produto_empresa_sku
  ON public.est_lotes_produto (empresa_id, sku_id);
CREATE INDEX IF NOT EXISTS idx_est_lotes_produto_empresa_validade
  ON public.est_lotes_produto (empresa_id, data_validade);

COMMENT ON TABLE public.est_lotes_produto IS
  'Lote/batch de produto (fabricante). Distinto de est_*_lotes (documentos operacionais).';

ALTER TABLE public.est_lotes_produto ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS est_lotes_produto_select ON public.est_lotes_produto;
CREATE POLICY est_lotes_produto_select ON public.est_lotes_produto
FOR SELECT TO authenticated
USING (
  public.check_permission('estoque', 'view')
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = est_lotes_produto.empresa_id)
  )
);

DROP POLICY IF EXISTS est_lotes_produto_insert ON public.est_lotes_produto;
CREATE POLICY est_lotes_produto_insert ON public.est_lotes_produto
FOR INSERT TO authenticated
WITH CHECK (
  (public.check_permission('estoque', 'create') OR public.check_permission('estoque', 'edit')
   OR public.check_permission('estoque_entradas', 'create') OR public.check_permission('estoque_entradas', 'edit'))
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = est_lotes_produto.empresa_id)
  )
);

DROP POLICY IF EXISTS est_lotes_produto_update ON public.est_lotes_produto;
CREATE POLICY est_lotes_produto_update ON public.est_lotes_produto
FOR UPDATE TO authenticated
USING (
  (public.check_permission('estoque', 'edit') OR public.check_permission('estoque_entradas', 'edit'))
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND (u.role_global = 'superadmin' OR u.empresa_id = est_lotes_produto.empresa_id)
  )
);

-- ---------------------------------------------------------------------------
-- 3) Colunas lote_produto_id + uniques NULLS NOT DISTINCT
-- ---------------------------------------------------------------------------
ALTER TABLE public.est_saldos
  ADD COLUMN IF NOT EXISTS lote_produto_id uuid NULL
    REFERENCES public.est_lotes_produto (id) ON DELETE RESTRICT;

ALTER TABLE public.est_saldos
  DROP CONSTRAINT IF EXISTS est_saldos_empresa_sku_local_uq;

ALTER TABLE public.est_saldos
  DROP CONSTRAINT IF EXISTS est_saldos_empresa_sku_local_lote_uq;

ALTER TABLE public.est_saldos
  ADD CONSTRAINT est_saldos_empresa_sku_local_lote_uq
  UNIQUE NULLS NOT DISTINCT (empresa_id, sku_id, local_id, lote_produto_id);

CREATE INDEX IF NOT EXISTS idx_est_saldos_empresa_lote
  ON public.est_saldos (empresa_id, lote_produto_id)
  WHERE lote_produto_id IS NOT NULL;

ALTER TABLE public.est_movimentos
  ADD COLUMN IF NOT EXISTS lote_produto_id uuid NULL
    REFERENCES public.est_lotes_produto (id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_est_movimentos_empresa_lote
  ON public.est_movimentos (empresa_id, lote_produto_id)
  WHERE lote_produto_id IS NOT NULL;

ALTER TABLE public.est_saldos_poder_terceiros
  ADD COLUMN IF NOT EXISTS lote_produto_id uuid NULL
    REFERENCES public.est_lotes_produto (id) ON DELETE RESTRICT;

DROP INDEX IF EXISTS public.uq_est_saldos_poder_empresa_pessoa_sku_remessa;

CREATE UNIQUE INDEX uq_est_saldos_poder_empresa_pessoa_sku_remessa_lote
  ON public.est_saldos_poder_terceiros (
    empresa_id, pessoa_id, sku_id, remessa_id, lote_produto_id
  ) NULLS NOT DISTINCT;

-- Itens operacionais
ALTER TABLE public.est_entrada_itens
  ADD COLUMN IF NOT EXISTS lote_produto_id uuid NULL
    REFERENCES public.est_lotes_produto (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS numero_lote text NULL,
  ADD COLUMN IF NOT EXISTS data_validade date NULL,
  ADD COLUMN IF NOT EXISTS data_fabricacao date NULL;

ALTER TABLE public.est_retirada_itens
  ADD COLUMN IF NOT EXISTS lote_produto_id uuid NULL
    REFERENCES public.est_lotes_produto (id) ON DELETE SET NULL;

ALTER TABLE public.est_ajuste_itens
  ADD COLUMN IF NOT EXISTS lote_produto_id uuid NULL
    REFERENCES public.est_lotes_produto (id) ON DELETE SET NULL;

ALTER TABLE public.est_transferencia_itens
  ADD COLUMN IF NOT EXISTS lote_produto_id uuid NULL
    REFERENCES public.est_lotes_produto (id) ON DELETE SET NULL;

ALTER TABLE public.est_remessa_itens
  ADD COLUMN IF NOT EXISTS lote_produto_id uuid NULL
    REFERENCES public.est_lotes_produto (id) ON DELETE SET NULL;

-- Config políticas FEFO
ALTER TABLE public.est_config
  ADD COLUMN IF NOT EXISTS fefo_sugerido boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS bloquear_lotes_vencidos boolean NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- 4) Helper: validar SKU × lote
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.est_validar_lote_produto(
  p_empresa_id uuid,
  p_sku_id uuid,
  p_lote_produto_id uuid
)
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_controla boolean;
  v_exige boolean;
  v_lote_sku uuid;
  v_lote_emp uuid;
  v_validade date;
BEGIN
  SELECT COALESCE(s.controla_lote, false), COALESCE(s.exige_validade, true)
  INTO v_controla, v_exige
  FROM public.cad_skus s
  WHERE s.id = p_sku_id AND s.empresa_id = p_empresa_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SKU_INVALIDO: SKU não encontrado no tenant.';
  END IF;

  IF v_controla THEN
    IF p_lote_produto_id IS NULL THEN
      RAISE EXCEPTION 'LOTE_OBRIGATORIO: SKU controla lote; informe lote_produto_id.';
    END IF;
    SELECT l.sku_id, l.empresa_id, l.data_validade
    INTO v_lote_sku, v_lote_emp, v_validade
    FROM public.est_lotes_produto l
    WHERE l.id = p_lote_produto_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'LOTE_INVALIDO: lote_produto_id inexistente.';
    END IF;
    IF v_lote_emp IS DISTINCT FROM p_empresa_id OR v_lote_sku IS DISTINCT FROM p_sku_id THEN
      RAISE EXCEPTION 'LOTE_SKU_DIVERGENTE: lote não pertence ao SKU/empresa do movimento.';
    END IF;
    IF v_exige AND v_validade IS NULL THEN
      RAISE EXCEPTION 'VALIDADE_OBRIGATORIA: lote sem data_validade e SKU exige_validade.';
    END IF;
  ELSE
    IF p_lote_produto_id IS NOT NULL THEN
      RAISE EXCEPTION 'LOTE_NAO_PERMITIDO: SKU não controla lote; lote_produto_id deve ser NULL.';
    END IF;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5) RPC atômica com p_lote_produto_id
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.est_registrar_movimento_atomico(
  uuid, text, uuid, uuid, numeric, uuid, text, uuid, text,
  uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, uuid, boolean,
  uuid, numeric
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
  p_quantidade_poder numeric DEFAULT NULL,
  p_lote_produto_id uuid DEFAULT NULL
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
  v_lote uuid := p_lote_produto_id;
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
      SELECT u.id INTO v_usuario_resolved_id FROM public.usuarios u
      WHERE u.auth_user_id = v_user_auth_id LIMIT 1;
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

  PERFORM public.est_validar_lote_produto(p_empresa_id, p_sku_id, v_lote);

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
  IF p_tipo = 'remessa_retorno' AND (v_qtd_poder IS NULL OR v_qtd_poder <= 0) THEN
    RAISE EXCEPTION 'QUANTIDADE_INVALIDA: quantidade_poder do retorno deve ser maior que zero.';
  END IF;
  IF p_tipo IN ('remessa_saida', 'remessa_retorno', 'remessa_baixa') THEN
    v_locais := public.est_garantir_locais_padrao(p_empresa_id);
    v_local_terceiros := (v_locais->>'terceiros_id')::uuid;
    IF v_local_terceiros IS NULL THEN
      RAISE EXCEPTION 'LOCAL_TERCEIROS_AUSENTE: Não foi possível garantir o local TERCEIROS.';
    END IF;
  END IF;

  -- Validar lote do SKU poder em retorno/baixa quando diferente
  IF p_tipo IN ('remessa_retorno', 'remessa_baixa') AND v_sku_poder IS DISTINCT FROM p_sku_id THEN
    PERFORM public.est_validar_lote_produto(p_empresa_id, v_sku_poder, v_lote);
  END IF;

  CASE p_tipo
    WHEN 'entrada' THEN
      INSERT INTO public.est_saldos (empresa_id, sku_id, local_id, lote_produto_id, quantidade, updated_at)
      VALUES (p_empresa_id, p_sku_id, p_local_id, v_lote, p_quantidade, now())
      ON CONFLICT (empresa_id, sku_id, local_id, lote_produto_id)
      DO UPDATE SET quantidade = est_saldos.quantidade + EXCLUDED.quantidade, updated_at = now();

    WHEN 'saida' THEN
      SELECT s.quantidade INTO v_saldo_atual FROM public.est_saldos s
      WHERE s.empresa_id = p_empresa_id AND s.sku_id = p_sku_id AND s.local_id = p_local_id
        AND s.lote_produto_id IS NOT DISTINCT FROM v_lote
      FOR UPDATE;
      v_saldo_atual := COALESCE(v_saldo_atual, 0);
      IF v_saldo_atual < p_quantidade AND NOT p_permitir_saldo_negativo THEN
        RAISE EXCEPTION 'SALDO_INSUFICIENTE: Saldo disponível (%) é insuficiente para saída de %.', v_saldo_atual, p_quantidade;
      END IF;
      UPDATE public.est_saldos SET quantidade = quantidade - p_quantidade, updated_at = now()
      WHERE empresa_id = p_empresa_id AND sku_id = p_sku_id AND local_id = p_local_id
        AND lote_produto_id IS NOT DISTINCT FROM v_lote;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'SALDO_INSUFICIENTE: Não há posição de saldo no local/lote informado para saída de %.', p_quantidade;
      END IF;

    WHEN 'ajuste' THEN
      IF p_ajuste_sinal = 'positivo' THEN
        INSERT INTO public.est_saldos (empresa_id, sku_id, local_id, lote_produto_id, quantidade, updated_at)
        VALUES (p_empresa_id, p_sku_id, p_local_id, v_lote, p_quantidade, now())
        ON CONFLICT (empresa_id, sku_id, local_id, lote_produto_id)
        DO UPDATE SET quantidade = est_saldos.quantidade + EXCLUDED.quantidade, updated_at = now();
      ELSE
        SELECT s.quantidade INTO v_saldo_atual FROM public.est_saldos s
        WHERE s.empresa_id = p_empresa_id AND s.sku_id = p_sku_id AND s.local_id = p_local_id
          AND s.lote_produto_id IS NOT DISTINCT FROM v_lote FOR UPDATE;
        v_saldo_atual := COALESCE(v_saldo_atual, 0);
        IF v_saldo_atual < p_quantidade AND NOT p_permitir_saldo_negativo THEN
          RAISE EXCEPTION 'SALDO_INSUFICIENTE: Saldo disponível (%) insuficiente para ajuste negativo de %.', v_saldo_atual, p_quantidade;
        END IF;
        UPDATE public.est_saldos SET quantidade = quantidade - p_quantidade, updated_at = now()
        WHERE empresa_id = p_empresa_id AND sku_id = p_sku_id AND local_id = p_local_id
          AND lote_produto_id IS NOT DISTINCT FROM v_lote;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'SALDO_INSUFICIENTE: Não há posição de saldo no local/lote para ajuste negativo de %.', p_quantidade;
        END IF;
      END IF;

    WHEN 'transferencia' THEN
      SELECT s.quantidade INTO v_saldo_atual FROM public.est_saldos s
      WHERE s.empresa_id = p_empresa_id AND s.sku_id = p_sku_id AND s.local_id = p_local_id
        AND s.lote_produto_id IS NOT DISTINCT FROM v_lote FOR UPDATE;
      v_saldo_atual := COALESCE(v_saldo_atual, 0);
      IF v_saldo_atual < p_quantidade AND NOT p_permitir_saldo_negativo THEN
        RAISE EXCEPTION 'SALDO_INSUFICIENTE: Saldo de origem (%) insuficiente para transferir %.', v_saldo_atual, p_quantidade;
      END IF;
      UPDATE public.est_saldos SET quantidade = quantidade - p_quantidade, updated_at = now()
      WHERE empresa_id = p_empresa_id AND sku_id = p_sku_id AND local_id = p_local_id
        AND lote_produto_id IS NOT DISTINCT FROM v_lote;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'SALDO_INSUFICIENTE: Não há posição de saldo na origem/lote para transferir %.', p_quantidade;
      END IF;
      INSERT INTO public.est_saldos (empresa_id, sku_id, local_id, lote_produto_id, quantidade, updated_at)
      VALUES (p_empresa_id, p_sku_id, p_local_destino_id, v_lote, p_quantidade, now())
      ON CONFLICT (empresa_id, sku_id, local_id, lote_produto_id)
      DO UPDATE SET quantidade = est_saldos.quantidade + EXCLUDED.quantidade, updated_at = now();

    WHEN 'remessa_saida' THEN
      SELECT s.quantidade INTO v_saldo_atual FROM public.est_saldos s
      WHERE s.empresa_id = p_empresa_id AND s.sku_id = p_sku_id AND s.local_id = p_local_id
        AND s.lote_produto_id IS NOT DISTINCT FROM v_lote FOR UPDATE;
      v_saldo_atual := COALESCE(v_saldo_atual, 0);
      IF v_saldo_atual < p_quantidade AND NOT p_permitir_saldo_negativo THEN
        RAISE EXCEPTION 'SALDO_INSUFICIENTE: Saldo no local/lote (%) insuficiente para remessa de %.', v_saldo_atual, p_quantidade;
      END IF;
      UPDATE public.est_saldos SET quantidade = quantidade - p_quantidade, updated_at = now()
      WHERE empresa_id = p_empresa_id AND sku_id = p_sku_id AND local_id = p_local_id
        AND lote_produto_id IS NOT DISTINCT FROM v_lote;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'SALDO_INSUFICIENTE: Sem posição no local/lote para remessa de %.', p_quantidade;
      END IF;

      INSERT INTO public.est_saldos (empresa_id, sku_id, local_id, lote_produto_id, quantidade, updated_at)
      VALUES (p_empresa_id, p_sku_id, v_local_terceiros, v_lote, p_quantidade, now())
      ON CONFLICT (empresa_id, sku_id, local_id, lote_produto_id)
      DO UPDATE SET quantidade = est_saldos.quantidade + EXCLUDED.quantidade, updated_at = now();

      INSERT INTO public.est_saldos_poder_terceiros (
        empresa_id, pessoa_id, sku_id, remessa_id, lote_produto_id, quantidade, updated_at
      ) VALUES (
        p_empresa_id, p_pessoa_id, p_sku_id, p_lote_remessa_id, v_lote, p_quantidade, now()
      )
      ON CONFLICT (empresa_id, pessoa_id, sku_id, remessa_id, lote_produto_id)
      DO UPDATE SET
        quantidade = est_saldos_poder_terceiros.quantidade + EXCLUDED.quantidade,
        updated_at = now();

      INSERT INTO public.est_movimentos (
        empresa_id, tipo, sku_id, local_id, quantidade, documento, pessoa_id, origem,
        lote_remessa_id, remessa_item_id, motivo_codigo, motivo, usuario_id, movimento_em,
        lote_produto_id
      ) VALUES (
        p_empresa_id, 'remessa_saida', p_sku_id, p_local_id, p_quantidade, p_documento, p_pessoa_id, COALESCE(p_origem, 'remessa'),
        p_lote_remessa_id, p_remessa_item_id, p_motivo_codigo, p_motivo, v_usuario_resolved_id, now(),
        v_lote
      ) RETURNING id INTO v_movimento_id;

      INSERT INTO public.est_movimentos (
        empresa_id, tipo, sku_id, local_id, quantidade, documento, pessoa_id, origem,
        lote_remessa_id, remessa_item_id, motivo_codigo, motivo, usuario_id, movimento_em,
        lote_produto_id
      ) VALUES (
        p_empresa_id, 'remessa_entrada_terceiros', p_sku_id, v_local_terceiros, p_quantidade, p_documento, p_pessoa_id, COALESCE(p_origem, 'remessa'),
        p_lote_remessa_id, p_remessa_item_id, p_motivo_codigo,
        COALESCE(p_motivo, 'Entrada em poder de terceiros'), v_usuario_resolved_id, now(),
        v_lote
      ) RETURNING id INTO v_movimento_par_id;

      RETURN jsonb_build_object(
        'success', true, 'movimento_id', v_movimento_id, 'movimento_par_id', v_movimento_par_id,
        'empresa_id', p_empresa_id, 'sku_id', p_sku_id, 'local_id', p_local_id,
        'local_terceiros_id', v_local_terceiros, 'quantidade', p_quantidade, 'tipo', p_tipo,
        'lote_produto_id', v_lote
      );

    WHEN 'remessa_retorno' THEN
      SELECT s.quantidade INTO v_saldo_atual FROM public.est_saldos s
      WHERE s.empresa_id = p_empresa_id AND s.sku_id = v_sku_poder AND s.local_id = v_local_terceiros
        AND s.lote_produto_id IS NOT DISTINCT FROM v_lote FOR UPDATE;
      v_saldo_atual := COALESCE(v_saldo_atual, 0);
      IF v_saldo_atual < v_qtd_poder AND NOT p_permitir_saldo_negativo THEN
        RAISE EXCEPTION 'SALDO_INSUFICIENTE: Saldo em TERCEIROS (%) insuficiente para retorno de %.', v_saldo_atual, v_qtd_poder;
      END IF;
      UPDATE public.est_saldos SET quantidade = quantidade - v_qtd_poder, updated_at = now()
      WHERE empresa_id = p_empresa_id AND sku_id = v_sku_poder AND local_id = v_local_terceiros
        AND lote_produto_id IS NOT DISTINCT FROM v_lote;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'SALDO_INSUFICIENTE: Sem posição em TERCEIROS/lote para retorno de %.', v_qtd_poder;
      END IF;

      SELECT t.quantidade INTO v_saldo_terceiro FROM public.est_saldos_poder_terceiros t
      WHERE t.empresa_id = p_empresa_id AND t.pessoa_id = p_pessoa_id
        AND t.sku_id = v_sku_poder AND t.remessa_id = p_lote_remessa_id
        AND t.lote_produto_id IS NOT DISTINCT FROM v_lote
      FOR UPDATE;
      v_saldo_terceiro := COALESCE(v_saldo_terceiro, 0);
      IF v_saldo_terceiro < v_qtd_poder THEN
        RAISE EXCEPTION 'SALDO_TERCEIRO_INSUFICIENTE: Poder do lote (%) < retorno %.', v_saldo_terceiro, v_qtd_poder;
      END IF;
      UPDATE public.est_saldos_poder_terceiros
      SET quantidade = quantidade - v_qtd_poder, updated_at = now()
      WHERE empresa_id = p_empresa_id AND pessoa_id = p_pessoa_id
        AND sku_id = v_sku_poder AND remessa_id = p_lote_remessa_id
        AND lote_produto_id IS NOT DISTINCT FROM v_lote;

      INSERT INTO public.est_saldos (empresa_id, sku_id, local_id, lote_produto_id, quantidade, updated_at)
      VALUES (p_empresa_id, p_sku_id, p_local_id, v_lote, p_quantidade, now())
      ON CONFLICT (empresa_id, sku_id, local_id, lote_produto_id)
      DO UPDATE SET quantidade = est_saldos.quantidade + EXCLUDED.quantidade, updated_at = now();

      INSERT INTO public.est_movimentos (
        empresa_id, tipo, sku_id, local_id, quantidade, documento, pessoa_id, origem,
        lote_remessa_id, remessa_item_id, motivo, usuario_id, movimento_em,
        sku_poder_id, quantidade_poder, lote_produto_id
      ) VALUES (
        p_empresa_id, 'remessa_saida_terceiros', v_sku_poder, v_local_terceiros, v_qtd_poder,
        p_documento, p_pessoa_id, COALESCE(p_origem, 'remessa'),
        p_lote_remessa_id, p_remessa_item_id,
        'Saída de TERCEIROS (retorno remessa)', v_usuario_resolved_id, now(),
        CASE WHEN v_sku_poder IS DISTINCT FROM p_sku_id THEN v_sku_poder ELSE NULL END,
        CASE WHEN v_qtd_poder IS DISTINCT FROM p_quantidade THEN v_qtd_poder ELSE NULL END,
        v_lote
      ) RETURNING id INTO v_movimento_par_id;

      INSERT INTO public.est_movimentos (
        empresa_id, tipo, sku_id, local_id, quantidade, documento, pessoa_id, origem,
        lote_remessa_id, remessa_item_id, motivo, usuario_id, movimento_em,
        sku_poder_id, quantidade_poder, lote_produto_id
      ) VALUES (
        p_empresa_id, 'remessa_retorno', p_sku_id, p_local_id, p_quantidade,
        p_documento, p_pessoa_id, COALESCE(p_origem, 'remessa'),
        p_lote_remessa_id, p_remessa_item_id, p_motivo, v_usuario_resolved_id, now(),
        CASE WHEN v_sku_poder IS DISTINCT FROM p_sku_id OR v_qtd_poder IS DISTINCT FROM p_quantidade THEN v_sku_poder ELSE NULL END,
        CASE WHEN v_sku_poder IS DISTINCT FROM p_sku_id OR v_qtd_poder IS DISTINCT FROM p_quantidade THEN v_qtd_poder ELSE NULL END,
        v_lote
      ) RETURNING id INTO v_movimento_id;

      RETURN jsonb_build_object(
        'success', true, 'movimento_id', v_movimento_id, 'movimento_par_id', v_movimento_par_id,
        'empresa_id', p_empresa_id, 'sku_id', p_sku_id, 'sku_poder_id', v_sku_poder,
        'local_id', p_local_id, 'local_terceiros_id', v_local_terceiros,
        'quantidade', p_quantidade, 'quantidade_poder', v_qtd_poder, 'tipo', p_tipo,
        'lote_produto_id', v_lote
      );

    WHEN 'remessa_baixa' THEN
      SELECT s.quantidade INTO v_saldo_atual FROM public.est_saldos s
      WHERE s.empresa_id = p_empresa_id AND s.sku_id = p_sku_id AND s.local_id = v_local_terceiros
        AND s.lote_produto_id IS NOT DISTINCT FROM v_lote FOR UPDATE;
      v_saldo_atual := COALESCE(v_saldo_atual, 0);
      IF v_saldo_atual < p_quantidade AND NOT p_permitir_saldo_negativo THEN
        RAISE EXCEPTION 'SALDO_INSUFICIENTE: Saldo em TERCEIROS (%) insuficiente para baixa de %.', v_saldo_atual, p_quantidade;
      END IF;
      UPDATE public.est_saldos SET quantidade = quantidade - p_quantidade, updated_at = now()
      WHERE empresa_id = p_empresa_id AND sku_id = p_sku_id AND local_id = v_local_terceiros
        AND lote_produto_id IS NOT DISTINCT FROM v_lote;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'SALDO_INSUFICIENTE: Sem posição em TERCEIROS/lote para baixa de %.', p_quantidade;
      END IF;

      SELECT t.quantidade INTO v_saldo_terceiro FROM public.est_saldos_poder_terceiros t
      WHERE t.empresa_id = p_empresa_id AND t.pessoa_id = p_pessoa_id
        AND t.sku_id = p_sku_id AND t.remessa_id = p_lote_remessa_id
        AND t.lote_produto_id IS NOT DISTINCT FROM v_lote
      FOR UPDATE;
      v_saldo_terceiro := COALESCE(v_saldo_terceiro, 0);
      IF v_saldo_terceiro < p_quantidade THEN
        RAISE EXCEPTION 'SALDO_TERCEIRO_INSUFICIENTE: Poder do lote (%) < baixa %.', v_saldo_terceiro, p_quantidade;
      END IF;
      UPDATE public.est_saldos_poder_terceiros
      SET quantidade = quantidade - p_quantidade, updated_at = now()
      WHERE empresa_id = p_empresa_id AND pessoa_id = p_pessoa_id
        AND sku_id = p_sku_id AND remessa_id = p_lote_remessa_id
        AND lote_produto_id IS NOT DISTINCT FROM v_lote;

      INSERT INTO public.est_movimentos (
        empresa_id, tipo, sku_id, local_id, quantidade, documento, pessoa_id, origem,
        lote_remessa_id, remessa_item_id, motivo_codigo, motivo, usuario_id, movimento_em,
        lote_produto_id
      ) VALUES (
        p_empresa_id, 'remessa_baixa', p_sku_id, v_local_terceiros, p_quantidade,
        p_documento, p_pessoa_id, COALESCE(p_origem, 'remessa'),
        p_lote_remessa_id, p_remessa_item_id, p_motivo_codigo, p_motivo, v_usuario_resolved_id, now(),
        v_lote
      ) RETURNING id INTO v_movimento_id;

      RETURN jsonb_build_object(
        'success', true, 'movimento_id', v_movimento_id,
        'empresa_id', p_empresa_id, 'sku_id', p_sku_id,
        'local_id', v_local_terceiros, 'quantidade', p_quantidade, 'tipo', p_tipo,
        'lote_produto_id', v_lote
      );

    ELSE
      RAISE EXCEPTION 'TIPO_INVALIDO: %', p_tipo;
  END CASE;

  INSERT INTO public.est_movimentos (
    empresa_id, tipo, sku_id, local_id, local_destino_id, quantidade, documento, pessoa_id, origem,
    lote_entrada_id, lote_retirada_id, lote_ajuste_id, lote_remessa_id, remessa_item_id, requisicao_id,
    ajuste_sinal, motivo_codigo, motivo, usuario_id, movimento_em, lote_produto_id
  ) VALUES (
    p_empresa_id, p_tipo, p_sku_id, p_local_id, p_local_destino_id, p_quantidade, p_documento, p_pessoa_id, p_origem,
    p_lote_entrada_id, p_lote_retirada_id, p_lote_ajuste_id, p_lote_remessa_id, p_remessa_item_id, p_requisicao_id,
    p_ajuste_sinal, p_motivo_codigo, p_motivo, v_usuario_resolved_id, now(), v_lote
  ) RETURNING id INTO v_movimento_id;

  RETURN jsonb_build_object(
    'success', true, 'movimento_id', v_movimento_id,
    'empresa_id', p_empresa_id, 'sku_id', p_sku_id,
    'local_id', p_local_id, 'local_destino_id', p_local_destino_id,
    'quantidade', p_quantidade, 'tipo', p_tipo, 'lote_produto_id', v_lote
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.est_registrar_movimento_atomico(
  uuid, text, uuid, uuid, numeric, uuid, text, uuid, text,
  uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, uuid, boolean,
  uuid, numeric, uuid
) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6) Rebuild incluindo lote_produto_id
-- ---------------------------------------------------------------------------
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
    SELECT m.empresa_id, m.sku_id, m.local_id, m.lote_produto_id,
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
    GROUP BY m.empresa_id, m.sku_id, m.local_id, m.lote_produto_id
    UNION ALL
    SELECT m.empresa_id, m.sku_id, m.local_destino_id AS local_id, m.lote_produto_id, SUM(m.quantidade) AS delta
    FROM public.est_movimentos m
    WHERE m.empresa_id = p_empresa_id AND m.tipo = 'transferencia' AND m.local_destino_id IS NOT NULL
      AND (p_sku_id IS NULL OR m.sku_id = p_sku_id)
      AND (p_local_id IS NULL OR m.local_destino_id = p_local_id)
    GROUP BY m.empresa_id, m.sku_id, m.local_destino_id, m.lote_produto_id
  ),
  totais AS (
    SELECT d.empresa_id, d.sku_id, d.local_id, d.lote_produto_id, SUM(d.delta) AS saldo_final
    FROM deltas d GROUP BY d.empresa_id, d.sku_id, d.local_id, d.lote_produto_id
  )
  INSERT INTO public.est_saldos (empresa_id, sku_id, local_id, lote_produto_id, quantidade, updated_at)
  SELECT t.empresa_id, t.sku_id, t.local_id, t.lote_produto_id, t.saldo_final, now()
  FROM totais t WHERE t.saldo_final <> 0 AND t.local_id IS NOT NULL;

  GET DIAGNOSTICS v_saldos_inseridos = ROW_COUNT;

  IF p_local_id IS NULL THEN
    WITH deltas_terceiros AS (
      SELECT m.empresa_id, m.pessoa_id, m.sku_id, m.lote_remessa_id AS remessa_id, m.lote_produto_id,
        SUM(CASE
            WHEN m.tipo = 'remessa_entrada_terceiros' THEN m.quantidade
            WHEN m.tipo IN ('remessa_saida_terceiros', 'remessa_baixa') THEN -m.quantidade
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
      GROUP BY m.empresa_id, m.pessoa_id, m.sku_id, m.lote_remessa_id, m.lote_produto_id
    )
    INSERT INTO public.est_saldos_poder_terceiros (
      empresa_id, pessoa_id, sku_id, remessa_id, lote_produto_id, quantidade, updated_at
    )
    SELECT dt.empresa_id, dt.pessoa_id, dt.sku_id, dt.remessa_id, dt.lote_produto_id, dt.saldo_terceiro_final, now()
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
